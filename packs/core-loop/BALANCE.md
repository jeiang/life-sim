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
| Net worth at 65 | mostly positive, wide spread | `random` roughly $200k-400k median, `studious` about $1M, `idle` near zero |
| Degree rate | 25-45% for `random`; higher for `studious` | University enrolment is open from 18 to 24 |
| Employment (25-64) | high for lives that look for work | `idle` never applies, so it is 0% by construction |
| Loans | some defaults, rare repossessions | repossessions come almost entirely from `spender`, who loans for every car and home |
| Mood | stats spread, not pinned at 100 | `everyday-stress` pulls happiness down 7 points in 60% of years while it is above 55 |
| Events per year | about 3-4 | |
| Decisions | at least 1 / 2 / 3 decisions in 90 / 50 / 30% of years from age 5 (within 3 points); empty slots under 5% of years; no storylet over 3% of decisions | the `year.decisions` slot draw; `Decision slots` in the harness report |
| Never-fired storylets in 10,000 lives | none | see below for the rare ones |

## What was tuned

- Salaries are take-home after living costs (the sim has no rent or bills), cut to about half of the first draft. Ladders now run roughly $4k (cashier) to $33k (art director, senior engineer) a year.
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
