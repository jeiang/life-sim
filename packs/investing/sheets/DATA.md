# Data item: investing pack (non-chain)

Pack-level data that is not a storylet chain. Companion of `local://sheets/investing/OUTLINE.md`.

## Kinds (`items/market.yaml`)

All kinds: `category: investments`, `requires: age >= 18`, `icon`. Values are the archive v1 starting point; retune per G3 in OUTLINE.

| id | start | drift | vol | other | role |
|---|---|---|---|---|---|
| total-market | 10000 | 8% | 16% | crash 4% / drop 35% | index |
| world-index | 8500 | 2% | 8% | beta total-market 75% | index |
| income-bond-fund | 5000 | 3% | 3% | | bond fund |
| corporate-bond-fund | 4000 | 4.5% | 6% | beta total-market 10% | bond fund (retune down, G3) |
| acme-robotics | 4500 | 3% | 22% | beta total-market 110% | stock |
| northwind-foods | 8200 | 2% | 15% | beta total-market 60% | stock |
| lumen-energy | 1900 | 3% | 28% | beta total-market 90% | stock |
| quark-coin | 250000 | 12% | 35% | crash 8% / drop 40% | coin (retune: median at or below 0, G3) |
| pinecrest-mining | 250 | -20% | 60% | jump 1% x10, delist 6% | penny stock |
| brightwave-labs | 180 | -15% | 50% | jump 1% x10, delist 5% | penny stock |
| gov-bond-5 | 10000 | 0% | 1% | bond term 5, coupon 3%, default 0.4%, loss 60% | government bond |
| gov-bond-10 | 10000 | 0% | 1% | bond term 10, coupon 4%, default 0.4%, loss 60% | government bond (retune coupon, G3) |

Beta, delist and relist fields follow `docs/spec/pack-format/content-kinds.md`. Penny stocks: no `relist_after` in v1 (decision 2 says delisted to 0). Government bonds: one issuer, so the default chance is per issuer in pack data (decision 3); the per-country split is deferred (G4). Drift/vol are archive numbers and not tuned for this pack.

## Qualities (`qualities/invest.yaml`)

All with the `invest_` prefix.

- `invest_insider_age` int 0.., default 0: age the player acted on an insider tip (C2).
- `invest_scams` int 0.., default 0: scams the player fell for; lowers scam weight (C3).
- `invest_tip_age` int 0.., default 0, `scope: person`: last age a source tipped the player (C1; once per year per source).
- `invest_portfolio` int 0.., default 0: mirror of the `portfolio` readable, written by an `on_age_up_post` hook for harness snapshots (G1).
- `invest_*` harness mirrors (G1 options): per-kind yearly return sums and crash-year count, chosen during sheet drafting.

## Readables (`readables/portfolio.yaml`)

- `portfolio` readable int: `holding_value(k)` summed over all 12 kinds. Expression form (precedent: `karma_value`). Used by C4 and by the `invest_portfolio` hook.

## State

None. All market state is Core's (world-year series, holdings). No `state/` file.

## Settlement lines

None. Holdings are valued by Core; bond coupons and maturities are Core. Shortfall is Core (decision 7).

## Hooks (`pack.yaml`)

- `on_age_up_post`: set `invest_portfolio` to `portfolio` (hook syntax [INFERENCE]; check hooks.md), plus any G1 mirrors (per-kind return, crash count) if option (b) is chosen. Hooks run in player scope.

## Harness

`harness/metrics.yaml` (title Investing, `visible_if_table` none unless a trade table is added):
- measures: `investor` (holds any kind), `portfolio at 40 / 65` (snapshot of `invest_portfolio`), `insider_ever` (`fires` on insider tips), `scam_lost` (`quality: invest_scams, at: end`), `years`.
- stats: participation (share of investors), annualised return per kind (blocked by G1), crash years (G1), portfolio share of net worth at 40 and 65 (ratio, G1 partial), net worth median investors vs non-investors (snapshot net_worth, ages 40 and 65), bond default rate (blocked, G1), tip accuracy (tip hit rate from tip outcomes via `fires`), insider offers per life.
- Blocks: returns table per kind (blocked), participation/net worth, tips and scams.

`harness/profiles.yaml`:
- `investor`: buys and holds the index and bond kinds through `menu: assets/investments`; no look-ahead at prices; takes tips when offered. Rules: `ids: [investing/tip-*]` with `pick: random`, then `menu: assets/investments`.
- `tipstacker`: asks every source and trades on the majority (G2). Until G2 is resolved, document the approximation in the description and do not claim the majority rule.

`harness/force/`:
- `scam.yaml`: forces the Ponzi scheme to be offered and the loss branch to roll (`outcome/investing/ponzi-scheme`).
- `delist.yaml`: forces a penny-stock delisting year for the headline (C5) with `roll:` on the delist chance, if the harness supports it (G1).

## Tests

`packs/investing/test/`: market settlement (return bounds per kind over a fixed seed), delist and relist (`relist_after` only with `delist`), bond coupon, maturity and default, tip direction and accuracy, insider flag set on act, scam weights vs smarts, shortfall keeps holdings, save round-trip and replay determinism.

## Docs

`packs/investing/CONTEXT.md` (terms: holding, tip, insider tip, scam, delisting, government bond); `packs/investing/BALANCE.md` (targets from the archive table, results filled in #234).
