# Core loop content (`core-loop` Pack)

Decided in [Core loop content scope](https://github.com/jeiang/life-sim/issues/13). This is the content of the first playable, written as one Pack in the [Pack format](pack-format/index.md) and shown through the [screens](screens.md). Numbers marked "about" are targets for authoring; the balance harness tunes values such as salaries, prices, and chances.

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

- Verbs (Occupation menu): study harder (any `school` group occupation); drop out (core-loop university only). Graduation also ends the school occupation explicitly with `end_occupation`, so a school ends cleanly even when it did not run to its `duration_years`. Enrolment is closed while `in_group("school")`.
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
- Yearly verbs: work harder, ask for a raise, quit. Work harder and ask for a raise are gated on the groups (`in_group("full-time")` without `Retired`, or `in_group("part-time")`), so any Pack's jobs get them; the `apply-*` jobs need `not in_group("full-time")` (part-time ones `not in_group("part-time")`), so applying never silently ends a job from another Pack, and the analyst, engineer and nurse applications also need no `crime_record`. Quit still names core-loop jobs: other Packs ship their own quit action.
- Retirement at 60+: starts the `Retired` occupation (same `full-time` group, so it ends any full-time job) and ends the part-time core-loop jobs. The pension is based on `years_in_group("full-time") + years_in_group("part-time")`.

## People

- At birth: two parents and 0-2 siblings, generated from Pack data.
- Every generated person, the player included, gets a gender, drawn from the same stream as their other traits (male or female with equal weight unless the generator sets `gender`; see the pack-format spec). The first name is chosen from the pool for that gender: the first-name roll keeps its place in the stream and the gender draw comes last. Text uses it through pronoun placeholders; people without a gender (old saves) read as neutral (they/them/their). Nonbinary is chosen only in god mode (#105).
- At school start: 2-3 classmates. At job start: 2 coworkers.
- Verbs (Relationships menu, profile): spend time, conversation, ask for money (family), befriend (classmates, coworkers).
- NPC yearly pass: aging, stat drift, and a few NPC storylets (for example a parent's illness or death).
- Core-loop declares the roles `partner`, `spouse` and `child` (no content creates them yet), so core-loop content can be guarded on them; a later Pack turns people into them with `relationship(p).role = ...`. `dating-app` and `heartbreak` do not fire for a player who has a partner or spouse (heartbreak: a spouse); `grandchild-babysit` and `tell-old-stories` wait until the player is 65 / 75 if a child exists, so a young child never gets the grandparent events.
- NPC storylets are role-targeted: `sibling-*` events target `sibling`, `person-new-job` and `person-checks-in` the human roles that make sense. **Generic mortality** (`person-mortality`) kills people of the human roles (sibling, classmate, coworker, friend, partner, spouse, child) at the same rates as the player (`natural-mortality` from 30, `childhood-mortality` below); parents keep `parent-death` and are not in its targets, and a non-human role added later is simply not listed. A death costs the player `3 + closeness / 8` happiness and adds a journal line.
- No dating, marriage, or children in core-loop itself (later Pack).
- NPC careers: people in the `partner`, `spouse` and (once 18) `child` roles work a real job from the `full-time` group, chosen at the first start among entry rungs they qualify for (degrees are rolled once), paid yearly into their own money (`person.money`). Each year: 3% chance of losing the job (40% yearly hire afterwards), 30% chance to be promoted once the rung's `promotion_years` are served, retirement at 65 into the `retired` pension. Leaving the role (breakup, divorce) keeps the record but stops pay and rolls. A person whose money was merged into the player's (`merge_money()`, marriage without a prenup) pays their earnings to the player; otherwise it stays in `person.money`. Everyone else (parents, siblings, friends, coworkers) has a static job label and income tier from the generator's `jobs` list.

## Shared state for other Packs

Core-loop owns these qualities so no Pack edits core-loop content or rolls its own. None is shown in the UI.

| Quality | Meaning |
|---|---|
| `crime_record` (flag), `crime_wanted` (flag) | Set by Crime. The professional `apply-*` jobs (analyst, engineer, nurse) need no `crime_record`; entry jobs still hire. |
| `crime_pending_charge` (int, 0 = none) | A mailbox: any Pack sets it to a charge code, Crime arrests at the next age-up and resets it. |
| `family_wealth` (int 1-5) | Rolled once, hidden, by `roll-family-wealth` at the first age-up (a life has no events at age 0): 15 / 25 / 30 / 20 / 10% for poor, modest, middle, comfortable, wealthy (default 3 for a life that predates it). Parents' help, weddings, family standing and the parents' household read it. |
| `dating_attracted_men`, `dating_attracted_women`, `dating_attracted_nonbinary` (int 0-100) | Owned by the dating Pack (`dating/attraction`), not core-loop: the player's attraction, rolled once by `dating/roll-attraction` at the first age-up, by the player's gender. NPC attraction comes in a later release. |
| `karma_score` (int 0-100, default 50) | Owned by the karma leaf Pack (`karma/score`, with the readable `karma_value`), not core-loop, which requires it. Hidden. Non-repeatable content (Crime, Dating, Base, and core-loop's own wallet, volunteering, cheating and helping-a-stranger choices) raises or lowers it; a few events read it. Repeatable actions must not write it (a repeated compliment would max it). |
| `reloc_lang_<language>` (int 0-100) | Owned by the relocation Pack (`relocation/languages`), not core-loop: English (default 100), Spanish, French, German, Italian, Japanese, Mandarin, Korean (default 0). `relocation/study-a-language` (`activities/languages`, age 6+, repeatable) raises one; see `packs/relocation/BALANCE.md`. |

Analyst, engineer and designer ladder jobs are `remote`; service, trades and nursing are not.

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
- When no parent is alive, living with parents ends at the next age-up: an adult is on their own, a minor goes to live with a guardian (below).
- The profile shows the city and the living situation. Journal lines: moved out, asked to leave, moved to a city.
- Siblings are not modelled as leaving home: every living sibling counts as still at home.

## Standards of living (`standards`, `assets/housing`)

- Seven standards: homeless, thrifty, average, above average, wealthy, rich, ultra-rich, with base yearly costs of $0, $9k, $18k, $32k, $60k, $120k and $300k at a 100% cost index, scaled by the city cost index. Lower standards cost happiness and health every year and raise illness and death chances (homeless 115%, thrifty 105%); higher ones add happiness and health up to a cap and lower the risk.
- An owned home in the current city removes 40% of the cost. The **Standard of living** action sets the standard at any time (choices you cannot afford are hidden). On moving out the default is average, or the best affordable.
- Charged at age-up while on your own, after pay. Short of savings, the player lives the best standard they can afford that year (a journal line), and the chosen standard is tried again next year. Money never goes negative.
- Salaries are gross pay (about $6k for a teen cashier to $115k for a senior engineer at a 100% wage index), multiplied by the current city's wage index (80% to 150%). Pensions, raises and the windfall raise bonus are scaled the same way.
- The profile shows the current standard and its yearly cost. Harness numbers and targets are in [BALANCE.md](../../packs/core-loop/BALANCE.md).

### Household costs

- A child living at home adds $4,000 a year (scaled by the city cost index) to the player's living cost; it stops when the child moves out or dies.
- A partner who moved in pays 50% of the standard's cost from their own money (up to what they have). Merging a spouse's money into the player's (marriage without a prenup) ends the separate share.
- A minor with no living parent lives **with a guardian**: no living cost, no standard, no illness-risk penalty, and money and assets in trust (no shopping) until 18, when the player is on their own. Moving out never applies under 18. The first living adult sibling is named as guardian in the journal, else just "a guardian".
- The profile lists the dependents and the partner's share in the living cost, and shows "With guardian". Harness: living cost as a share of income by household shape ([BALANCE.md](../../packs/core-loop/BALANCE.md)).

## Confinement

Core-loop ships no confining occupation (prison and hospital come with later Packs), but its content is ready: mortality, illness, loan (missed payment), graduation and NPC events carry the Core tag `custody-ok` and keep running while the player is confined. Everything else (activities, jobs, relationships, housing, the shop) locks by default. See [pack-format](pack-format/content-kinds.md#confinement).

## Activities (`activities`)

Gym, library, doctor, meditate, take a walk, and the job board. Each is an action storylet with age gates and stat effects. No casino; the amount picker is first used by the gambling Pack.

Recreational and social actions are **repeatable** (pack-format: Repeatable actions) under core-loop's curve `{ full: 3, reduced: 8, factor: 25% }`: go to the gym, visit the library, see a doctor, meditate, take a walk, study harder, spend time together and have a conversation. Uses 1-3 in a year give the full effect, 4-8 a quarter of every gain, 9 and later none; costs (the doctor's fee), harms and money are never reduced. Actions that apply, enrol, buy, borrow, quit, ask for money or a raise, take a test, or create or change people (job applications, enrolment, drop out, driving test, work harder, ask for a raise, quit, retire, ask for money, become friends, make a friend) keep their `cooldown` or one-off rules.

### Amount input

An action with `amount` is listed with its resolved range (`ActionRow.amount`) and opens the shared amount picker (modal; keyboard and screen-reader behaviour as in the purchase dialog) before it runs. `runAction(world, bundles, id, target?, amount?)` takes the picked amount and rejects one off the grid. The amount is logged in the `action` choice-log entry and kept in `world.pending.amount` while choices are open. See [ADR 0005](../adr/0005-amount-input-on-actions.md).

## Storylets

About 60, plus NPC and mortality storylets:

| Kind | Count | Examples |
|---|---|---|
| Flavour events (weighted) | About 30, spread across childhood, teens, adulthood, old age | Learned to ride a bike; bad haircut |
| Chance events | About 15 | Illness, windfall, accident |
| Choice events | About 15, some with `next:` chains | Found wallet; a friend asks for a loan |

## Death and the end of a life

- A mortality storylet whose yearly chance rises with age and falls with health, plus a few accident and illness deaths among the chance events.
- Death shows an obituary (age, cause, net worth, career, education). With a living child the player may continue as them ([Succession](#succession)); otherwise, or when the player chooses to finish, the life moves to the graveyard. The Core does not pick: it offers `heirsOf` and `succeed`, and the web flow asks: the obituary screen lists the heirs (`heirsOf`) and offers "Finish this life". The dead life stays in the life list, autosaved, until the player chooses; a reload in between returns to the obituary. Choosing an heir archives the finished generation in the graveyard and stores the heir's world in one transaction; finishing archives it and removes the life.

## Generations and the world clock

- Core carries a generation index (0 for the founder) in every RNG stream derivation, and a world-year counter that advances once per age-up and keeps running across generations. Series read the world year, not the player's age.
- `succeed(world, bundles, heirId)` moves the player pointer to a living child of the dead player: generation +1, and the storylet firing log, roll-site counters and repeatable-action counters reset. See [Succession](#succession).

## Succession

The dead player's life continues as one of their living children, in the same world (same persons, same market and world clock). `heirsOf(world)` lists who may inherit: the player's living children by birth, adoption or marriage (kinship `child` and `step-child`), in person id order; none ends the lineage (`canSucceed` is false). `succeed(world, bundles, heirId)` needs the life ended and returns `{ world, lines }` (the heir's first journal lines). It runs, in order:

1. **The estate** (below).
2. `World.deceased` records the dead player: `{ person, cause, money }` (the cash held at death, before debts). The person stays in the world, dead, with name, stats and qualities.
3. The player pointer moves to the heir and `generation` rises by one; `worldYear` is untouched. `ended`, the open storylet, the will, the reached milestones, `storyletLog`, `uses` and the roll-site counters are cleared, so `once` storylets fire once per generation. The journal restarts with the heir's life; the caller keeps the finished life's obituary and journal before calling.
4. Scheduled consequences: entries without `lineage: true` were dropped at death; the `lineage: true` ones are handed to the heir, except entries bound to the dead player or to the heir.
5. The heir is seated in the family: for each relative, a role row from the heir in the family role their kinship names (`parent`, `sibling`, ...; only roles the Packs declare). Nothing is relabelled: every name is derived from the heir's position ([ADR 0006](../adr/0006-parent-links-derived-kinship.md)), so the dead player is now the heir's parent, the other parent a parent, the other children siblings.
6. The `on_succession` hooks run for the heir (effects act on the heir), then every `trigger: succession` storylet is queued to open at the next age-up, with read-only `deceased.*` bound ([hooks](pack-format/hooks.md#succession), [storylets](pack-format/storylets.md#succession-storylets)).
7. The choice log gets a `succeed` entry, so replay reproduces it (the heir's draws use generation `n + 1`, [ADR 0003](../adr/0003-saves-derived-rng-stable-ids.md)).

### The estate

Settled in `succeed`, before the heir takes over. No estate tax (a Pack may add one later, with its own settlement line).

- **Unsecured debts** (loans that secure no asset the dead player owns) are paid from the cash, in loan id order; a shortfall is written off.
- **Secured loans** (a mortgage, a car loan) travel with their asset to an adult (18+) heir, keeping their balance and missed payments. For a minor heir the asset is sold at its value instead: the loan is repaid from the proceeds, a surplus joins the cash, a shortfall is written off.
- **Other assets and investment holdings** pass whole to the heir, with no forced sale and whatever the will says; an asset keeps its age (`asset.years`) and a holding its start (`holding_years`), and a holding of a kind the heir already has merges with it. The dead player keeps nothing.
- **Cash** left after debts is divided by the **will** (`set_will` / `will_heir`, [state](pack-format/state.md#the-will)): leave all to one named person (`heir`), split evenly among the children (`even`), all to the living spouse (`spouse`) or to charity (`charity`, the cash goes to nobody). With no will, or one that cannot be carried out (the named person is dead, no living spouse to leave it to), the no-will rule applies: a living spouse gets half and the children split the rest evenly; with no living spouse the children get it all. An uneven division gives the remainder to the succeeding heir. The spouse is a living person the dead player has a `spouse` role toward; their share is added to their own money (NPC money, #131).
- A minor heir's money and assets sit in trust under the guardian rules (above). Choosing the guardian is #222; trust release at 18 and the other minor-heir rules are #221.

## Market and holdings

The Assets menu has an **Investments** screen (`assets/investments`, age 18+, shown when a loaded Pack has market kinds): per kind the price, one-year change and holding. A row opens the price chart (by world year) with Buy, Sell and Sell all; Buy and Sell use the shared amount picker (whole currency units). Each trade is a `trade` choice-log entry and a journal line. Trading is locked while confined. Holdings count in net worth. Shortfall at settlement does not sell holdings (epic #57); `tradeHolding` lets later Core code do it. See [pack-format](pack-format/content-kinds.md#market-kinds).

## Chart

The first chart series is net worth over age (cash plus asset values minus loan balances), shown from the Assets menu and the player profile.
