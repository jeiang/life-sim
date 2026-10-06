import type { CompiledStorylet, PackBundle } from "../pack.ts";
import type {
  ChoiceEntry,
  PersonId,
  QueuedEvent,
  ScopeRef,
  World,
} from "../state/types.ts";
import {
  addJournalLine,
  getPerson,
  nextStream,
  personsInIdOrder,
  updatePerson,
} from "../state/world.ts";
import { reportChanceDrops, reportDecisions } from "./env.ts";
import {
  ADULT_AGE,
  guardianOf,
  livesWithGuardian,
  livesWithParents,
  startLivingOnOwn,
} from "./living.ts";
import { clockAge, evalBool, evalInt } from "./ops.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";
import { settle } from "./settle.ts";
import {
  amountAllowed,
  amountRange,
  isEligible,
  open,
  resolveChoice,
  scopeFor,
} from "./storylets.ts";
import { pickText, renderText } from "./text.ts";

/** What a step changed in the journal, in order. */
export interface SimResult {
  readonly world: World;
  /** Journal lines written during this call. */
  readonly lines: readonly string[];
}

/** An open storylet as the UI shows it. */
export interface PendingView {
  readonly storyletId: string;
  readonly icon?: string;
  /** Rendered prompt text (empty when the storylet has none). */
  readonly text: string;
  readonly choices: readonly {
    readonly index: number;
    readonly label: string;
    /** False when the choice's `when` fails; it cannot be chosen. */
    readonly enabled: boolean;
  }[];
}

function lineCount(w: World): number {
  let n = 0;
  for (const e of w.journal) n += e.lines.length;
  return n;
}

function result(before: World, after: World): SimResult {
  const all = after.journal.flatMap((e) => e.lines);
  return { world: after, lines: all.slice(lineCount(before)) };
}

/** The world with one more player choice on its log. */
export function appendChoice(world: World, entry: ChoiceEntry): World {
  return { ...world, choiceLog: [...world.choiceLog, entry] };
}

/** True when the life can age up: not ended, nothing pending. */
export function canAgeUp(world: World): boolean {
  return world.ended === null && world.pending === null;
}

const cmp = (a: number, b: number): number => a - b;

interface Candidate {
  readonly storylet: CompiledStorylet;
  readonly scope?: ScopeRef;
}

function candidates(
  world: World,
  idx: PackIndex,
  kind: "none" | "loan" | "person",
): Candidate[] {
  const out: Candidate[] = [];
  const player = getPerson(world, world.playerId);
  for (const s of idx.events) {
    if ((s.scope ?? "none") !== kind) continue;
    if (kind === "none") {
      if (isEligible(world, idx, s, undefined)) out.push({ storylet: s });
    } else if (kind === "loan") {
      for (const l of [...player.loans].sort((a, b) => cmp(a.id, b.id))) {
        const scope: ScopeRef = { kind: "loan", id: l.id };
        if (isEligible(world, idx, s, scope)) out.push({ storylet: s, scope });
      }
    } else {
      for (const p of personsInIdOrder(world)) {
        if (p.id === world.playerId) continue;
        const scope: ScopeRef = { kind: "person", id: p.id };
        if (isEligible(world, idx, s, scope)) out.push({ storylet: s, scope });
      }
    }
  }
  return out;
}

const keyOf = (c: Candidate): string =>
  c.scope ? `${c.storylet.id}@${c.scope.kind}:${c.scope.id}` : c.storylet.id;

/** Roll every chance candidate independently (id order). */
function rollChance(
  world: World,
  idx: PackIndex,
  cands: readonly Candidate[],
): [World, Candidate[]] {
  let w = world;
  const hits: Candidate[] = [];
  for (const c of cands) {
    if (c.storylet.chance === undefined) continue;
    const bp = evalInt(c.storylet.chance, w, idx, scopeFor(w, c.scope));
    const [w2, rng] = nextStream(w, clockAge(w), keyOf(c));
    w = w2;
    if (rng.chanceBp(bp)) hits.push(c);
  }
  return [w, hits];
}

/**
 * Keep at most `cap` chance hits. When the cap bites, survivors are a uniform keyed draw
 * (`year/chance-cap/<i>`, partial Fisher-Yates), never id order, so no Pack is favoured; they
 * keep their id order. Nothing is drawn when the hits already fit.
 */
function capChance(
  world: World,
  hits: readonly Candidate[],
  cap: number,
): [World, Candidate[]] {
  const keep = Math.max(0, cap);
  if (hits.length <= keep) return [world, [...hits]];
  let w = world;
  const order = hits.map((_, i) => i);
  for (let i = 0; i < keep; i++) {
    const [w2, rng] = nextStream(w, clockAge(w), `year/chance-cap/${i}`);
    w = w2;
    const j = i + rng.int(order.length - i);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const kept = new Set(order.slice(0, keep));
  reportChanceDrops(
    hits.filter((_, i) => !kept.has(i)).map((c) => c.storylet.id),
  );
  return [w, hits.filter((_, i) => kept.has(i))];
}

/** Draw up to `slots` candidates by weight, without replacement. */
function drawWeighted(
  world: World,
  idx: PackIndex,
  cands: readonly Candidate[],
  slots: number,
  purpose: string,
): [World, Candidate[]] {
  let w = world;
  const pool = cands.filter((c) => c.storylet.weight !== undefined);
  const picked: Candidate[] = [];
  for (let i = 0; i < slots; i++) {
    const weights = pool.map((c) =>
      Math.max(
        0,
        evalInt(c.storylet.weight as never, w, idx, scopeFor(w, c.scope)),
      ),
    );
    if (!weights.some((x) => x > 0)) break;
    const [w2, rng] = nextStream(w, clockAge(w), `${purpose}/${i}`);
    w = w2;
    const at = rng.weightedPick(weights);
    picked.push(pool[at] as Candidate);
    pool.splice(at, 1);
  }
  return [w, picked];
}

function asEvent(c: Candidate): QueuedEvent {
  return { storyletId: c.storylet.id, ...(c.scope ? { scope: c.scope } : {}) };
}

/** A year with nothing journaled still gets its group: a Pack `quiet` line, else an empty group. */
function ensureYearEntry(world: World, idx: PackIndex): World {
  if (world.ended || world.pending) return world;
  const age = clockAge(world);
  if (world.journal.some((e) => e.age === age)) return world;
  const quiet = idx.year.quiet;
  if (!quiet || quiet.length === 0)
    return {
      ...world,
      journal: [...world.journal, { age, lines: [] }].sort(
        (a, b) => a.age - b.age,
      ),
    };
  const [w, rng] = nextStream(world, age, "year/quiet");
  return addJournalLine(w, age, quiet[rng.int(quiet.length)] as string);
}

const isDecision = (c: Candidate): boolean => c.storylet.choices.length > 0;

/**
 * Decision slots (`year.decisions`, basis points of "at least k decisions"). Slot k rolls only
 * when slot k-1 fired, with probability p_k / p_{k-1}, so the run of hits reaches k with
 * probability p_k. Chance choice events fill slots first; the rest draw one eligible choice
 * storylet each by weight. Flavour slots draw from storylets without choices.
 */
function drawWithDecisions(
  world: World,
  idx: PackIndex,
  cands: readonly Candidate[],
  chance: readonly Candidate[],
): [World, QueuedEvent[]] {
  const probs = idx.year.decisions as readonly number[];
  let w = world;
  let fired = 0;
  if (clockAge(w) >= (idx.year.decisionsMinAge ?? 0)) {
    for (const [k, p] of probs.entries()) {
      const prev = k === 0 ? 10000 : (probs[k - 1] as number);
      if (prev <= 0) break;
      const [w2, rng] = nextStream(w, clockAge(w), `decision-slot/${k + 1}`);
      w = w2;
      if (rng.int(prev) >= p) break;
      fired++;
    }
  }
  const taken = new Set(chance.map(keyOf));
  const have = chance.filter(isDecision).length;
  const need = Math.max(0, fired - have);
  const pool = cands.filter((c) => isDecision(c) && !taken.has(keyOf(c)));
  const decisions: Candidate[] = [];
  for (let i = 0; i < need; i++) {
    const [w2, drawn] = drawWeighted(
      w,
      idx,
      pool,
      1,
      `decision-pick/${have + i + 1}`,
    );
    w = w2;
    const pick = drawn[0];
    if (!pick) break;
    decisions.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  const [lo, hi] = idx.year.slots;
  let slots = lo;
  if (hi > lo) {
    const [w2, rng] = nextStream(w, clockAge(w), "year/slots");
    w = w2;
    slots = lo + rng.int(hi - lo + 1);
  }
  const [w3, flavour] = drawWeighted(
    w,
    idx,
    cands.filter((c) => !taken.has(keyOf(c)) && !isDecision(c)),
    slots,
    "year/flavour",
  );
  const [w4, kept] = capChance(w3, chance, idx.year.cap);
  const all = [...kept, ...decisions, ...flavour].slice(
    0,
    Math.max(0, idx.year.cap),
  );
  reportDecisions({
    fired,
    queued: all.filter(isDecision).length,
    empty: need - decisions.length,
  });
  return [w4, all.map(asEvent)];
}

/** The player's events for this age-up: chance events first, then flavour slots, under the cap. */
function drawEvents(world: World, idx: PackIndex): [World, QueuedEvent[]] {
  const cands = [
    ...candidates(world, idx, "none"),
    ...candidates(world, idx, "loan"),
  ];
  const [w1, chance] = rollChance(world, idx, cands);
  if (idx.year.decisions) return drawWithDecisions(w1, idx, cands, chance);
  const [lo, hi] = idx.year.slots;
  let w = w1;
  let slots = lo;
  if (hi > lo) {
    const [w2, rng] = nextStream(w, clockAge(w), "year/slots");
    w = w2;
    slots = lo + rng.int(hi - lo + 1);
  }
  const taken = new Set(chance.map(keyOf));
  const [w3, flavour] = drawWeighted(
    w,
    idx,
    cands.filter((c) => !taken.has(keyOf(c))),
    slots,
    "year/flavour",
  );
  const [w4, kept] = capChance(w3, chance, idx.year.cap);
  const all = [...kept, ...flavour].slice(0, Math.max(0, idx.year.cap));
  return [w4, all.map(asEvent)];
}

/** NPC yearly pass: `scope: person` events, chance events rolled per person, one flavour slot each. */
function npcPass(world: World, idx: PackIndex): World {
  let w = world;
  const people = personsInIdOrder(w)
    .filter((p) => p.alive && p.id !== w.playerId)
    .map((p) => p.id);
  for (const pid of people) {
    if (w.ended) break;
    const cands = candidates(w, idx, "person").filter(
      (c) => c.scope?.id === pid,
    );
    const [w1, chance] = rollChance(w, idx, cands);
    const [w2, flavour] = drawWeighted(
      w1,
      idx,
      cands.filter((c) => !chance.includes(c)),
      1,
      `npc/${pid}`,
    );
    w = w2;
    for (const c of [...chance, ...flavour]) {
      if (!isEligible(w, idx, c.storylet, c.scope)) continue;
      w = open(w, idx, asEvent(c));
    }
  }
  return w.ended ? w : endLivingWithParents(w, idx);
}

/**
 * Living with parents ends when no parent is left alive: an adult is on their own, a minor
 * goes to a guardian, and a guardian's care ends at 18.
 */
function endLivingWithParents(world: World, idx: PackIndex): World {
  const player = getPerson(world, world.playerId);
  if (livesWithGuardian(player))
    return player.age < ADULT_AGE
      ? world
      : addJournalLine(
          startLivingOnOwn(world, idx, player.id),
          player.age,
          "You are 18: your guardian hands over your assets and you are on your own now.",
        );
  const role = idx.family?.parent.role;
  if (!role || (!livesWithParents(player) && player.age >= ADULT_AGE))
    return world;
  const parentAlive = world.relationships.some(
    (r) =>
      r.from === world.playerId &&
      r.role === role &&
      world.persons.get(r.to)?.alive,
  );
  if (parentAlive) return world;
  const next = startLivingOnOwn(world, idx, player.id);
  if (!livesWithGuardian(getPerson(next, player.id)))
    return addJournalLine(
      next,
      player.age,
      "With no parent left, you are on your own now.",
    );
  const guardian = guardianOf(world, idx, player);
  return addJournalLine(
    next,
    player.age,
    `With no parent left, ${guardian ? `${guardian.givenName} ${guardian.familyName} becomes your guardian` : "a guardian takes you in"}. Your assets are held in trust until you are 18.`,
  );
}

/** Open the queued events in order, stopping at the first that needs a choice. */
function advance(
  world: World,
  idx: PackIndex,
  events: readonly QueuedEvent[],
  inYear: boolean,
): World {
  let w = world;
  let queue = events;
  while (queue.length > 0 && !w.ended) {
    const [head, ...rest] = queue as [QueuedEvent, ...QueuedEvent[]];
    queue = rest;
    const s = idx.storylets.get(head.storyletId);
    if (!s || !isEligible(w, idx, s, head.scope)) continue;
    w = open(w, idx, head);
    if (w.pending) {
      return {
        ...w,
        pending: {
          ...w.pending,
          ...(inYear ? { rest: { events: queue } } : {}),
        },
      };
    }
  }
  if (w.ended || !inYear) return w;
  return npcPass(w, idx);
}

/**
 * Roll-site counters are keyed `<age>/<purpose>` and only the current age is ever read again,
 * so earlier ages are dropped; otherwise every roll copies a table that grows all life long.
 */
function pruneCounters(world: World): World {
  const now = clockAge(world);
  const kept: Record<string, number> = {};
  for (const [k, n] of Object.entries(world.rngCounters))
    if (Number.parseInt(k, 10) >= now) kept[k] = n;
  return { ...world, rngCounters: kept };
}

/**
 * Advance the world one year (ADR 0003): age everyone; settlement; the player's events
 * (chance, then flavour, under the cap); the NPC pass. A storylet with choices stops the year
 * as `world.pending`; `choose` resumes it. Throws if the life ended or a storylet is pending.
 */
export function ageUp(world: World, bundles: readonly PackBundle[]): SimResult {
  if (world.ended) throw new Error("the life has ended");
  if (world.pending) throw new Error("a storylet is pending; choose first");
  const idx = indexBundles(bundles);
  let w = appendChoice(
    { ...world, worldYear: world.worldYear + 1 },
    { t: "age" },
  );
  for (const p of personsInIdOrder(w)) {
    if (p.alive) w = updatePerson(w, p.id, (x) => ({ ...x, age: x.age + 1 }));
  }
  w = pruneCounters({ ...w, uses: {} });
  w = endLivingWithParents(w, idx);
  w = settle(w, idx);
  const [w2, events] = drawEvents(w, idx);
  return result(world, ensureYearEntry(advance(w2, idx, events, true), idx));
}

/**
 * Open an action storylet by id (from a menu), bound to `target` when it is `scope: person`.
 * With choices it becomes `world.pending`; otherwise it resolves now. Returns the world
 * unchanged (and logs nothing) if the storylet is not eligible. Logged as an `action` choice.
 */
export function startStorylet(
  world: World,
  bundles: readonly PackBundle[],
  storyletId: string,
  target?: PersonId,
  amount?: number,
): SimResult {
  if (world.ended) throw new Error("the life has ended");
  if (world.pending) throw new Error("a storylet is pending; choose first");
  const idx = indexBundles(bundles);
  const s = idx.storylets.get(storyletId);
  if (!s) throw new RangeError(`unknown storylet '${storyletId}'`);
  const scope: ScopeRef | undefined =
    target === undefined ? undefined : { kind: "person", id: target };
  if (!s.amount !== (amount === undefined))
    throw new RangeError(
      s.amount
        ? `action '${storyletId}' needs an amount`
        : `action '${storyletId}' takes no amount`,
    );
  if (!isEligible(world, idx, s, scope)) return { world, lines: [] };
  const range = amountRange(world, idx, s, scope);
  if (range && !amountAllowed(range, amount as number))
    throw new RangeError(
      `amount ${amount} is outside ${range.min}..${range.max} step ${range.step}`,
    );
  const logged = appendChoice(world, {
    t: "action",
    id: storyletId,
    ...(target === undefined ? {} : { target }),
    ...(amount === undefined ? {} : { amount }),
  });
  return result(
    world,
    advance(
      logged,
      idx,
      [
        {
          storyletId,
          ...(scope ? { scope } : {}),
          ...(amount === undefined ? {} : { amount }),
        },
      ],
      false,
    ),
  );
}

/**
 * Resolve the open storylet with the chosen choice: weighted outcome, effects, then `next`
 * (which may open another pending storylet). When the chain ends, the rest of the age-up
 * resumes (remaining events, then the NPC pass).
 */
export function choose(
  world: World,
  bundles: readonly PackBundle[],
  choiceIndex: number,
): SimResult {
  const p = world.pending;
  if (!p) throw new Error("nothing is pending");
  const idx = indexBundles(bundles);
  const s = idx.storylets.get(p.storyletId);
  if (!s) throw new RangeError(`unknown storylet '${p.storyletId}'`);
  const cleared = {
    ...appendChoice(world, { t: "choose", i: choiceIndex }),
    pending: null,
  };
  const w = resolveChoice(
    cleared,
    idx,
    s,
    p.scope,
    choiceIndex,
    p.amount,
    p.factorBp,
  );
  if (w.ended) return result(world, w);
  if (w.pending) {
    return result(world, {
      ...w,
      pending: { ...w.pending, ...(p.rest ? { rest: p.rest } : {}) },
    });
  }
  const done = advance(w, idx, p.rest?.events ?? [], p.rest !== undefined);
  return result(world, p.rest ? ensureYearEntry(done, idx) : done);
}

/** The open storylet's prompt and choices, or null. */
export function describePending(
  world: World,
  bundles: readonly PackBundle[],
): PendingView | null {
  const p = world.pending;
  if (!p) return null;
  const idx = indexBundles(bundles);
  const s = idx.storylets.get(p.storyletId);
  if (!s) throw new RangeError(`unknown storylet '${p.storyletId}'`);
  const scope = scopeFor(world, p.scope, s.id);
  // Prompt text is rendered without `amount`; only choices and outcomes bind it.
  const bound = scopeFor(world, p.scope, s.id, p.amount);
  return {
    storyletId: s.id,
    ...(s.icon ? { icon: s.icon } : {}),
    text:
      s.text === undefined
        ? ""
        : renderText(pickText(world, s.text, s.matureText), world, idx, scope),
    choices: s.choices.map((c, index) => ({
      index,
      label: pickText(world, c.label, c.matureLabel),
      enabled: evalBool(c.when, world, idx, bound),
    })),
  };
}
