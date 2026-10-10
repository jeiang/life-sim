import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  choose,
  deserializeWorld,
  getPerson,
  grantAsset,
  indexBundles,
  livingCost,
  newLife,
  type PackBundle,
  runAction,
  serializeWorld,
  settleLiving,
  standardCost,
  standardOf,
  updatePerson,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const std = (id: string) => `core-loop/${id}`;
const me = (w: World) => getPerson(w, w.playerId);

/** A 30-year-old on their own in `city` with `money`, at `standard`. */
function own(
  city: string,
  money: number,
  standard = "average",
  b: readonly PackBundle[] = bundles,
): World {
  let w = newLife(b, 3, { cityId: std(city) });
  w = updatePerson(w, w.playerId, (p) => ({
    ...p,
    age: 30,
    money,
    withParents: false,
    standardId: std(standard),
    livedStandardId: std(standard),
    stats: { ...p.stats, happiness: 50, health: 50 },
  }));
  return w;
}
const settle = (w: World, b: readonly PackBundle[] = bundles) =>
  settleLiving(w, indexBundles(b));

describe("cost of living", () => {
  test("base cost times the city cost index", () => {
    const base = idx.standardsById.get(std("average"))?.cost as number;
    for (const [city, index] of [
      ["dustwater", 70],
      ["riverton", 110],
      ["goldcrest", 180],
    ] as const)
      expect(livingCost(own(city, 9e9), idx, me(own(city, 9e9)))).toBe(
        Math.trunc((base * index) / 100),
      );
  });

  test("a home in the current city removes the housing share; one elsewhere does not", () => {
    const w = own("riverton", 9e9);
    const full = livingCost(w, idx, me(w));
    const [withHome] = grantAsset(w, idx, w.playerId, std("house"));
    const owner = me(withHome);
    const share = (idx.living?.housingShareBp as number) / 10000;
    expect(livingCost(withHome, idx, owner)).toBe(
      full - Math.trunc(full * share),
    );
    expect(livingCost(withHome, idx, owner)).toBeLessThan(full);
    const moved = updatePerson(withHome, w.playerId, (p) => ({
      ...p,
      cityId: std("goldcrest"),
    }));
    // Moving does not sell the home, but it only counts where it stands.
    expect(me(moved).assets).toHaveLength(1);
    const cost = (c: string) =>
      standardCost(
        { ...me(moved), cityId: std(c) },
        idx,
        idx.standardsById.get(std("average")) as never,
      );
    expect(cost("goldcrest")).toBeGreaterThan(
      Math.trunc(cost("riverton") * 1.5),
    );
    const noHomeHere = livingCost(moved, idx, me(moved));
    const sameCityNoHome = livingCost(moved, idx, { ...me(moved), assets: [] });
    expect(noHomeHere).toBe(sameCityNoHome);
  });

  test("a minor with a guardian (last parent dead) is never charged or downgraded", () => {
    let w = own("riverton", 1_000, "wealthy");
    w = updatePerson(w, 0, (p) => ({ ...p, age: 15, withGuardian: true }));
    expect(livingCost(w, idx, me(w))).toBe(0);
    const after = settle(w);
    expect(me(after).money).toBe(1_000);
    expect(me(after).livedStandardId).toBe(std("wealthy"));
    expect(me(after).stats).toMatchObject({ happiness: 50, health: 50 });
  });

  test("nothing is charged with parents", () => {
    const w = updatePerson(own("riverton", 1e6), 0, (p) => ({
      ...p,
      withParents: true,
    }));
    expect(livingCost(w, idx, me(w))).toBe(0);
    expect(me(settle(w)).money).toBe(1e6);
  });
});

describe("settlement", () => {
  test("pays the cost and applies the standard's yearly effects", () => {
    const w = settle(own("riverton", 5e7, "above-average"));
    const cost = standardCost(
      me(own("riverton", 0)),
      idx,
      idx.standardsById.get(std("above-average")) as never,
    );
    expect(me(w).money).toBe(5e7 - cost);
    expect(me(w).stats).toMatchObject({ happiness: 51, health: 51 });
  });

  test("a positive effect stops at the cap and never lowers a stat above it", () => {
    let w = own("riverton", 5e7, "above-average");
    w = updatePerson(w, 0, (p) => ({
      ...p,
      stats: { ...p.stats, happiness: 85, health: 99 },
    }));
    w = settle(w);
    expect(me(w).stats).toMatchObject({ happiness: 85, health: 99 });
  });

  test("a lower standard hurts every year", () => {
    const w = settle(own("riverton", 0, "homeless"));
    expect(me(w).stats).toMatchObject({ happiness: 48, health: 50 });
  });

  test("savings short of the cost: drop to the best standard they can afford, money never negative", () => {
    const start = own("riverton", 1_500_000, "wealthy");
    const w = settle(start);
    const lived = standardOf(me(w), idx);
    expect(lived?.id).not.toBe(std("wealthy"));
    const paid = standardCost(me(start), idx, lived as never);
    expect(paid).toBeLessThanOrEqual(1_500_000);
    expect(me(w).money).toBe(1_500_000 - paid);
    expect(me(w).money).toBeGreaterThanOrEqual(0);
    // Nothing more expensive was affordable.
    for (const s of idx.standards)
      if (s.cost > (lived?.cost ?? 0))
        expect(standardCost(me(start), idx, s)).toBeGreaterThan(1_500_000);
    expect(
      w.journal
        .flatMap((e) => e.lines)
        .some((l) => l.includes("cannot afford")),
    ).toBe(true);
    // The choice stands, so a richer year restores it.
    expect(me(w).standardId).toBe(std("wealthy"));
    const richer = settle(updatePerson(w, 0, (p) => ({ ...p, money: 5e8 })));
    expect(standardOf(me(richer), idx)?.id).toBe(std("wealthy"));
  });

  test("broke: homeless, nothing charged, money stays zero", () => {
    const w = settle(own("goldcrest", 0, "average"));
    expect(standardOf(me(w), idx)?.id).toBe(std("homeless"));
    expect(me(w).money).toBe(0);
  });

  test("housing provided by an occupation waives the cost and the effects", () => {
    const clone = structuredClone(bundles) as PackBundle[];
    const b = clone.map((x) => ({
      ...x,
      occupations: x.occupations.map((o) =>
        o.id === std("cashier") ? { ...o, providesHousing: true } : o,
      ),
    })) as PackBundle[];
    const index = indexBundles(b);
    let w = own("riverton", 1_000_000, "rich", b);
    w = updatePerson(w, 0, (p) => ({
      ...p,
      occupations: [
        {
          id: 99,
          kindId: std("cashier"),
          group: "part-time",
          startedAge: 20,
          years: 1,
          performance: 50,
          pay: 0,
        },
      ],
    }));
    expect(livingCost(w, index, me(w))).toBe(0);
    const after = settle(w, b);
    expect(me(after).money).toBe(1_000_000);
    expect(me(after).stats).toMatchObject({ happiness: 50, health: 50 });
  });
});

describe("moving out and choosing", () => {
  test("moving out takes average, or the best affordable when short", () => {
    const young = (money: number) =>
      updatePerson(
        newLife(bundles, 5, { cityId: std("riverton") }),
        0,
        (p) => ({
          ...p,
          age: 19,
          money,
        }),
      );
    let w = runAction(young(9e8), bundles, std("move-out")).world;
    expect(me(w).standardId).toBe(std("average"));
    w = runAction(young(1_000_000), bundles, std("move-out")).world;
    expect(me(w).standardId).not.toBe(std("average"));
    expect(
      standardCost(
        me(w),
        idx,
        idx.standardsById.get(me(w).standardId as string) as never,
      ),
    ).toBeLessThanOrEqual(1_000_000);
  });

  test("the menu action sets the standard; the choice replays", () => {
    let w = own("riverton", 9e8);
    w = runAction(w, bundles, std("choose-standard")).world;
    const labels = idx.standards.map((s) => s.label);
    w = choose(w, bundles, labels.indexOf("Wealthy")).world;
    expect(me(w).standardId).toBe(std("wealthy"));
    expect(me(w).livedStandardId).toBe(std("wealthy"));
  });

  test("old saves without a standard load and pay the default one", () => {
    const w = own("riverton", 9e8);
    const raw = JSON.parse(serializeWorld(w)) as {
      persons: Record<string, unknown>[];
    };
    for (const p of raw.persons) {
      delete p.standardId;
      delete p.livedStandardId;
    }
    const old = deserializeWorld(JSON.stringify(raw));
    expect(standardOf(me(old), idx)?.id).toBe(std("average"));
    expect(livingCost(old, idx, me(old))).toBeGreaterThan(0);
  });
});
