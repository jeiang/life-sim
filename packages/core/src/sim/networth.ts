import type { World } from "../state/types.ts";
import { netWorth } from "./ops.ts";

/** Net worth of the player at one age, minor units. */
export interface NetWorthPoint {
  readonly age: number;
  readonly value: number;
}

/**
 * Record the player's current net worth (cash plus asset values and holdings minus loan balances) at the
 * player's current age. A point already recorded for that age is replaced, so calling after
 * every action keeps one point per age. Returns `history` unchanged when the player is missing.
 */
export function recordNetWorth(
  history: readonly NetWorthPoint[],
  world: World,
): readonly NetWorthPoint[] {
  const p = world.persons.get(world.playerId);
  if (!p) return history;
  const point = { age: p.age, value: netWorth(world, p) };
  const last = history[history.length - 1];
  if (last && last.age > point.age) return history;
  if (last && last.age === point.age) {
    if (last.value === point.value) return history;
    return [...history.slice(0, -1), point];
  }
  return [...history, point];
}
