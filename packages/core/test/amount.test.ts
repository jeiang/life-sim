import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  choose,
  describePending,
  getPerson,
  listActions,
  newLife,
  parseSave,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  serializeSave,
  serializeWorld,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "amount"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const withMoney = (money: number, seed = 5): World => {
  const w = newLife(bundles, seed);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age: 20, money }));
};
const money = (w: World) => getPerson(w, w.playerId).money;
const row = (w: World, id: string) =>
  listActions(w, bundles, "activities").find((r) => r.id === id);

describe("amount input", () => {
  test("listing resolves the range from the player's state", () => {
    expect(row(withMoney(700), "amt/stake")?.amount).toEqual({
      min: 200,
      max: 700,
      step: 100,
    });
    expect(row(withMoney(5000), "amt/stake")?.amount?.max).toBe(1000);
    expect(row(withMoney(5000), "amt/donate")?.amount).toEqual({
      min: 100,
      max: 1000,
      step: 1,
    });
  });

  test("an action whose minimum exceeds the player's money is disabled", () => {
    const poor = row(withMoney(150), "amt/stake");
    expect(poor).toMatchObject({
      locked: true,
      reason: "Needs at least $2.00",
    });
    expect(row(withMoney(150), "amt/donate")?.locked).toBe(false);
    const w = withMoney(150);
    expect(runAction(w, bundles, "amt/stake", undefined, 200).world).toBe(w);
  });

  test("amounts must sit on the min + k*step grid inside the range", () => {
    const w = withMoney(5000);
    for (const bad of [199, 250, 1100, 100.5, Number.NaN])
      expect(() => runAction(w, bundles, "amt/stake", undefined, bad)).toThrow(
        RangeError,
      );
    expect(() => runAction(w, bundles, "amt/stake")).toThrow(/needs an amount/);
    expect(() => runAction(w, bundles, "amt/after", undefined, 1)).toThrow(
      /takes no amount/,
    );
    expect(
      runAction(w, bundles, "amt/donate", undefined, 101).world,
    ).toBeTruthy();
    expect(() => runAction(w, bundles, "amt/donate", undefined, 1001)).toThrow(
      RangeError,
    );
  });

  test("amount is bound in outcomes and renders as money", () => {
    const r = runAction(withMoney(5000), bundles, "amt/donate", undefined, 300);
    expect(money(r.world)).toBe(4700);
    expect(r.lines.join(" ")).toContain("Gave $3.00.");
  });

  test("a choice's `when` and outcomes see the amount held by the pending storylet", () => {
    const small = runAction(
      withMoney(5000),
      bundles,
      "amt/stake",
      undefined,
      300,
    ).world;
    expect(small.pending?.amount).toBe(300);
    expect(
      describePending(small, bundles)?.choices.map((c) => c.enabled),
    ).toEqual([true, true]);
    expect(describePending(small, bundles)?.text).toBe(
      "Prompt text cannot see the stake.",
    );
    const big = runAction(
      withMoney(5000),
      bundles,
      "amt/stake",
      undefined,
      700,
    ).world;
    expect(
      describePending(big, bundles)?.choices.map((c) => c.enabled),
    ).toEqual([false, true]);
    expect(() => choose(big, bundles, 0)).toThrow(RangeError);
    const done = choose(small, bundles, 0);
    expect(money(done.world)).toBe(4700);
    expect(done.world.pending).toBeNull();
    expect(done.lines.join(" ")).toContain("You stake $3.00.");
  });

  test("the choice log records the amount and replay reproduces the world", () => {
    let w = runAction(
      withMoney(5000, 9),
      bundles,
      "amt/stake",
      undefined,
      400,
    ).world;
    w = choose(w, bundles, 1).world;
    expect(w.choiceLog).toContainEqual({
      t: "action",
      id: "amt/stake",
      amount: 400,
    });
    // `withMoney` is not a logged move, so replay the log from the same start.
    const start = withMoney(5000, 9);
    let r = start;
    for (const c of w.choiceLog) {
      if (c.t === "action")
        r = runAction(r, bundles, c.id, c.target, c.amount).world;
      if (c.t === "choose") r = choose(r, bundles, c.i).world;
    }
    expect(worldHash(r)).toBe(worldHash(w));
    const logged = replay(9, bundles, [
      { t: "god-money", value: 5000 },
      { t: "action", id: "amt/donate", amount: 300 },
    ]);
    expect(money(logged)).toBe(4700);
    expect(logged.choiceLog.at(-1)).toEqual({
      t: "action",
      id: "amt/donate",
      amount: 300,
    });
  });

  test("a pending amount survives a save and load", () => {
    const w = runAction(
      withMoney(5000),
      bundles,
      "amt/stake",
      undefined,
      400,
    ).world;
    const file = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      capabilities: [],
      appliedMigrations: [],
      lives: [{ id: "a", name: "A", updatedAt: 1, world: w }],
      graveyard: [],
    };
    const back = parseSave(serializeSave(file));
    const loaded = back.lives[0]?.world as World;
    expect(loaded.pending?.amount).toBe(400);
    expect(worldHash(loaded)).toBe(worldHash(w));
  });
});
