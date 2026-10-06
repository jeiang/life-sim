import type { World } from "../state/types.ts";
import { clamp, setStat, updatePerson } from "../state/world.ts";
import { appendChoice } from "./flow.ts";

function assertEditable(world: World): void {
  if (world.ended) throw new RangeError("this life is over");
}

/** God mode: set one of the player's stats (clamped to 0-100). Logged, so replay reproduces it. */
export function godSetStat(world: World, stat: string, value: number): World {
  assertEditable(world);
  const player = world.persons.get(world.playerId);
  if (!player || !(stat in player.stats))
    throw new RangeError(`unknown stat '${stat}'`);
  const v = clamp(Math.trunc(value), 0, 100);
  return appendChoice(setStat(world, world.playerId, stat, v), {
    t: "god-stat",
    stat,
    value: v,
  });
}

/** God mode: set the player's money, minor units (any safe integer). Logged. */
export function godSetMoney(world: World, value: number): World {
  assertEditable(world);
  if (!Number.isSafeInteger(value))
    throw new RangeError("money must be a whole number of minor units");
  return appendChoice(
    updatePerson(world, world.playerId, (p) => ({ ...p, money: value })),
    { t: "god-money", value },
  );
}

/** True when the life used god mode (a custom start or any edit): the "edited" badge. */
export function isGodLife(world: World): boolean {
  return world.choiceLog.some(
    (c) => c.t === "start" || c.t === "god-stat" || c.t === "god-money",
  );
}
