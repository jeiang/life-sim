import type { PackBundle } from "../pack.ts";
import type { ChoiceEntry, World } from "../state/types.ts";
import { runAction } from "./actions.ts";
import { ageUp, choose } from "./flow.ts";
import { godSetMoney, godSetStat } from "./god.ts";
import { type NewLifeOptions, newLife } from "./new-life.ts";
import { purchase, sell } from "./purchase.ts";
import { succeed } from "./succession.ts";

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
  const mature = log[0]?.t === "mature";
  const rest = mature ? log.slice(1) : log;
  const first = rest[0];
  const start = first?.t === "start" ? first : undefined;
  let w = newLife(bundles, seed, {
    ...opts,
    ...(start ? { custom: start } : {}),
    ...(mature ? { mature } : {}),
  });
  for (const c of start ? rest.slice(1) : rest) {
    switch (c.t) {
      case "mature":
        throw new RangeError(
          "a mature entry is only valid as the first choice",
        );
      case "start":
        throw new RangeError("a start entry is only valid as the first choice");
      case "age":
        w = ageUp(w, bundles).world;
        break;
      case "choose":
        w = choose(w, bundles, c.i).world;
        break;
      case "action":
        w = runAction(w, bundles, c.id, c.target, c.amount).world;
        break;
      case "buy":
        w = purchase(w, bundles, c.kind, c.mode).world;
        break;
      case "sell":
        w = sell(w, bundles, c.asset).world;
        break;
      case "succeed":
        w = succeed(w, c.heir);
        break;
      case "god-stat":
        w = godSetStat(w, c.stat, c.value);
        break;
      case "god-money":
        w = godSetMoney(w, c.value);
        break;
    }
  }
  return w;
}
