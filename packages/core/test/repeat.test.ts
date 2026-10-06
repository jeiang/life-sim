import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  getPerson,
  newLife,
  personsInIdOrder,
  replay,
  runAction,
  setStat,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const player = (w: World) => getPerson(w, w.playerId);
const fresh = (): World => {
  let w = newLife(bundles, 5);
  w = setStat(w, w.playerId, "happiness", 0);
  return setStat(w, w.playerId, "health", 100);
};
const use = (w: World, id: string, target?: number): World =>
  runAction(w, bundles, id, target).world;
const times = (w: World, id: string, n: number, target?: number): World => {
  for (let i = 0; i < n; i++) w = use(w, id, target);
  return w;
};
const closeness = (w: World, id: number): number =>
  w.relationships.find((r) => r.from === w.playerId && r.to === id)
    ?.closeness ?? 0;

describe("repeatable actions", () => {
  test("gains are full to use 10, a quarter to use 20, then nothing", () => {
    const happy = (n: number) =>
      player(times(fresh(), "life/train", n)).stats.happiness;
    expect(happy(10)).toBe(80);
    expect(happy(11)).toBe(82); // 8 * 25% = 2
    const small = (n: number) =>
      player(times(fresh(), "life/train-small", n)).stats.happiness;
    expect([10, 11, 20, 21].map(small)).toEqual([40, 41, 50, 50]);
  });

  test("a curve override and rounding toward zero", () => {
    const happy = (n: number) =>
      player(times(fresh(), "life/train-short", n)).stats.happiness;
    expect([1, 2, 3, 4].map(happy)).toEqual([9, 13, 13, 13]); // 9 * 50% = 4.5 -> 4
  });

  test("only gains shrink: costs, money, harms and qualities stay whole", () => {
    const p = player(times(fresh(), "life/train", 25));
    // = player(w);
    expect(p.stats.health).toBe(100 - 25 * 3);
    expect(p.money).toBe(25 * 950);
    expect(p.qualities.lucky).toBe(5); // clamped at its max, still counted each use
  });

  test("closeness gains shrink, losses do not; each person counts apart", () => {
    const base = fresh();
    const [mom, dad] = personsInIdOrder(base)
      .filter((p) => p.id !== base.playerId)
      .map((p) => p.id) as [number, number];
    const zeroed: World = {
      ...base,
      relationships: base.relationships.map((r) => ({ ...r, closeness: 0 })),
    };
    // each hug is +8 then -1: +7 at full effect, +2 -1 = +1 reduced, -1 once spent
    expect(closeness(times(zeroed, "life/hug", 10, mom), mom)).toBe(70);
    expect(closeness(times(zeroed, "life/hug", 11, mom), mom)).toBe(71);
    expect(closeness(times(zeroed, "life/hug", 21, mom), mom)).toBe(79);
    const w = use(times(zeroed, "life/hug", 12, mom), "life/hug", dad);
    expect(closeness(w, dad)).toBe(7);
    expect(w.uses[`life/hug#${dad}`]).toBe(1);
  });

  test("counters reset at age-up and survive replay and the hash", () => {
    let w = times(newLife(bundles, 5), "life/train", 12);
    expect(w.uses["life/train"]).toBe(12);
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    w = ageUp(w, bundles).world;
    expect(w.uses).toEqual({});
    w = setStat(w, w.playerId, "happiness", 0);
    expect(player(use(w, "life/train")).stats.happiness).toBe(8);
  });

  test("the outcome says so once returns diminish", () => {
    const last = (w: World) => (w.journal.at(-1)?.lines ?? []).at(-1) ?? "";
    expect(last(times(fresh(), "life/train", 10))).not.toContain("tired");
    expect(last(times(fresh(), "life/train", 11))).toContain("tired of this");
    expect(last(times(fresh(), "life/train", 21))).toContain("no longer helps");
  });
});
