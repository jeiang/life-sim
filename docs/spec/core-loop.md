# Core loop content (`core-loop` Pack)

Decided in [Core loop content scope](https://github.com/jeiang/life-sim/issues/13). This is the content of the first playable, written as one Pack in the [Pack format](pack-format.md) and shown through the [screens](screens.md). Numbers marked "about" are targets for authoring; the balance harness tunes values such as salaries, prices, and chances.

## Setting

- One generic US-like setting: dollars (`$`, 2 minor-unit digits), US-style first and last names, and US school ages. There is no country model. Relocation and other countries are a later Pack, and multi-currency needs a Core release (ADR 0002).

## Stats and qualities

- Stats: Happiness, Health, Smarts, Looks (0-100; start ranges per BitLife: Happiness 50-100, Health 80-100, Smarts and Looks 0-100).
- Qualities as needed by content (for example `years_worked`, `missed_payments`, `has_degree_<major>`), declared in the manifest.

## Education (occupations, `school` exclusivity group)

| Stage | Ages | Notes |
|---|---|---|
| Elementary school | 6-11 | Automatic |
| High school | 12-17 | Automatic; graduation at 18 |
| University (optional) | 18+, 4 years | 3-4 majors (for example business, engineering, nursing, arts). Tuition each year at settlement, paid in cash or by student loan, chosen at enrolment |

- Verbs (Occupation menu): study harder; drop out (university only).
- Graduate school (medical, law, business) is a later Pack that keys off majors.

## Jobs (occupations, `full-time` and `part-time` exclusivity groups)

About 12 jobs in 4 ladders, each rung with pay, requirements, and a promotion target:

| Ladder | Example rungs | Requirement |
|---|---|---|
| Teen part-time | Cashier, Barista | Age 14+ |
| Service | Server, Shift lead, Restaurant manager | Age 18+ |
| Trades | Apprentice, Electrician, Master electrician | Age 18+, high school |
| Professional | Junior analyst, Analyst, Senior analyst (or per major) | Matching degree |

- Applying from the job board opens a two-question interview chain (`next:`), and the hire outcome is weighted by stats.
- Yearly verbs: work harder, ask for a raise, quit.
- Retirement at 60+: ends the job and starts a `Retired` occupation that pays a yearly pension based on years worked.

## People

- At birth: two parents and 0-2 siblings, generated from Pack data.
- At school start: 2-3 classmates. At job start: 2 coworkers.
- Verbs (Relationships menu, profile): spend time, conversation, ask for money (family), befriend (classmates, coworkers).
- NPC yearly pass: aging, stat drift, and a few NPC storylets (for example a parent's illness or death).
- No dating, marriage, or children (later Pack).

## Shop and assets (`assets/shopping`)

About 10 item kinds, bought through the purchase dialog:

| Category | Items | Loan kind |
|---|---|---|
| Vehicles | Used bike, used car, new car | Auto loan (cars) |
| Homes | Studio condo, house, big house | Mortgage |
| Stuff | Phone, computer, jewellery, instrument | None (cash only) |

- Asset values change each year at settlement (vehicles depreciate, homes appreciate slightly).
- Selling an asset returns its current value.

## Loans

- Kinds: student loan, auto loan, mortgage. Each kind has a fixed rate and term; the payment is a fixed yearly amount deducted at settlement.
- A loan can be secured by the asset it bought (auto loan, mortgage); a student loan is unsecured.
- Settlement (Core) handles default. When cash is short, it takes what cash there is, adds the shortfall to the balance, and increments the loan's consecutive-miss count, which expressions read as `loan.missed`. A full payment resets it to 0. At 3 consecutive misses, settlement repossesses the secured asset: it removes the asset, applies its current value to the balance, and writes a journal line. Any remaining balance stays as debt. An unsecured loan keeps accruing misses.
- The Pack's "missed payment" event (`when: loan.missed > 0`) supplies the story and the happiness penalty. Repossession itself is Core behaviour, not a storylet effect, so the closed effect set (ADR 0002) needs no new effect.

## Cities and living situation (`cities`, `assets/housing`)

- Six cities with cost indexes from 70% to 180% and birth weights. A life is born in a weighted-random city; its parents and siblings live there. The cost index scales [living costs](#standards-of-living-standards-assetshousing); the wage index scales pay.
- Living situation: with parents (free) or on your own. Actions in `assets/housing`: **Move out** (age 18+, while living with parents) and **Move to another city** (on your own, one-off $2,500, one choice per other city, or stay).
- **Kicked out:** from 18, while living with parents, the yearly chance (`parents-ask-you-to-leave`) is 1% plus 0.04% per point of missing parent closeness, plus 0.75% per living sibling, plus 1.5% per step of parental impatience (one step per year after 30, capped at 10 steps, so +15%). The player is never forced out automatically. All of these numbers sit in that storylet's `chance`, so a later cultural pack can change them.
- When no parent is alive, living with parents ends at the next age-up.
- The profile shows the city and the living situation. Journal lines: moved out, asked to leave, moved to a city.
- Siblings are not modelled as leaving home: every living sibling counts as still at home.

## Standards of living (`standards`, `assets/housing`)

- Seven standards: homeless, thrifty, average, above average, wealthy, rich, ultra-rich, with base yearly costs of $0, $9k, $18k, $32k, $60k, $120k and $300k at a 100% cost index, scaled by the city cost index. Lower standards cost happiness and health every year and raise illness and death chances (homeless 115%, thrifty 105%); higher ones add happiness and health up to a cap and lower the risk.
- An owned home in the current city removes 40% of the cost. The **Standard of living** action sets the standard at any time (choices you cannot afford are hidden). On moving out the default is average, or the best affordable.
- Charged at age-up while on your own, after pay. Short of savings, the player lives the best standard they can afford that year (a journal line), and the chosen standard is tried again next year. Money never goes negative.
- Salaries are gross pay (about $6k for a teen cashier to $115k for a senior engineer at a 100% wage index), multiplied by the current city's wage index (80% to 150%). Pensions, raises and the windfall raise bonus are scaled the same way.
- The profile shows the current standard and its yearly cost. Harness numbers and targets are in [BALANCE.md](../../packs/core-loop/BALANCE.md).

## Activities (`activities`)

Gym, library, doctor, meditate, take a walk, and the job board. Each is an action storylet with age gates and stat effects. No casino; the amount picker is first used by the gambling Pack.

## Storylets

About 60, plus NPC and mortality storylets:

| Kind | Count | Examples |
|---|---|---|
| Flavour events (weighted) | About 30, spread across childhood, teens, adulthood, old age | Learned to ride a bike; bad haircut |
| Chance events | About 15 | Illness, windfall, accident, lottery scratch-card win |
| Choice events | About 15, some with `next:` chains | Found wallet; a friend asks for a loan |

## Death and the end of a life

- A mortality storylet whose yearly chance rises with age and falls with health, plus a few accident and illness deaths among the chance events.
- Death shows an obituary (age, cause, net worth, career, education), then the life moves to the graveyard. There is no heir and no continue-as-child.

## Chart

The first chart series is net worth over age (cash plus asset values minus loan balances), shown from the Assets menu and the player profile.
