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

Local 2,000 lives (seed 20260101, `--jobs 4`); the 10,000-life numbers from CI follow below.
