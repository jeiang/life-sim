import type { Loan, PersonId, World } from "../state/types.ts";
import {
  addJournalLine,
  getPerson,
  personsInIdOrder,
  putAsset,
  putLoan,
  removeLoan,
  updatePerson,
} from "../state/world.ts";
import { settleLiving } from "./living.ts";
import { dropAsset, endOccupation, evalInt } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";
import { formatMoney } from "./text.ts";

/** Consecutive misses after which a secured asset is repossessed. */
export const REPOSSESSION_MISSES = 3;

/**
 * Settlement (ADR 0003): occupations pay or charge, then the player pays living costs, then loans take payments (with default
 * and repossession), then assets change value; each in person id, then item id order.
 */
export function settle(world: World, idx: PackIndex): World {
  let w = world;
  const ids = personsInIdOrder(w)
    .filter((p) => p.alive)
    .map((p) => p.id);
  for (const id of ids) w = settleOccupations(w, idx, id);
  w = settleLiving(w, idx);
  for (const id of ids) w = settleLoans(w, idx, id);
  for (const id of ids) w = settleAssets(w, idx, id);
  return w;
}

function settleOccupations(w: World, idx: PackIndex, id: PersonId): World {
  const age = getPerson(w, id).age;
  for (const occ of getPerson(w, id).occupations) {
    const kind = idx.occupations.get(occ.kindId);
    if (!kind) continue;
    const pay = evalInt(kind.pay, w, idx, { subject: id });
    const years = occ.years + 1;
    w = updatePerson(w, id, (p) => ({
      ...p,
      money: p.money + pay,
      occupations: p.occupations.map((o) =>
        o.id === occ.id ? { ...o, years, pay } : o,
      ),
    }));
    if (kind.durationYears !== undefined && years >= kind.durationYears) {
      w = endOccupation(w, id, occ.id);
      w = addJournalLine(w, age, `You finished ${kind.label}.`);
    }
  }
  return w;
}

function settleLoans(w: World, idx: PackIndex, id: PersonId): World {
  for (const loan of getPerson(w, id).loans) w = settleLoan(w, idx, id, loan);
  return w;
}

function settleLoan(w: World, idx: PackIndex, id: PersonId, loan: Loan): World {
  const age = getPerson(w, id).age;
  const kindLabel = idx.loans.get(loan.kindId)?.label ?? "loan";
  // Interest accrues first; the payment is capped at what is owed.
  const owed = loan.balance + Math.trunc((loan.balance * loan.rateBp) / 10000);
  const due = Math.min(loan.payment, owed);
  const cash = Math.max(0, getPerson(w, id).money);
  const paid = Math.min(due, cash);
  const shortfall = due - paid;
  w = updatePerson(w, id, (p) => ({ ...p, money: p.money - paid }));
  // The scheduled payment lowers the balance; the shortfall is added back.
  let next: Loan = {
    ...loan,
    balance: owed - due + shortfall,
    missed: shortfall > 0 ? loan.missed + 1 : 0,
  };
  if (shortfall > 0) {
    w = addJournalLine(
      w,
      age,
      `You could not pay ${formatMoney(shortfall, idx.currency)} of your ${kindLabel} payment.`,
    );
  }
  if (next.missed >= REPOSSESSION_MISSES && next.securedAssetId !== undefined) {
    const asset = getPerson(w, id).assets.find(
      (a) => a.id === next.securedAssetId,
    );
    if (asset) {
      const label = idx.items.get(asset.kindId)?.label ?? "asset";
      w = dropAsset(w, id, asset.id);
      const { securedAssetId: _s, ...unsecured } = next;
      next = { ...unsecured, balance: Math.max(0, next.balance - asset.value) };
      w = addJournalLine(
        w,
        age,
        `Your ${label} was repossessed for ${formatMoney(asset.value, idx.currency)}.`,
      );
    }
  }
  if (next.balance <= 0) return removeLoan(w, id, loan.id);
  return putLoan(w, id, next);
}

function settleAssets(w: World, idx: PackIndex, id: PersonId): World {
  const age = getPerson(w, id).age;
  for (const a of getPerson(w, id).assets) {
    const kind = idx.items.get(a.kindId);
    if (!kind) continue;
    const value = Math.max(
      0,
      evalInt(kind.value, w, idx, {
        subject: id,
        asset: {
          purchasePrice: a.purchasePrice,
          value: a.value,
          years: age - (a.acquiredAge ?? age),
        },
      }),
    );
    w = putAsset(w, id, { ...a, value });
  }
  return w;
}
