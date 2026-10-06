import { bundles } from "virtual:packs";
import {
  ageUp,
  type CompiledStorylet,
  canAgeUp,
  choose,
  describePending,
  endLife,
  type GraveyardEntry,
  indexBundles,
  listShop,
  type NetWorthPoint,
  newLife,
  type Obituary,
  type PackIndex,
  type PendingView,
  playFixedLife,
  purchase,
  recordNetWorth,
  runAction,
  type SavedLife,
  type ShopRow,
  sell,
  type World,
} from "@life/core";
import { computed, effect, signal } from "@preact/signals";
import { amountDemo } from "../components/AmountPickerDemo.tsx";
import {
  type Autosaver,
  createAutosaver,
  type LifeStore,
  type LoadProblem,
  openLifeStore,
  requestPersistence,
} from "../persistence/index.ts";

/** UI-layer seed: the only place the web app draws randomness (ADR 0002). */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}

export const packIndex: PackIndex = indexBundles(bundles);

/** The life being played. */
export const world = signal<World>(newLife(bundles, randomSeed()));

/**
 * Player net worth per age for the chart. Session state, not part of the World, so it is not
 * saved: a restored life starts a fresh series from its current age.
 */
export const netWorthHistory = signal<readonly NetWorthPoint[]>(
  recordNetWorth([], world.value),
);

const track = (): void => {
  netWorthHistory.value = recordNetWorth(netWorthHistory.value, world.value);
};

/** Journal lines written by the latest action, for the polite live region. */
export const latestLines = signal<readonly string[]>([]);

export const player = computed(() => {
  const w = world.value;
  // biome-ignore lint/style/noNonNullAssertion: the player pointer always resolves.
  return w.persons.get(w.playerId)!;
});

export const pending = computed<PendingView | null>(() =>
  describePending(world.value, bundles),
);

export const canAge = computed(() => canAgeUp(world.value));

/** Outcome lines of the finished steps of the open `next:` chain, shown above the current step. */
export const chainLines = signal<readonly string[]>([]);
// ---- Lives, graveyard, autosave (ADR 0003) ----

/** True once the stored lives have been read; render nothing before that. */
export const ready = signal(false);
/** Ongoing lives, newest first (refreshed on startup, import and when leaving a life). */
export const lives = signal<readonly SavedLife[]>([]);
/** Finished lives, newest first. */
export const graveyard = signal<readonly GraveyardEntry[]>([]);
/** The id of the life in `world`, or null while the life list is showing. */
export const currentLifeId = signal<string | null>(null);
/** Set when the current life ends: the obituary screen shows until acknowledged. */
export const deathObituary = signal<Obituary | null>(null);
/** Rows that could not be loaded (damaged or from a newer build). */
export const loadProblems = signal<readonly LoadProblem[]>([]);
/** Why saving is unavailable (storage could not open), or null. */
export const storageError = signal<string | null>(null);

let store: LifeStore | null = null;
let autosaver: Autosaver | null = null;
let lastSaved: World | null = null;
let persistRequested = false;

/** The open store, for Settings (export, import); null when storage is unavailable. */
export const getLifeStore = (): LifeStore | null => store;

/** Last autosave failure (quota, blocked), or null. */
export const saveError = computed(
  () => storageError.value ?? autosaver?.lastError.value ?? null,
);

/** Resolves when every queued autosave has been written. */
export const flushSaves = (): Promise<void> =>
  autosaver?.flush() ?? Promise.resolve();

const lifeName = (w: World): string => {
  const p = w.persons.get(w.playerId);
  return p ? `${p.givenName} ${p.familyName}` : "Unnamed";
};

/** Reload both lists from storage. */
export async function refreshLists(): Promise<void> {
  if (!store) return;
  const [l, g] = await Promise.all([
    store.loadLives(bundles),
    store.loadGraveyard(bundles),
  ]);
  lives.value = l.items;
  graveyard.value = g.items;
  loadProblems.value = [...l.problems, ...g.problems];
}

function saveWorld(id: string, w: World): void {
  if (!autosaver) return;
  lastSaved = w;
  if (w.ended) deathObituary.value = w.ended;
  void autosaver
    .save(id, lifeName(w), w)
    .then(() => {
      if (!persistRequested) {
        persistRequested = true;
        void requestPersistence();
      }
      if (w.ended) return refreshLists();
    })
    .catch(() => {
      // surfaced through `saveError`
    });
}

// Autosave after every change to the world: age-up, choice, action (any code that sets `world`).
effect(() => {
  const w = world.value;
  const id = currentLifeId.peek();
  if (id !== null && w !== lastSaved) saveWorld(id, w);
});

function enter(id: string, w: World): void {
  lastSaved = w; // loading is not a change: do not re-save
  currentLifeId.value = id;
  world.value = w;
  latestLines.value = [];
  netWorthHistory.value = recordNetWorth([], w);
  chainLines.value = [];
  purchasing.value = null;
}

/** Read the stored lives and decide the first screen. Call once before rendering. */
export async function initGame(): Promise<void> {
  try {
    store = await openLifeStore();
    autosaver = createAutosaver(store);
    await refreshLists();
    const ongoing = lives.value;
    const first = ongoing[0];
    if (
      ongoing.length === 0 &&
      graveyard.value.length === 0 &&
      loadProblems.value.length === 0
    ) {
      // Very first launch: start the first life straight away.
      const id = crypto.randomUUID();
      currentLifeId.value = id;
      saveWorld(id, world.peek());
    } else if (ongoing.length === 1 && first) {
      enter(first.id, first.world);
    }
    // Several lives, or none in progress: the life list shows.
  } catch (e) {
    storageError.value = e instanceof Error ? e.message : String(e);
    currentLifeId.value = crypto.randomUUID();
  }
  ready.value = true;
}

export function ageUpOneYear(): void {
  if (!canAgeUp(world.value)) return;
  const r = ageUp(world.value, bundles);
  world.value = r.world;
  latestLines.value = r.lines;
  track();
  chainLines.value = [];
}

export function chooseOption(index: number): void {
  const before = world.value.pending;
  if (!before) return;
  const r = choose(world.value, bundles, index);
  world.value = r.world;
  latestLines.value = r.lines;
  // A `next:` step keeps the parent's `rest` object; a later queued event gets a fresh one.
  const chained =
    r.world.pending !== null && r.world.pending.rest === before.rest;
  chainLines.value = chained ? [...chainLines.value, ...r.lines] : [];
  track();
}

/** Item kind id whose purchase dialog is open, or null. */
export const purchasing = signal<string | null>(null);

/** Open the purchase dialog for an item kind (shop rows call this). */
export function openPurchase(itemKindId: string): void {
  purchasing.value = itemKindId;
}

export function closePurchase(): void {
  purchasing.value = null;
}

/** The open purchase's shop row, priced now, or null. */
export const purchaseRow = computed<ShopRow | null>(() => {
  const id = purchasing.value;
  if (id === null) return null;
  return listShop(world.value, bundles).find((r) => r.id === id) ?? null;
});

/** Buy the open item with cash or its loan, then close the dialog. */
export function confirmPurchase(mode: "cash" | "loan"): void {
  const id = purchasing.value;
  if (id === null) return;
  const r = purchase(world.value, bundles, id, mode);
  world.value = r.world;
  latestLines.value = r.lines;
  purchasing.value = null;
  track();
}

/** Add a new life to the list and play it. The current life stays in the list. */
export function startNewLife(): void {
  const w = newLife(bundles, randomSeed());
  currentLifeId.value = crypto.randomUUID();
  lastSaved = null;
  world.value = w;
  latestLines.value = [];
  netWorthHistory.value = recordNetWorth([], world.value);
  chainLines.value = [];
  purchasing.value = null;
}

// Test hook for the e2e suite; the flag is set only by the e2e build, so it is tree-shaken out of releases.
if (import.meta.env.VITE_E2E) {
  /**
   * Fixture storylets cloned from an interview question and appended to the loaded Pack:
   * `<id>-1..n`, text `<label> n`, step n opening `nexts[n-1]` (null: no link). Returns the ids.
   */
  const fixtureSteps = (
    id: string,
    label: string,
    nexts: readonly (string | null)[],
  ): string[] => {
    const storylets = packIndex.storylets as Map<string, CompiledStorylet>;
    const src = [...storylets.values()].find((x) =>
      x.id.endsWith("interview-question-2"),
    );
    if (!src) throw new Error("interview chain missing");
    const rewire = (v: unknown, next: string | null): unknown => {
      if (Array.isArray(v)) return v.map((x) => rewire(x, next));
      if (v && typeof v === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v)) {
          if (k === "next") {
            if (next !== null) o[k] = next;
          } else o[k] = rewire(x, next);
        }
        return o;
      }
      return v;
    };
    return nexts.map((next, i) => {
      const f = {
        ...(rewire(src, next) as object),
        id: `${id}-${i + 1}`,
        text: `${label} ${i + 1}`,
      };
      storylets.set(f.id, f as CompiledStorylet);
      return f.id;
    });
  };
  const hook = {
    /** Run an action (e.g. start a `next:` chain). */
    runAction(id: string): void {
      const r = runAction(world.value, bundles, id);
      world.value = r.world;
      latestLines.value = r.lines;
    },
    openPurchase,
    pickAmount(min: number, max: number, step: number): void {
      amountDemo.value = { min, max, step };
    },
    /**
     * Open a three-step `next:` chain (core-loop has none longer than two interactive steps):
     * fixture storylets cloned from the interview questions, appended to the loaded Pack.
     */
    startChain3(): void {
      const [one] = fixtureSteps("e2e-chain", "Chain step", [
        "e2e-chain-2",
        "e2e-chain-3",
        null,
      ]);
      world.value = { ...world.value, pending: { storyletId: one as string } };
    },
    /**
     * Queue three separate decisions as an age-up would: the first is open, the other two wait
     * in `pending.rest` (no `next:` links between them).
     */
    queueDecisions(): void {
      const [one, two, three] = fixtureSteps("e2e-decision", "Decision", [
        null,
        null,
        null,
      ]) as [string, string, string];
      world.value = {
        ...world.value,
        pending: {
          storyletId: one,
          rest: { events: [{ storyletId: two }, { storyletId: three }] },
        },
      };
    },
    /** End the player's life now (the obituary shows and the life moves to the graveyard). */
    die(): void {
      world.value = endLife(world.value, world.value.playerId, "an e2e test");
    },
    /** Final world hashes of fixed-policy lives, one per seed (determinism comparison). */
    playFixedLives(seeds: readonly number[]): string[] {
      return seeds.map((s) => playFixedLife(bundles, s));
    },
    /** Set the player's cash, minor units. */
    setMoney(n: number): void {
      const w = world.value;
      const persons = new Map(w.persons);
      const p = persons.get(w.playerId);
      if (p) persons.set(w.playerId, { ...p, money: n });
      world.value = { ...w, persons };
    },
  };
  (window as unknown as { __life: typeof hook }).__life = hook;
}

/** Apply a sim result that may throw (rejected purchase); returns the error message or null. */
function apply(
  run: () => { world: World; lines: readonly string[] },
): string | null {
  try {
    const r = run();
    world.value = r.world;
    latestLines.value = r.lines;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Run a menu action (bound to `target` for person actions). Any open choice shows in the dialog. */
export function runMenuAction(
  actionId: string,
  target?: number,
): string | null {
  return apply(() => runAction(world.value, bundles, actionId, target));
}

export function sellAsset(assetId: number): string | null {
  return apply(() => sell(world.value, bundles, assetId));
}

/** Play a life from the list. */
export function continueLife(id: string): void {
  const life = lives.value.find((l) => l.id === id);
  if (life) enter(life.id, life.world);
}

/** Leave the current life (already saved) for the life list. */
export async function showLifeList(): Promise<void> {
  await flushSaves();
  currentLifeId.value = null;
  await refreshLists();
}

/** After the obituary: back to the life list. */
export async function dismissObituary(): Promise<void> {
  deathObituary.value = null;
  await showLifeList();
}
