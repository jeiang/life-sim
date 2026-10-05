import { bundles } from "virtual:packs";
import {
  ageUp,
  canAgeUp,
  choose,
  describePending,
  indexBundles,
  newLife,
  type PackIndex,
  type PendingView,
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
}

export function chooseOption(index: number): void {
  if (!world.value.pending) return;
  const r = choose(world.value, bundles, index);
  world.value = r.world;
  latestLines.value = r.lines;
}

export function startNewLife(): void {
  world.value = newLife(bundles, randomSeed());
  latestLines.value = [];
}
