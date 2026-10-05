import type { CompiledStorylet, PackBundle } from "../pack.ts";
import type {
  ChoiceEntry,
  PersonId,
  QueuedEvent,
  ScopeRef,
  World,
} from "../state/types.ts";
import {
  getPerson,
  nextStream,
  personsInIdOrder,
  updatePerson,
} from "../state/world.ts";
import { clockAge, evalBool, evalInt } from "./ops.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";
import { settle } from "./settle.ts";
import { isEligible, open, resolveChoice, scopeFor } from "./storylets.ts";
import { renderText } from "./text.ts";

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

/** The player's events for this age-up: chance events first, then flavour slots, under the cap. */
function drawEvents(world: World, idx: PackIndex): [World, QueuedEvent[]] {
  const cands = [
    ...candidates(world, idx, "none"),
    ...candidates(world, idx, "loan"),
  ];
  const [w1, chance] = rollChance(world, idx, cands);
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
  const all = [...chance, ...flavour].slice(0, Math.max(0, idx.year.cap));
  return [w3, all.map(asEvent)];
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
  return w;
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
  let w = appendChoice(world, { t: "age" });
  for (const p of personsInIdOrder(w)) {
    if (p.alive) w = updatePerson(w, p.id, (x) => ({ ...x, age: x.age + 1 }));
  }
  w = pruneCounters(w);
  w = settle(w, idx);
  const [w2, events] = drawEvents(w, idx);
  return result(world, advance(w2, idx, events, true));
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
): SimResult {
  if (world.ended) throw new Error("the life has ended");
  if (world.pending) throw new Error("a storylet is pending; choose first");
  const idx = indexBundles(bundles);
  const s = idx.storylets.get(storyletId);
  if (!s) throw new RangeError(`unknown storylet '${storyletId}'`);
  const scope: ScopeRef | undefined =
    target === undefined ? undefined : { kind: "person", id: target };
  if (!isEligible(world, idx, s, scope)) return { world, lines: [] };
  const logged = appendChoice(world, {
    t: "action",
    id: storyletId,
    ...(target === undefined ? {} : { target }),
  });
  return result(
    world,
    advance(logged, idx, [{ storyletId, ...(scope ? { scope } : {}) }], false),
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
  const w = resolveChoice(cleared, idx, s, p.scope, choiceIndex);
  if (w.ended) return result(world, w);
  if (w.pending) {
    return result(world, {
      ...w,
      pending: { ...w.pending, ...(p.rest ? { rest: p.rest } : {}) },
    });
  }
  return result(
    world,
    advance(w, idx, p.rest?.events ?? [], p.rest !== undefined),
  );
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
  const scope = scopeFor(world, p.scope);
  return {
    storyletId: s.id,
    ...(s.icon ? { icon: s.icon } : {}),
    text: s.text === undefined ? "" : renderText(s.text, world, idx, scope),
    choices: s.choices.map((c, index) => ({
      index,
      label: c.label,
      enabled: evalBool(c.when, world, idx, scope),
    })),
  };
}
