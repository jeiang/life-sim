import { bundles } from "virtual:packs";
import { listMarket, type MarketRow, marketSeries } from "@life/core";
import { useState } from "preact/hooks";
import { Chart } from "../components/Chart.tsx";
import { MenuList } from "../components/MenuList.tsx";
import { money } from "../game/format.ts";
import {
  packIndex,
  player,
  requestAmount,
  tradeKind,
  world,
} from "../game/store.ts";

/** Age from which the market screen is open (docs/spec/screens.md). */
export const MARKET_MIN_AGE = 18;

const pct = (bp: number): string =>
  `${bp > 0 ? "+" : ""}${(bp / 100).toFixed(1)}%`;
const unitsText = (units: number): string =>
  (units / 10000).toFixed(4).replace(/\.?0+$/, "");

/** The market screen (`assets/investments`): a row per market kind; a row opens its chart and Buy/Sell. */
export function MarketScreen() {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const w = world.value;
  const rows = listMarket(w, bundles);
  const row = rows.find((r) => r.id === open);
  const unit = 10 ** packIndex.currency.digits;

  const ask = (r: MarketRow, sign: 1 | -1) => {
    const cap = sign === 1 ? player.value.money : r.value;
    const max = Math.floor(cap / unit) * unit;
    if (max < unit) {
      setError(sign === 1 ? "Not enough cash" : "Nothing to sell");
      return;
    }
    setError(null);
    requestAmount({
      title: `${sign === 1 ? "Buy" : "Sell"} ${r.label}`,
      min: unit,
      max,
      step: unit,
      format: money,
      onConfirm: (n) => setError(tradeKind(r.id, sign * n)),
    });
  };

  if (!row)
    return (
      <MenuList
        rows={rows.map((r) => ({
          key: r.id,
          icon: r.icon,
          label: r.label,
          sublabel: `1-year change ${pct(r.changeBp)}${r.units > 0 ? `. Holding ${money(r.value)}` : ""}`,
          value: money(r.price),
          chevron: true,
          onSelect: () => setOpen(r.id),
        }))}
      />
    );

  const points = marketSeries(w, row.id).map((p) => ({
    x: p.year,
    y: p.price,
  }));
  const button =
    "min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action disabled:opacity-50";
  return (
    <section aria-label={row.label} class="flex flex-col gap-3">
      <div role="alert" class={error ? "text-danger" : "hidden"}>
        {error}
      </div>
      <h2 class="text-lg font-bold">
        {row.label}: {money(row.price)}
        <span class="ml-2 text-sm font-normal text-text-muted">
          {pct(row.changeBp)} in a year
        </span>
      </h2>
      {row.bond ? (
        <p class="text-sm text-text-muted">
          Government bond: {pct(row.bond.couponBp)} coupon a year,{" "}
          {row.bond.termYears}-year term.
        </p>
      ) : null}
      <p data-testid="holding">
        {row.units > 0
          ? `You hold ${unitsText(row.units)} units worth ${money(row.value)} (cost ${money(row.basis)}).`
          : "You hold none."}
      </p>
      <Chart
        title={`${row.label} price by year`}
        points={points}
        xUnit="year"
      />
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class={button}
          disabled={row.locked}
          onClick={() => ask(row, 1)}
        >
          Buy
        </button>
        <button
          type="button"
          class={button}
          disabled={row.units === 0}
          onClick={() => ask(row, -1)}
        >
          Sell
        </button>
        <button
          type="button"
          class={button}
          disabled={row.units === 0}
          onClick={() => setError(tradeKind(row.id, -row.value - 1))}
        >
          Sell all
        </button>
        <button
          type="button"
          onClick={() => setOpen(null)}
          class="min-h-11 rounded-xl px-4 font-semibold text-text ring-1 ring-text-muted/40"
        >
          All investments
        </button>
      </div>
      {row.locked && row.reason ? (
        <p class="text-sm text-text-muted">{row.reason}</p>
      ) : null}
    </section>
  );
}
