import { evaluate } from "../expr/index.ts";
import type { IconRef, PackBundle } from "../pack.ts";
import type { World } from "../state/types.ts";
import {
  addJournalLine,
  getPerson,
  putLoan,
  removeLoan,
  updatePerson,
} from "../state/world.ts";
import { makeEnv } from "./env.ts";
import { appendChoice, type SimResult } from "./flow.ts";
import { confinementOf } from "./living.ts";
import {
  clockAge,
  dropAsset,
  evalBool,
  evalInt,
  grantAsset,
  openLoan,
} from "./ops.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";
import { explainFalse } from "./reason.ts";
import { formatMoney } from "./text.ts";

/** One item kind in the shop, priced for the player now. */
export interface ShopRow {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  readonly category: string;
  /** Minor units. */
  readonly price: number;
  /** Loan kind that can finance it, if any. */
  readonly loanKind?: string;
  /** Cash due up front with a loan, minor units (set with `loanKind`). */
  readonly downPayment?: number;
  readonly canCash: boolean;
  readonly canLoan: boolean;
  /** Neither mode is possible; `reason` says why. */
  readonly locked: boolean;
  readonly reason?: string;
}

const CONFINED = "Not allowed while confined";

const confinedFromMenus = (world: World, idx: PackIndex): boolean =>
  confinementOf(getPerson(world, world.playerId), idx)?.menus === true;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Quote {
  readonly price: number;
  readonly down?: number;
  readonly requiresReason: string | null;
}

function quote(world: World, idx: PackIndex, kindId: string): Quote {
  const kind = idx.items.get(kindId);
  if (!kind) throw new RangeError(`unknown item kind '${kindId}'`);
  const scope = { subject: world.playerId };
  const price = Math.max(0, evalInt(kind.price, world, idx, scope));
  const loan = kind.loan ? idx.loans.get(kind.loan) : undefined;
  const down = loan
    ? Math.min(price, Math.trunc((price * loan.downPaymentBp + 9999) / 10000))
    : undefined;
  const ok = evalBool(kind.requires, world, idx, scope);
  const requiresReason = confinedFromMenus(world, idx)
    ? CONFINED
    : ok
      ? null
      : kind.requires === undefined
        ? "Not available"
        : explainFalse(kind.requires, (c) =>
            Boolean(evaluate(c, makeEnv(world, idx, scope))),
          );
  return {
    price,
    ...(down === undefined ? {} : { down }),
    requiresReason,
  };
}

function rejection(
  world: World,
  q: Quote,
  mode: "cash" | "loan",
): string | null {
  if (world.ended) return "This life is over";
  if (world.pending) return "Finish the open choice first";
  if (q.requiresReason) return q.requiresReason;
  const money = getPerson(world, world.playerId).money;
  if (mode === "cash") return money >= q.price ? null : "Can't afford it";
  if (q.down === undefined) return "No loan available";
  return money >= q.down ? null : "Can't afford the down payment";
}

/** The shop, optionally one category, sorted by id. */
export function listShop(
  world: World,
  bundles: readonly PackBundle[],
  category?: string,
): ShopRow[] {
  const idx = indexBundles(bundles);
  const rows: ShopRow[] = [];
  const kinds = [...idx.items.values()].sort((a, b) => cmp(a.id, b.id));
  for (const k of kinds) {
    if (category !== undefined && k.category !== category) continue;
    const q = quote(world, idx, k.id);
    const cash = rejection(world, q, "cash");
    const loan = rejection(world, q, "loan");
    const locked = cash !== null && loan !== null;
    // With a loan option the smaller hurdle (the down payment) is the one to explain.
    const reason = q.requiresReason ?? (q.down === undefined ? cash : loan);
    rows.push({
      id: k.id,
      label: k.label,
      ...(k.icon ? { icon: k.icon } : {}),
      category: k.category,
      price: q.price,
      ...(k.loan && q.down !== undefined
        ? { loanKind: k.loan, downPayment: q.down }
        : {}),
      canCash: cash === null,
      canLoan: loan === null,
      locked,
      ...(locked && reason ? { reason } : {}),
    });
  }
  return rows;
}

/**
 * Buy an item kind with cash, or with its loan kind (down payment in cash, the rest borrowed
 * at the loan kind's rate and term; a secured loan is secured by the new asset). Throws
 * `Error(reason)` and changes nothing when the item's `requires` fails or the player cannot
 * afford it. Logged as a `buy` choice.
 */
export function purchase(
  world: World,
  bundles: readonly PackBundle[],
  itemKindId: string,
  mode: "cash" | "loan",
): SimResult {
  const idx = indexBundles(bundles);
  const q = quote(world, idx, itemKindId);
  const why = rejection(world, q, mode);
  if (why) throw new Error(why);
  const kind = idx.items.get(itemKindId);
  if (!kind) throw new RangeError(`unknown item kind '${itemKindId}'`);
  const who = world.playerId;
  const age = clockAge(world);
  const money = (n: number) => formatMoney(n, idx.currency);
  let [w, assetId] = grantAsset(
    appendChoice(world, { t: "buy", kind: itemKindId, mode }),
    idx,
    who,
    itemKindId,
  );
  let line = `Bought a ${kind.label} for ${money(q.price)}.`;
  const lk =
    mode === "loan" && kind.loan ? idx.loans.get(kind.loan) : undefined;
  const principal = lk ? q.price - (q.down ?? 0) : 0;
  if (lk && principal > 0) {
    [w] = openLoan(w, who, {
      kindId: lk.id,
      principal,
      rateBp: lk.rateBp,
      termYears: lk.termYears,
      ...(lk.secured ? { securedAssetId: assetId } : {}),
    });
    line = `Bought a ${kind.label} for ${money(q.price)}: ${money(q.down ?? 0)} down and a ${lk.label} of ${money(principal)}.`;
  }
  w = updatePerson(w, who, (p) => ({ ...p, money: p.money - q.price }));
  w = addJournalLine(w, age, line);
  return { world: w, lines: [line] };
}

/**
 * Sell an owned asset at its current value. Proceeds first pay off the loan it secured
 * (any remainder of that loan stays, unsecured); the rest is cash. Logged as a `sell` choice.
 */
export function sell(
  world: World,
  bundles: readonly PackBundle[],
  assetId: number,
): SimResult {
  const idx = indexBundles(bundles);
  if (world.ended) throw new Error("This life is over");
  if (world.pending) throw new Error("Finish the open choice first");
  if (confinedFromMenus(world, idx)) throw new Error(CONFINED);
  const who = world.playerId;
  const asset = getPerson(world, who).assets.find((a) => a.id === assetId);
  if (!asset) throw new RangeError(`no asset ${assetId}`);
  const label = idx.items.get(asset.kindId)?.label ?? "asset";
  const money = (n: number) => formatMoney(n, idx.currency);
  const secured = getPerson(world, who).loans.find(
    (l) => l.securedAssetId === assetId,
  );
  let w = dropAsset(
    appendChoice(world, { t: "sell", asset: assetId }),
    who,
    assetId,
  );
  let cash = asset.value;
  let line = `Sold your ${label} for ${money(asset.value)}.`;
  if (secured) {
    const pay = Math.min(secured.balance, asset.value);
    cash -= pay;
    const left = secured.balance - pay;
    const { securedAssetId: _s, ...rest } = secured;
    w =
      left <= 0
        ? removeLoan(w, who, secured.id)
        : putLoan(w, who, { ...rest, balance: left });
    line = `Sold your ${label} for ${money(asset.value)}, paying ${money(pay)} toward its loan.`;
  }
  w = updatePerson(w, who, (p) => ({ ...p, money: p.money + cash }));
  w = addJournalLine(w, clockAge(w), line);
  return { world: w, lines: [line] };
}
