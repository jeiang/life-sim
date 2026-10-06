import type { Expr } from "../expr/index.ts";
import { evaluate } from "../expr/index.ts";
import type { CompiledStorylet } from "../pack.ts";
import type {
  QueuedEvent,
  ScheduledEvent,
  ScopeRef,
  World,
} from "../state/types.ts";
import { nextStream } from "../state/world.ts";
import { makeEnv, type Scope } from "./env.ts";
import { clockAge } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";

const sameBinding = (a: ScopeRef | undefined, b: ScopeRef | undefined) =>
  a?.kind === b?.kind && a?.id === b?.id;

/**
 * `schedule(storylet, after: from-to years[, person][, lineage: true])`: queue a consequence
 * that fires once, from `from` to `to` years from now (`1 <= from <= to`). Scheduling a
 * storylet that is already queued for the same person keeps the earlier one.
 */
export function scheduleEffect(
  world: World,
  idx: PackIndex,
  scope: Scope,
  bound: ReadonlyMap<string, number>,
  storylet: Expr,
  from: number,
  to: number,
  person: string | null,
  lineage: boolean,
): World {
  const id = String(evaluate(storylet, makeEnv(world, idx, scope)));
  const s = idx.storylets.get(id);
  if (!s) throw new RangeError(`unknown storylet '${id}'`);
  if (from < 1 || to < from)
    throw new RangeError(
      `schedule window ${from}-${to} is not 1 <= from <= to`,
    );
  let ref: ScopeRef | undefined;
  if (person !== null) {
    const pid =
      bound.get(person) ?? (person === "person" ? scope.person : undefined);
    if (pid === undefined) return world;
    ref = { kind: "person", id: pid };
  }
  if (
    world.scheduled.some(
      (e) => e.storyletId === id && sameBinding(e.scope, ref),
    )
  )
    return world;
  const entry: ScheduledEvent = {
    storyletId: id,
    ...(ref ? { scope: ref } : {}),
    wait: from - 1,
    left: to - from + 1,
    lineage,
  };
  return { ...world, scheduled: [...world.scheduled, entry] };
}

/** `unschedule(storylet)`: cancel every queued consequence of the storylet, for any person. */
export function unschedule(world: World, storyletId: string): World {
  return world.scheduled.some((e) => e.storyletId === storyletId)
    ? {
        ...world,
        scheduled: world.scheduled.filter((e) => e.storyletId !== storyletId),
      }
    : world;
}

/**
 * One age-up of the schedule. An entry waits until its window opens; while open it rolls each
 * age-up with chance 1 / (age-ups left in the window), so the odds rise and the last age-up
 * is certain. Its storylet's `when` (and the other eligibility rules) are checked each time: if
 * false it waits, and the window running out drops it. A person who died drops it at once.
 * Fired ones leave the queue and come back as events, in the order they were scheduled
 * (purpose key `schedule/<storylet>[#<person>]`).
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
  if (world.scheduled.length === 0) return [world, []];
  let w = world;
  const keep: ScheduledEvent[] = [];
  const fire: QueuedEvent[] = [];
  for (const e of world.scheduled) {
    const s = idx.storylets.get(e.storyletId);
    if (!s || (e.scope && !w.persons.get(e.scope.id)?.alive)) continue;
    if (e.wait > 0) {
      keep.push({ ...e, wait: e.wait - 1 });
      continue;
    }
    if (eligible(w, s, e.scope)) {
      const key = `schedule/${e.storyletId}${e.scope ? `#${e.scope.id}` : ""}`;
      const [w2, rng] = nextStream(w, clockAge(w), key);
      w = w2;
      if (rng.chanceBp(Math.trunc(10000 / e.left))) {
        fire.push({
          storyletId: e.storyletId,
          ...(e.scope ? { scope: e.scope } : {}),
        });
        continue;
      }
    }
    if (e.left > 1) keep.push({ ...e, left: e.left - 1 });
  }
  return [{ ...w, scheduled: keep }, fire];
}
