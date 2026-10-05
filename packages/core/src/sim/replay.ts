import type { PackBundle } from "../pack.ts";
import type { ChoiceEntry, World } from "../state/types.ts";
import { runAction } from "./actions.ts";
import { ageUp, choose } from "./flow.ts";
import { type NewLifeOptions, newLife } from "./new-life.ts";
import { purchase, sell } from "./purchase.ts";

/**
 * Rebuild a life from its seed and choice log (ADR 0003). Reproduces the same world hash
 * only on the build and Pack versions that wrote the log, with the same `newLife` options.
 */
export function replay(
  seed: number,
  bundles: readonly PackBundle[],
  log: readonly ChoiceEntry[],
  opts: NewLifeOptions = {},
): World {
  let w = newLife(bundles, seed, opts);
  for (const c of log) {
    switch (c.t) {
      case "age":
        w = ageUp(w, bundles).world;
        break;
      case "choose":
        w = choose(w, bundles, c.i).world;
        break;
      case "action":
        w = runAction(w, bundles, c.id, c.target).world;
        break;
      case "buy":
        w = purchase(w, bundles, c.kind, c.mode).world;
        break;
      case "sell":
        w = sell(w, bundles, c.asset).world;
        break;
    }
  }
  return w;
}
