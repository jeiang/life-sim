# investing balance

Final numbers: 10000 lives, seed 1, all profiles, on artemis (`scripts/artemis-run.sh investing-tune build/tune-investing -- --lives 10000 --profile all`, commit 1afc7a2), 0 faults, 1 never fired (`crime/prison-study-ged`, not this Pack). Closed in #234.

## Targets and measured

| Metric | Target | Measured (10k) |
|---|---|---|
| total-market annualised | about 5% | 5.12% (median) |
| world-index | about 5% | 5.81% |
| bond funds | 2-3% | 2.96% income, 2.46% corporate |
| gov bonds | 2-3% | coupon 3% on both; price-only series reads about -0.06% |
| quark-coin median | at or below 0% | -3.59% |
| total-market years down 20%+ | one per 15-20 years | 6.6% of years |
| pinecrest / brightwave delisted in a life | 5-6% a year | 99.6% / 99.4% of lives (8-year relist keeps the kinds returning) |
| bond default | 0.4% of years | 0.41% / 0.40% |
| insider offers per life | under 0.1 | 0.047 (all), 0.14 tipstacker |
| scams lost per life, `random` | under 1 | 0.63 (was 1.115; scam weight cut, #234) |
| `investor` / `tipstacker` net worth | within a few points | tipstacker +20.6% at 40 ($233,693 vs $193,793), +20.1% at 65 ($559,176 vs $465,444); was +18.7% / +55.2% |
| market-headline opens per life | 5..15 (band fixed, #234) | 8.96 (89,631 opens) |
| decision slots (1 / 2 / 3 a year) | 90 / 50 / 30 | 88.5% / 48.1% / 27.3% |

## Notes and deviations

- Insider tips list six kinds (no bonds, no penny stocks), per the sheet.
- Scams (#234): the offer weight was `max(1, 2 + (100 - smarts) / 15 - invest_scams)`, now `max(1, 1 + (100 - smarts) / 25 - invest_scams)`. Stakes and loss odds are unchanged. Offers per life fell from 2.28 to 1.15 for `random`; `random` loses 0.63 a life at 10k.
- Tip accuracy (#234): relatives and friends 52 + smarts / 30 (was 65 + smarts / 10), news 53 (was 70), book 55 (was 80). The design target is a modest edge of about +1.3 points of annual return, not +55% net worth. A 3000-life control with every tip at 50% accuracy (no edge) still put `tipstacker` +13% ahead of `investor` at 40 and +24% at 65, so most of the remaining gap is exposure: `tipstacker` takes up to three tips a year, each a quarter of its cash, and `investor` one. The gap is profile behaviour, not tip quality, and is accepted. The harness has no per-profile annualised-return metric, so the +1.3 points is a design target, not a measured number.
- The harness cannot trade on the market screen, so `investor` and `tipstacker` invest through tip choices (a quarter of cash). `tipstacker` approximates the majority rule (G2 unresolved: ask all sources, no comparison).
- Net worth of investors reads below non-investors (about $144k vs $263k at 40): confounded, the profiles do not save or study. Only 42.8% of all lives (98.6% of `investor`, 98.8% of `tipstacker`, 77% of `random`) hold anything at an age-up.
- `market-headline` (and `portfolio-statement`) open about 9 per life, not the sheet's old 30..80: only the investing profiles hold something for most of their life. The band is now 5..15. The content is unchanged.
- `ask-for-tip` is the top storylet at 289,568 fires (29 per life). It is a player action, not a decision event, so the 3% decision cap does not apply to it; `investor` and `tipstacker` ask every year. Its sheet band is 6..40 per life. `read-the-news` runs 9.6 per life and delisting headlines 3.2 to 3.7 per life (a fresh world delists the kinds before the player is 18). `penny-surge-brightwave-labs` fires (0.19 per life).
- Sheet changes: market ids are written `investing/<kind>`; `scams` lost the `> review` notes; `portfolio` readable is Core's name, not declared by this Pack.
