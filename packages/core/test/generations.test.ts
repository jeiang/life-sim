import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  cyrb128,
  deserializeWorld,
  getPerson,
  newLife,
  Rng,
  replay,
  serializeWorld,
  streamFor,
  succeed,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

function play(w: World, years: number): World {
  for (let y = 0; y < years && !w.ended; y++) {
    w = ageUp(w, bundles).world;
    while (w.pending) w = choose(w, bundles, 0).world;
  }
  return w;
}

function heirOf(w: World): number {
  const h = [...w.persons.values()].find((p) => p.alive && p.id !== w.playerId);
  if (!h) throw new Error("no heir in fixture");
  return h.id;
}

const draws = (r: Rng) => Array.from({ length: 6 }, () => r.next32());

describe("streamFor generations", () => {
  test("generation 0 is the original derivation; generation 1 differs", () => {
    const [a, b, c, d] = cyrb128("7|30|2|chance/x");
    expect(draws(streamFor(7, 30, "chance/x", 2))).toEqual(
      draws(new Rng(a, b, c, d)),
    );
    expect(draws(streamFor(7, 30, "chance/x", 2, 0))).toEqual(
      draws(streamFor(7, 30, "chance/x", 2)),
    );
    expect(draws(streamFor(7, 30, "chance/x", 2, 1))).not.toEqual(
      draws(streamFor(7, 30, "chance/x", 2, 0)),
    );
    expect(draws(streamFor(7, 30, "chance/x", 2, 1))).not.toEqual(
      draws(streamFor(7, 30, "chance/x", 2, 2)),
    );
  });
});

describe("succession", () => {
  test("worldYear is monotonic across succession; generation and resets apply", () => {
    let w = play(newLife(bundles, 11), 5);
    expect(w.generation).toBe(0);
    expect(w.worldYear).toBe(5);
    const heir = heirOf(w);
    w = succeed(w, heir);
    expect(w).toMatchObject({
      playerId: heir,
      generation: 1,
      worldYear: 5,
      storyletLog: {},
      rngCounters: {},
    });
    w = play(w, 3);
    expect(w.worldYear).toBe(8);
    expect(w.generation).toBe(1);
  });

  test("storyletLog is non-empty before succession and empty after", () => {
    const w = {
      ...newLife(bundles, 3),
      storyletLog: { "a/b": { count: 2, lastAge: 5 } },
    };
    expect(succeed(w, heirOf(w)).storyletLog).toEqual({});
  });

  test("the repeatable-action counters reset at succession", () => {
    const w = { ...newLife(bundles, 3), uses: { "a/b": 4 } };
    expect(succeed(w, heirOf(w)).uses).toEqual({});
  });

  test("an heir's life is a different draw sequence from the founder's", () => {
    const base = newLife(bundles, 21);
    const founder = play(base, 6);
    const s = succeed(base, heirOf(base));
    // same ages, same counters, same seed: only the generation differs
    const g0 = streamFor(base.seed, 1, "year/quiet", 0, base.generation);
    const g1 = streamFor(s.seed, 1, "year/quiet", 0, s.generation);
    expect(draws(g1)).not.toEqual(draws(g0));
    expect(founder.generation).toBe(0);
  });

  test("rejects the current player and the dead", () => {
    const w = newLife(bundles, 4);
    expect(() => succeed(w, w.playerId)).toThrow(RangeError);
  });

  test("deterministic: replay reproduces the world hash, and the hash covers generation and clock", () => {
    let w = play(newLife(bundles, 8), 4);
    w = play(succeed(w, heirOf(w)), 4);
    const r = replay(w.seed, bundles, w.choiceLog);
    expect(worldHash(r)).toBe(worldHash(w));
    expect(worldHash({ ...w, generation: 0 })).not.toBe(worldHash(w));
    expect(worldHash({ ...w, worldYear: w.worldYear + 1 })).not.toBe(
      worldHash(w),
    );
    expect(deserializeWorld(serializeWorld(w))).toEqual(w);
  });

  test("a save from before generations loads as generation 0 with the clock at the player's age", () => {
    const w = play(newLife(bundles, 2), 6);
    const raw = JSON.parse(serializeWorld(w));
    delete raw.generation;
    delete raw.worldYear;
    const old = deserializeWorld(JSON.stringify(raw));
    expect(old.generation).toBe(0);
    expect(old.worldYear).toBe(getPerson(w, w.playerId).age);
  });
});
