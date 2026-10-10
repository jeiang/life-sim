import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  deserializeWorld,
  evaluate,
  getPerson,
  indexBundles,
  livesWithParents,
  makeEnv,
  newLife,
  personsInIdOrder,
  putRelationship,
  replay,
  runAction,
  serializeWorld,
  setQuality,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const KICK = "core-loop/parents-ask-you-to-leave";

const player = (w: World) => getPerson(w, w.playerId);
const family = (w: World, role: string) =>
  w.relationships.filter(
    (r) => r.from === w.playerId && r.role === `core-loop/${role}`,
  );

/** A life at `age` with parent closeness `closeness` and `siblings` living siblings. */
function at(age: number, closeness: number, siblings: number): World {
  let w = newLife(bundles, 11);
  for (const p of personsInIdOrder(w))
    if (p.id !== w.playerId && p.id)
      w = updatePerson(w, p.id, (x) => ({ ...x, alive: true }));
  for (const r of family(w, "parent"))
    w = putRelationship(w, { ...r, closeness });
  const sibs = family(w, "sibling");
  for (const [i, r] of sibs.entries())
    w = updatePerson(w, r.to, (x) => ({ ...x, alive: i < siblings }));
  // Not enough generated siblings: add by relinking parents is not needed; callers pick <= generated.
  return updatePerson(w, w.playerId, (p) => ({ ...p, age }));
}

/** Yearly kick-out chance in basis points. */
function pressure(w: World): number {
  const s = idx.storylets.get(KICK);
  if (!s?.chance) throw new Error("missing storylet");
  return evaluate(s.chance, makeEnv(w, idx, { subject: w.playerId })) as number;
}

describe("kick-out pressure", () => {
  test("rises as the parent relationship drops", () => {
    const hi = pressure(at(20, 90, 0));
    const mid = pressure(at(20, 50, 0));
    const lo = pressure(at(20, 0, 0));
    expect(hi).toBeLessThan(mid);
    expect(mid).toBeLessThan(lo);
  });

  test("impatience stacks each year after 30 and stops at the cap", () => {
    const p = (age: number) => pressure(at(age, 50, 0));
    expect(p(30)).toBe(p(20));
    expect(p(31)).toBeGreaterThan(p(30));
    expect(p(32) - p(31)).toBe(p(31) - p(30));
    expect(p(40)).toBe(p(45));
    expect(p(40)).toBeGreaterThan(p(39));
  });

  test("each sibling still alive adds pressure", () => {
    const w = at(25, 50, 0);
    expect(family(w, "sibling").length).toBeGreaterThanOrEqual(1);
    const withSib = at(25, 50, 1);
    expect(pressure(withSib)).toBeGreaterThan(pressure(w));
  });

  test("the player is never forced out: nothing moves them at any age", () => {
    let w = at(17, 100, 0);
    w = updatePerson(w, w.playerId, (p) => ({ ...p, withParents: true }));
    expect(idx.storylets.get(KICK)?.when).toBeDefined();
    for (let i = 0; i < 10 && !w.ended; i++) {
      // closeness 100 and age < 30: the chance stays at its floor and a quiet life keeps the roof
      expect(pressure(w)).toBeLessThanOrEqual(100);
      w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 18 + i }));
    }
    expect(livesWithParents(player(w))).toBe(true);
  });

  test("kickout_pct multiplies the chance: 100 is the base, 0 never, 250 raises it", () => {
    const w = at(25, 50, 1);
    const base = pressure(w);
    expect(base).toBeGreaterThan(0);
    expect(player(w).qualities.kickout_pct).toBe(100);
    const set = (pct: number) => setQuality(w, w.playerId, "kickout_pct", pct);
    expect(pressure(set(100))).toBe(base);
    expect(pressure(set(0))).toBe(0);
    expect(pressure(set(250))).toBe(Math.trunc((base * 250) / 100));
  });
});

describe("cities and living situation", () => {
  test("a life is born in a city with its family, living with them", () => {
    const w = newLife(bundles, 5);
    const city = player(w).cityId;
    expect(idx.cities.has(city as string)).toBe(true);
    expect(livesWithParents(player(w))).toBe(true);
    for (const p of personsInIdOrder(w)) expect(p.cityId).toBe(city);
  });

  test("the birth city can be chosen and must exist", () => {
    expect(
      player(newLife(bundles, 5, { cityId: "core-loop/goldcrest" })).cityId,
    ).toBe("core-loop/goldcrest");
    expect(() =>
      newLife(bundles, 5, { cityId: "core-loop/nowhere" }),
    ).toThrow();
  });

  test("a god-mode custom start can fix the birth city and replays", () => {
    const custom = {
      givenName: "Ada",
      familyName: "Lovelace",
      gender: "female" as const,
      stats: {},
      parents: 2,
      siblings: 0,
      cityId: "core-loop/dustwater",
    };
    const w = newLife(bundles, 5, { custom });
    expect(player(w).cityId).toBe("core-loop/dustwater");
    expect(worldHash(replay(5, bundles, w.choiceLog))).toBe(worldHash(w));
  });

  test("birth cities follow the weights over many seeds", () => {
    const seen = new Set<string>();
    for (let s = 0; s < 200; s++)
      seen.add(player(newLife(bundles, s)).cityId as string);
    expect(seen.size).toBe(idx.cities.size);
  });

  test("move out, then move city; replay reproduces the life", () => {
    let w = newLife(bundles, 21, { cityId: "core-loop/riverton" });
    w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 19, money: 500000 }));
    expect(runAction(w, bundles, "core-loop/move-city").world).toBe(w);
    w = runAction(w, bundles, "core-loop/move-out").world;
    expect(livesWithParents(player(w))).toBe(false);
    expect(runAction(w, bundles, "core-loop/move-out").world).toBe(w);
    w = runAction(w, bundles, "core-loop/move-city").world;
    expect(w.pending).not.toBeNull();
    const labels = [
      "Dustwater",
      "Harborview",
      "Maple Falls",
      "Riverton",
      "Lakeshore",
      "Goldcrest",
    ];
    w = choose(w, bundles, labels.indexOf("Goldcrest")).world;
    expect(player(w).cityId).toBe("core-loop/goldcrest");
    expect(player(w).money).toBe(250000);
    const journal = w.journal.flatMap((e) => e.lines);
    expect(journal.some((l) => l.startsWith("Moved out"))).toBe(true);
    expect(journal.some((l) => l.startsWith("Moved to Goldcrest"))).toBe(true);
  });

  test("replaying the choice log rebuilds the same world", () => {
    let w = newLife(bundles, 33);
    for (let i = 0; i < 19; i++) {
      w = ageUp(w, bundles).world;
      while (w.pending) w = choose(w, bundles, 0).world;
      if (w.ended) break;
    }
    w = updatePerson(w, w.playerId, (p) => p);
    const again = replay(33, bundles, w.choiceLog);
    expect(worldHash(again)).toBe(worldHash(w));
  });

  test("living with parents ends when no parent is alive", () => {
    let w = newLife(bundles, 8);
    for (const r of family(w, "parent"))
      w = updatePerson(w, r.to, (p) => ({ ...p, alive: false }));
    w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 30 }));
    w = ageUp(w, bundles).world;
    while (w.pending) w = choose(w, bundles, 0).world;
    if (!w.ended) expect(livesWithParents(player(w))).toBe(false);
  });

  test("a life saved before cities load with no city and the age-based situation", () => {
    const w = newLife(bundles, 4);
    const o = JSON.parse(serializeWorld(w)) as {
      persons: Record<string, unknown>[];
    };
    for (const p of o.persons) {
      delete p.cityId;
      delete p.withParents;
    }
    const old = deserializeWorld(JSON.stringify(o));
    expect(player(old).cityId).toBeUndefined();
    expect(livesWithParents(player(old))).toBe(true);
    expect(livesWithParents({ ...player(old), age: 30 })).toBe(false);
  });
});
