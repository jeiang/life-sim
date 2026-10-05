import { worldHash } from "../hash.ts";
import type { PackBundle } from "../pack.ts";
import { streamFor } from "../rng.ts";
import { ageUp, choose, describePending } from "./flow.ts";
import { newLife } from "./new-life.ts";

/** Years a fixed-policy life is played at most. */
const MAX_YEARS = 100;
/** Chained choices answered in one year before giving up (a pack bug, not a policy matter). */
const CHAIN_CAP = 64;

/**
 * Play one seeded life with a fixed policy (age up, answer every event with a seeded-random
 * enabled choice, no voluntary actions) and return the final `worldHash`. Hosts on different
 * JS engines compare the result: the e2e determinism check runs this in Node, Chromium, and WebKit.
 */
export function playFixedLife(
  bundles: readonly PackBundle[],
  seed: number,
): string {
  const rng = streamFor(seed, 0, "determinism/fixed-life", 0);
  let w = newLife(bundles, seed);
  for (let year = 0; year < MAX_YEARS && !w.ended; year++) {
    w = ageUp(w, bundles).world;
    for (let n = 0; w.pending && !w.ended; n++) {
      if (n >= CHAIN_CAP) throw new Error("event chain did not terminate");
      const view = describePending(w, bundles);
      if (!view) break;
      const enabled = view.choices.filter((c) => c.enabled);
      const pick = enabled[rng.int(enabled.length)];
      if (!pick) throw new Error(`event ${view.storyletId} has no choice`);
      w = choose(w, bundles, pick.index).world;
    }
  }
  return worldHash(w);
}
