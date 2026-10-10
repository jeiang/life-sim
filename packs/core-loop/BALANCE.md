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
| Mood | stats spread, not pinned at 100 | see Stat saturation (#146): `random` has no stat over 10% at 100 from age 30 to 60 (age 20: 15%) |
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

## Repeatable activities (issue #106)

Gym, library, doctor, meditate, walk, study harder, spend time together and have a conversation are `repeatable` (default curve `repeat: { full: 10, reduced: 20, factor: 25% }`: uses 1-10 a year in full, 11-20 a quarter of each gain, 21+ none; money and harms never shrink). They no longer lock after one use per year.

Result (10,000 lives, seed 20260101, 0 faults), before -> after: median death age 74 -> 74; net worth at 65 median $548,651 -> $539,233 (`random` at 40: $77,490 -> $72,765; `studious` and `spender` unchanged); degree 36.7% -> 36.8%; employment 64.0% -> 63.8%; loan defaults 19.5% -> 19.5%; decisions 89.9 / 49.9 / 29.8% unchanged; events per year 5.03; every storylet still fires; happiness and health medians by age unchanged.

The profiles never reach the penalty ranges: `random` makes 0-2 moves a year, so no activity was used more than twice in a year (library 0.23 uses per year lived, most others under 0.1; see `Repeated activities` in the harness report). The 11+ and 21+ tiers are covered by unit tests, not by balance runs. One harness change was needed: `studious` now does each action at most once a year, as the old cooldown made it; without that it studied all year, never applied for work, and employment fell from 64% to 41%.

## Intentionally rare storylets

These fired at least once in 10,000 lives but are rare on purpose:

- `core-loop/pay-raise-surprise`: a 4% yearly chance, only while employed.
- `core-loop/drop-out-of-university`: needs a player action while enrolled; only the `random` profile picks it.
- `core-loop/childhood-mortality` (0.03-0.15% a year) and `core-loop/fatal-car-crash` (0.1% a year): deaths.
- The white-collar `apply-*` and `promote-*` steps (`junior-analyst`, `analyst`, `junior-engineer`, `engineer`, `staff-nurse`, `charge-nurse`, `studio-assistant`, `designer`): gated by a degree, which about a third of lives earn.

## Housing (cities and moving out, #108)

10,000 lives, seed 20260101, all profiles: no faults. Age at moving out (any cause): p10 20, median 33, p90 42. Share of lives reaching 18 that moved out 97.5%, kicked out 88.1% (`random` 66.5%, the others 95-96%: they never choose to leave). Still with parents at 30: 58.7% (`random` 50.2%); at 40: 14.8% (`random` 11.5%). The kick-out chance is 1% + 0.04% per missing closeness point + 0.75% per living sibling + 1.5% per impatience step (age 31 onward, 10 steps at most). A first draft with double those weights kicked out 92% and moved the median to 27, too fast for a player who is never forced out.

Guardian choice (#222): the event `parents-put-you-out` puts a 16-17 year old out at 0.5% to 2.5% a year (cooler parents raise it). The guardian is the closest living adult kin (grandparent, aunt/uncle, sibling, cousin), else unnamed. The no-guardian roll is `(200 - karma - smarts) x 2.5` basis points: 5% at karma 0 and smarts 0, 2.5% at 50/50, 0 at 100/100. 1,000 lives, seed 20260101, all profiles: no faults; 28 lives put out, 1 (3.6%) with no guardian (the bots' karma and smarts sit mid-range). Tune the share through the `no_guardian.chance` expression, and the put-out rate through the event's `chance`.

## Living standards (cost of living, #109)

Pay moved from take-home to gross at a realistic scale, and the player on their own pays a standard of living each year. The nominal prices of homes and events were left alone (homes $120k-$600k).

Standards at a 100% cost index: homeless $0, thrifty $9k, average $18k, above average $32k, wealthy $60k, rich $120k, ultra-rich $300k; happiness and health per year: homeless -2/0, thrifty 0/0, average 0/0, above average +1/+1 (cap 85), wealthy +2/+1 (cap 90), rich +3/+2 (cap 95), ultra-rich +4/+3. Illness and death risk multipliers: homeless 115%, thrifty 103%, average 100%, then 95%, 90%, 85%, 80%. They multiply the flu and serious-illness chances and `natural-mortality`. An owned home in the current city removes 40%.

First drafts (health -3/-2 and risk 200-250% for homeless) put the median age at death at 62-66; milder homelessness (health 0, risk 115%) restores it to 73. The harness never picks a standard, so everyone who can pay lives on the default `average`; the upper standards show up only through the chosen-standard action.

10,000 lives, seed 20260101, all profiles: no faults. Median age at death 73 (`idle` 73, `random` 75, `spender` 72, `studious` 73); p10 49, p90 93. Net worth (major units): age 18 median 150; age 40 median 220k (p10 0, p90 800k); age 65 median 1.04M (p10 0, p90 2.85M). Employment 64% of person-years aged 25-64.

Years lived on their own that were homeless: 45.5% overall (idle 100%, random 47.7%, spender 25.2%, studious 8.8%). Standard by age (share of lives, with parents / homeless / thrifty / average / higher): age 30 58.8 / 22.7 / 5.0 / 13.3 / 0.1; age 40 14.9 / 39.8 / 7.4 / 37.2 / 0.7; age 60 0.2 / 43.7 / 8.6 / 44.6 / 2.9; age 80 0 / 39.6 / 9.5 / 44.9 / 6.0. Loans: 57,197 opened, 13.7% had a missed payment, 2,017 repossessions.

## Student loan pays the school (#144)

`take_loan` credits the principal to the player, and `tuition_by_loan` zeroes yearly tuition, so enrolling with a loan handed the player $28k-$40k of spendable cash. Each of the four enrol choices now runs `money -= N` right after `take_loan`, so money is unchanged at enrolment and the loan balance is N (pack version 6).

10,000 lives, seed 20260101, all profiles, 0 faults, before -> after: degree rate 36.2% -> 36.0%; median net worth at 65 $1.042M -> $1.007M; median age at death 73 -> 73. Side effect: loans with a missed payment 13.7% -> 20.4% (loan count 57,197 -> 57,209), because the player no longer holds the loan as cash to service it.

## Household costs (#133, pack v8)

Per child at home $4,000 a year at a 100% cost index (about a fifth of the average standard); a partner who moved in pays 50% of the standard's cost. A minor with no living parent lives with a guardian: no cost, no standard effects, no risk multiplier, assets in trust until 18. The bots have no children or partners yet, so the harness applies the terms to their own years.

10,000 lives, seed 20260101, all profiles: no faults, median age at death 73 (unchanged). Living cost as a percent of income, person-years aged 25-64 on their own with income (median / p90): alone 16.2 / 50.4; one child 25 / 64.9; two children 31.3 / 104.8; partner sharing 8.1 / 25.2; two children and a partner sharing 22.6 / 100. Target: a child at home adds about 8-9 points to the median share and a sharing partner removes about half of the base; the p90 above 100% is the low earners the standard already outprices.

## Stat saturation (#146)

Harness: `Stats at 100` (share of living lives at the cap, per stat, by decade) and the opt-in `grinder` profile (12 random repeatable uses a year; `--profile grinder`, never in `all`).

Targets: `random`: no stat over 10% at 100 at ages 30-60 and over 15% at age 20 (age 10 is excluded: stats start anywhere in their range and childhood decisions push them up). `grinder`: a stress case that spends every move on repeatables; no stat over 35% at 100 at ages 30-60. Existing targets unchanged.

Baseline (pre-#106, commit 0fbc9f76 plus the metric; `random`, 3,000 lives, seed 20260101): share at 100 at ages 20 / 30 / 50 / 70: happiness 29 / 20 / 16 / 30%, health 2.5 / 5 / 5 / 3%, looks 0.8 / 1 / 8 / 17%, smarts 19 / 26 / 40 / 51%. With repeatables untuned (#122, same run) it was almost identical (happiness 30 / 25 / 23 / 40%, smarts 19 / 27 / 40 / 51%), so the repeatables did not cause the saturation: stats start at random values, nothing pulled them down, and decisions and events only add. `grinder` untuned: happiness 46 / 45 / 45%, health 49 / 56 / 54%, smarts 95-100% from age 20 (ages 20 / 30 / 50).

Changes (pack version 9):
- Default curve `repeat` is now `{ full: 3, reduced: 8, factor: 25% }` (was 10 / 20): a year of 10 library visits is no longer 10 full uses.
- `have-a-conversation` no longer gives `smarts +1`; the biggest sink for grinders (every relative counts apart).
- Three new yearly events that pull a high stat down: `mind-wanders` (age 10+, smarts over 65, 50%, -2), `looks-fade` (age 30+, looks over 60, 40%, -1), `wear-and-tear` (age 30+, health over 90, 40%, -3); `everyday-stress` rises from 60% to 85%.
- The repeat factor now carries through `next:` chains (including across a pending choice and a save), so chained steps of a repeatable action diminish with it.

Result, `random` (2,000 lives, seed 20260101) share at 100 at ages 20 / 30 / 40 / 50 / 60: happiness 12.6 / 6.2 / 6.1 / 4.7 / 5.1%; health 2.1 / 2.3 / 0.4 / 0.3 / 0.4%; looks 1.2 / 0.8 / 0.6 / 1.1 / 1.2%; smarts 1.1 / 0.1 / 0 / 0 / 0%. Medians stay spread (smarts about 65, looks 47-60, health 81 at 20 falling to 71 at 60). `grinder` (2,000 lives) at ages 30 / 40 / 50 / 60: happiness 31 / 26 / 24 / 26%, health 34 / 22 / 23 / 23%, looks 3 / 7 / 9 / 11%, smarts 11 / 12 / 13 / 17%; median age at death 81.

All profiles (10,000 lives, seed 20260101, 0 faults): median age at death 72 (`random` 74); net worth at 65 median $1.019M (p10 0, p90 $2.86M); degree 36.3%; employment 63.7%; decisions 89.9 / 49.7 / 29.1%; events per year 5.34; every storylet fires. Share at 100 over all profiles at ages 30-60: happiness 2-3%, health 0.1-1.3%, looks under 1%, smarts 10-12% (the `studious` profile; only it exceeds 10%).

## core-loop v10 (#134)

Shared qualities, hidden birth rolls (family wealth, attraction), languages and "Study a language", group-check verbs, role guards, `person-mortality` for human roles, the `remote` flag and a negative-EV lottery. Pack version 9 -> 10.

- **Lottery.** `lottery-ticket` (a $5 ticket, tagged `wager`) paid +$5.25 on average (5% chance of $200, 95% a loss of $5). It now pays $20 at 5%, $100 at 0.9% and $500 at 0.1%, so it returns $2.40 on $5 (expected return 48%, net -$2.60). The harness `Wagers` section reports the realised return: **45.9%** over 13,533 tickets (net -$36,585).
- **Family wealth** is 1 poor / 2 modest / 3 middle / 4 comfortable / 5 wealthy at 15 / 25 / 30 / 20 / 10%, rolled once at the first age-up (a unit test checks the distribution over 1,500 lives). Attraction patterns by gender: about 78% mostly the opposite gender, 8% the same, 10% both, 4% other.
- **Generic NPC mortality** (`person-mortality`, human roles only, same rates as the player's) removes siblings, classmates, coworkers and friends over a life; parents keep `parent-death`. The kick-out chance counts living siblings, so a dead sibling lowers it slightly; the median move-out age did not move.

Result (10,000 lives, seed 20260101, all profiles, `--jobs 4`), v9 -> v10: faults 0; median age at death 73 -> 73 (p10 49, p90 94); net worth at 65 median $1.007M -> $1.004M (p10 $0, p90 $2.87M); degree rate 36.0% -> 36.0%; employment (25-64) 63.8% -> 63.9%; retirement 34.2%; loans with a missed payment 20.4% -> 20.6%, repossessions 2,011; decisions at least 1 / 2 / 3: 89.9 / 49.9 / 29.7% (unchanged); events per year 4.59; every one of 242 storylets fires. "Study a language" is used by `random` only (4,560 uses, at most 2 in a year), so the 11+ and 21+ tiers are covered by the unit test. The baseline figures come from the v6/v7 sections above (the 10,000-life run was on the pre-#148 base). Rebased on v9 (#148, household costs; vacations) a 2,000-life check, seed 20260101: 0 faults, median age at death 73, net worth at 65 median $1.017M, degree 36.4%, employment 64.1%, every storylet fires.

## Fame and looks decline after 40 (#223)

`fame` / `fame_age` / `fame_value` / `add_fame` (see CONTEXT.md): fame decays 5 points a year, lazily; nothing in core-loop grants fame yet, so it changes no life until a Pack (Social) calls `add_fame`.

New yearly event `looks-decline`: age 40+, looks above 0, 40%, `looks -= 1 + (age - 40) / 25` (1 a year at 40-64, 2 at 65-89, 3 from 90), about 0.4-0.8 looks a year. It is sized against the gym curve (`go-to-gym` +2 looks at roughly 70% a session, diminishing after 3 uses a year at 25%, so one or two sessions a year hold looks level): a player who never trains slides about 10 points over 25 years, a gym-goer holds. A first try at 50% and `/ 20` took the median at 65 from 49 (at 40) to 42, steeper than a decline should be. `looks-fade` (30+, looks over 60) is unchanged and now overlaps it for high-looks players.

1,000 lives, seed 20260101, all profiles, 0 faults (pack-delta against main, `core-loop/harness/metrics.yaml` added): median looks at 65 (the age the event bites) on main -> here: all profiles 58 -> 47, `random` (uses the gym) 61 -> 52, `idle` 60 -> 47; at 18 and 40 unchanged to within 1 point (all profiles: 47 / 49 / 47 at 18 / 40 / 65, so looks hold from 40 to 65 instead of rising 9 points). `looks-decline` fires 12.7 times a life; `looks-fade` 6.4 -> 4.6 a life (fewer lives stay above 60); events per year 4.97 -> 5.05; median age at death 73 -> 73. The other flagged rows (gambling and vacations net worth, tier shares, fire rates under -10%) are the year's event cap and stream order shifting with the new event, not a rule change; they are within the 1k noise.
