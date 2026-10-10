import { bundles } from "virtual:packs";
import {
  addParentLink,
  addPerson,
  ageUp,
  type CompiledItemKind,
  type CompiledStorylet,
  type CustomStart,
  canAgeUp,
  choose,
  describePending,
  endLife,
  formatMoney,
  type GraveyardEntry,
  godSetMoney,
  godSetStat,
  heirsOf,
  indexBundles,
  listActions,
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
  type SimResult,
  sell,
  succeed,
  trade,
  type World,
} from "@life/core";
import { computed, effect, signal } from "@preact/signals";
import {
  type Autosaver,
  createAutosaver,
  type LifeStore,
  type LoadProblem,
  openLifeStore,
  requestPersistence,
} from "../persistence/index.ts";
import { matureMode } from "./hidden.ts";

/** UI-layer seed: the only place the web app draws randomness (ADR 0002). */
function randomSeed(): number {
  // The e2e build plays one fixed life: a random life made specs flaky (early deaths, years too
  // tall for the journal pane). Release builds tree-shake this branch out.
  if (import.meta.env.VITE_E2E) return 1;
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

/** What the shared amount picker is open for; `null` when closed. Host: `AmountPrompt`. */
export interface AmountRequest {
  title: string;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onConfirm: (amount: number) => void;
  onCancel?: () => void;
}
export const amountRequest = signal<AmountRequest | null>(null);

/** Ask the player for an amount through the one shared picker (actions, the market screen). */
export function requestAmount(req: AmountRequest): void {
  amountRequest.value = req;
}

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
/**
 * Set while the current life's player is dead: the obituary screen (heir picker) shows until
 * the player continues as an heir or finishes the life. The life stays in the life list, so a
 * reload in between returns here.
 */
export const deathObituary = computed<Obituary | null>(() =>
  currentLifeId.value === null ? null : world.value.ended,
);
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
  void autosaver
    .save(id, lifeName(w), w)
    .then(() => {
      if (!persistRequested) {
        persistRequested = true;
        void requestPersistence();
      }
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
  begin(newLife(bundles, randomSeed(), { mature: matureMode.value }));
}

/** God mode: start a life with the chosen starting options. */
export function startCustomLife(custom: CustomStart): void {
  begin(newLife(bundles, randomSeed(), { custom, mature: matureMode.value }));
}

function begin(w: World): void {
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
      const done = (result: number | null) => {
        (window as unknown as { __picked: number | null }).__picked = result;
        amountRequest.value = null;
      };
      amountRequest.value = {
        title: "Place your bet",
        min,
        max,
        step,
        onConfirm: done,
        onCancel: () => done(null),
      };
    },
    /**
     * Add an action with an amount input (`e2e-bet`, menu `activities`, $1.00 to $10.00 in
     * $1.00 steps, costs the amount) to the loaded Pack.
     */
    addAmountAction(): void {
      (packIndex.storylets as Map<string, CompiledStorylet>).set("e2e-bet", {
        id: "e2e-bet",
        label: "Place a bet",
        tags: [],
        trigger: "action",
        menu: "activities",
        once: false,
        amount: { min: 100, max: 1000, step: 100 },
        choices: [],
        outcomes: [
          {
            weight: 1,
            text: "You bet {amount}.",
            effects: [["sub", "money", ["v", "amount"]]],
          },
        ],
      } as unknown as CompiledStorylet);
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
    flushSaves,
    /** Give the player a living child of this age (a possible heir). */
    addChild(age: number): void {
      const [w, id] = addPerson(world.value, {
        givenName: "Kid",
        familyName: "Heir",
        age,
      });
      world.value = addParentLink(w, id, w.playerId);
    },
    /** End the player's life now (the obituary and heir picker show; the life stays listed until chosen). */
    die(): void {
      world.value = endLife(world.value, world.value.playerId, "an e2e test");
    },
    /** Final world hashes of fixed-policy lives, one per seed (determinism comparison). */
    playFixedLives(seeds: readonly number[]): string[] {
      return seeds.map((s) => playFixedLife(bundles, s));
    },
    /**
     * Add a market kind (`e2e-fund`, $100.00 a unit) and an age-18 player to the loaded Pack, so
     * the market screen has something to trade (core-loop has no market kinds).
     */
    addMarket(): void {
      (packIndex.markets as Map<string, CompiledItemKind>).set("e2e-fund", {
        id: "e2e-fund",
        label: "E2E fund",
        category: "investments",
        price: 0,
        value: 0,
        market: { start: 10000, driftBp: 500, volBp: 0 },
      } as CompiledItemKind);
      const w = world.value;
      const persons = new Map(w.persons);
      const p = persons.get(w.playerId);
      if (p) persons.set(w.playerId, { ...p, age: 18 });
      world.value = { ...w, persons };
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
  const s = packIndex.storylets.get(actionId);
  if (!s?.amount)
    return apply(() => runAction(world.value, bundles, actionId, target));
  const row = listActions(world.value, bundles, s.menu ?? "", target).find(
    (r) => r.id === actionId,
  );
  if (!row?.amount || row.locked) return row?.reason ?? "Not available";
  requestAmount({
    title: row.label,
    ...row.amount,
    format: (n) => formatMoney(n, packIndex.currency),
    onConfirm: (amount) =>
      apply(() => runAction(world.value, bundles, actionId, target, amount)),
  });
  return null;
}

/** Buy (positive) or sell (negative) `amount` of cash worth of a market kind; error message or null. */
export function tradeKind(kindId: string, amount: number): string | null {
  return apply(() => trade(world.value, bundles, kindId, amount));
}

/** God mode: set a player stat (0-100). */
export function editStat(stat: string, value: number): string | null {
  return apply(() => ({
    world: godSetStat(world.value, stat, value),
    lines: [],
  }));
}

/** God mode: set the player's money, minor units. */
export function editMoney(value: number): string | null {
  return apply(() => ({ world: godSetMoney(world.value, value), lines: [] }));
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

/** One person who may inherit, for the picker. */
export interface HeirView {
  readonly id: number;
  readonly name: string;
  readonly age: number;
}

/** The dead player's living children, who may carry on the line. Empty unless the life has ended. */
export const heirs = computed<readonly HeirView[]>(() => {
  const w = world.value;
  if (!w.ended) return [];
  return heirsOf(w).map((id) => {
    const p = w.persons.get(id);
    return {
      id,
      name: p ? `${p.givenName} ${p.familyName}` : `Person ${id}`,
      age: p?.age ?? 0,
    };
  });
});

/**
 * Continue as one of the dead player's children: the finished generation moves to the graveyard
 * and the same life carries on with the heir, both written in one transaction. Returns an
 * error message, or null.
 */
export async function chooseHeir(heirId: number): Promise<string | null> {
  const id = currentLifeId.value;
  const dead = world.value;
  if (id === null || !dead.ended) return "This life has not ended.";
  let r: SimResult;
  try {
    r = succeed(dead, bundles, heirId);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  const series = netWorthHistory.value;
  await flushSaves();
  if (store) {
    try {
      await store.succeedLife(
        { id, name: lifeName(dead), updatedAt: Date.now(), world: dead },
        { id, name: lifeName(r.world), updatedAt: Date.now(), world: r.world },
        series,
      );
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  enter(id, r.world);
  latestLines.value = r.lines;
  await refreshLists();
  return null;
}

/** Finish the dead player's life: it moves to the graveyard and the life list shows. */
export async function finishLife(): Promise<string | null> {
  const id = currentLifeId.value;
  const dead = world.value;
  if (id === null || !dead.ended) return "This life has not ended.";
  const series = netWorthHistory.value;
  await flushSaves();
  if (store) {
    try {
      await store.moveToGraveyard(
        { id, name: lifeName(dead), updatedAt: Date.now(), world: dead },
        series,
      );
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  currentLifeId.value = null;
  await refreshLists();
  return null;
}
