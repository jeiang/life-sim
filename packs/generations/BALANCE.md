# generations balance

Content: 23 storylets (will 2, openers 4, aftermath 6, minor heir 4, heirlooms 5 including the sell action, NPC-parent inheritance 2 on `person_death`, #341) plus the `on_succession` hook. Final numbers come from the artemis run of the balance issue (#243); the figures below are local runs (seed 1/3/5, `--jobs 4`).

## Profile and harness

`dynasty` (opt-in, `default: false`): the dating `romantic` moves plus writing a will from 30 (`will-heir`, `will-make`); it does not buy property (#364). `dynasty_homes` (opt-in) is the same plus unlimited house buying, for the `family-home` script only. It exists so `--generations N` runs reach succession: scripts cannot combine with `--generations`. Heirloom and opener fire rates of later generations are not part of the founder's `report.json`; the Pack's own section reports the founder's will kinds and heirloom finds, and the heir availability, inheritance, heir age, minor-heir and insolvent-estate rates by generation are core-loop's generation tables.

300 lives, `--profile dynasty --generations 4`, seed 5: 0 faults for `--heir random` and `--heir richest` (and 3 generations, `eldest`, seed 1); `once-repeated` 0. Decision slots 89.5 / 49.7 / 28.9%. Persons per save p50 24, p99 25; save bytes p50 165 KB (founder numbers).

Lineage (`--heir random`): 142 of 300 founders (47%) leave an heir, 45 reach generation 2 and 11 generation 3. Cash inherited into generation 1: p10 0, p50 $1.32M, p90 $4.23M (minor units 131869200 / 422607850; includes the family wealth carry-over). Heir age at succession p10 9, p50 31, p90 58; 14% of heirs at 9 or younger. Net worth at death by generation (p50): 2.42M, 3.49M, 3.79M, 3.69M dollars.

## Numbers (focused-sim)

| storylet | opens per life | band |
|---|---|---|
| will-make | 0.07 (default bots), 14 wills written per dynasty life (3-year cooldown) | 0.03..0.15 |
| will-heir | 0 default bots (no children) | 0..0.05 |
| heirloom-attic-find | 0.33 | 0.2..0.5 |
| heirloom-appraisal | 0.2 | 0.1..0.3 |
| heirloom-family-quarrel | 0.19 | 0.1..0.3 |
| heirloom-history | 0 in a founder's life (needs a passed heirloom) | 0..0.3 |

Tweaks from the sheets: `heirloom-attic-find` weight 8 to 1 and `heirloom-appraisal` 6 to 2 (the sheet weights gave 3.3 and 2.5 opens a life); `will-make` and `will-heir` bands moved to the default bots (a deliberate player action; the dynasty profile plays it). `heirloom-history` is a succession-only beat, so `focused-sim` flags it `never-fired` in every founder run; it fires only for a later generation (tested directly in `test/generations.test.ts`).

Sheet conversions: the four openers, `aftermath-grief`, `aftermath-cash-left`, `aftermath-family-home` and `minor-guardian-takes-in` are `trigger: succession` storylets (engine feature, PR 304), not `chance: 0%` steps scheduled by the hook; the openers no longer schedule grief. `quality.gen_minor_heir` is an int 0..1 (`age < 18 ? 1 : 0`) because lint cannot see a boolean expression written to a flag. Outcome text in grief no longer says "at school" (the heir may be 60).

## Heirloom values (minor units)

Base: watch 60,000, quilt 20,000, clock 180,000, violin 900,000, letters 35,000. Gain per generation passed: 8, 5, 14, 15, 10 percent, applied to a held heirloom at each succession (`value * (100 + gain) / 100`). Heirlooms add nothing to net worth; selling pays `value` in cash once. The violin tops out at about $9,000 x 1.15^n: small against median net worth of $2.4M at death.

## Known limits and flags for the balance issue (#243)

- `aftermath-sibling-contests` (10% a year, once per generation, age 16+) can fire decades after the death for an heir with a sibling; judge its rate and band in the artemis run.
- `minor-handover-at-18` is a weight-40 event: when it is not drawn in the year the heir turns 18, the flag stays 1 (harmless: every other minor storylet gates on age).
- The opener bands and the minor-heir storylets only occur in generation 1+, which the founder-only storylet rates cannot show; the artemis run should read `generation` lineage numbers and fire rates with `--generations`.
- No harness measure reads a table cell, so heirloom value by generation is not reported.

## Release run (#243, #352)

10,000 lives, `--profile dynasty --generations 4 --heir random`, origin/main `3f326a1d` (artemis): founders dying with a living child 50.5% (reference ~47%); lives reaching generation 1 / 2 / 3 50.5 / 33.7 / 23.2%; minor-heir successions into generation 1 / 2 / 3 29.3 / 15.9 / 15.0% (`--heir richest`: 24.5 / 9.3 / 7.3%); will share 76.9%; heirloom found in a founder life 47.1%; decision years with at least 1 / 2 / 3 decisions 89.9 / 49.4 / 28.3%; 0 faults; largest decision share 2.46%. No tuning came out of it.

Heir-generation storylets (`storylets.heirFired` of a local 300-life run of the same command, after the dynasty profile learned to buy a house): the report lists which storylets fired in a later generation, not how often. Fired in generations 1+: the four `inherit-*` openers, `aftermath-grief`, `aftermath-cash-left`, `aftermath-spouse-share`, `aftermath-sibling-contests`, `aftermath-anniversary`, `aftermath-family-home`, `minor-guardian-takes-in`, `minor-guardian-review`, `minor-handover-at-18`, `heirloom-history`, `will-make`, `will-heir`, `heirloom-attic-find`, `heirloom-appraisal`, `heirloom-family-quarrel`. Not fired by that profile: `minor-on-own` (needs a 16-17 year old minor heir with a living parent who is put out and rolls no guardian, about 0.2% of minor heirs) and `heirloom-sell`.

Reachability (#352, changed in #364): the `dynasty_homes` profile (below) buys a house or big house from age 30 when it can afford one (a `shop` rule limited by `ids`), so `aftermath-family-home` fires for heirs. `generations/minor-on-own` is a forced script (`profile: dynasty`, `generations: 4`, `heir: random`) that puts every 16-17 year old out of the house (`core-loop/parents-put-you-out` hit) and forces every no-guardian roll (`guardian/none/*` hit): 300 lives, 0 faults, `minor-on-own` in `heirFired`. Forced scripts may now declare `generations` and `heir`, and forcing applies to every generation.

## Tuning after the v1 rebalance (#364)

Report: `~/life-sim-reports/generations-v2/` (artemis `reports/generations-dyn1-01fe761-20261011T055724Z`), 10,000 lives, `--profile dynasty --generations 4 --heir random`, base seed 1, 0 faults. The v1 reference is the #245 run (`rebalance-v1/dyn`, seed 20260101); the seeds differ, so read the shifts of a few percent as noise.

Cause: Core lets a life own any number of houses and the `dynasty` profile's `shop` rule bought one whenever it could afford it (a local lineage run showed 7 to 10 houses for a founder and 17 to 21 for a generation 2 heir). Cash went into property every year, so heir cash was 0 at the median, and the estate passes every asset whole, so the hoard grew with every generation. The compounding was the bot's, not the Pack's rules.

Change (data only): `dynasty` no longer buys houses (the `will-make` and `will-heir` rules stay). The house-buying profile lives on as `dynasty_homes` (opt-in, `default: false`), used only by the new forced script `generations/family-home` (2 generations, 40 lives locally, 0 faults, `aftermath-family-home` in `heirFired`), so the release merge still sees that storylet fire. No storylet, will rule or heirloom number changed.

| | v1 (#245) | after |
|---|---|---|
| net worth at death p50, generation 0 / 1 / 2 / 3 (major units) | 2.77M / 6.25M / 10.18M / 14.80M | 2.56M / 2.99M / 3.22M / 3.29M |
| growth per generation | 2.3x / 1.6x / 1.5x | 1.17x / 1.08x / 1.02x |
| cash inherited p50 into generation 1 / 2 / 3 (minor units) | 0 / 0 / 0 | 0 / 40.4M / 64.5M |
| cash inherited p90 into generation 1 / 2 / 3 | 64.5M / 52.8M / 37.3M | 344.3M / 450.3M / 498.9M |
| founders leaving a living child | 64.6% | 64.3% |
| lives reaching generation 1 / 2 / 3 | 64.6 / 44.8 / 32.1% | 64.3 / 43.6 / 31.4% |
| minor-heir successions into generation 1 / 2 / 3 | 37.9 / 28.0 / 24.5% | 38.5 / 28.4 / 22.5% |
| heir age at succession p50 | 24 / 32 / 34 | 24 / 32 / 34 |
| will share | 81.5% | 81.3% |
| decision slots (at least 1 / 2 / 3) | 89.0 / 48.7 / 27.9% | 89.9 / 49.4 / 28.3% |
| largest decision share | 2.14% | 2.44% (`core-loop/lottery-ticket`) |
| median death age | 72 | 72 |

Succession shares: the 64% living-child rate and the larger minor-heir share follow the dating tuning (#241) and the profile's always-partner, always-baby play, not this Pack's rules. A bot that always dates and tries for a baby is a ceiling case; it is kept as is. Heir-generation storylets (`storylets.heirFired`): `inherit-under-12`, `inherit-12-17`, `inherit-18-39`, `inherit-40-plus`, `aftermath-grief`, `aftermath-cash-left`, `aftermath-spouse-share`, `aftermath-sibling-contests`, `aftermath-anniversary`, `minor-guardian-takes-in`, `minor-guardian-review`, `minor-handover-at-18`, `heirloom-history`, `heirloom-attic-find`, `heirloom-appraisal`, `heirloom-family-quarrel`, `will-heir`, `will-make` all fire; `aftermath-family-home` now fires only in the `family-home` script.

Gap for Core (closed by #379): Core now caps owned houses per item kind (`max_owned`) and an estate pays a settlement cost on succession. The house-buying restore still fails the growth bound, so `dynasty` stays property-free (below).

## Estate settlement cost and house cap (#379)

Core change (pack format 6 to 7): `estate.settlement_cost` is a percent that `generations` declares as the `estate` singleton (`provides.singletons`). On each succession the estate pays that percent of its value (cash, assets and holdings, less the debts the heir takes on), from cash only, capped at the cash left and before the split. The rate is 10%. `max_owned` on the `core-loop` items `house` and `big-house` caps owned houses at 1 (`studio-condo` stays unlimited). The shop greys the row and `purchase()` refuses.

Restoring house buying in `dynasty` fails the bound. With the cap and the settlement cost on, a profile that buys a house or big house whenever it can afford one grows net worth 1.53x from generation 0 to 1 (`estate-cost-2`, 10,000 lives, `--profile dynasty --generations 4 --heir random`, seed 20260101; net worth at death p50 3.57M, 5.46M, 6.73M, 7.81M; growth 1.53x, 1.23x, 1.16x). The bound is about 1.2x, so the restore is reverted. `dynasty` buys no property. `dynasty_homes` (opt-in) buys at most one house and one big house, for the `family-home` script only; its growth was not measured after the cap.

| | before: #364 run (`generations-dyn1-01fe761-20261011T055724Z`, seed 1) | after: `estate-cost-1` (`b91cd5d`, same tree as this PR, seed 20260101) |
|---|---|---|
| net worth at death p50, generation 0 / 1 / 2 / 3 (major units) | 2.56M / 2.99M / 3.22M / 3.29M | 2.75M / 2.97M / 3.11M / 3.15M |
| growth per generation | 1.17x / 1.08x / 1.02x | 1.08x / 1.05x / 1.01x |
| faults | 0 | 0 |
| median age at death | 72 | 72 |
| decision slots (at least 1 / 2 / 3) | 89.9 / 49.4 / 28.3% | 89.9 / 49.5 / 28.4% |
| never-fired storylets | 124 | 125 (see below) |

The seeds differ, so read shifts of a few percent as noise. The #364 run is the reference: the main-checkout baseline on `c1d14f1` hit the 2-hour artemis timeout (exit 124), so it has no report.

Storylets that fired in the #364 run and are never-fired after this change: `grad-school/ceo-offer` (a 0.3% chance after five years as a business manager) and `gambling/year-at-the-tables` (8,138 fires in the #364 run). Both are never-fired with and without house buying. The all profile still fires them (11,008 and 3 times). Whether main had already lost them in dynasty is unconfirmed. Open item for the next balance pass.

Artemis slugs: `estate-cost-1` (dynasty, no buying, this tree), `estate-cost-2` (dynasty with buying, rejected), `estate-cost-3` (all profiles; `all` excludes `default: false` profiles, so it covers this tree).
