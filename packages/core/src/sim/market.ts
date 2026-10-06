import type { CompiledItemKind, CompiledMarket } from "../pack.ts";
import { streamFor } from "../rng.ts";
import {
  type Holding,
  type PersonId,
  type Series,
  UNIT_SCALE,
  type World,
} from "../state/types.ts";
import {
  addJournalLine,
  getPerson,
  personsInIdOrder,
  putHolding,
  updatePerson,
} from "../state/world.ts";
import type { PackIndex } from "./pack-index.ts";
import { formatMoney } from "./text.ts";

/** Price points kept per series (a world year each); older ones drop off. */
export const MAX_HISTORY = 100;
/** Largest price of one whole unit, minor units: keeps every product below 2^53. */
const MAX_PRICE = 10_000_000_000;
/** Range of a yearly return, basis points. */
const MIN_RETURN = -10000;
const MAX_RETURN = 500000;

/** Cash value of `units` (x10^4) at `price` per whole unit, rounded down, without overflow. */
export function unitsValue(units: number, price: number): number {
  const whole = Math.trunc(units / UNIT_SCALE);
  return (
    whole * price +
    Math.trunc(((units - whole * UNIT_SCALE) * price) / UNIT_SCALE)
  );
}

/** Units (x10^4) that `amount` buys at `price` per whole unit, rounded down. */
export function unitsFor(amount: number, price: number): number {
  const whole = Math.trunc(amount / price);
  return (
    whole * UNIT_SCALE +
    Math.trunc(((amount - whole * price) * UNIT_SCALE) / price)
  );
}

/** The current price of a kind's series, or undefined before it exists. */
export function seriesPrice(world: World, kindId: string): number | undefined {
  const s = world.market[kindId];
  return s?.prices[s.prices.length - 1];
}

function marketOf(
  idx: PackIndex,
  kindId: string,
): CompiledItemKind & {
  readonly market: CompiledMarket;
} {
  const k = idx.markets.get(kindId);
  if (!k?.market) throw new RangeError(`unknown market kind '${kindId}'`);
  return k as CompiledItemKind & { readonly market: CompiledMarket };
}

/** Price of one whole unit now; the starting price while the series does not exist yet. */
export function priceNow(world: World, idx: PackIndex, kindId: string): number {
  return seriesPrice(world, kindId) ?? marketOf(idx, kindId).market.start;
}

/** One-year price change in basis points (0 with under two points or a zero price). */
export function changeBp(world: World, kindId: string): number {
  const s = world.market[kindId];
  if (!s || s.prices.length < 2) return 0;
  const cur = s.prices[s.prices.length - 1] as number;
  const prev = s.prices[s.prices.length - 2] as number;
  return prev === 0 ? 0 : Math.trunc(((cur - prev) * 10000) / prev);
}

/** The stored return (basis points) the next settlement applies: `forecast(kind)`. */
export function forecastBp(world: World, kindId: string): number {
  return world.market[kindId]?.next ?? 0;
}

/** Value of a holding at the current price; its cost while the series is missing. */
export function holdingValue(world: World, h: Holding): number {
  const price = seriesPrice(world, h.kindId);
  return price === undefined ? h.basis : unitsValue(h.units, price);
}

/** Value of everything the person holds in the market. */
export function portfolioValue(world: World, personId: PersonId): number {
  let n = 0;
  for (const h of getPerson(world, personId).holdings)
    n += holdingValue(world, h);
  return n;
}

/** Market kinds ordered so a kind follows the one it has `beta` on (ties by id). */
function orderedKinds(idx: PackIndex): CompiledItemKind[] {
  const depth = (id: string, seen: readonly string[]): number => {
    if (seen.includes(id)) throw new RangeError(`beta cycle at '${id}'`);
    const of = idx.markets.get(id)?.market?.beta?.of;
    return of === undefined ? 0 : 1 + depth(of, [...seen, id]);
  };
  return [...idx.markets.values()]
    .map((k) => ({ k, d: depth(k.id, []) }))
    .sort(
      (a, b) => a.d - b.d || (a.k.id < b.k.id ? -1 : a.k.id > b.k.id ? 1 : 0),
    )
    .map((x) => x.k);
}

/**
 * The return drawn for the year a settlement at world year `year` will apply next (a pure
 * function of the seed, the kind and the year, never of the player's age or choices).
 */
function drawReturn(
  seed: number,
  kindId: string,
  m: CompiledMarket,
  year: number,
  parentReturn: number | undefined,
): number {
  const rng = streamFor(seed, year, `market/${kindId}`, 0);
  // Sum of 12 uniform draws: close enough to a normal shock with std dev 1000 (milli-sigmas).
  let shock = -5994;
  for (let i = 0; i < 12; i++) shock += rng.int(1000);
  let r = m.driftBp + Math.trunc((m.volBp * shock) / 1000);
  if (m.beta && parentReturn !== undefined)
    r += Math.trunc((m.beta.factorBp * parentReturn) / 10000);
  if (m.crash && rng.chanceBp(m.crash.chanceBp)) r -= m.crash.dropBp;
  r = Math.max(r, MIN_RETURN);
  if (m.jump && rng.chanceBp(m.jump.chanceBp))
    r = (10000 + r) * m.jump.multiple - 10000;
  return Math.min(Math.max(r, MIN_RETURN), MAX_RETURN);
}

/** What happened to a market kind at one settlement, for the holders' journals. */
export interface MarketEvent {
  readonly kindId: string;
  readonly what: "delisted" | "default";
}

function step(
  world: World,
  kindId: string,
  m: CompiledMarket,
  s: Series,
  parentReturn: number | undefined,
  events: MarketEvent[],
): Series {
  const year = world.worldYear;
  const cur = s.prices[s.prices.length - 1] as number;
  let price = cur;
  let face = s.face;
  if (cur > 0) {
    price = Math.max(
      1,
      Math.min(MAX_PRICE, Math.trunc((cur * (10000 + s.next)) / 10000)),
    );
    const rng = streamFor(world.seed, year, `market/${kindId}/event`, 0);
    if (m.delistBp !== undefined && rng.chanceBp(m.delistBp)) {
      price = 0;
      events.push({ kindId, what: "delisted" });
    } else if (m.bond && rng.chanceBp(m.bond.defaultBp)) {
      const left = Math.trunc(
        ((face ?? 10000) * (10000 - m.bond.lossBp)) / 10000,
      );
      face = left;
      price =
        left === 0
          ? 0
          : Math.max(1, Math.trunc((price * (10000 - m.bond.lossBp)) / 10000));
      events.push({ kindId, what: "default" });
    }
  }
  const prices = [...s.prices, price];
  const drop = Math.max(0, prices.length - MAX_HISTORY);
  return {
    from: s.from + drop,
    prices: drop ? prices.slice(drop) : prices,
    next:
      price === 0 ? 0 : drawReturn(world.seed, kindId, m, year, parentReturn),
    ...(face === undefined ? {} : { face }),
  };
}

/**
 * Bring every market series to the world's current year: existing ones apply their stored
 * return (then roll delisting and bond default) and draw the next; kinds without a series
 * yet start at their starting price. Called at `newLife` and at each settlement.
 */
export function updateMarket(
  world: World,
  idx: PackIndex,
): [World, MarketEvent[]] {
  const events: MarketEvent[] = [];
  if (idx.markets.size === 0) return [world, events];
  const next: Record<string, Series> = { ...world.market };
  const drawn = new Map<string, number>();
  for (const k of orderedKinds(idx)) {
    const m = k.market as CompiledMarket;
    const parent = m.beta ? drawn.get(m.beta.of) : undefined;
    const s = world.market[k.id];
    const out: Series = s
      ? step(world, k.id, m, s, parent, events)
      : {
          from: world.worldYear,
          prices: [m.start],
          next: drawReturn(world.seed, k.id, m, world.worldYear, parent),
        };
    next[k.id] = out;
    drawn.set(k.id, out.next);
  }
  return [{ ...world, market: next }, events];
}

/** A series for `kindId`, created at the starting price when the world has none. */
export function ensureSeries(
  world: World,
  idx: PackIndex,
  kindId: string,
): World {
  if (world.market[kindId]) return world;
  const m = marketOf(idx, kindId).market;
  const parentSeries = m.beta ? world.market[m.beta.of] : undefined;
  return {
    ...world,
    market: {
      ...world.market,
      [kindId]: {
        from: world.worldYear,
        prices: [m.start],
        next: drawReturn(
          world.seed,
          kindId,
          m,
          world.worldYear,
          parentSeries?.next,
        ),
      },
    },
  };
}

/** Cash movement of one trade: negative when buying, positive when selling. */
export interface TradeResult {
  readonly cash: number;
  readonly units: number;
}

/** Add `units` bought for `cost` to the person's holding of the kind (opening it if needed). */
function addUnits(
  world: World,
  idx: PackIndex,
  personId: PersonId,
  kindId: string,
  units: number,
  cost: number,
): World {
  const m = marketOf(idx, kindId).market;
  const p = getPerson(world, personId);
  const held = p.holdings.find((h) => h.kindId === kindId);
  return putHolding(world, personId, {
    kindId,
    units: (held?.units ?? 0) + units,
    basis: (held?.basis ?? 0) + cost,
    firstAge: held?.firstAge ?? p.age,
    ...(held?.maturesYear !== undefined
      ? { maturesYear: held.maturesYear }
      : m.bond
        ? { maturesYear: world.worldYear + m.bond.termYears }
        : {}),
  });
}

/**
 * Buy (`amount` > 0: that much cash, or all the cash there is) or sell (`amount` < 0: that
 * much cash worth, or the whole holding) a market kind at the current price. Money never goes
 * negative and selling more than is held sells all of it; with nothing to do the world is
 * returned unchanged with a zero result. No journal line and no logging here.
 */
export function tradeHolding(
  world: World,
  idx: PackIndex,
  personId: PersonId,
  kindId: string,
  amount: number,
): [World, TradeResult] {
  marketOf(idx, kindId);
  const w = ensureSeries(world, idx, kindId);
  const price = seriesPrice(w, kindId) as number;
  const p = getPerson(w, personId);
  if (amount > 0) {
    const spend = Math.min(amount, Math.max(0, p.money));
    const units = price > 0 ? unitsFor(spend, price) : 0;
    if (units <= 0) return [world, { cash: 0, units: 0 }];
    const bought = updatePerson(
      addUnits(w, idx, personId, kindId, units, spend),
      personId,
      (x) => ({
        ...x,
        money: x.money - spend,
      }),
    );
    return [bought, { cash: -spend, units }];
  }
  const held = p.holdings.find((h) => h.kindId === kindId);
  if (amount >= 0 || !held) return [world, { cash: 0, units: 0 }];
  const all = price === 0 || -amount >= unitsValue(held.units, price);
  const units = all ? held.units : unitsFor(-amount, price);
  if (units <= 0) return [world, { cash: 0, units: 0 }];
  const proceeds = unitsValue(units, price);
  // The product can pass 2^53, so the pro-rata basis goes through BigInt.
  const basisSold = Number(
    (BigInt(held.basis) * BigInt(units)) / BigInt(held.units),
  );
  const sold = updatePerson(
    putHolding(w, personId, {
      ...held,
      units: held.units - units,
      basis: held.basis - basisSold,
    }),
    personId,
    (x) => ({ ...x, money: x.money + proceeds }),
  );
  return [sold, { cash: proceeds, units }];
}

/** `grant_asset` on a market kind: one whole unit at the current price, no money charged. */
export function grantUnit(
  world: World,
  idx: PackIndex,
  personId: PersonId,
  kindId: string,
): World {
  marketOf(idx, kindId);
  const w = ensureSeries(world, idx, kindId);
  return addUnits(
    w,
    idx,
    personId,
    kindId,
    UNIT_SCALE,
    seriesPrice(w, kindId) as number,
  );
}

/** `remove_asset` on a market kind: the whole holding goes, with no proceeds. */
export function removeHolding(
  world: World,
  personId: PersonId,
  kindId: string,
): World {
  const held = getPerson(world, personId).holdings.find(
    (h) => h.kindId === kindId,
  );
  return held ? putHolding(world, personId, { ...held, units: 0 }) : world;
}

/**
 * Market part of settlement (after pay, before living costs): series move (delisting and bond
 * default are journaled for the player when they hold the kind), then every bond holding pays
 * its coupon and, at maturity, its remaining principal.
 */
export function settleMarket(world: World, idx: PackIndex): World {
  if (idx.markets.size === 0) return world;
  const [updated, events] = updateMarket(world, idx);
  let w = updated;
  const money = (n: number) => formatMoney(n, idx.currency);
  const player = getPerson(w, w.playerId);
  for (const e of events) {
    const label = idx.markets.get(e.kindId)?.label ?? e.kindId;
    if (!player.holdings.some((h) => h.kindId === e.kindId)) continue;
    w = addJournalLine(
      w,
      player.age,
      e.what === "delisted"
        ? `${label} was delisted. Your holding is worth nothing now.`
        : `The issuer of ${label} defaulted. Your bonds lost part of their principal.`,
    );
  }
  for (const person of personsInIdOrder(w)) {
    if (!person.alive) continue;
    for (const h of person.holdings) {
      const kind = idx.markets.get(h.kindId);
      const bond = kind?.market?.bond;
      if (!kind?.market || !bond) continue;
      const owed = Math.trunc(
        (unitsValue(h.units, kind.market.start) *
          (w.market[h.kindId]?.face ?? 10000)) /
          10000,
      );
      const coupon = Math.trunc((owed * bond.couponBp) / 10000);
      const matured =
        h.maturesYear !== undefined && w.worldYear >= h.maturesYear;
      const pay = coupon + (matured ? owed : 0);
      w = updatePerson(w, person.id, (x) => ({ ...x, money: x.money + pay }));
      if (matured) w = putHolding(w, person.id, { ...h, units: 0 });
      if (person.id === w.playerId && pay > 0)
        w = addJournalLine(
          w,
          person.age,
          matured
            ? `Your ${kind.label} matured: ${money(owed)} principal and ${money(coupon)} coupon paid.`
            : `Your ${kind.label} paid a coupon of ${money(coupon)}.`,
        );
    }
  }
  return w;
}
