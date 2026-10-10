# gambling balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --lives 10000 --profile all --seed 20260101 --jobs 4`. The `gambler` profile (four voluntary moves a year, all on the casinos and lottery; once addicted it goes to support meetings and work, relapsing one move in five) exists to exercise this Pack. The other profiles reach it only through the lottery, the friend events and, for `random`, the menus.

## Targets and results

| Metric | Target | Result (10,000 lives, seed 20260101, 0 faults) |
|---|---|---|
| Faults, including cash below 0 after any gambling action | 0 | 0 |
| Realised return, roulette | about 95% | 96.4% (theory 95.0%) |
| Realised return, slots | about 90% | 90.1% (theory 90.0%) |
| Realised return, horses | 90-95% | 94.0% (theory 93.0%) |
| Realised return, baccarat / craps | under 100% | 95.2% / 88.9% (random bets mix the 98.9% banker and 85.8% tie, and 94.4% field and 83.3% seven) |
| Realised return, blackjack / poker | under 100% | 76.2% / 71.0%: the profile hits, stands, folds, calls and raises at random. Best play is 96.4% (blackjack) and 89-99% (poker, smarts 0-100); see below |
| Realised return, lottery | about 50% in theory | 20.5%: the 1-in-10,000,000 $5M jackpot (25 points of the 50) did not fall in 47,869 tickets. Without it theory is 25% |
| Lives that staked anything (lottery and friend events included) | most lives, over 40% for the passive profile | all 81.6%; `idle` 46.1% (only events), `random` 96.9% |
| Addiction | only frequent bettors | `gambler` 97.6%, `random`, `studious`, `spender`, `idle` 0%; 23.9% of all gamblers |
| Recovery | most addicted lives end it | 79.5% of addicted lives recovered |
| Years lived addicted | a minority | 3.4% of the years of gamblers |
| Bans (suspected cheating) | rare | 0.6% of lives |
| VIP room | gamblers who win big or lose big | 56.1% of lives (mostly `gambler`, then wealthy lives that gambled) |
| Decisions | unchanged: 90 / 50 / 30% | 90.0 / 49.9 / 29.5% |
| Median age at death | 72-82 | 72 (p10 49, p90 93) |
| Never-fired storylets | none | none |

Gamblers lose cash but not their lives' viability: median net worth at 65 is still positive across profiles ($1.2M). The profile bets at random stakes from the table minimum to the limit, so it is the worst case for cash.

## Design numbers

Stakes are minor units; amounts run on a $1 grid (slots $1 to $100, roulette, horses and craps $5 to $500, blackjack $10 to $500, baccarat $10 to $1,000, poker buy-in $50 to $1,000; the VIP room raises every limit ten-fold). Never more than cash.

| Game | Theoretical return |
|---|---|
| Roulette: red or black / dozen / single number | 95.0% / 95.0% / 95.0% |
| Slots | 90.0% (jackpot 100x at 0.1%; 20x 1%; 5x 4%; 2x 12%; stake back 16%) |
| Horses: 2 to 1 / 5 to 1 / 20 to 1 | 93.0% each |
| Craps: the field / any seven | 94.4% / 83.3% |
| Baccarat: banker / player / tie | 99.0% / 98.8% / 85.8% |
| Blackjack (two steps: hand dealt, then hit or stand) | always stand 94.4%, best play 96.4%; natural pays 3 to 2 |
| Poker (buy-in, hand dealt, then fold / call / raise) | best play 89% at smarts 0, 94% at 50, 99.3% at 100 (call pays 1.9x the buy-in, so folding weak hands is not free); smarts adds 0.05 points of win chance per point |
| Lottery ticket ($2) | 50.0%: $5,000,000 at 1 in 10,000,000 (25 points), $100,000 at 1 in 1,000,000 (5), $1,000 at 1 in 10,000 (5), $50 at 1 in 500 (5), $4 at 1 in 20 (10) |
| Friend casino night / betting pool / hot tip | 95.0% / 90.0% / 92.5% |

The issue asked for a jackpot of about 1 in 1,000,000 for $5M+ and a 50% return. Those cannot both hold ($5M at 1 in 1,000,000 is $5 per $2 ticket, 250%), so the jackpot is 1 in 10,000,000.

Repeatable (default curve): payouts and stakes never scale, only happiness gains do. Two-step games put their positive happiness in the first step (scaled) and only harms in the second.

## Habit and addiction

`gambling_heat` rises by 8 + 2 x bets in a year with four or more casino bets, falls by 5 with one to three and by 20 with none. Above 20 each year can tip into addiction with a chance of (heat - 20) x 0.4%. Addicted: -3 happiness in years still betting, -4 in a year away (progress +1), a 25% yearly urge (resist -2 happiness; give in loses up to $500 and resets progress). Three progress ends it; a free support meeting (once a year) adds one.

## Harness

- Profile `gambler`: four voluntary moves a year, all on the casino games and lottery (random game, amount uniform over the allowed grid); applies for work only when nothing is left to bet on. Answers events at random, never goes to support meetings (once addicted it goes to support meetings and work, relapsing one move in five).
- Report section **Gambling**, declared in `harness/metrics.yaml` (shown when a life placed a bet): per profile, the share of lives that staked anything and the share ever addicted; the share of gamblers ever addicted, of the addicted who recovered, of years lived addicted, bans for suspected cheating and VIP rooms; lifetime stakes per gambler; and per game the bets, stakes, net change of cash and realised return (stakes plus net, over stakes). A bet is any action of this Pack that raised `gambling_wagered`; one that leaves cash below zero is an assertion fault (`money_floor: 0`).
