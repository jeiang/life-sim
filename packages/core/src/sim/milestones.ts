import type { QueuedEvent, World } from "../state/types.ts";
import { getPerson, updatePerson } from "../state/world.ts";
import type { PackIndex } from "./pack-index.ts";

/**
 * Milestones Core emits itself, once per person:
 * - `graduated`: an occupation in the `school` group ends by completing its `duration_years`;
 * - `first_job`: the player starts an occupation outside the `school` group;
 * - `married`: the player's tie to someone becomes the `core-loop/spouse` role;
 * - `first_child`: the player's tie to someone becomes the `core-loop/child` role;
 * - `retired`: the player starts the `core-loop/retired` occupation.
 * Like the `school` group in the obituary, the three `core-loop/...` ids are Core-owned
 * references to the one Pack that declares them (ADR 0002).
 */
export const CORE_MILESTONES = [
  "graduated",
  "first_job",
  "married",
  "first_child",
  "retired",
] as const;

export const SPOUSE_ROLE = "core-loop/spouse";
export const CHILD_ROLE = "core-loop/child";
export const RETIRED_OCCUPATION = "core-loop/retired";

/** The milestone a role the player takes toward someone emits, if any. */
export function roleMilestone(role: string): string | undefined {
  return role === SPOUSE_ROLE
    ? "married"
    : role === CHILD_ROLE
      ? "first_child"
      : undefined;
}

/**
 * The player reaches a milestone: it is recorded (readable as `milestone.<id>`) and its
 * `trigger: milestone` storylets are queued to open. A no-op the second time.
 */
export function emitMilestone(world: World, id: string): World {
  const player = getPerson(world, world.playerId);
  if (player.milestones?.includes(id)) return world;
  return {
    ...updatePerson(world, world.playerId, (p) => ({
      ...p,
      milestones: [...(p.milestones ?? []), id],
    })),
    milestoneQueue: [...world.milestoneQueue, id],
  };
}

/** Take the milestones reached since the last call as events (queue order, then storylet id order). */
export function takeMilestoneEvents(
  world: World,
  idx: PackIndex,
): [World, QueuedEvent[]] {
  if (world.milestoneQueue.length === 0) return [world, []];
  const events = world.milestoneQueue.flatMap((id) =>
    (idx.milestoneStorylets.get(id) ?? []).map((s) => ({ storyletId: s.id })),
  );
  return [{ ...world, milestoneQueue: [] }, events];
}
