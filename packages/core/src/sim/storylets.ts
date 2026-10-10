import { evaluate } from "../expr/index.ts";
import type {
  CompiledOutcome,
  CompiledStorylet,
  RepeatCurve,
} from "../pack.ts";
import type { PersonId, QueuedEvent, ScopeRef, World } from "../state/types.ts";
import { addJournalLine, getPerson, nextStream } from "../state/world.ts";
import { applyEffects } from "./effects.ts";
import { makeEnv, reportOutcome, rolesOf, type Scope } from "./env.ts";
import { confinementOf } from "./living.ts";
import { clockAge, evalBool, evalInt } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";
import { explainFalse } from "./reason.ts";
import { formatMoney, pickText, renderText } from "./text.ts";

/** Core-owned storylet tag: the only content that runs while a confinement locks its trigger kind. */
export const CUSTODY_OK = "custody-ok";

/** A `next:` chain longer than this stops silently (guards against authored cycles). */
const MAX_CHAIN = 32;

export function scopeFor(
  world: World,
  ref: ScopeRef | undefined,
  storyletId?: string,
  amount?: number,
): Scope {
  const subject = world.playerId;
  const base: Scope = {
    subject,
    ...(storyletId === undefined
      ? {}
      : { uses: world.uses[logKey(storyletId, ref)] ?? 0 }),
    ...(amount === undefined ? {} : { amount }),
  };
  if (!ref) return base;
  if (ref.kind === "person") return { ...base, person: ref.id };
  const loan = getPerson(world, subject).loans.find((l) => l.id === ref.id);
  return loan ? { ...base, loan } : base;
}

/** Share of gains kept for use number `n` in a year under a curve, basis points. */
export function repeatFactorBp(c: RepeatCurve, n: number): number {
  return n <= c.full ? 10000 : n <= c.reduced ? c.factorBp : 0;
}

/** The curve of a repeatable action (its overrides over the manifest default); else undefined. */
function curveOf(idx: PackIndex, s: CompiledStorylet): RepeatCurve | undefined {
  return s.repeatable ? { ...idx.repeat, ...s.repeat } : undefined;
}

/** An action's amount range as the player sees it now. */
export interface AmountRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Evaluate `s.amount` (no `amount` is bound in it); null when the storylet has none. */
export function amountRange(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  scope: ScopeRef | undefined,
): AmountRange | null {
  if (!s.amount) return null;
  const env = scopeFor(world, scope);
  return {
    min: evalInt(s.amount.min, world, idx, env),
    max: evalInt(s.amount.max, world, idx, env),
    step: Math.max(1, evalInt(s.amount.step, world, idx, env)),
  };
}

/** True when `n` is an integer on the `min + k * step` grid inside `[min, max]`. */
export function amountAllowed(r: AmountRange, n: number): boolean {
  return (
    Number.isSafeInteger(n) &&
    n >= r.min &&
    n <= r.max &&
    (n - r.min) % r.step === 0
  );
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
  const lock = confinementOf(getPerson(world, world.playerId), idx);
  if (
    lock &&
    (s.trigger === "action" ? lock.menus : lock.events) &&
    !s.tags.includes(CUSTODY_OK)
  )
    return "Not allowed while confined";
  const rec = world.storyletLog[logKey(s.id, scope)];
  if (rec) {
    if (s.once) return "Already done";
    if (s.maxPerLife !== undefined && rec.count >= s.maxPerLife)
      return "Done too often";
    if (s.cooldown !== undefined && clockAge(world) - rec.lastAge < s.cooldown)
      return `Again at age ${rec.lastAge + s.cooldown}`;
  }
  const env = scopeFor(world, scope, s.id);
  if (!evalBool(s.when, world, idx, env))
    return s.when === undefined
      ? "Not available"
      : explainFalse(s.when, (c) =>
          Boolean(evaluate(c, makeEnv(world, idx, env))),
        );
  // The minimum is checked at listing: an action the player cannot pay for is disabled.
  const range = amountRange(world, idx, s, scope);
  if (range) {
    if (range.min > getPerson(world, world.playerId).money)
      return `Needs at least ${formatMoney(range.min, idx.currency)}`;
    if (range.max < range.min) return "Not available";
  }
  return null;
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

const signed = (n: number): string => (n < 0 ? `\u2212${-n}` : `+${n}`);

/** Visible stat and money changes of the subject between two worlds, e.g. `Smarts −3, Happiness +2`. */
function deltas(
  before: World,
  after: World,
  idx: PackIndex,
  who: PersonId,
): string {
  const a = getPerson(before, who);
  const b = getPerson(after, who);
  const parts: string[] = [];
  for (const st of idx.stats) {
    const d = (b.stats[st.id] ?? 0) - (a.stats[st.id] ?? 0);
    if (d !== 0) parts.push(`${st.label} ${signed(d)}`);
  }
  const m = b.money - a.money;
  if (m !== 0)
    parts.push(
      `${m < 0 ? "\u2212" : "+"}${formatMoney(Math.abs(m), idx.currency)}`,
    );
  return parts.join(", ");
}

/** The note a repeatable action adds to its outcome once its returns diminish. */
function wearNote(c: RepeatCurve, n: number): string {
  if (n > c.reduced) return "It no longer helps this year.";
  return n > c.full ? "You are getting tired of this." : "";
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
  return [
    w,
    live[
      rng.weightedPick(
        weights,
        live.map((o) => o.text ?? ""),
      )
    ],
  ];
}

function runOutcome(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  outcomes: readonly CompiledOutcome[],
  ref: ScopeRef | undefined,
  depth: number,
  amount?: number,
  carryBp = 10000,
  auto = false,
): World {
  const curve = curveOf(idx, s);
  const base = scopeFor(world, ref, s.id, amount);
  // A `next:` step keeps the repeat factor of the action that led to it.
  const bp = Math.min(
    carryBp,
    curve ? repeatFactorBp(curve, base.uses ?? 0) : 10000,
  );
  const scope: Scope = bp < 10000 ? { ...base, factorBp: bp } : base;
  const [w0, outcome] = pickOutcome(world, idx, s.id, outcomes, scope);
  if (!outcome) return w0;
  const bound = new Map<string, PersonId>();
  let w = w0;
  const withBound: Scope = { ...scope, bound };
  // Effects run first so a `spawn_person ... as n` binding exists for the outcome text.
  w = applyEffects(w, idx, outcome.effects, scope, bound);
  reportOutcome(
    s.id,
    getPerson(w, scope.subject).money - getPerson(w0, scope.subject).money,
  );
  if (!w.ended) {
    const note = curve ? wearNote(curve, base.uses ?? 0) : "";
    if (outcome.text !== undefined) {
      const text = renderText(
        pickText(w, outcome.text, outcome.matureText),
        w,
        idx,
        withBound,
      );
      const d = deltas(w0, w, idx, scope.subject);
      const said = note ? `${text} ${note}` : text;
      w = say(w, d ? `${said} (${d})` : said);
    } else if (note) w = say(w, note);
  }
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
    bp,
    auto,
  );
}

/**
 * Open a storylet. Without choices it resolves now (text, one weighted outcome, effects,
 * then `next`). With choices it becomes `world.pending` for the player, except with `auto`
 * (the NPC pass and its `next:` chains) in `scope: person`, where the first enabled choice is
 * taken for the person. Records the firing.
 */
export function open(
  world: World,
  idx: PackIndex,
  ev: QueuedEvent,
  depth = 0,
  carryBp = 10000,
  auto = false,
): World {
  if (world.ended || depth > MAX_CHAIN) return world;
  const s = idx.storylets.get(ev.storyletId);
  if (!s) throw new RangeError(`unknown storylet '${ev.storyletId}'`);
  if (s.amount && ev.amount === undefined)
    throw new RangeError(`storylet '${s.id}' needs an amount`);
  let w = record(world, logKey(s.id, ev.scope));
  if (s.repeatable) {
    const key = logKey(s.id, ev.scope);
    w = { ...w, uses: { ...w.uses, [key]: (w.uses[key] ?? 0) + 1 } };
  }
  if (s.choices.length > 0) {
    if (auto && ev.scope?.kind === "person" && s.trigger === "event") {
      const scope = scopeFor(w, ev.scope, s.id);
      const c = s.choices.find((x) => evalBool(x.when, w, idx, scope));
      if (!c) return w;
      if (s.text !== undefined)
        w = say(
          w,
          renderText(pickText(w, s.text, s.matureText), w, idx, scope),
        );
      return runOutcome(
        w,
        idx,
        s,
        c.outcomes,
        ev.scope,
        depth,
        ev.amount,
        carryBp,
        true,
      );
    }
    return {
      ...w,
      pending: {
        storyletId: s.id,
        ...(ev.scope ? { scope: ev.scope } : {}),
        ...(ev.amount === undefined ? {} : { amount: ev.amount }),
        ...(carryBp < 10000 ? { factorBp: carryBp } : {}),
      },
    };
  }
  if (s.text !== undefined)
    w = say(
      w,
      renderText(
        pickText(w, s.text, s.matureText),
        w,
        idx,
        scopeFor(w, ev.scope, s.id),
      ),
    );
  return runOutcome(w, idx, s, s.outcomes, ev.scope, depth, ev.amount, carryBp);
}

/** Resolve a choice of the open storylet (journals its text and the outcome, runs effects). */
export function resolveChoice(
  world: World,
  idx: PackIndex,
  s: CompiledStorylet,
  ref: ScopeRef | undefined,
  choiceIndex: number,
  amount?: number,
  carryBp = 10000,
): World {
  const choice = s.choices[choiceIndex];
  if (!choice)
    throw new RangeError(`storylet '${s.id}' has no choice ${choiceIndex}`);
  const scope = scopeFor(world, ref, s.id, amount);
  if (!evalBool(choice.when, world, idx, scope))
    throw new RangeError(`choice ${choiceIndex} of '${s.id}' is not available`);
  let w = world;
  if (s.text !== undefined)
    w = say(w, renderText(pickText(w, s.text, s.matureText), w, idx, scope));
  w = say(w, `You chose: ${pickText(w, choice.label, choice.matureLabel)}`);
  return runOutcome(w, idx, s, choice.outcomes, ref, 0, amount, carryBp);
}
