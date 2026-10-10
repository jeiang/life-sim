import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  getPerson,
  grantAsset,
  indexBundles,
  listActions,
  listShop,
  livingCost,
  makeEnv,
  newLife,
  type PackBundle,
  purchase,
  replay,
  runAction,
  sell,
  settleLiving,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "confinement"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;
const idx = indexBundles(bundles);
const me = (w: World) => getPerson(w, w.playerId);
const run = (w: World, id: string) => runAction(w, bundles, `life/${id}`).world;
const confined = (w: World) =>
  makeEnv(w, idx, { subject: w.playerId }).get("confined");
const rows = (w: World, menu: string) =>
  Object.fromEntries(
    listActions(w, bundles, menu).map((r) => [r.id.slice(5), r.locked]),
  );

const adult = (): World =>
  updatePerson(newLife(bundles, 1), 0, (p) => ({
    ...p,
    age: 30,
    money: 100_000,
  }));

describe("confinement", () => {
  test("menus lock except custody-ok actions", () => {
    const free = adult();
    expect(confined(free)).toBe(false);
    expect(rows(free, "activities")).toEqual({ read: false, jog: false });

    const w = run(free, "arrest");
    expect(confined(w)).toBe(true);
    expect(rows(w, "activities")).toEqual({ read: false, jog: true });
    const stuck = run(w, "jog");
    expect(me(stuck).stats.happiness).toBe(me(w).stats.happiness);
    expect(me(run(w, "read")).stats.happiness).toBe(
      (me(w).stats.happiness ?? 0) + 1,
    );
  });

  test("shop rows and sales lock; release unlocks", () => {
    const [owned, assetId] = grantAsset(adult(), idx, 0, "life/trinket");
    expect(listShop(owned, bundles).every((r) => !r.locked)).toBe(true);

    const w = run(owned, "arrest");
    expect(listShop(w, bundles).every((r) => r.locked)).toBe(true);
    expect(() => purchase(w, bundles, "life/trinket", "cash")).toThrow(
      /confined/,
    );
    expect(() => sell(w, bundles, assetId)).toThrow(/confined/);

    const out = run(w, "release");
    expect(confined(out)).toBe(false);
    expect(rows(out, "activities").jog).toBe(false);
    expect(listShop(out, bundles).every((r) => !r.locked)).toBe(true);
    expect(me(sell(out, bundles, assetId).world).assets).toHaveLength(0);
  });

  test("events: only custody-ok ones are drawn", () => {
    const text = (w: World) => ageUp(w, bundles).lines.join("\n");
    const before = text(adult());
    expect(before).toContain("A visitor.");
    expect(before).toContain("A party.");
    const during = text(run(adult(), "arrest"));
    expect(during).toContain("A visitor.");
    expect(during).not.toContain("A party.");
  });

  test("events-only confinement leaves menus and the shop open", () => {
    const w = run(adult(), "admit");
    expect(confined(w)).toBe(true);
    expect(rows(w, "activities")).toEqual({ read: false, jog: false });
    expect(listShop(w, bundles).every((r) => !r.locked)).toBe(true);
    expect(ageUp(w, bundles).lines.join("\n")).not.toContain("A party.");
  });

  test("replay reproduces a confined life", () => {
    let w = run(newLife(bundles, 1), "arrest");
    w = ageUp(w, bundles).world;
    w = run(w, "release");
    w = ageUp(w, bundles).world;
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
  });
});

describe("confinement and housing", () => {
  const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
    only: ["core-loop"],
  });
  if (!real.ok)
    throw new Error(real.diagnostics.map((d) => d.message).join("\n"));

  test("a confining occupation provides housing: no living cost, no effects", () => {
    const b = (structuredClone(real.bundles) as PackBundle[]).map((x) => ({
      ...x,
      occupations: x.occupations.map((o) =>
        o.id === "core-loop/cashier"
          ? { ...o, confines: { menus: true, events: false } }
          : o,
      ),
    })) as PackBundle[];
    const index = indexBundles(b);
    let w = updatePerson(
      newLife(b, 3, { cityId: "core-loop/riverton" }),
      0,
      (p) => ({
        ...p,
        age: 30,
        money: 1_000_000,
        withParents: false,
        standardId: "core-loop/rich",
        livedStandardId: "core-loop/rich",
        stats: { ...p.stats, happiness: 50, health: 50 },
      }),
    );
    expect(livingCost(w, index, me(w))).toBeGreaterThan(0);
    w = updatePerson(w, 0, (p) => ({
      ...p,
      occupations: [
        {
          id: 99,
          kindId: "core-loop/cashier",
          group: "part-time",
          startedAt: 20,
          startedAge: 20,
          years: 1,
          performance: 50,
          pay: 0,
        },
      ],
    }));
    expect(livingCost(w, index, me(w))).toBe(0);
    const after = settleLiving(w, index);
    expect(me(after).money).toBe(1_000_000);
    expect(me(after).stats).toMatchObject({ happiness: 50, health: 50 });
  });
});
