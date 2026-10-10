/**
 * Milestones (docs/spec/pack-format/hooks.md#milestones): moments of a life the Core recognises
 * (`graduated`, `first_job`, `married`, `first_child`, `retired`) or a Pack declares
 * (`provides: milestones`, fired by the `reach_milestone(id)` effect). Each fires once per life.
 * Reaching one records it (the readable flag `milestone_reached(id)`), runs the `on_milestone`
 * hooks of every Pack, and queues the milestone's `trigger: milestone` storylets to open at the
 * next age-up. The record is a Core-owned world state container (`state/milestones.ts`).
 */
import type { PackBundle } from "../pack.ts";
import { markMilestone, milestoneReached } from "../state/milestones.ts";
import {
  type ScheduledEntry,
  scheduledEntries,
  setScheduled,
} from "../state/schedule.ts";
import type { PersonId, World } from "../state/types.ts";
import { getPerson } from "../state/world.ts";
import { runHook } from "./hooks.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";

/**
 * Reach milestone `id`: nothing happens when the life already has. Otherwise it is recorded,
 * the hooks run (Packs in bundle order; a hook may reach further milestones), and each
 * `trigger: milestone` storylet of the id (in id order) joins the schedule queue due at the next
 * age-up. That queue entry is a window of one age-up, so the storylet's `when` is checked then
 * and a failing one is dropped: a milestone never repeats, so it is never offered later.
 */
export function reachMilestone(
  world: World,
  idx: PackIndex,
  id: string,
): World {
  if (milestoneReached(world, id)) return world;
  let w = runHook(markMilestone(world, id), idx, "on_milestone", id);
  const opens = [...idx.storylets.values()]
    .filter((s) => s.trigger === "milestone" && s.milestone === id)
    .map((s) => s.id)
    .sort();
  if (opens.length === 0) return w;
  const queue = scheduledEntries(w);
  let seq = queue.reduce((n, e) => Math.max(n, e.seq), -1) + 1;
  const added: ScheduledEntry[] = [];
  for (const storyletId of opens) {
    if (queue.some((e) => e.storyletId === storyletId)) continue;
    added.push({ storyletId, wait: 0, left: 1, lineage: false, seq: seq++ });
  }
  w = setScheduled(w, [...queue, ...added]);
  return w;
}

/**
 * The player started occupation `kindId` (the world before and after the start): the retirement
 * kind (`npc_careers.retired`) is `retired`; any other kind that pays, is not schooling
 * (group `school`) and does not confine is `first_job`.
 */
export function occupationStarted(
  before: World,
  after: World,
  idx: PackIndex,
  personId: PersonId,
  kindId: string,
): World {
  if (personId !== after.playerId) return after;
  const had = getPerson(before, personId).occupations.some(
    (o) => o.kindId === kindId,
  );
  const started = getPerson(after, personId).occupations.find(
    (o) => o.kindId === kindId,
  );
  if (had || !started) return after;
  if (kindId === idx.npcCareers?.retired)
    return reachMilestone(after, idx, "retired");
  const kind = idx.occupations.get(kindId);
  if (!kind || kind.group === "school" || kind.confines || started.pay <= 0)
    return after;
  return reachMilestone(after, idx, "first_job");
}

/**
 * Fire the `on_milestone` hooks of `milestoneId`, recording it, like the Core does when it
 * reaches one: once per life, whatever the number of calls. Not logged, so a caller outside a
 * logged action (a test, a tool) must repeat the call to reproduce the world.
 */
export function fireMilestone(
  world: World,
  bundles: readonly PackBundle[],
  milestoneId: string,
): World {
  return reachMilestone(world, indexBundles(bundles), milestoneId);
}
