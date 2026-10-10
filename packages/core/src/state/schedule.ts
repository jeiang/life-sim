/**
 * The scheduled-consequence queue (`schedule(...)` / `unschedule(...)`, docs/spec/pack-format/
 * effects.md). It is a Core-owned world state container: it lives in `World.state` under the
 * reserved id `_schedule` (no Pack id can start with `_`), so the save codec, canonical
 * serializer and world hash need nothing for it, and it is absent until the first `schedule`.
 *
 * Shape: `{ [storyletId]: { [who]: { seq, wait, left, lineage } } }`, where `who` is the bound
 * person's id or `-` for a storylet with no person, `seq` orders entries by when they were
 * queued, `wait` is the age-ups before the window opens, `left` the age-ups the window still has
 * (including this one), and `lineage` is a flag.
 */
import type { PersonId, StateTree, StateValue, World } from "./types.ts";

/** The reserved id of the queue in `World.state`. */
export const SCHEDULE_ID = "_schedule";

const NO_PERSON = "-";

/** One queued consequence. */
export interface ScheduledEntry {
  readonly storyletId: string;
  /** The person a `scope: person` storylet opens for; absent for one with no scope. */
  readonly person?: PersonId;
  /** Age-ups to skip before the window opens. */
  readonly wait: number;
  /** Age-ups the window still has, counting the current one (at least 1). */
  readonly left: number;
  /** Carries to the heir (hand-off in succession) instead of dropping at death. */
  readonly lineage: boolean;
  /** Queue order: lower fires first. */
  readonly seq: number;
}

/** Every queued consequence, in the order they were queued. */
export function scheduledEntries(world: World): ScheduledEntry[] {
  const tree = world.state?.[SCHEDULE_ID];
  if (typeof tree !== "object") return [];
  const out: ScheduledEntry[] = [];
  for (const [storyletId, byWho] of Object.entries(tree)) {
    if (typeof byWho !== "object") continue;
    for (const [who, e] of Object.entries(byWho)) {
      if (typeof e !== "object") continue;
      out.push({
        storyletId,
        ...(who === NO_PERSON ? {} : { person: Number(who) }),
        wait: e.wait as number,
        left: e.left as number,
        lineage: e.lineage as boolean,
        seq: e.seq as number,
      });
    }
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/** Replace the whole queue. An empty queue removes the container, so the world is as if never scheduled. */
export function setScheduled(
  world: World,
  entries: readonly ScheduledEntry[],
): World {
  const { [SCHEDULE_ID]: _gone, ...rest } = world.state ?? {};
  const { state: _state, ...bare } = world;
  if (entries.length === 0)
    return Object.keys(rest).length === 0 ? bare : { ...bare, state: rest };
  const tree: Record<string, Record<string, StateValue>> = {};
  for (const e of entries) {
    const byWho = tree[e.storyletId] ?? {};
    tree[e.storyletId] = byWho;
    byWho[e.person === undefined ? NO_PERSON : String(e.person)] = {
      seq: e.seq,
      wait: e.wait,
      left: e.left,
      lineage: e.lineage,
    };
  }
  return { ...bare, state: { ...rest, [SCHEDULE_ID]: tree } };
}

/** Drop what does not outlive a life: every entry without `lineage: true`. */
export function dropMortalSchedule(world: World): World {
  const queue = scheduledEntries(world);
  const kept = queue.filter((e) => e.lineage);
  return kept.length === queue.length ? world : setScheduled(world, kept);
}

const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/** Problems of a stored queue's shape; empty when sound. */
export function checkSchedule(where: string, v: StateValue): string[] {
  if (typeof v !== "object") return [`${where}: expected a schedule table`];
  const out: string[] = [];
  const seqs = new Set<number>();
  for (const [sid, byWho] of Object.entries(v)) {
    if (typeof byWho !== "object") {
      out.push(`${where}.${sid}: expected a table of scheduled entries`);
      continue;
    }
    for (const [who, e] of Object.entries(byWho)) {
      const at = `${where}.${sid}.${who}`;
      if (who !== NO_PERSON && !/^\d+$/.test(who)) {
        out.push(`${at}: the key must be a person id or '-'`);
      } else if (
        typeof e !== "object" ||
        !isInt(e.seq) ||
        !isInt(e.wait) ||
        !isInt(e.left) ||
        typeof e.lineage !== "boolean" ||
        e.wait < 0 ||
        e.left < 1
      ) {
        out.push(`${at}: expected { seq, wait, left, lineage }`);
      } else if (seqs.has(e.seq)) {
        out.push(`${at}: duplicate queue position ${e.seq}`);
      } else seqs.add(e.seq);
    }
  }
  return out;
}

/**
 * Rewrite a stored queue's storylet ids through a Pack migration resolver. A removed storylet
 * drops its entries; two entries that land on one id and person keep the earlier.
 */
export function migrateSchedule(
  tree: StateTree,
  resolve: (id: string) => string | null,
): StateTree | undefined {
  const v = tree[SCHEDULE_ID];
  // A malformed queue is left as it is, for the state check to reject.
  if (v === undefined || checkSchedule(SCHEDULE_ID, v).length > 0) return tree;
  const moved = new Map<string, ScheduledEntry>();
  const world = { state: tree } as unknown as World;
  for (const e of scheduledEntries(world)) {
    const to = resolve(e.storyletId);
    if (to === null) continue;
    const key = `${to}\u0000${e.person ?? NO_PERSON}`;
    if (!moved.has(key)) moved.set(key, { ...e, storyletId: to });
  }
  return setScheduled(world, [...moved.values()]).state;
}
