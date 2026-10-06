import {
  ageUp,
  canAgeUp,
  choose,
  describePending,
  type Loan,
  netWorth,
  newLife,
  type PackBundle,
  parseSave,
  purchase,
  REPOSSESSION_MISSES,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  sell,
  serializeSave,
  setAssertSink,
  streamFor,
  type World,
  worldHash,
} from "@life/core";
import {
  type Context,
  type Move,
  menusOf,
  PROFILES,
  type ProfileName,
} from "./profiles.ts";

/** Lives still alive at this age are cut off and reported as stuck. */
export const AGE_CAP = 130;
/** Most choices in one chain of events before the run calls it a loop. */
const CHAIN_CAP = 64;
/** Chance (1 in N) per year of a save round-trip check, besides the final world. */
const SAVE_CHECK_ONE_IN = 8;

export type FaultKind = "exception" | "assertion" | "stuck" | "save-mismatch";

export interface Fault {
  readonly kind: FaultKind;
  readonly profile: ProfileName;
  /** Life seed; `--life-seed` replays exactly this life. */
  readonly seed: number;
  readonly age: number;
  readonly message: string;
}

export interface YearSample {
  readonly age: number;
  readonly stats: Readonly<Record<string, number>>;
  readonly netWorth: number;
  /** Holds a non-school, non-retired occupation. */
  readonly employed: boolean;
}

export interface LifeResult {
  readonly seed: number;
  readonly profile: ProfileName;
  readonly faults: readonly Fault[];
  /** Null when the life did not end (faulted or hit the cap). */
  readonly death: { readonly age: number; readonly cause: string } | null;
  /** Storylet id -> times opened (scopes merged). */
  readonly fires: Readonly<Record<string, number>>;
  /** Events opened by each age-up (voluntary actions excluded). */
  readonly yearEvents: readonly number[];
  /** Choice events (event storylets that ask the player to pick) opened by each age-up, with the age reached. */
  readonly yearChoices: readonly { readonly age: number; readonly n: number }[];
  readonly samples: readonly YearSample[];
  readonly loansOpened: number;
  readonly loansDefaulted: number;
  readonly repossessions: number;
  readonly everDegree: boolean;
  readonly everEmployed: boolean;
  readonly retired: boolean;
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

/** Opens of storylets whose ids are in `ids`. */
function firesIn(w: World, ids: ReadonlySet<string>): number {
  let n = 0;
  for (const [k, r] of Object.entries(w.storyletLog))
    if (ids.has(k.split("#")[0] as string)) n += r.count;
  return n;
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
    packVersions: bundles
      .map((b) => ({ id: b.id, version: String(b.version) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
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

/**
 * Play one life to its end (or a fault) as `profile`. Every choice the profile makes comes
 * from a harness stream seeded by the life seed, never from the game's own streams.
 */
export function runLife(
  bundles: readonly PackBundle[],
  seed: number,
  profileName: ProfileName,
): LifeResult {
  const profile = PROFILES[profileName];
  const ctx: Context = { bundles, menus: menusOf(bundles) };
  const rng = streamFor(seed, 0, `harness/${profileName}`, 0);
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
  const choiceIds = new Set<string>();
  for (const b of bundles)
    for (const st of b.storylets)
      if (st.trigger === "event" && st.choices.length > 0) choiceIds.add(st.id);
  const samples: YearSample[] = [];
  const loanIds = new Set<number>();
  const defaulted = new Set<number>();
  let repossessions = 0;
  let everEmployed = false;
  let retired = false;
  let w: World | null = null;

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
      w = choose(w, bundles, profile.pickChoice(view, enabled, rng)).world;
    }
    return true;
  };

  const apply = (m: Move): void => {
    if (!w) return;
    if (m.t === "action") w = runAction(w, bundles, m.id, m.target).world;
    else if (m.t === "buy") w = purchase(w, bundles, m.kind, m.mode).world;
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
    w = newLife(bundles, seed);
    while (w && !w.ended) {
      age = playerOf(w).age;
      if (age >= AGE_CAP) {
        fault("stuck", `alive at the age cap of ${AGE_CAP}`);
        break;
      }
      // Voluntary moves.
      const moves = profile.maxMoves(rng);
      for (let i = 0; i < moves && w && !w.ended && !w.pending; i++) {
        const m = profile.nextMove(w, ctx, rng);
        if (!m) break;
        apply(m);
        if (!resolve()) break;
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
      w = ageUp(w, bundles).world;
      age = playerOf(w).age;
      if (!resolve()) break;
      yearEvents.push(totalFires(w) - firesBefore);
      yearChoices.push({ age, n: firesIn(w, choiceIds) - choicesBefore });
      trackLoans(loansBefore, w);
      if (w.ended) break;
      const me = playerOf(w);
      const employed = me.occupations.some(
        (o) => o.group !== "school" && !isRetired(o.kindId),
      );
      if (employed) everEmployed = true;
      if (me.occupations.some((o) => isRetired(o.kindId))) retired = true;
      samples.push({
        age: me.age,
        stats: me.stats,
        netWorth: netWorth(me),
        employed,
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
  }

  const final = w;
  const me = final ? playerOf(final) : null;
  const all = me ? [...me.occupationHistory, ...me.occupations] : [];
  return {
    seed,
    profile: profileName,
    faults,
    death:
      final?.ended && me
        ? { age: final.ended.age, cause: final.ended.cause }
        : null,
    fires: final ? firesById(final) : {},
    yearEvents,
    yearChoices,
    samples,
    loansOpened: loanIds.size,
    loansDefaulted: defaulted.size,
    repossessions,
    everDegree: me
      ? Object.entries(me.qualities).some(
          ([k, v]) => k.startsWith("has_degree") && v === true,
        )
      : false,
    everEmployed,
    retired: retired || all.some((o) => isRetired(o.kindId)),
  };
}
