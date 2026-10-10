import {
  ageUp,
  canAgeUp,
  canSucceed,
  choose,
  costIndexOf,
  describePending,
  familyRoleOf,
  getPerson,
  hasTargetRole,
  heirsOf,
  holdingValue,
  indexBundles,
  isAnimal,
  kinshipOf,
  type Loan,
  livesWithoutGuardian,
  livesWithParents,
  livingBreakdown,
  livingCost,
  netWorth,
  newLife,
  type PackBundle,
  type PackIndex,
  parseSave,
  purchase,
  REPOSSESSION_MISSES,
  reachedMilestones,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  scheduledEntries,
  sell,
  serializeSave,
  serializeWorld,
  setAssertSink,
  setChanceDropSink,
  setDecisionSink,
  setOutcomeSink,
  setStreamOverride,
  settleLiving,
  standardOf,
  streamFor,
  succeed,
  type World,
  worldHash,
} from "@life/core";
import {
  type GenerationRecord,
  type LifeEnd,
  type LifeMetrics,
  MetricCollector,
} from "./collect.ts";
import { chooseIndex, type ForceEntry, installRollOverride } from "./force.ts";
import type { PackMetrics } from "./metrics.ts";
import type { ProfileSpec } from "./profile-spec.ts";
import {
  type Context,
  type Move,
  makeProfile,
  menusOf,
  unlockedActions,
} from "./profiles.ts";

/** Lives still alive at this age are cut off and reported as stuck. */
export const AGE_CAP = 130;
/** Persons the player holds an animal role toward. */
function countAnimals(w: World, idx: PackIndex): number {
  let n = 0;
  for (const p of w.persons.keys()) if (isAnimal(w, idx, p)) n++;
  return n;
}

/** Most choices in one chain of events before the run calls it a loop. */
const CHAIN_CAP = 64;
/** Chance (1 in N) per year of a save round-trip check, besides the final world. */
const SAVE_CHECK_ONE_IN = 8;

export type FaultKind =
  | "exception"
  | "assertion"
  | "stuck"
  | "save-mismatch"
  | "minor-living-cost"
  | "unresolved-family"
  | "animal-bound"
  | "once-repeated";

export interface Fault {
  readonly kind: FaultKind;
  readonly profile: string;
  /** Life seed; `--life-seed` replays exactly this life. */
  readonly seed: number;
  readonly age: number;
  readonly message: string;
}

export interface YearSample {
  readonly age: number;
  readonly stats: Readonly<Record<string, number>>;
  readonly netWorth: number;
  /** Holds a non-school, non-retired, non-confining occupation. */
  readonly employed: boolean;
  /** Lives with their parents. */
  readonly withParents: boolean;
  /** Standard of living id while on their own; null with parents or without standards. */
  readonly standard: string | null;
  /**
   * Yearly living cost against income while on their own, minor units, with what a child at
   * home and a moved-in partner would change (the bots have neither); null with parents, a
   * guardian, or without standards.
   */
  readonly household: {
    readonly income: number;
    readonly cost: number;
    readonly child: number;
    readonly partner: number;
  } | null;
}

export interface LifeResult {
  readonly seed: number;
  readonly profile: string;
  readonly faults: readonly Fault[];
  /** Null when the life did not end (faulted or hit the cap). */
  readonly death: { readonly age: number; readonly cause: string } | null;
  /** Storylet id -> times opened (scopes merged). */
  readonly fires: Readonly<Record<string, number>>;
  /** Storylet id -> outcome key -> times resolved (see `outcomeKey`); every storylet that resolved an outcome. */
  readonly outcomes: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Events opened by each age-up (voluntary actions excluded). */
  readonly yearEvents: readonly number[];
  /** Choice events (event storylets that ask the player to pick) opened by each age-up, with the age reached. */
  readonly yearChoices: readonly { readonly age: number; readonly n: number }[];
  /** Decision slots per age-up (with the age reached); only from Packs that declare `year.decisions`. */
  readonly yearDecisions: readonly {
    readonly age: number;
    /** Decisions queued (chance choice events included). */
    readonly queued: number;
    /** Slots that fired with nothing eligible to draw. */
    readonly empty: number;
  }[];
  /** Per age-up: uses of repeatable actions in the year just ended, keyed like `World.uses`. */
  readonly yearUses: readonly Readonly<Record<string, number>>[];
  /** Chance hits the yearly cap dropped, by Pack id (the storylet id's prefix). */
  readonly capDrops: Readonly<Record<string, number>>;
  /**
   * Milestones and scheduled consequences (docs/spec/pack-format/hooks.md#milestones): the
   * milestones the final life reached, the milestone storylets it opened, and the consequences
   * still queued when it ended (or was cut off).
   */
  readonly consequences: {
    readonly milestones: readonly string[];
    readonly fired: number;
    readonly pending: number;
  };
  readonly samples: readonly YearSample[];
  /**
   * Money change of every resolved choice of a storylet tagged `wager`, by storylet id: how
   * often it was played, the net money change, and the worst single change (the stake).
   */
  readonly wagers: Readonly<
    Record<string, { plays: number; net: number; worst: number }>
  >;
  /** Persons in the final world and how many of them (not the player) hold or held a job; null without a world. */
  /** People in the world other than animals; null when the life did not finish. */
  readonly persons: number | null;
  /** Animals (pets) in the world. */
  readonly pets: number;
  readonly careers: number;
  /** Length of the serialized final world, bytes (UTF-8 for the ASCII-only canonical text). */
  readonly saveBytes: number;
  readonly loansOpened: number;
  readonly loansDefaulted: number;
  readonly repossessions: number;
  readonly everDegree: boolean;
  readonly everEmployed: boolean;
  readonly retired: boolean;
  /** Age at which living with their parents first ended (any cause); null if it never did. */
  readonly moveOutAge: number | null;
  /** The parents asked the player to leave. */
  readonly kickedOut: boolean;
  /** The parents put the player out at 16-17 (a minor leaving home with a living parent). */
  readonly putOut: boolean;
  /** The player lived on their own under 18 with no guardian at some point. */
  readonly noGuardian: boolean;
  /** Sum of positive occupation pay over the life (gross, minor units). */
  readonly earnings: number;
  /** Declared Pack metrics of the life (`packs/<id>/harness/metrics.yaml`), by Pack id. */
  readonly metrics: Readonly<Record<string, LifeMetrics>>;
  /** Times each forced entry fired in this life (by index); absent when nothing is forced. */
  readonly forced?: readonly number[];
  /**
   * With `--generations` above 1: one record per generation played, the founder's first. The
   * fields above describe the founder's life only; later generations add their faults to it.
   */
  readonly lineage?: readonly GenerationRecord[];
}

const playerOf = (w: World) => {
  const p = w.persons.get(w.playerId);
  if (!p) throw new Error("player missing");
  return p;
};

function totalFires(w: World): number {
  let n = 0;
  for (const r of Object.values(w.storyletLog)) n += r.count;
  return n;
}

/** Ids of the `trigger: milestone` storylets. */
function milestoneStorylets(bundles: readonly PackBundle[]): Set<string> {
  return new Set(
    bundles.flatMap((b) =>
      b.storylets.filter((s) => s.trigger === "milestone").map((s) => s.id),
    ),
  );
}

/** Opens of storylets whose ids are in `ids`. */
function firesIn(w: World, ids: ReadonlySet<string>): number {
  let n = 0;
  for (const [k, r] of Object.entries(w.storyletLog))
    if (ids.has(k.split("#")[0] as string)) n += r.count;
  return n;
}

/** Key of a resolved outcome: `o<i>` for a storylet without choices, `c<j>.o<i>` for outcome i of choice j (both 0-based, in YAML order). */
export function outcomeKey(o: {
  readonly choice: number | null;
  readonly index: number;
}): string {
  return o.choice === null ? `o${o.index}` : `c${o.choice}.o${o.index}`;
}

function firesById(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, r] of Object.entries(w.storyletLog)) {
    const id = k.split("#")[0] as string;
    out[id] = (out[id] ?? 0) + r.count;
  }
  return out;
}

const isRetired = (kindId: string): boolean => kindId.endsWith("/retired");

function describeError(e: unknown): string {
  if (e instanceof Error) {
    const where = e.stack?.split("\n").find((l) => l.includes("    at "));
    return `${e.name}: ${e.message}${where ? ` (${where.trim()})` : ""}`;
  }
  return String(e);
}

/** Serialize, parse, and compare: the world must survive a save unchanged. */
function checkSave(w: World, bundles: readonly PackBundle[]): string | null {
  const save: SaveFile = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    capabilities: bundles.flatMap((b) => b.capabilities).sort(),
    appliedMigrations: bundles
      .flatMap((b) => b.migrations.map((m) => m.id))
      .sort(),
    lives: [{ id: "harness", name: "harness", world: w }],
    graveyard: [],
  };
  const text = serializeSave(save);
  const back = parseSave(text);
  const loaded = back.lives[0]?.world;
  if (!loaded) return "the loaded save has no life";
  if (worldHash(loaded) !== worldHash(w))
    return `world hash differs after save and load (${worldHash(w)} != ${worldHash(loaded)})`;
  if (serializeSave(back) !== text)
    return "save text differs after load and re-save";
  return null;
}

/** One life played by `playLife`: its result, final world and the metrics left to finish. */
interface Played {
  /** `metrics` is empty: `finish` fills it once the lineage is known. */
  readonly result: LifeResult;
  readonly world: World | null;
  readonly finish: (
    lineage: readonly GenerationRecord[],
  ) => Record<string, LifeMetrics>;
}

/**
 * Play one life to its end (or a fault) as `profile`, from a new life or, for generation
 * `generation` above 0, from `start` (an heir's world after `succeed`). Every choice the
 * profile makes comes from a harness stream seeded by the life seed, never from the game's
 * own streams.
 */
function playLife(
  bundles: readonly PackBundle[],
  seed: number,
  spec: ProfileSpec,
  packMetrics: readonly PackMetrics[],
  force: readonly ForceEntry[],
  start: World | null,
  generation: number,
): Played {
  const fired: number[] = force.map(() => 0);
  const overridden = installRollOverride(force, fired);
  const profile = makeProfile(spec, bundles);
  const profileName = spec.id;
  const ctx: Context = { bundles, menus: menusOf(bundles) };
  const collector = new MetricCollector(packMetrics, (tag) => {
    const ids = new Set<string>();
    for (const b of bundles)
      for (const st of b.storylets) if (st.tags.includes(tag)) ids.add(st.id);
    return ids;
  });
  const rng = streamFor(seed, 0, `harness/${profileName}`, 0, generation);
  const faults: Fault[] = [];
  const seen = new Set<string>();
  let age = 0;
  const fault = (kind: FaultKind, message: string): void => {
    const key = `${kind}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    faults.push({ kind, profile: profileName, seed, age, message });
  };
  setAssertSink((m) => fault("assertion", `expression ${m}`));

  const yearEvents: number[] = [];
  const yearChoices: { age: number; n: number }[] = [];
  const yearDecisions: { age: number; queued: number; empty: number }[] = [];
  let lastDraw: { queued: number; empty: number } | null = null;
  setDecisionSink((d) => {
    lastDraw = d;
  });
  const capDrops: Record<string, number> = {};
  setChanceDropSink((ids) => {
    for (const id of ids) {
      const pack = id.slice(0, id.indexOf("/"));
      capDrops[pack] = (capDrops[pack] ?? 0) + 1;
    }
  });
  const choiceIds = new Set<string>();
  for (const b of bundles)
    for (const st of b.storylets)
      if (st.trigger === "event" && st.choices.length > 0) choiceIds.add(st.id);
  const wagerIds = new Set<string>();
  for (const b of bundles)
    for (const st of b.storylets)
      if (st.tags.includes("wager")) wagerIds.add(st.id);
  const wagers: Record<string, { plays: number; net: number; worst: number }> =
    {};
  const outcomes: Record<string, Record<string, number>> = {};
  setOutcomeSink((id, d, o) => {
    const tally = outcomes[id] ?? {};
    outcomes[id] = tally;
    const k = outcomeKey(o);
    tally[k] = (tally[k] ?? 0) + 1;
    if (!wagerIds.has(id) || d === 0) return;
    const t = wagers[id] ?? { plays: 0, net: 0, worst: 0 };
    wagers[id] = {
      plays: t.plays + 1,
      net: t.net + d,
      worst: Math.min(t.worst, d),
    };
  });
  const yearUses: Record<string, number>[] = [];
  const samples: YearSample[] = [];
  const loanIds = new Set<number>();
  const defaulted = new Set<number>();
  const animalBound = new Set<string>();
  let repossessions = 0;
  let everEmployed = false;
  let retired = false;
  let moveOutAge: number | null = null;
  let noGuardian = false;
  let earnings = 0;
  let w: World | null = null;

  /** Note the age at which the player first stops living with their parents. */
  const noteHome = (): void => {
    if (w && moveOutAge === null && !livesWithParents(playerOf(w)))
      moveOutAge = playerOf(w).age;
  };

  /** Answer open events until none is left. False when the run is stuck. */
  const resolve = (): boolean => {
    for (let n = 0; w?.pending && !w.ended; n++) {
      if (n >= CHAIN_CAP) {
        fault("stuck", `more than ${CHAIN_CAP} chained choices in a row`);
        return false;
      }
      const view = describePending(w, bundles);
      if (!view) return true;
      const enabled = view.choices.filter((c) => c.enabled);
      if (enabled.length === 0) {
        fault(
          "stuck",
          `open event ${view.storyletId} has no selectable choice`,
        );
        return false;
      }
      let pick = -1;
      for (const [i, e] of force.entries()) {
        if (e.kind !== "choose" || (e.age !== undefined && e.age !== age))
          continue;
        const at = chooseIndex(
          e,
          enabled.map((c) => c.label),
        );
        if (at < 0) continue;
        fired[i] = (fired[i] ?? 0) + 1;
        pick = (enabled[at] as { index: number }).index;
        break;
      }
      w = choose(
        w,
        bundles,
        pick >= 0 ? pick : profile.pickChoice(view, enabled, rng),
      ).world;
    }
    return true;
  };

  const apply = (m: Move): void => {
    if (!w) return;
    if (m.t === "action") {
      const before = collector.beforeAction(playerOf(w), m);
      w = runAction(w, bundles, m.id, m.target, m.amount).world;
      if (!resolve()) return;
      for (const msg of collector.afterAction(playerOf(w), m, before))
        fault("assertion", msg);
    } else if (m.t === "buy") w = purchase(w, bundles, m.kind, m.mode).world;
    else w = sell(w, bundles, m.asset).world;
  };

  const trackLoans = (before: readonly Loan[], after: World): void => {
    const now = new Map(playerOf(after).loans.map((l) => [l.id, l]));
    const assets = new Set(playerOf(after).assets.map((a) => a.id));
    for (const l of now.values()) {
      loanIds.add(l.id);
      if (l.missed > 0) defaulted.add(l.id);
    }
    for (const prev of before) {
      const cur = now.get(prev.id);
      if (
        prev.securedAssetId !== undefined &&
        prev.missed + 1 >= REPOSSESSION_MISSES &&
        !assets.has(prev.securedAssetId) &&
        (!cur || cur.securedAssetId === undefined)
      )
        repossessions++;
    }
  };

  try {
    w = start ?? newLife(bundles, seed);
    collector.market(w.market);
    while (w && !w.ended) {
      age = playerOf(w).age;
      if (age >= AGE_CAP) {
        fault("stuck", `alive at the age cap of ${AGE_CAP}`);
        break;
      }
      for (const [i, e] of force.entries()) {
        if (e.kind !== "do" || e.age !== age || !w || w.pending) continue;
        const row = unlockedActions(w, ctx).find(
          (r) => r.id === e.action && r.target === undefined,
        );
        const range = row?.amount;
        if (!row) continue;
        let amount: number | undefined;
        if (range) {
          amount =
            e.amount === "min"
              ? range.min
              : e.amount === "max"
                ? range.max
                : e.amount;
          if (
            amount < range.min ||
            amount > range.max ||
            (amount - range.min) % range.step !== 0
          )
            continue;
        }
        fired[i] = (fired[i] ?? 0) + 1;
        apply({
          t: "action",
          id: e.action,
          ...(range && amount !== undefined
            ? {
                amount,
                slot: Math.round((amount - range.min) / range.step) + 1,
              }
            : {}),
        });
        if (!resolve()) break;
        noteHome();
        if (w) collector.observe(playerOf(w));
      }
      if (faults.some((f) => f.kind === "stuck")) break;
      if (!w || w.ended) break;
      // Voluntary moves.
      const moves = profile.maxMoves(rng);
      for (let i = 0; i < moves && w && !w.ended && !w.pending; i++) {
        const m = profile.nextMove(w, ctx, rng);
        if (!m) break;
        apply(m);
        if (!resolve()) break;
        noteHome();
        if (w) collector.observe(playerOf(w));
      }
      if (faults.some((f) => f.kind === "stuck")) break;
      if (!w || w.ended) break;
      if (!canAgeUp(w)) {
        fault("stuck", "the life cannot age up and has not ended");
        break;
      }
      // The year.
      const loansBefore = playerOf(w).loans;
      const firesBefore = totalFires(w);
      const choicesBefore = firesIn(w, choiceIds);
      lastDraw = null;
      yearUses.push({ ...w.uses });
      w = ageUp(w, bundles).world;
      age = playerOf(w).age;
      const draw = lastDraw as { queued: number; empty: number } | null;
      if (draw) yearDecisions.push({ age, ...draw });
      if (!resolve()) break;
      noteHome();
      collector.observe(playerOf(w));
      collector.market(w.market);
      collector.yearEnd(playerOf(w));
      yearEvents.push(totalFires(w) - firesBefore);
      yearChoices.push({ age, n: firesIn(w, choiceIds) - choicesBefore });
      trackLoans(loansBefore, w);
      if (w.ended) break;
      const me = playerOf(w);
      for (const o of me.occupations) if (o.pay > 0) earnings += o.pay;
      const index = indexBundles(bundles);
      const employed = me.occupations.some(
        (o) =>
          o.group !== "school" &&
          !isRetired(o.kindId) &&
          !index.occupations.get(o.kindId)?.confines,
      );
      if (employed) everEmployed = true;
      if (me.occupations.some((o) => isRetired(o.kindId))) retired = true;
      if (me.age < 18) {
        // Invariant: no living cost is charged to a minor, except one on their own with no guardian.
        const alone = livesWithoutGuardian(me);
        if (alone) noGuardian = true;
        const settled = getPerson(settleLiving(w, index), me.id);
        if (me.age < 16 && alone)
          fault("minor-living-cost", `no guardian at age ${me.age}`);
        else if (
          !alone &&
          (livingCost(w, index, me) !== 0 ||
            settled.money !== me.money ||
            settled.livedStandardId !== me.livedStandardId)
        )
          fault("minor-living-cost", `living cost charged at age ${me.age}`);
      }
      // Invariant: everyone the player holds a family role toward has a kinship id.
      for (const r of w.relationships)
        if (
          r.from === w.playerId &&
          familyRoleOf(r.role) !== undefined &&
          kinshipOf(w, w.playerId, r.to) === undefined
        )
          fault(
            "unresolved-family",
            `person ${r.to} holds '${r.role}' but has no kinship id at age ${me.age}`,
          );
      // Invariant: a storylet binds an animal only when its `target` names an animal role.
      for (const key of Object.keys(w.storyletLog)) {
        const at = key.indexOf("#");
        const s = at < 0 ? undefined : index.storylets.get(key.slice(0, at));
        const pid = Number(key.slice(at + 1));
        if (
          s?.scope === "person" &&
          !animalBound.has(key) &&
          isAnimal(w, index, pid) &&
          !hasTargetRole(w, index, s, pid)
        ) {
          animalBound.add(key);
          fault(
            "animal-bound",
            `'${s.id}' opened for animal ${pid} at age ${me.age}`,
          );
        }
      }
      const lived = standardOf(me, index);
      const hh = index.living?.household;
      const bill =
        lived && hh && me.age >= 18 && !livesWithParents(me) && !me.withGuardian
          ? livingBreakdown(w, index, me, lived)
          : null;
      const nw = netWorth(w, me);
      samples.push({
        household:
          bill && hh
            ? {
                income: Math.max(
                  0,
                  me.occupations.reduce((n, o) => n + o.pay, 0),
                ),
                cost: bill.total,
                child: Math.trunc(
                  (hh.dependentCost * costIndexOf(me, index)) / 10000,
                ),
                partner: Math.trunc(
                  (bill.standard * hh.partnerShareBp) / 10000,
                ),
              }
            : null,
        age: me.age,
        stats: me.stats,
        netWorth: nw,
        employed,
        withParents: livesWithParents(me),
        standard: livesWithParents(me)
          ? null
          : (standardOf(me, indexBundles(bundles))?.id ?? null),
      });
      const byKind: Record<string, number> = {};
      for (const h of me.holdings)
        byKind[h.kindId] = (byKind[h.kindId] ?? 0) + holdingValue(w, h);
      collector.snapshot(me, nw, {
        total: Object.values(byKind).reduce((a, v) => a + v, 0),
        byKind,
      });
      if (rng.int(SAVE_CHECK_ONE_IN) === 0) {
        const bad = checkSave(w, bundles);
        if (bad) fault("save-mismatch", bad);
      }
    }
    if (w && !faults.some((f) => f.kind === "save-mismatch")) {
      const bad = checkSave(w, bundles);
      if (bad) fault("save-mismatch", bad);
    }
  } catch (e) {
    fault("exception", describeError(e));
  } finally {
    setAssertSink(null);
    setDecisionSink(null);
    setChanceDropSink(null);
    setOutcomeSink(null);
    if (overridden) setStreamOverride(null);
  }

  const final = w;
  const animals = final ? countAnimals(final, indexBundles(bundles)) : 0;
  const me = final ? playerOf(final) : null;
  const fires = final ? firesById(final) : {};
  const all = me ? [...me.occupationHistory, ...me.occupations] : [];
  if (final)
    for (const id of onceRepeated(final, bundles))
      fault(
        "once-repeated",
        `once storylet ${id} opened twice in a generation`,
      );
  const lifeEnd: Omit<LifeEnd, "lineage"> = {
    me,
    years: samples.length,
    earnings,
    death: final?.ended && me ? { cause: final.ended.cause } : null,
    fires,
    outcomes,
  };
  const result: LifeResult = {
    seed,
    profile: profileName,
    faults,
    death:
      final?.ended && me
        ? { age: final.ended.age, cause: final.ended.cause }
        : null,
    fires,
    outcomes,
    yearEvents,
    yearChoices,
    yearDecisions,
    yearUses,
    capDrops,
    consequences: final
      ? {
          milestones: reachedMilestones(final),
          fired: firesIn(final, milestoneStorylets(bundles)),
          pending: scheduledEntries(final).length,
        }
      : { milestones: [], fired: 0, pending: 0 },
    samples,
    wagers,
    persons: final ? final.persons.size - animals : null,
    pets: animals,
    careers: final
      ? [...final.persons.values()].filter(
          (p) =>
            p.id !== final.playerId &&
            (p.occupations.length > 0 || p.occupationHistory.length > 0),
        ).length
      : 0,
    saveBytes: final ? serializeWorld(final).length : 0,
    loansOpened: loanIds.size,
    loansDefaulted: defaulted.size,
    repossessions,
    everDegree: me
      ? Object.entries(me.qualities).some(
          ([k, v]) => k.startsWith("has_degree") && v === true,
        )
      : false,
    everEmployed,
    metrics: {},
    retired: retired || all.some((o) => isRetired(o.kindId)),
    moveOutAge,
    putOut:
      (final?.storyletLog["core-loop/parents-put-you-out"]?.count ?? 0) > 0,
    noGuardian,
    kickedOut:
      (final?.storyletLog["core-loop/parents-ask-you-to-leave"]?.count ?? 0) >
      0,
    earnings,
    ...(force.length > 0 ? { forced: fired } : {}),
  };
  return {
    result,
    world: final,
    finish: (lineage) => collector.finish({ ...lifeEnd, lineage }),
  };
}

/** Who inherits when several children survive. */
export type HeirPolicy = "eldest" | "richest" | "random";
export const HEIR_POLICIES: readonly HeirPolicy[] = [
  "eldest",
  "richest",
  "random",
];

/** How many generations a life continues for (`--generations`) and who inherits (`--heir`). */
export interface Lineage {
  readonly generations: number;
  readonly heir: HeirPolicy;
}

/** Ids of `once` storylets the world's log shows opened more than once under one key. */
function onceRepeated(w: World, bundles: readonly PackBundle[]): string[] {
  const once = new Set(
    bundles.flatMap((b) => b.storylets.filter((s) => s.once).map((s) => s.id)),
  );
  return Object.entries(w.storyletLog)
    .filter(([k, r]) => r.count > 1 && once.has(k.split("#")[0] as string))
    .map(([k]) => k);
}

/** The heir `policy` picks among `heirs` (living children, in person id order). */
function pickHeir(
  w: World,
  heirs: readonly number[],
  policy: HeirPolicy,
  rng: { int(n: number): number },
): number {
  if (policy === "random") return heirs[rng.int(heirs.length)] as number;
  let best = heirs[0] as number;
  for (const id of heirs) {
    const a = getPerson(w, id);
    const b = getPerson(w, best);
    if (policy === "eldest" ? a.age > b.age : a.money > b.money) best = id;
  }
  return best;
}

/** What a generation shows the lineage metrics: its death, and for an heir the succession into it. */
function recordOf(
  played: Played,
  generation: number,
  entry: Pick<
    GenerationRecord,
    "inheritance" | "heirAge" | "minorHeir" | "insolvent"
  >,
  repeatedOnce: number,
): GenerationRecord {
  const w = played.world;
  const ended = w?.ended ?? null;
  return {
    generation,
    died: ended ? 1 : 0,
    deathAge: ended ? ended.age : 0,
    netWorth: w && ended ? netWorth(w, playerOf(w)) : 0,
    heirs: w && ended ? heirsOf(w).length : 0,
    ...entry,
    repeatedOnce,
  };
}

const NO_ENTRY = { inheritance: 0, heirAge: 0, minorHeir: 0, insolvent: 0 };

/**
 * Play one life to its end (or a fault) as `profile`; with `lineage.generations` above 1 the
 * life continues as an heir (chosen by `lineage.heir`) until the line ends, a fault stops it
 * or that many generations were played. The result is the founder's; heirs' faults join it
 * and `lineage` has one record per generation. Forcing applies to the founder only.
 */
export function runLife(
  bundles: readonly PackBundle[],
  seed: number,
  spec: ProfileSpec,
  packMetrics: readonly PackMetrics[] = [],
  force: readonly ForceEntry[] = [],
  lineage?: Lineage,
): LifeResult {
  const first = playLife(bundles, seed, spec, packMetrics, force, null, 0);
  const records: GenerationRecord[] = [
    recordOf(
      first,
      0,
      NO_ENTRY,
      first.world ? onceRepeated(first.world, bundles).length : 0,
    ),
  ];
  const faults = [...first.result.faults];
  let cur = first;
  const rng = streamFor(seed, 0, `harness/${spec.id}/heir`, 0);
  for (let g = 1; g < (lineage?.generations ?? 1); g++) {
    const w = cur.world;
    if (!w || !w.ended || cur.result.faults.length > 0 || !canSucceed(w)) break;
    const heirId = pickHeir(w, heirsOf(w), lineage?.heir ?? "eldest", rng);
    const before = getPerson(w, heirId);
    const insolvent = netWorth(w, playerOf(w)) < 0 ? 1 : 0;
    let next: World;
    try {
      next = succeed(w, bundles, heirId).world;
    } catch (e) {
      faults.push({
        kind: "exception",
        profile: spec.id,
        seed,
        age: before.age,
        message: `succeed: ${describeError(e)}`,
      });
      break;
    }
    const bad = checkSave(next, bundles);
    if (bad)
      faults.push({
        kind: "save-mismatch",
        profile: spec.id,
        seed,
        age: before.age,
        message: `after succession: ${bad}`,
      });
    cur = playLife(bundles, seed, spec, packMetrics, [], next, g);
    faults.push(...cur.result.faults);
    records.push(
      recordOf(
        cur,
        g,
        {
          inheritance: getPerson(next, heirId).money - before.money,
          heirAge: before.age,
          minorHeir: before.age < 18 ? 1 : 0,
          insolvent,
        },
        cur.world ? onceRepeated(cur.world, bundles).length : 0,
      ),
    );
  }
  return {
    ...first.result,
    faults,
    metrics: first.finish(records),
    ...(lineage && lineage.generations > 1 ? { lineage: records } : {}),
  };
}
