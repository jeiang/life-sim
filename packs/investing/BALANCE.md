# investing balance

Focused numbers: 2000 lives, seed 7, all profiles (`pnpm harness --lives 2000 --seed 7 --jobs 4`), 0 faults, 0 never fired. Final numbers come from the artemis run in #234.

## Targets and measured

| Metric | Target | Measured |
|---|---|---|
| total-market annualised | about 5% | 5.16% (median) |
| world-index | about 5% | 5.87% |
| bond funds | 2-3% | 2.97% income, 2.48% corporate (drift 4.5% cut to 2%, G3) |
| gov bonds | 2-3% | coupon 3% on both (10-year coupon cut from 4%, G3); price-only series reads about -0.06% |
| quark-coin median | at or below 0% | -3.3% (drift cut 12% to 8%, G3) |
| total-market years down 20%+ | one per 15-20 years | 6.6% of years |
| pinecrest / brightwave delisted in a life | 5-6% a year | 99% of lives (8-year relist added so the kinds return) |
| bond default | 0.4% of years | 0.40% / 0.40% |
| insider offers per life | under 0.1 | 0.04 (all), 0.13 tipstacker |
| scams lost per life, `random` | under 1 | 1.20 (not met; decide in #234: cut weight or stakes) |
| `investor` / `tipstacker` | within a few points | both take tips only; compare in #234 |

## Notes and deviations

- Insider tips list six kinds (no bonds, no penny stocks), per the sheet.
- The harness cannot trade on the market screen, so `investor` and `tipstacker` invest through tip choices (a quarter of cash). `tipstacker` approximates the majority rule (G2 unresolved: ask all sources, no comparison).
- Net worth of investors reads below non-investors (about $210k vs $281k at 40): confounded, the profiles do not save or study.
- Focused-sim flags kept, explained: tip-source and tip-kind opens run above the sheet bands because `investor`/`tipstacker` ask every year (36 asks per life, about 5.4 tip events per profile-life share); headlines open 10 per life against 30..80 because only 37% of lives hold anything; penny delisting headlines open 0.05-0.09 per life because a fresh world delists the kinds before the player is 18; brightwave surge never fired in the sample (about 0.03-0.05 expected).
- Sheet changes: market ids are written `investing/<kind>`; `scams` lost the `> review` notes; `portfolio` readable is Core's name, not declared by this Pack.
- Open for #234: scam loss rate, tip-source frequencies, tipstacker vs investor return.
