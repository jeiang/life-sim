import { bundles } from "virtual:packs";
import {
  ageUp,
  canAgeUp,
  choose,
  describePending,
  indexBundles,
  type NetWorthPoint,
  newLife,
  type PackIndex,
  type PendingView,
  recordNetWorth,
  type World,
} from "@life/core";
import { computed, signal } from "@preact/signals";

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

export function ageUpOneYear(): void {
  if (!canAgeUp(world.value)) return;
  const r = ageUp(world.value, bundles);
  world.value = r.world;
  latestLines.value = r.lines;
  track();
}

export function chooseOption(index: number): void {
  if (!world.value.pending) return;
  const r = choose(world.value, bundles, index);
  world.value = r.world;
  latestLines.value = r.lines;
  track();
}

export function startNewLife(): void {
  world.value = newLife(bundles, randomSeed());
  latestLines.value = [];
  netWorthHistory.value = recordNetWorth([], world.value);
}
