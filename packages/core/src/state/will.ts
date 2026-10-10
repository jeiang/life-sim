/**
 * The player's will (docs/spec/pack-format/state.md#the-will). It is a Core-owned world state
 * container: it lives in `World.state` under the reserved id `_will` (no Pack id can start with
 * `_`), so the save codec, canonical serializer and world hash need nothing for it, and it is
 * absent while the player has made none.
 *
 * Shape: `{ mode: <code>, heir?: <person id> }`, where the code is `WILL_MODE_CODE[mode]`:
 * `heir` 1 (all cash to the named person, who is the `heir` field), `even` 2 (split evenly among
 * the children), `spouse` 3 (all to the spouse), `charity` 4. Succession reads it and then
 * clears it, so the heir starts with no will.
 */
import type { PersonId, StateValue, World } from "./types.ts";

/** The reserved id of the will in `World.state`. */
export const WILL_ID = "_will";

/** What a will does with the cash left after debts. */
export type WillMode = "heir" | "even" | "spouse" | "charity";

export const WILL_MODES: readonly WillMode[] = [
  "heir",
  "even",
  "spouse",
  "charity",
] as const;

/** The stored integer of a mode. */
export const WILL_MODE_CODE: Readonly<Record<WillMode, number>> = {
  heir: 1,
  even: 2,
  spouse: 3,
  charity: 4,
};

/** The words of `set_will(...)`: the modes that need no named person, and `none` to remove the will. */
export const WILL_SET_MODES = ["even", "spouse", "charity", "none"] as const;

/** The will of a life: the mode and, for `heir`, the named person. */
export interface Will {
  readonly mode: WillMode;
  readonly heir?: PersonId;
}

/** The player's will, or `undefined` when none is made (or the stored one is malformed). */
export function willOf(world: World): Will | undefined {
  const tree = world.state?.[WILL_ID];
  if (typeof tree !== "object") return undefined;
  const mode =
    typeof tree.mode === "number" ? WILL_MODES[tree.mode - 1] : undefined;
  if (mode === undefined) return undefined;
  return mode === "heir" && typeof tree.heir === "number"
    ? { mode, heir: tree.heir }
    : mode === "heir"
      ? undefined
      : { mode };
}

/** Make or replace the will. `heir` is required for (and only stored with) mode `heir`. */
export function setWill(world: World, will: Will): World {
  if (will.mode === "heir" && will.heir === undefined)
    throw new RangeError("a will to one heir names the heir");
  const value: Record<string, StateValue> = {
    mode: WILL_MODE_CODE[will.mode],
  };
  if (will.mode === "heir") value.heir = will.heir as PersonId;
  return { ...world, state: { ...world.state, [WILL_ID]: value } };
}

/** Remove the will, so the world is as if none was made. */
export function clearWill(world: World): World {
  if (world.state?.[WILL_ID] === undefined) return world;
  const { [WILL_ID]: _gone, ...rest } = world.state;
  const { state: _state, ...bare } = world;
  return Object.keys(rest).length === 0 ? bare : { ...bare, state: rest };
}

/** Problems of a stored will's shape; empty when sound. */
export function checkWill(
  where: string,
  v: StateValue,
  world: World,
): string[] {
  if (typeof v !== "object") return [`${where}: expected a will table`];
  const mode = typeof v.mode === "number" ? WILL_MODES[v.mode - 1] : undefined;
  if (mode === undefined)
    return [`${where}.mode: expected a will mode code 1-4`];
  if (mode === "heir") {
    const h = v.heir;
    if (typeof h !== "number" || !world.persons.has(h))
      return [`${where}.heir: expected the id of an existing person`];
    return [];
  }
  return v.heir === undefined
    ? []
    : [`${where}.heir: only a will to one heir names one`];
}
