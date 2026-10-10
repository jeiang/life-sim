/**
 * The milestones a life has reached (docs/spec/pack-format/hooks.md#milestones). It is a Core-owned
 * world state container: it lives in `World.state` under the reserved id `_milestones` (no Pack id
 * can start with `_`), so the save codec, canonical serializer and world hash need nothing for
 * it, and it is absent until the first milestone.
 *
 * Shape: `{ [milestoneId]: true }`. A milestone fires once per life, so a present id is the
 * record and the readable flag (`milestone_reached(id)`); succession starts the heir's record
 * empty.
 */
import type { StateValue, World } from "./types.ts";

/** The reserved id of the record in `World.state`. */
export const MILESTONES_ID = "_milestones";

/** Milestone ids the Core emits itself, usable with no declaration; a Pack may list one in `provides: milestones` to own it for `vocab`. */
export const CORE_MILESTONES = [
  "graduated",
  "first_job",
  "married",
  "first_child",
  "retired",
] as const;

/** A milestone id (the same pattern as a content id's bare form). */
export const MILESTONE_ID = /^[a-z][a-z0-9_-]*$/;

/** Has the life reached the milestone? */
export function milestoneReached(world: World, id: string): boolean {
  const tree = world.state?.[MILESTONES_ID];
  return typeof tree === "object" && tree[id] === true;
}

/** Every milestone the life has reached, sorted by id. */
export function reachedMilestones(world: World): string[] {
  const tree = world.state?.[MILESTONES_ID];
  return typeof tree === "object" ? Object.keys(tree).sort() : [];
}

/** Record a milestone as reached. */
export function markMilestone(world: World, id: string): World {
  const tree = world.state?.[MILESTONES_ID];
  const have = typeof tree === "object" ? tree : {};
  return {
    ...world,
    state: { ...world.state, [MILESTONES_ID]: { ...have, [id]: true } },
  };
}

/** A new life (the heir): drop the record, so the world is as if no milestone was reached. */
export function clearMilestones(world: World): World {
  if (world.state?.[MILESTONES_ID] === undefined) return world;
  const { [MILESTONES_ID]: _gone, ...rest } = world.state;
  const { state: _state, ...bare } = world;
  return Object.keys(rest).length === 0 ? bare : { ...bare, state: rest };
}

/** Problems of a stored record's shape; empty when sound. */
export function checkMilestones(where: string, v: StateValue): string[] {
  if (typeof v !== "object") return [`${where}: expected a milestone table`];
  const out: string[] = [];
  for (const [id, flag] of Object.entries(v)) {
    if (!MILESTONE_ID.test(id)) out.push(`${where}.${id}: not a milestone id`);
    else if (flag !== true) out.push(`${where}.${id}: expected true`);
  }
  return out;
}
