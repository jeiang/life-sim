# core-loop balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --lives 10000 --profile all --seed 20260101 --out <dir>`
(10,000 lives, dealt to the four profiles in turn). Re-run it after any change to numbers in this Pack and compare with the targets below.

## Targets

The profiles are deliberately crude, so judge each metric against the profile that models it:
`random` approximates a casual player, `studious` a diligent one, `spender` a reckless one, and `idle` a player who never touches the menus (it never works, so it drags the all-profile employment and degree rates down).

| Metric | Target | Notes |
|---|---|---|
| Faults | 0 | the only blocking harness result |
| Median age at death | 72-82 | all profiles, 10,000 lives |
| Net worth at 65 | mostly positive, wide spread | gross pay and living costs (v3): all-profile median about $1.0M, p10 $0 (`idle` stays at zero), p90 about $2.8M |
| Degree rate | 25-45% for `random`; higher for `studious` | University enrolment is open from 18 to 24 |
| Employment (25-64) | high for lives that look for work | `idle` never applies, so it is 0% by construction |
| Loans | some defaults, rare repossessions | repossessions come almost entirely from `spender`, who loans for every car and home |
| Mood | stats spread, not pinned at 100 | `everyday-stress` pulls happiness down 7 points in 60% of years while it is above 55 |
| Events per year | about 3-4 | |
| Decisions | at least 1 / 2 / 3 decisions in 90 / 50 / 30% of years from age 5 (within 3 points); empty slots under 5% of years; no storylet over 3% of decisions | the `year.decisions` slot draw; `Decision slots` in the harness report |
| Housing | `random` (which moves out at will) mostly moved out by 40; passive profiles (`idle`, `studious`, `spender` never use Move out) are asked to leave eventually | kick-out pressure in `parents-ask-you-to-leave`: with a passive player about 55-60% still live with their parents at 30 and about 15% at 40; median age at moving out about 33 for all profiles, a real player who chooses to leave moves earlier |
| Living standards | A diligent player (`studious`) is on average living or better most years; homelessness tracks unemployment (`idle` never works, `random` seldom applies) | harness `Living standards`: homeless share of own years ≤ 15% for `studious`, 100% for `idle` by construction |
| Never-fired storylets in 10,000 lives | none | see below for the rare ones |

## What was tuned

- Salaries are gross pay (v3), at a 100% wage index and multiplied by the current city's wage index (80% to 150%). Ladders run from $6k (teen cashier) and $24k (server) to $115k (senior engineer); the pension is `min($30k, $8k + $600 x years worked)`. Earlier versions paid take-home after living costs ($4k to $33k).
- Tuition is $7k-$10k a year (student loans $28k-$40k); homes cost $120k, $250k and $600k; the mortgage runs 30 years at 4.5% and the auto loan 6 years at 6%.
- Mortality: `age^4 / 90000` (was `/ 68000`).
- University enrolment closes at age 24 (a random-choice player previously enrolled at some point in 97% of lives).
- `pay-raise-surprise` required `quality.years_worked`, which is only set at retirement, so it almost never fired; it now requires a job and also adds a small permanent raise.

- More decisions (issue #91): 20 new choice storylets in `storylets/decisions.yaml`, 4-6% a year each, spread over ages 5-90 (childhood dares and dilemmas, teen parties and study nights, adult spending/health/community choices, retirement-age hobbies and visits). Before: 19% of years from age 5 had a choice event (one every 4.6 years, 5-12 only 9%). After: see the numbers below.

Result (10,000 lives, seed 20260101, 0 faults, median death age 73): 33.8 choice events per life (p10 19, p90 47) and 26.5 years with a choice (of about 70 from age 5): **39.3% of years from age 5 have a choice event, one decision every 2.0 years**. By stage (share of years with a choice): 5-12 28.4%, 13-17 41.7%, 18-29 38.6%, 30-49 42.0%, 50-64 45.5%, 65+ 35.5%. By profile (events per life): idle 28.6, random 35.0, spender 35.8, studious 36.0. Every storylet still fires.

## Decision content (issue #99)

All choice storylets are now drawn by `weight` into the yearly decision slots (`year.decisions: [90%, 50%, 30%]`, from age 5). 81 new storylets (and 5 `chance: 0%` follow-ups) live in `storylets/decisions-{child,teen,adult,senior}.yaml`; they use `cooldown` (3-12 years) for everyday decisions and `once` for life milestones. The 31 older unscoped choice storylets that rolled by `chance` (`choice.yaml`, `decisions.yaml`) were converted to `weight` (2x their old percentage) with a 6-year cooldown where none was set, because chance-rolled decisions add on top of the slots and pushed the delivered rates to 93 / 53 / 30%.

Result (10,000 lives, seed 20260101, 0 faults, median death age 74): at least 1 / 2 / 3 decisions in **89.9% / 49.9% / 29.8%** of years from age 5 (every profile within 0.3 points of that); slots with nothing eligible **0.2%** of years (1,960 slots); 115 choice events per life and 60 years with a choice. Top storylet 2.70% of decisions (`volunteer-weekend`), then `lottery-ticket` 2.62%; the rarest is `code-review-clash` (needs an office job). Every storylet fires. By stage (share of years with a choice): 5-12 90%, 13-17 90%, 18-29 90%, 30-49 90%, 50-64 88%, 65+ 84%.

## Intentionally rare storylets

These fired at least once in 10,000 lives but are rare on purpose:

- `core-loop/pay-raise-surprise`: a 4% yearly chance, only while employed.
- `core-loop/drop-out-of-university`: needs a player action while enrolled; only the `random` profile picks it.
- `core-loop/childhood-mortality` (0.03-0.15% a year) and `core-loop/fatal-car-crash` (0.1% a year): deaths.
- The white-collar `apply-*` and `promote-*` steps (`junior-analyst`, `analyst`, `junior-engineer`, `engineer`, `staff-nurse`, `charge-nurse`, `studio-assistant`, `designer`): gated by a degree, which about a third of lives earn.

## Housing (cities and moving out, #108)

10,000 lives, seed 20260101, all profiles: no faults. Age at moving out (any cause): p10 20, median 33, p90 42. Share of lives reaching 18 that moved out 97.5%, kicked out 88.1% (`random` 66.5%, the others 95-96%: they never choose to leave). Still with parents at 30: 58.7% (`random` 50.2%); at 40: 14.8% (`random` 11.5%). The kick-out chance is 1% + 0.04% per missing closeness point + 0.75% per living sibling + 1.5% per impatience step (age 31 onward, 10 steps at most). A first draft with double those weights kicked out 92% and moved the median to 27, too fast for a player who is never forced out.

## Living standards (cost of living, #109)

Pay moved from take-home to gross at a realistic scale, and the player on their own pays a standard of living each year. The nominal prices of homes and events were left alone (homes $120k-$600k).

Standards at a 100% cost index: homeless $0, thrifty $9k, average $18k, above average $32k, wealthy $60k, rich $120k, ultra-rich $300k; happiness and health per year: homeless -2/0, thrifty 0/0, average 0/0, above average +1/+1 (cap 85), wealthy +2/+1 (cap 90), rich +3/+2 (cap 95), ultra-rich +4/+3. Illness and death risk multipliers: homeless 115%, thrifty 103%, average 100%, then 95%, 90%, 85%, 80%. They multiply the flu and serious-illness chances and `natural-mortality`. An owned home in the current city removes 40%.

First drafts (health -3/-2 and risk 200-250% for homeless) put the median age at death at 62-66; milder homelessness (health 0, risk 115%) restores it to 73. The harness never picks a standard, so everyone who can pay lives on the default `average`; the upper standards show up only through the chosen-standard action.

10,000 lives, seed 20260101, all profiles: no faults. Median age at death 73 (`idle` 73, `random` 75, `spender` 72, `studious` 73); p10 49, p90 93. Net worth (major units): age 18 median 150; age 40 median 220k (p10 0, p90 800k); age 65 median 1.04M (p10 0, p90 2.85M). Employment 64% of person-years aged 25-64.

Years lived on their own that were homeless: 45.5% overall (idle 100%, random 47.7%, spender 25.2%, studious 8.8%). Standard by age (share of lives, with parents / homeless / thrifty / average / higher): age 30 58.8 / 22.7 / 5.0 / 13.3 / 0.1; age 40 14.9 / 39.8 / 7.4 / 37.2 / 0.7; age 60 0.2 / 43.7 / 8.6 / 44.6 / 2.9; age 80 0 / 39.6 / 9.5 / 44.9 / 6.0. Loans: 57,197 opened, 13.7% had a missed payment, 2,017 repossessions.
