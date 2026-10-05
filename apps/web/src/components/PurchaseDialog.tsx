import { loanPayment } from "@life/core";
import { money } from "../game/format.ts";
import {
  closePurchase,
  confirmPurchase,
  packIndex,
  player,
  purchaseRow,
} from "../game/store.ts";
import { PackIcon } from "./Emoji.tsx";
import { Modal } from "./Modal.tsx";

/** Buy an item kind: Pay cash, Take loan (terms shown), or Cancel. */
export function PurchaseDialog() {
  const row = purchaseRow.value;
  if (!row) return null;
  const loan = row.loanKind ? packIndex.loans.get(row.loanKind) : undefined;
  const down = row.downPayment ?? 0;
  const principal = row.price - down;
  const payment = loan
    ? loanPayment(principal, loan.rateBp, loan.termYears)
    : 0;
  const btn =
    "min-h-11 w-full rounded-xl px-3 py-2.5 font-semibold disabled:opacity-50";
  return (
    <Modal labelledBy="purchase-title" onClose={closePurchase}>
      <div class="mb-2 text-center text-4xl">
        <PackIcon icon={row.icon} />
      </div>
      <h2 id="purchase-title" class="text-center text-lg font-semibold">
        {row.label}
      </h2>
      <p class="text-center text-xl font-bold">{money(row.price)}</p>
      <p class="mb-3 text-center text-sm text-text-muted">
        You have {money(player.value.money)}
      </p>
      {row.locked && row.reason && (
        <p class="mb-3 text-center text-sm text-danger">{row.reason}</p>
      )}
      {loan && (
        <dl class="mb-3 grid grid-cols-2 gap-x-2 gap-y-1 rounded-xl bg-surface p-3 text-sm">
          <dt class="text-text-muted">Down payment</dt>
          <dd class="text-right font-medium">{money(down)}</dd>
          <dt class="text-text-muted">Rate</dt>
          <dd class="text-right font-medium">{loan.rateBp / 100}% a year</dd>
          <dt class="text-text-muted">Term</dt>
          <dd class="text-right font-medium">
            {loan.termYears} {loan.termYears === 1 ? "year" : "years"}
          </dd>
          <dt class="text-text-muted">Payment</dt>
          <dd class="text-right font-medium">{money(payment)} a year</dd>
        </dl>
      )}
      <div class="space-y-2">
        <button
          type="button"
          data-autofocus={row.canCash ? "" : undefined}
          disabled={!row.canCash}
          onClick={() => confirmPurchase("cash")}
          class={`${btn} bg-primary text-on-primary`}
        >
          Pay cash
        </button>
        <button
          type="button"
          disabled={!row.canLoan}
          onClick={() => confirmPurchase("loan")}
          class={`${btn} bg-primary text-on-primary`}
        >
          Take loan
        </button>
        <button
          type="button"
          onClick={closePurchase}
          class={`${btn} border border-text-muted/50`}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
