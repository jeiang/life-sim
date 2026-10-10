/**
 * Scheduled consequences (`schedule(storylet, after: a-b years[, person][, lineage: true])` and
 * `unschedule(storylet)`, docs/spec/pack-format/effects.md). The queue is a Core-owned world
 * state container (`state/schedule.ts`); this module is the effect primitives and the age-up step.
 */
import type { Expr } from "../expr/index.ts";
import { evaluate } from "../expr/index.ts";
import type { CompiledStorylet } from "../pack.ts";
import {
  type ScheduledEntry,
  scheduledEntries,
  setScheduled,
} from "../state/schedule.ts";
import type { QueuedEvent, ScopeRef, World } from "../state/types.ts";
import { nextStream } from "../state/world.ts";
import { makeEnv, type Scope } from "./env.ts";
import { clockAge } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";

/**
 * `schedule(storylet, after: from-to years[, person][, lineage: true])`: queue a consequence that
 * fires once, from `from` to `to` years from now (`1 <= from <= to`). `person` is a bound name
 * (or `person`) the storylet opens for; it is required for a `scope: person` storylet and
 * ignored otherwise. With no person in scope, the effect does nothing. Scheduling a storylet
 * that is already queued for the same person keeps the earlier entry.
 */
export function scheduleEffect(
  world: World,
  idx: PackIndex,
  scope: Scope,
  bound: ReadonlyMap<string, number>,
  storylet: Expr,
  from: number,
  to: number,
  person: Expr | boolean,
  lineage: boolean,
): World {
  const id = String(evaluate(storylet, makeEnv(world, idx, scope)));
  const s = idx.storylets.get(id);
  if (!s) throw new RangeError(`unknown storylet '${id}'`);
  if (from < 1 || to < from)
    throw new RangeError(
      `schedule window ${from}-${to} is not 1 <= from <= to`,
    );
  let pid: number | undefined;
  if (s.scope === "person") {
    if (typeof person === "boolean")
      throw new RangeError(
        `storylet '${id}' is scope: person and needs a person`,
      );
    const name = (person as readonly [string, string])[1];
    pid = bound.get(name) ?? (name === "person" ? scope.person : undefined);
    if (pid === undefined) return world;
  } else if (s.scope !== undefined) {
    throw new RangeError(
      `storylet '${id}' (scope: ${s.scope}) cannot be scheduled`,
    );
  }
  const queue = scheduledEntries(world);
  if (queue.some((e) => e.storyletId === id && e.person === pid)) return world;
  const entry: ScheduledEntry = {
    storyletId: id,
    ...(pid === undefined ? {} : { person: pid }),
    wait: from - 1,
    left: to - from + 1,
    lineage,
    seq: queue.reduce((n, e) => Math.max(n, e.seq), -1) + 1,
  };
  return setScheduled(world, [...queue, entry]);
}

/** `unschedule(storylet)`: cancel every queued consequence of the storylet, for any person. */
export function unschedule(world: World, storyletId: string): World {
  const queue = scheduledEntries(world);
  const kept = queue.filter((e) => e.storyletId !== storyletId);
  return kept.length === queue.length ? world : setScheduled(world, kept);
}

/**
 * One age-up of the schedule. An entry waits until its window opens; once open it rolls each
 * age-up with chance 1 / (age-ups left in the window), so the odds rise and the last age-up is
 * certain. The storylet's `when` (and `once`, `cooldown`, `max_per_life`) is checked first: if it
 * fails the entry waits, and the window running out drops it. A person who died drops it at once.
 * Fired entries leave the queue and come back as events in the order they were queued (purpose
 * key `schedule/<storylet>[#<person id>]`, one roll per eligible entry).
 */
export function dueScheduled(
  world: World,
  idx: PackIndex,
  eligible: (
    w: World,
    s: CompiledStorylet,
    scope: ScopeRef | undefined,
  ) => boolean,
): [World, QueuedEvent[]] {
  const queue = scheduledEntries(world);
  if (queue.length === 0) return [world, []];
  let w = world;
  const keep: ScheduledEntry[] = [];
  const fire: QueuedEvent[] = [];
  for (const e of queue) {
    const s = idx.storylets.get(e.storyletId);
    if (!s || (e.person !== undefined && !w.persons.get(e.person)?.alive))
      continue;
    if (e.wait > 0) {
      keep.push({ ...e, wait: e.wait - 1 });
      continue;
    }
    const scope: ScopeRef | undefined =
      e.person === undefined ? undefined : { kind: "person", id: e.person };
    if (eligible(w, s, scope)) {
      const key = `schedule/${e.storyletId}${e.person === undefined ? "" : `#${e.person}`}`;
      const [w2, rng] = nextStream(w, clockAge(w), key);
      w = w2;
      if (rng.chanceBp(Math.trunc(10000 / e.left))) {
        fire.push({ storyletId: e.storyletId, ...(scope ? { scope } : {}) });
        continue;
      }
    }
    if (e.left > 1) keep.push({ ...e, left: e.left - 1 });
  }
  return [setScheduled(w, keep), fire];
}
