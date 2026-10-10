import { evaluate } from "../expr/index.ts";
import type { IconRef, PackBundle } from "../pack.ts";
import type { World } from "../state/types.ts";
import { addJournalLine, getPerson } from "../state/world.ts";
import { makeEnv } from "./env.ts";
import { appendChoice, type SimResult } from "./flow.ts";
import { confinementOf } from "./living.ts";
import {
  changeBp,
  holdingValue,
  priceNow,
  seriesPrice,
  tradeHolding,
} from "./market.ts";
import { clockAge, evalBool } from "./ops.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";
import { explainFalse } from "./reason.ts";
import { formatMoney } from "./text.ts";

const CONFINED = "Not allowed while confined";

/** One market kind as the market screen shows it, priced and held now. */
export interface MarketRow {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** Price of one whole unit, minor units (0 once delisted). */
  readonly price: number;
  /** One-year price change, basis points. */
  readonly changeBp: number;
  /** Units held, x10^4 (0 with no holding). */
  readonly units: number;
  /** Value of the holding now, minor units. */
  readonly value: number;
  /** Cash paid for the units held, minor units. */
  readonly basis: number;
  /** Government bond terms, when the kind is one. */
  readonly bond?: {
    readonly couponBp: number;
    readonly termYears: number;
    /** World year the held principal comes back, when held. */
    readonly maturesYear?: number;
  };
  /** Buying is not possible now; `reason` says why. Selling depends on `units`. */
  readonly locked: boolean;
  readonly reason?: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function buyReason(
  world: World,
  idx: PackIndex,
  kindId: string,
): string | null {
  const player = getPerson(world, world.playerId);
  if (confinementOf(player, idx)?.menus === true) return CONFINED;
  const req = idx.markets.get(kindId)?.requires;
  const scope = { subject: world.playerId };
  if (req === undefined || evalBool(req, world, idx, scope)) return null;
  return explainFalse(req, (c) =>
    Boolean(evaluate(c, makeEnv(world, idx, scope))),
  );
}

/** Every market kind of the loaded Packs for the player, sorted by id; delisted kinds nobody holds are left out. */
export function listMarket(
  world: World,
  bundles: readonly PackBundle[],
): MarketRow[] {
  const idx = indexBundles(bundles);
  const player = getPerson(world, world.playerId);
  return [...idx.markets.values()]
    .sort((a, b) => cmp(a.id, b.id))
    .filter(
      (k) =>
        seriesPrice(world, k.id) !== 0 ||
        player.holdings.some((h) => h.kindId === k.id),
    )
    .map((k) => {
      const held = player.holdings.find((h) => h.kindId === k.id);
      const reason = buyReason(world, idx, k.id);
      const bond = k.market?.bond;
      return {
        id: k.id,
        label: k.label,
        ...(k.icon ? { icon: k.icon } : {}),
        price: priceNow(world, idx, k.id),
        changeBp: changeBp(world, k.id),
        units: held?.units ?? 0,
        value: held ? holdingValue(world, held) : 0,
        basis: held?.basis ?? 0,
        ...(bond
          ? {
              bond: {
                couponBp: bond.couponBp,
                termYears: bond.termYears,
                ...(held?.maturesYear === undefined
                  ? {}
                  : { maturesYear: held.maturesYear }),
              },
            }
          : {}),
        locked: reason !== null,
        ...(reason ? { reason } : {}),
      };
    });
}

/** A kind's price history for the chart: one point per world year, oldest first. */
export function marketSeries(
  world: World,
  kindId: string,
): { readonly year: number; readonly price: number }[] {
  const s = world.market[kindId];
  if (!s) return [];
  const from = s.from;
  return s.prices.map((price, i) => ({ year: from + i, price }));
}

/**
 * Buy (`amount` > 0, minor units of cash) or sell (`amount` < 0, cash worth) a market kind
 * from the market screen, at the current price. Buying with less cash than `amount` spends
 * what there is; selling more than is held sells all. Throws `Error(reason)` and changes
 * nothing when the life is over, a choice is open, the player is confined, the kind's
 * `requires` fails, or there is nothing to buy with or sell. Logged as a `trade` choice.
 */
export function trade(
  world: World,
  bundles: readonly PackBundle[],
  kindId: string,
  amount: number,
): SimResult {
  const idx = indexBundles(bundles);
  const kind = idx.markets.get(kindId);
  if (!kind) throw new RangeError(`unknown market kind '${kindId}'`);
  if (!Number.isSafeInteger(amount) || amount === 0)
    throw new RangeError("amount must be a non-zero integer");
  if (world.ended) throw new Error("This life is over");
  if (world.pending) throw new Error("Finish the open choice first");
  const who = world.playerId;
  const player = getPerson(world, who);
  if (confinementOf(player, idx)?.menus === true) throw new Error(CONFINED);
  if (amount > 0) {
    const why = buyReason(world, idx, kindId);
    if (why) throw new Error(why);
  }
  const [traded, done] = tradeHolding(world, idx, who, kindId, amount);
  if (done.units === 0)
    throw new Error(amount > 0 ? "Can't afford any" : "You hold none of it");
  const money = (n: number) => formatMoney(n, idx.currency);
  const line =
    amount > 0
      ? `Bought ${money(-done.cash)} of ${kind.label}.`
      : `Sold ${kind.label} for ${money(done.cash)}.`;
  const w = addJournalLine(
    appendChoice(traded, { t: "trade", kind: kindId, amount }),
    clockAge(traded),
    line,
  );
  return { world: w, lines: [line] };
}
