import type { PackBundle } from "../pack.ts";
import type { ChoiceEntry, World } from "../state/types.ts";
import { runAction } from "./actions.ts";
import { ageUp, choose } from "./flow.ts";
import {
  finishGodStep,
  godEditPerson,
  godPickRoll,
  godSetMarket,
  godSetMoney,
  godSetStat,
} from "./god.ts";
import { type NewLifeOptions, newLife } from "./new-life.ts";
import { purchase, sell } from "./purchase.ts";
import { succeed } from "./succession.ts";
import { trade } from "./trade.ts";

/**
 * Rebuild a life from its seed and choice log (ADR 0003). Reproduces the same world hash
 * only on the build and capabilities that wrote the log, with the same `newLife` options.
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
        w = finishGodStep(ageUp(w, bundles).world);
        break;
      case "choose":
        w = finishGodStep(choose(w, bundles, c.i).world);
        break;
      case "action":
        w = finishGodStep(
          runAction(w, bundles, c.id, c.target, c.amount).world,
        );
        break;
      case "buy":
        w = finishGodStep(purchase(w, bundles, c.kind, c.mode).world);
        break;
      case "sell":
        w = finishGodStep(sell(w, bundles, c.asset).world);
        break;
      case "trade":
        w = finishGodStep(trade(w, bundles, c.kind, c.amount).world);
        break;
      case "succeed":
        w = finishGodStep(succeed(w, bundles, c.heir).world);
        break;
      case "god-stat":
        w = godSetStat(w, c.stat, c.value);
        break;
      case "god-money":
        w = godSetMoney(w, c.value);
        break;
      case "god-roll": {
        const { t: _t, ...pick } = c;
        w = godPickRoll(w, pick);
        break;
      }
      case "god-market":
        w = godSetMarket(w, c.kind, {
          ...(c.next === undefined ? {} : { next: c.next }),
          ...(c.event === undefined ? {} : { event: c.event }),
        });
        break;
      case "god-person": {
        const { t: _t, id, ...patch } = c;
        w = godEditPerson(w, id, patch);
        break;
      }
    }
  }
  return w;
}
