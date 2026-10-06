import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  type CustomStart,
  choose,
  deserializeWorld,
  getPerson,
  godSetMoney,
  godSetStat,
  isGodLife,
  newLife,
  replay,
  serializeWorld,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const custom: CustomStart = {
  givenName: "Ada",
  familyName: "Lovelace",
  gender: "female",
  stats: { happiness: 12, health: 99 },
  parents: 1,
  siblings: 3,
};

const me = (w: ReturnType<typeof newLife>) => getPerson(w, w.playerId);

function play(w: ReturnType<typeof newLife>, years: number) {
  for (let y = 0; y < years && !w.ended; y++) {
    w = ageUp(w, bundles).world;
    while (w.pending) w = choose(w, bundles, 0).world;
  }
  return w;
}

describe("god mode", () => {
  test("a custom start fixes the chosen options and logs a start entry first", () => {
    const w = newLife(bundles, 5, { custom });
    expect(me(w)).toMatchObject({
      givenName: "Ada",
      familyName: "Lovelace",
      gender: "female",
      stats: { happiness: 12, health: 99 },
    });
    expect(w.choiceLog).toEqual([{ t: "start", ...custom }]);
    const roles = w.relationships.filter((r) => r.from === w.playerId);
    expect(roles.length).toBe(4); // 1 parent + 3 siblings
  });

  test("replay of a custom start with edits matches the world hash", () => {
    let w = newLife(bundles, 9, { custom });
    w = play(w, 3);
    w = godSetStat(w, "health", 5);
    w = godSetMoney(w, 123456);
    w = play(w, 2);
    w = godSetStat(w, "happiness", 250); // clamps to 100
    expect(me(w).stats.happiness).toBe(100);
    const again = replay(w.seed, bundles, w.choiceLog);
    expect(worldHash(again)).toBe(worldHash(w));
  });

  test("replay of edits on a plain life matches, and the log survives serialization", () => {
    let w = newLife(bundles, 3);
    w = godSetMoney(play(w, 2), -500);
    w = godSetStat(w, "health", 1);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(replay(back.seed, bundles, back.choiceLog))).toBe(
      worldHash(w),
    );
    expect(me(back).money).toBe(-500);
  });

  test("edits are rejected for unknown stats, fractional money and ended lives", () => {
    const w = newLife(bundles, 3);
    expect(() => godSetStat(w, "nope", 1)).toThrow(/unknown stat/);
    expect(() => godSetMoney(w, 1.5)).toThrow(/whole number/);
    expect(() => godSetMoney({ ...w, ended: {} as never }, 1)).toThrow(/over/);
  });

  test("only edited or custom lives count as god lives", () => {
    const w = newLife(bundles, 3);
    expect(isGodLife(w)).toBe(false);
    expect(isGodLife(godSetMoney(w, 1))).toBe(true);
    expect(isGodLife(newLife(bundles, 3, { custom }))).toBe(true);
  });
});
