import { evaluate } from "../expr/index.ts";
import type { CompiledOutcome, CompiledStorylet } from "../pack.ts";
import type { PersonId, QueuedEvent, ScopeRef, World } from "../state/types.ts";
import { addJournalLine, getPerson, nextStream } from "../state/world.ts";
import { applyEffects } from "./effects.ts";
import { makeEnv, rolesOf, type Scope } from "./env.ts";
import { clockAge, evalBool, evalInt } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";
import { explainFalse } from "./reason.ts";
import { renderText } from "./text.ts";

/** A `next:` chain longer than this stops silently (guards against authored cycles). */
const MAX_CHAIN = 32;

export function scopeFor(world: World, ref: ScopeRef | undefined): Scope {
  const subject = world.playerId;
  if (!ref) return { subject };
  if (ref.kind === "person") return { subject, person: ref.id };
  const loan = getPerson(world, subject).loans.find((l) => l.id === ref.id);
  return loan ? { subject, loan } : { subject };
}

export function logKey(
  storyletId: string,
  scope: ScopeRef | undefined,
): string {
  return scope ? `${storyletId}#${scope.id}` : storyletId;
}

/** Is the scope's binding still valid (loan still held, person alive)? */
function bindingLive(world: World, scope: ScopeRef | undefined): boolean {
  if (!scope) return true;
  if (scope.kind === "person") {
    const p = world.persons.get(scope.id);
    return !!p?.alive && scope.id !== world.playerId;
  }
  return getPerson(world, world.playerId).loans.some((l) => l.id === scope.id);
}

/** The person holds one of the storylet's `target` roles toward the player (no filter: any). */
export function hasTargetRole(
  world: World,
  s: CompiledStorylet,
  person: PersonId,
): boolean {
  if (!s.target || s.target.length === 0) return true;
  const roles = rolesOf(world, person);
  return s.target.some((t) => roles.includes(t));
}

/**
 * Why a storylet cannot open for this binding, in words a player can read; null when it can.
 * `when`, `once`, `cooldown`, `max_per_life`, the binding and the `target` role all count.
 */
export function ineligibility(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  scope: ScopeRef | undefined,
): string | null {
  if ((s.scope ?? undefined) !== scope?.kind) return "Not available";
  if (!bindingLive(world, scope)) return "Not available";
  if (scope?.kind === "person" && !hasTargetRole(world, s, scope.id))
    return "Not available";
  const rec = world.storyletLog[logKey(s.id, scope)];
  if (rec) {
    if (s.once) return "Already done";
    if (s.maxPerLife !== undefined && rec.count >= s.maxPerLife)
      return "Done too often";
    if (s.cooldown !== undefined && clockAge(world) - rec.lastAge < s.cooldown)
      return `Again at age ${rec.lastAge + s.cooldown}`;
  }
  const env = scopeFor(world, scope);
  return evalBool(s.when, world, idx, env)
    ? null
    : s.when === undefined
      ? "Not available"
      : explainFalse(s.when, (c) =>
          Boolean(evaluate(c, makeEnv(world, idx, env))),
        );
}

/** `when`, `once`, `cooldown` and `max_per_life` all pass for this storylet and binding. */
export function isEligible(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  scope: ScopeRef | undefined,
): boolean {
  return ineligibility(world, idx, s, scope) === null;
}

function record(world: World, key: string): World {
  const rec = world.storyletLog[key];
  return {
    ...world,
    storyletLog: {
      ...world.storyletLog,
      [key]: { count: (rec?.count ?? 0) + 1, lastAge: clockAge(world) },
    },
  };
}

function say(world: World, text: string): World {
  return addJournalLine(world, clockAge(world), text);
}

function pickOutcome(
  world: World,
  idx: PackIndex,
  storyletId: string,
  outcomes: readonly CompiledOutcome[],
  scope: Scope,
): [World, CompiledOutcome | undefined] {
  const live = outcomes.filter((o) => evalBool(o.when, world, idx, scope));
  const weights = live.map((o) =>
    Math.max(0, evalInt(o.weight, world, idx, scope)),
  );
  if (!weights.some((x) => x > 0)) return [world, undefined];
  const [w, rng] = nextStream(world, clockAge(world), `outcome/${storyletId}`);
  return [w, live[rng.weightedPick(weights)]];
}

function runOutcome(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  outcomes: readonly CompiledOutcome[],
  ref: ScopeRef | undefined,
  depth: number,
): World {
  const scope = scopeFor(world, ref);
  const [w0, outcome] = pickOutcome(world, idx, s.id, outcomes, scope);
  if (!outcome) return w0;
  const bound = new Map<string, PersonId>();
  let w = w0;
  const withBound: Scope = { ...scope, bound };
  // Effects run first so a `spawn_person ... as n` binding exists for the outcome text.
  w = applyEffects(w, idx, outcome.effects, scope, bound);
  if (outcome.text !== undefined && !w.ended)
    w = say(w, renderText(outcome.text, w, idx, withBound));
  if (w.ended || !outcome.next) return w;
  const next = idx.storylets.get(outcome.next);
  if (!next) throw new RangeError(`unknown storylet '${outcome.next}'`);
  return open(
    w,
    idx,
    {
      storyletId: next.id,
      ...(next.scope && ref?.kind === next.scope ? { scope: ref } : {}),
    },
    depth + 1,
  );
}

/**
 * Open a storylet. Without choices it resolves now (text, one weighted outcome, effects,
 * then `next`). With choices it becomes `world.pending` for the player, except in
 * `scope: person` where the first enabled choice is taken for events. Records the firing.
 */
export function open(
  world: World,
  idx: PackIndex,
  ev: QueuedEvent,
  depth = 0,
): World {
  if (world.ended || depth > MAX_CHAIN) return world;
  const s = idx.storylets.get(ev.storyletId);
  if (!s) throw new RangeError(`unknown storylet '${ev.storyletId}'`);
  let w = record(world, logKey(s.id, ev.scope));
  if (s.choices.length > 0) {
    if (ev.scope?.kind === "person" && s.trigger === "event") {
      const scope = scopeFor(w, ev.scope);
      const c = s.choices.find((x) => evalBool(x.when, w, idx, scope));
      if (!c) return w;
      if (s.text !== undefined) w = say(w, renderText(s.text, w, idx, scope));
      return runOutcome(w, idx, s, c.outcomes, ev.scope, depth);
    }
    return {
      ...w,
      pending: { storyletId: s.id, ...(ev.scope ? { scope: ev.scope } : {}) },
    };
  }
  if (s.text !== undefined)
    w = say(w, renderText(s.text, w, idx, scopeFor(w, ev.scope)));
  return runOutcome(w, idx, s, s.outcomes, ev.scope, depth);
}

/** Resolve a choice of the open storylet (journals its text and the outcome, runs effects). */
export function resolveChoice(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  ref: ScopeRef | undefined,
  choiceIndex: number,
): World {
  const choice = s.choices[choiceIndex];
  if (!choice)
    throw new RangeError(`storylet '${s.id}' has no choice ${choiceIndex}`);
  const scope = scopeFor(world, ref);
  if (!evalBool(choice.when, world, idx, scope))
    throw new RangeError(`choice ${choiceIndex} of '${s.id}' is not available`);
  let w = world;
  if (s.text !== undefined) w = say(w, renderText(s.text, w, idx, scope));
  return runOutcome(w, idx, s, choice.outcomes, ref, 0);
}
