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
| Choice events | a decision about every 2-3 years from age 5 (35-45% of years have at least one) | `choice events per life` and `years with a choice` in the harness report; every life stage from 5 on should be near this, none far below |
| Never-fired storylets in 10,000 lives | none | see below for the rare ones |

## What was tuned

- Salaries are take-home after living costs (the sim has no rent or bills), cut to about half of the first draft. Ladders now run roughly $4k (cashier) to $33k (art director, senior engineer) a year.
- Tuition is $7k-$10k a year (student loans $28k-$40k); homes cost $120k, $250k and $600k; the mortgage runs 30 years at 4.5% and the auto loan 6 years at 6%.
- Mortality: `age^4 / 90000` (was `/ 68000`).
- University enrolment closes at age 24 (a random-choice player previously enrolled at some point in 97% of lives).
- `pay-raise-surprise` required `quality.years_worked`, which is only set at retirement, so it almost never fired; it now requires a job and also adds a small permanent raise.

- More decisions (issue #91): 20 new choice storylets in `storylets/decisions.yaml`, 4-6% a year each, spread over ages 5-90 (childhood dares and dilemmas, teen parties and study nights, adult spending/health/community choices, retirement-age hobbies and visits). Before: 19% of years from age 5 had a choice event (one every 4.6 years, 5-12 only 9%). After: see the numbers below.

DECISIONS_NUMBERS

## Intentionally rare storylets

These fired at least once in 10,000 lives but are rare on purpose:

- `core-loop/pay-raise-surprise`: a 4% yearly chance, only while employed.
- `core-loop/drop-out-of-university`: needs a player action while enrolled; only the `random` profile picks it.
- `core-loop/childhood-mortality` (0.03-0.15% a year) and `core-loop/fatal-car-crash` (0.1% a year): deaths.
- The white-collar `apply-*` and `promote-*` steps (`junior-analyst`, `analyst`, `junior-engineer`, `engineer`, `staff-nurse`, `charge-nurse`, `studio-assistant`, `designer`): gated by a degree, which about a third of lives earn.
