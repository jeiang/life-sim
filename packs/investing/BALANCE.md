# investing balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives N --profile all --seed 20260101 --out <dir>`. The report has an **Investing** section when this Pack is loaded.

## Design numbers

- 12 market kinds, all from age 18 (`requires: age >= 18`), traded on the Investments screen: 2 index funds (`total-market` 8% drift, 16% vol, 4% yearly crash of -35%; `world-index` follows it at 75%), 2 bond funds (3% and 4.5%, vol 3% and 6%), 3 fictional stocks (follow the total market at 90-110% with 15-28% own vol), 1 coin (`quark-coin`, 12% drift, 35% vol, 8% crash of -40%), 2 penny stocks (drift -20% / -15%, vol 50-60%, 1% yearly 10x jump, 5-6% yearly delisting) and 2 government bonds (5 years at 3% coupon, 10 years at 4%; one issuer, so both carry a 0.4% yearly default chance with a 60% loss, rolled per bond). A later country gives its bonds its own chance.
- Tips: the ask actions live in `relationships` (each relative and friend: parent, sibling, friend, partner, spouse) and `activities/investing` (the news, a book at $25). All have a one-year cooldown, so each source tips at most once a year. The source draws the kind: each of the 10 tippable kinds (everything except government bonds) has weight `max(100, 1000 + Q x forecast / 100)` (0 when the kind's price is under 20 minor units), with source quality `Q` = 5 + the relative's smarts / 20, 4 for the news and 8 for a book. The player then puts 5% or 25% of cash into it, or passes.
- Insider tips: an extra outcome of asking a relative or friend aged 25+, for the 8 non-penny kinds, with weight `min(20, (forecast - 20%) / 1%)` (0 unless the forecast beats 20%). Acting (40% of cash) sets `invest_insider_age`.
- Scams (`ponzi-scheme`, `fake-coin`, `guaranteed-returns`): decision events, weight `max(1, 2 + (100 - smarts) / 15 - invest_scams)`, 4-year cooldown, age 18+ and $500+. Stakes are 10% or 40% of cash; the loss branch weighs `85 + (100 - smarts) / 10`, an early payout (+20%) the rest; "look into it" spots the scam with weight smarts.
- Shortfall: nothing to author. Living costs downgrade the standard and holdings are never sold (checked in `investing.test.ts`).

## Targets

| Metric | Target | Notes |
|---|---|---|
| Faults | 0 | blocking |
| Index annualised return | 4-6% | crash years (-20% or worse) 5-8% for the total market |
| Bond funds, government bonds | 2.5-5.5% annualised | government bond default rate near 0.4% of bond-years |
| Stocks | arithmetic mean above the index, annualised near it | |
| Coin | mean above 5%, annualised -3% to +2%, 15-22% crash years | |
| Penny stocks | negative mean return, annualised below -25%, 5-7% delisted per year | |
| Tip accuracy | tipped kinds rise 65-80% of the time and beat a random kind by 2-5 points | |
| Insider tips | rise 20%+ at least 90% of the time; rare (under 0.1 offers per life, all profiles) | |
| `tipstacker` against `investor` | annualised return within 2 points | else tune `Q` down |
| Scams | under 1 lost per life for `random`; more at low smarts | |
| Decisions | at least 1 / 2 / 3 per year stay within 3 points of 90 / 50 / 30% | scams join the decision pool |
| Never-fired storylets | none | |

## Results

10,000 lives, seed 20260101, all profiles (CI `harness-10k`), 0 faults, 0 storylets never fired, decisions at least 1 / 2 / 3 in 89.9 / 49.6 / 28.7% of years:

| kind | mean return | annualised | crash years | delisted | bond default rate |
|---|---|---|---|---|---|
| total-market | 6.62% | 5.08% | 6.5% | - | - |
| world-index | 6.96% | 5.81% | 4.27% | - | - |
| income-bond-fund | 3% | 2.95% | 0% | - | - |
| corporate-bond-fund | 5.16% | 4.97% | 0% | - | - |
| acme-robotics | 10.2% | 5.75% | 14.74% | - | - |
| northwind-foods | 5.99% | 4.34% | 7.84% | - | - |
| lumen-energy | 8.63% | 3.09% | 18.16% | - | - |
| quark-coin | 8.18% | 0.53% | 20.08% | - | - |
| pinecrest-mining | -5.43% | -39.29% | 25.11% | 6.01% | - |
| brightwave-labs | -3.57% | -32.92% | 24.47% | 4.92% | - |
| gov-bond-5 | 2.77% | 2.65% | 0.38% | - | 0.38% |
| gov-bond-10 | 3.76% | 3.63% | 0.4% | - | 0.4% |

- Tips: the tipped kind rose 71.25% of the time (444,375 tips) and returned 9.12% the next year against 6.24% for a random kind. Insider tips (669): all rose 20% or more, mean 45.15%; 0.07 offers per life, and the profiles that take them (`random`) acted on 0.006 per life.
- `investor` annualised 5.04% (99.9% participation, 74,732 holding years); `tipstacker` 6.34%, 1.3 points above, inside the 2-point target; `random` 4.83% with 82.8% of its lives investing.
- Net worth (median, major units): investors against the rest across all profiles $891,563 against $291,460 at 40 and $4,701,862 against $1,266,832 at 65. The groups are confounded (the `investor` and `tipstacker` profiles save most of their pay and seek work; `idle` and `spender` never invest).
- Scams: 2.26 offers per life over all profiles; `random` loses to 1.18 per life, `spender` 1.57 and `gambler` 1.54 (they answer at random), `studious` 0.52 (high smarts, so fewer offers and more "look into it" successes); `investor` and `tipstacker` decline every one.
- Penny stocks: mean return -5.4% and -3.6% a year, annualised near -33% to -39% (a holder usually loses nearly everything), delisted 5-6% of years; the 10x jump (1% a year) is too rare to show in the annualised figure.
- Observation, not changed: the price series are lognormal-like random walks over up to 100 world years, so the high-volatility kinds can drift to very small or very large prices in a long life; a return of -100% leaves a price of 1 minor unit that can never recover (Core rounding). Sources never tip a kind priced under 20 minor units.
