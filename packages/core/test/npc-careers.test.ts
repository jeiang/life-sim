import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  deserializeWorld,
  enterRole,
  getPerson,
  incomeTier,
  indexBundles,
  jobLabelOf,
  makeEnv,
  newLife,
  type PackBundle,
  putRelationship,
  serializeWorld,
  spawnPerson,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";
import { applyEffects } from "../src/sim/effects.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"));
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));

const PARTNER = "core-loop/partner";
const SPOUSE = "core-loop/spouse";
const GEN = "core-loop/coworker-gen";

/** The real bundles with the NPC career rates overridden. */
function tuned(
  over: Partial<NonNullable<PackBundle["npcCareers"]>>,
): readonly PackBundle[] {
  return real.bundles.map((b) =>
    b.id === "core-loop" && b.npcCareers
      ? { ...b, npcCareers: { ...b.npcCareers, ...over } }
      : b,
  );
}

/** A 25-year-old player with a 30-year-old person held in `role`. */
function withPerson(bundles: readonly PackBundle[], role: string) {
  const idx = indexBundles(bundles);
  let w = newLife(bundles, 5);
  w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 25 }));
  let id: number;
  [w, id] = spawnPerson(w, idx, w.playerId, role, GEN);
  w = updatePerson(w, id, (p) => ({ ...p, age: 30 }));
  return { w: enterRole(w, idx, id, role), id, idx };
}

function year(w: World, bundles: readonly PackBundle[]): World {
  let r = ageUp(w, bundles).world;
  while (r.pending) r = choose(r, bundles, 0).world;
  return r;
}

const held = (w: World, id: number) =>
  getPerson(w, id).occupations.map((o) => o.kindId);

describe("NPC careers", () => {
  const bundles = real.bundles;

  test("entering a career role starts a real job; other roles keep a static label", () => {
    const { w, id, idx } = withPerson(bundles, PARTNER);
    expect(held(w, id)).toHaveLength(1);
    expect(idx.occupations.get(held(w, id)[0] as string)?.group).toBe(
      "full-time",
    );
    const idx2 = indexBundles(bundles);
    let w2 = newLife(bundles, 5);
    let f: number;
    [w2, f] = spawnPerson(w2, idx2, w2.playerId, "core-loop/friend", GEN);
    expect(getPerson(w2, f).occupations).toEqual([]);
    expect(getPerson(w2, f).job?.label).toBeTruthy();
    expect(jobLabelOf(w2, idx2, f)).toBe(getPerson(w2, f).job?.label);
  });

  test("pay accrues into person.money yearly", () => {
    const { w, id } = withPerson(tuned({ jobLossBp: 0 }), PARTNER);
    const b = tuned({ jobLossBp: 0 });
    const w1 = year(w, b);
    const pay = getPerson(w1, id).occupations[0]?.pay as number;
    expect(pay).toBeGreaterThan(0);
    expect(getPerson(w1, id).money).toBe(pay);
    expect(getPerson(year(w1, b), id).money).toBeGreaterThan(pay);
  });

  test("promotion climbs the ladder; job loss ends the job and re-hire follows", () => {
    const b = tuned({ promotionBp: 10000, jobLossBp: 0 });
    let { w, id, idx } = withPerson(b, PARTNER);
    w = updatePerson(w, id, (p) => ({
      ...p,
      occupations: p.occupations.map((o) => ({
        ...o,
        kindId: "core-loop/server",
      })),
    }));
    expect(idx.occupations.get("core-loop/server")?.promotionYears).toBe(2);
    w = year(year(year(w, b), b), b);
    expect(held(w, id)).not.toContain("core-loop/server");

    const lose = tuned({ jobLossBp: 10000, hireBp: 0 });
    const s = withPerson(lose, PARTNER);
    const after = year(s.w, lose);
    expect(held(after, s.id)).toEqual([]);
    expect(getPerson(after, s.id).occupationHistory).toHaveLength(1);
    const hire = tuned({ jobLossBp: 10000, hireBp: 10000 });
    const hs = withPerson(hire, PARTNER);
    expect(held(year(year(hs.w, hire), hire), hs.id)).toHaveLength(1);
  });

  test("retirement by age starts the pension kind", () => {
    const b = tuned({ jobLossBp: 0, retireAge: 60 });
    const s = withPerson(b, PARTNER);
    const { id } = s;
    const w = updatePerson(s.w, id, (p) => ({ ...p, age: 59 }));
    const r = year(w, b);
    expect(getPerson(r, id).age).toBe(60);
    expect(held(r, id)).toEqual(["core-loop/retired"]);
  });

  test("leaving the role keeps the record but stops pay and rolls", () => {
    const { w, id } = withPerson(bundles, PARTNER);
    const gone = {
      ...w,
      relationships: w.relationships.filter((r) => r.to !== id),
    };
    const next = year(gone, bundles);
    expect(getPerson(next, id).money).toBe(0);
    expect(getPerson(next, id).occupations).toEqual(
      getPerson(gone, id).occupations,
    );
  });

  test("a merged household pays the player; an unmerged spouse keeps their own pay", () => {
    const { w, id } = withPerson(bundles, PARTNER);
    const link = (household?: "merged") =>
      putRelationship(w, {
        from: w.playerId,
        to: id,
        role: SPOUSE,
        closeness: 60,
        ...(household ? { household } : {}),
      });
    const merged = year(link("merged"), bundles);
    expect(getPerson(merged, id).money).toBe(0);
    const pay = getPerson(merged, id).occupations[0]?.pay as number;
    expect(getPerson(merged, merged.playerId).money).toBeGreaterThanOrEqual(
      pay,
    );
    expect(getPerson(year(link(), bundles), id).money).toBeGreaterThan(0);
  });

  test("person.money reads and moves; income tier follows pay and wealth", () => {
    const { w, id, idx } = withPerson(bundles, PARTNER);
    const rich = updatePerson(w, id, (p) => ({ ...p, money: 100 }));
    const env = makeEnv(rich, idx, { subject: rich.playerId, person: id });
    expect(env.get("person.money")).toBe(100);
    const moved = applyEffects(
      rich,
      idx,
      [
        ["add", "person.money", 50],
        ["sub", "person.money", 20],
      ],
      { subject: rich.playerId, person: id },
      new Map(),
    );
    expect(getPerson(moved, id).money).toBe(130);
    expect(getPerson(moved, moved.playerId).money).toBe(
      getPerson(rich, rich.playerId).money,
    );
    const poor = incomeTier(rich, idx, id);
    const wealthy = incomeTier(
      updatePerson(rich, id, (p) => ({ ...p, money: 1_000_000_000 })),
      idx,
      id,
    );
    expect(wealthy).toBeGreaterThan(poor);
  });

  test("deterministic, and persons with careers round-trip through a save", () => {
    const run = () =>
      year(year(withPerson(bundles, PARTNER).w, bundles), bundles);
    expect(worldHash(run())).toBe(worldHash(run()));
    const w = run();
    expect(serializeWorld(deserializeWorld(serializeWorld(w)))).toBe(
      serializeWorld(w),
    );
  });
});
