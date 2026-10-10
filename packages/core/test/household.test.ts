import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  deserializeWorld,
  getPerson,
  grantAsset,
  indexBundles,
  isJointSpouse,
  killPerson,
  listShop,
  livingBreakdown,
  livingCost,
  milestoneReached,
  newLife,
  riskBpOf,
  serializeWorld,
  settleLiving,
  spawnPerson,
  standardOf,
  startLivingOnOwn,
  startStorylet,
  updatePerson,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const packsDir = join(HERE, "..", "..", "..", "packs");

// A copy of the real packs plus two person-scoped test actions for the household effects.
const tmp = mkdtempSync(join(tmpdir(), "household-"));
cpSync(packsDir, tmp, { recursive: true });
writeFileSync(
  join(tmp, "core-loop", "storylets", "zz-household-test.yaml"),
  `- { id: t-wed, trigger: action, scope: person, target: [core-loop/partner], menu: assets/housing, text: "Wed.", outcomes: [{ weight: 1, effects: [relationship(person).role = spouse] }] }
- { id: t-divorce, trigger: action, scope: person, target: [core-loop/spouse], menu: assets/housing, text: "Divorce.", outcomes: [{ weight: 1, effects: [relationship(person).role = friend] }] }
- { id: t-move-in, trigger: action, scope: person, target: [core-loop/partner], menu: assets/housing, text: "In.", outcomes: [{ weight: 1, effects: [move_in()] }] }
- { id: t-merge, trigger: action, scope: person, target: [core-loop/partner], menu: assets/housing, text: "Merge.", outcomes: [{ weight: 1, effects: [merge_money()] }] }
- { id: t-wed, trigger: action, scope: person, target: [core-loop/partner], menu: assets/housing, text: "Wed.", outcomes: [{ weight: 1, effects: [relationship(person).role = core-loop/spouse] }] }
- { id: t-wed-merge, trigger: action, scope: person, target: [core-loop/partner], menu: assets/housing, text: "Wed.", outcomes: [{ weight: 1, effects: [relationship(person).role = core-loop/spouse, merge_money()] }] }
`,
);
const real = compilePacks(tmp, { only: ["core-loop"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const std = (id: string) => `core-loop/${id}`;
const me = (w: World) => getPerson(w, w.playerId);
const H = idx.living?.household;
if (!H) throw new Error("core-loop declares no household");

/** A 30-year-old on their own in riverton (cost index 110%) at the average standard. */
function own(money = 9e9): World {
  return updatePerson(
    newLife(bundles, 3, { cityId: std("riverton") }),
    0,
    (p) => ({
      ...p,
      age: 30,
      money,
      withParents: false,
      standardId: std("average"),
      livedStandardId: std("average"),
    }),
  );
}

function addPerson(
  w: World,
  role: string,
  age: number,
  patch: Partial<ReturnType<typeof me>> = {},
): [World, number] {
  const [w2, id] = spawnPerson(w, idx, w.playerId, role, std("sibling-gen"));
  return [updatePerson(w2, id, (p) => ({ ...p, age, ...patch })), id];
}
const withChildren = (w: World, n: number, age = 5): World => {
  let out = w;
  for (let i = 0; i < n; i++) out = addPerson(out, std("child"), age)[0];
  return out;
};
const cost = (w: World) => livingCost(w, idx, me(w));
const base = cost(own());
const perChild = Math.trunc((H.dependentCost * 11000) / 10000);

describe("dependents", () => {
  test("each child at home adds the scaled dependent cost: 0, 1 and n children", () => {
    expect(perChild).toBeGreaterThan(0);
    for (const n of [0, 1, 4])
      expect(cost(withChildren(own(), n))).toBe(base + n * perChild);
  });

  test("a child who moves out or dies stops costing money", () => {
    let [w, kid] = addPerson(own(), std("child"), 20, { withParents: true });
    expect(cost(w)).toBe(base + perChild);
    w = updatePerson(w, kid, (p) => ({ ...p, withParents: false }));
    expect(cost(w)).toBe(base);
    w = updatePerson(w, kid, (p) => ({ ...p, withParents: true }));
    w = killPerson(w, kid, "test");
    expect(cost(w)).toBe(base);
  });

  test("settlement charges them and money never goes negative", () => {
    const w = settleLiving(withChildren(own(5e6), 3), idx);
    expect(me(w).money).toBeGreaterThanOrEqual(0);
    const rich = settleLiving(withChildren(own(9e9), 3), idx);
    expect(me(rich).money).toBe(9e9 - base - 3 * perChild);
  });
});

describe("partner cost sharing", () => {
  const partnerWorld = (partnerMoney: number): [World, number] => {
    const [w, id] = addPerson(own(), std("partner"), 30, {
      money: partnerMoney,
    });
    return [w, id];
  };

  test("a partner who lives apart pays nothing", () => {
    const [w] = partnerWorld(9e9);
    expect(cost(w)).toBe(base);
  });

  test("moving in makes the partner pay their share from their own money", () => {
    let [w, pid] = partnerWorld(9e9);
    w = startStorylet(w, bundles, "core-loop/t-move-in", pid).world;
    const share = Math.trunc((base * H.partnerShareBp) / 10000);
    expect(share).toBeGreaterThan(0);
    expect(cost(w)).toBe(base - share);
    const after = settleLiving(w, idx);
    expect(me(after).money).toBe(9e9 - (base - share));
    expect(getPerson(after, pid).money).toBe(9e9 - share);
    const b = livingBreakdown(w, idx, me(w), standardOf(me(w), idx) as never);
    expect(b.partnerShare).toBe(share);
  });

  test("a partner short of money pays what they have; the player covers the rest", () => {
    let [w, pid] = partnerWorld(1000);
    w = startStorylet(w, bundles, "core-loop/t-move-in", pid).world;
    expect(cost(w)).toBe(base - 1000);
    const after = settleLiving(w, idx);
    expect(getPerson(after, pid).money).toBe(0);
  });

  test("a spouse who moved in but kept money separate still pays the household share; marriage fires `married` once", () => {
    let [w, pid] = partnerWorld(9e9);
    w = startStorylet(w, bundles, "core-loop/t-move-in", pid).world;
    const share = Math.trunc((base * H.partnerShareBp) / 10000);
    expect(milestoneReached(w, "married")).toBe(false);
    w = startStorylet(w, bundles, "core-loop/t-wed", pid).world;
    expect(milestoneReached(w, "married")).toBe(true);
    expect(w.relationships.some((r) => r.household === "merged")).toBe(false);
    expect(cost(w)).toBe(base - share);
    expect(getPerson(settleLiving(w, idx), pid).money).toBe(9e9 - share);
  });

  test("marrying and merging money in one action fires `married` and charges no share", () => {
    let [w, pid] = partnerWorld(5e8);
    w = startStorylet(w, bundles, "core-loop/t-wed-merge", pid).world;
    expect(milestoneReached(w, "married")).toBe(true);
    expect(me(w).money).toBe(9e9 + 5e8);
    expect(cost(w)).toBe(base);
  });

  test("merge_money alone does not fire `married`", () => {
    let [w, pid] = partnerWorld(5e8);
    w = startStorylet(w, bundles, "core-loop/t-merge", pid).world;
    expect(milestoneReached(w, "married")).toBe(false);
  });

  test("marriage without a prenup merges the money and charges no separate share", () => {
    let [w, pid] = partnerWorld(5e8);
    w = startStorylet(w, bundles, "core-loop/t-move-in", pid).world;
    w = startStorylet(w, bundles, "core-loop/t-merge", pid).world;
    expect(me(w).money).toBe(9e9 + 5e8);
    expect(getPerson(w, pid).money).toBe(0);
    expect(cost(w)).toBe(base);
    // Moving in again after merging does not undo the merge.
    w = startStorylet(w, bundles, "core-loop/t-move-in", pid).world;
    expect(cost(w)).toBe(base);
  });

  test("marrying keeps the merge; a role change away from the household ends it", () => {
    let [w, pid] = partnerWorld(5e8);
    w = startStorylet(w, bundles, "core-loop/t-merge", pid).world;
    w = startStorylet(w, bundles, "core-loop/t-wed", pid).world;
    expect(isJointSpouse(w, idx, pid)).toBe(true);
    w = startStorylet(w, bundles, "core-loop/t-divorce", pid).world;
    expect(isJointSpouse(w, idx, pid)).toBe(false);
    expect(
      w.relationships.some((r) => r.to === pid && r.household !== undefined),
    ).toBe(false);
    const back = deserializeWorld(serializeWorld(w));
    expect(isJointSpouse(back, idx, pid)).toBe(false);
  });

  test("the household flag survives a save round trip", () => {
    let [w, pid] = partnerWorld(9e9);
    w = startStorylet(w, bundles, "core-loop/t-move-in", pid).world;
    const back = deserializeWorld(serializeWorld(w));
    expect(cost(back)).toBe(cost(w));
  });
});

describe("living with a guardian", () => {
  /** A minor whose parents are all dead. */
  function orphan(age: number, money = 0): World {
    let w = newLife(bundles, 7, { cityId: std("riverton") });
    for (const r of w.relationships)
      if (r.from === w.playerId && r.role === std("parent"))
        w = killPerson(w, r.to, "test");
    return updatePerson(w, 0, (p) => ({ ...p, age, money }));
  }

  test("move out never applies under 18: a minor goes to a guardian", () => {
    for (const age of [0, 10, 17]) {
      const w = startLivingOnOwn(orphan(age, 0), idx, 0);
      const p = me(w);
      expect(p.withGuardian).toBe(true);
      expect(p.standardId).toBeUndefined();
      expect(livingCost(w, idx, p)).toBe(0);
    }
    const adult = startLivingOnOwn(orphan(18, 9e9), idx, 0);
    expect(me(adult).withGuardian).toBeUndefined();
    expect(me(adult).standardId).toBe(std("average"));
  });

  test("the last parent dying puts a minor with a guardian, not on their own", () => {
    let w = orphan(10);
    w = ageUp(w, bundles).world;
    expect(me(w).withGuardian).toBe(true);
    expect(me(w).withParents).toBe(false);
    expect(me(w).standardId).toBeUndefined();
  });

  test("a broke orphan gets no homeless standard, and a minor's standard never raises risk", () => {
    const w = startLivingOnOwn(orphan(12, 0), idx, 0);
    expect(me(w).livedStandardId).toBeUndefined();
    expect(me(settleLiving(w, idx)).money).toBe(0);
    const homeless = { ...me(orphan(12)), livedStandardId: std("homeless") };
    expect(riskBpOf(homeless, idx)).toBe(10000);
    expect(riskBpOf({ ...homeless, age: 30 }, idx)).toBeGreaterThan(10000);
  });

  test("the guardian waives costs, holds assets in trust, and hands over at 18 with a fresh standard", () => {
    let w = orphan(16, 9e9);
    w = startLivingOnOwn(w, idx, 0);
    expect(me(w).money).toBe(9e9);
    expect(me(settleLiving(w, idx)).money).toBe(9e9);
    const [owned] = grantAsset(w, idx, 0, std("house"));
    expect(me(owned).assets).toHaveLength(1);
    w = updatePerson(w, 0, (p) => ({ ...p, age: 17 }));
    w = ageUp(w, bundles).world;
    expect(me(w).age).toBe(18);
    expect(me(w).withGuardian).toBeUndefined();
    expect(me(w).withParents).toBe(false);
    expect(me(w).standardId).toBe(std("average"));
  });

  test("a minor can't shop while assets are in trust", () => {
    const w = startLivingOnOwn(orphan(15, 9e9), idx, 0);
    const rows = listShop(w, bundles);
    expect(rows.every((r) => r.locked)).toBe(true);
    expect(rows[0]?.canCash).toBe(false);
  });
});
