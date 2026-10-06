# Pack format

Decided in [Pack format and expression language](https://github.com/jeiang/life-sim/issues/10). Terms follow [CONTEXT.md](../../CONTEXT.md). Exact field-level schemas are defined in code (TypeBox) during the build; this document fixes the shape and the rules.

## Files

```
packs/<pack-id>/
  pack.yaml                  # manifest
  storylets/<topic>.yaml     # list of storylets
  occupations/<topic>.yaml   # occupation kinds
  items/<topic>.yaml         # item kinds
  people/<topic>.yaml        # people-generation data (names, stat ranges, roles)
  loans/<topic>.yaml         # loan kinds
  cities/<topic>.yaml        # cities (see Cities)
  standards/<topic>.yaml     # standards of living (see Standards of living)
```

- YAML 1.2 only, read with a strict parser (no implicit `yes`/`no` booleans, no duplicate keys).
- A file holds many items of one kind. Every item has an explicit `id`, unique within its Pack.
- Full ids are namespaced: `<pack-id>/<id>` (for example `core-loop/first-job-offer`). Inside its own Pack, an item may use the short id.

## Manifest (`pack.yaml`)

| Field | Meaning |
|---|---|
| `id`, `version` | Pack id and integer version. Saves record the version. |
| `depends` | Pack ids this Pack references. Only these can be referenced. |
| `currency` | Symbol and minor-unit digits (only in the Pack that sets the currency). |
| `stats` | Declared stats: id, label, icon, start range. Always 0 to 100. |
| `qualities` | Declared qualities: id, type (`int` with optional min/max, or `flag`), default. |
| `living` | Living costs: `default` (standard chosen on moving out), `housing_share` (percent of the cost an owned home removes) `home_category` (item kind category that counts as a home) and an optional `household` block (see Household costs). Needs `standards`. |
| `exclusivity` | Occupation exclusivity groups (for example `school`, `full-time`). |
| `repeat` | Default curve for repeatable actions: `{ full: 10, reduced: 20, factor: 25% }` (see Repeatable actions). Any field left out takes the value shown. The first manifest that sets it wins. |
| `year` | Only Pack `core-loop` may declare this block or the `family` block (any other Pack declaring either is a compile error). Event draw settings: flavour slot count range and the yearly event cap, `decisions` / `decisions_min_age` (decision slots per year, see Year draw), plus optional `quiet` lines the Core journals for a year in which nothing else happened (every age gets a journal group). |
| `npc_careers` | Only Pack `core-loop`. Who gets a simulated career and how it runs: `roles`, `start_age`, `retire_age`, `group` (exclusivity group of NPC jobs), `retired` (pension kind), yearly percents `hire`, `promotion`, `job_loss`, ascending `tiers` (yearly-income thresholds in minor units), `education` (flag qualities rolled once at career start, each with `chance` and optional `needs`). See [NPC careers](#npc-careers). |
| `migrations` | Renamed ids (`old -> new`) and removed ids (with a fallback). |

## Composition

- Add-only. A Pack can add content and reference ids from the Packs it depends on. It cannot override or patch another Pack's content.
- Stat and quality ids are bare and shared by every loaded Pack, so no two Packs may declare the same one. The compiler (and `indexBundles` at load) rejects a duplicate with an error naming both Packs and the id. Convention: a Pack prefixes its own qualities with its short name (`vac_`, `gambling_`, `moved_`). A quality several Packs need (for example `criminal_record`) is declared once in `core-loop`, and other Packs depend on `core-loop` and use it.
- Content ids are permanent. A shipped id that disappears without a migration entry fails the build (compared against the previous release's id list).

## Storylet

```yaml
# packs/core-loop/storylets/work.yaml
- id: first-job-offer
  icon: 💼
  trigger: event              # event | action
  chance: 4%                  # life event: absolute yearly roll
  when: age >= 16 and not has_occupation(job) and stat.smarts >= 30
  once: true
  text: "{player.first_name}, a local shop offers you a part-time job as a cashier."
  choices:
    - label: Accept
      outcomes:
        - weight: 80 + stat.looks / 5
          text: You start next week.
          effects:
            - start_occupation(job/cashier)
            - stat.happiness += 5
        - weight: 20
          text: The offer falls through.
          next: job-hunt-tips    # chained follow-up storylet
    - label: Decline
```

| Field | Meaning |
|---|---|
| `id`, `icon`, `tags` | Identity; optional icon (see Icons); free tags for grouping. `custody-ok` is a Core-owned tag: see [Confinement](#confinement). |
| `trigger` | `event` (drawn at age-up) or `action` (offered in a menu). |
| `menu` | For actions: the menu path, `<top>` or `<top>/<submenu>`, where the top is one of `occupation`, `assets`, `relationships`, `activities` (see [screens](screens.md#menu-ids)). |
| `scope` | Optional binding, evaluated once per bound item. `loan` (events only): once per loan the player holds, with `loan` bound (for example a missed-payment event). `person`: once per non-player person during the NPC yearly pass, with `person` bound (NPC storylets); on an action, the UI offers it for a chosen person. `die(...)` kills the bound person, and `relationship(person).closeness += n` changes the tie to them. Without `scope`, only the player and storylet-local names are in scope. |
| `target` | With `scope: person`: role ids the person must hold toward the player (for example `[core-loop/parent]`). `person.role`, `person.alive` and `person.age` are readable. |
| `when` | Eligibility condition (boolean expression). |
| `chance` | Event that rolls independently each year at this probability. |
| `weight` | Event that competes for a flavour slot with this weight. An event has exactly one of `chance` or `weight`. |
| `once`, `cooldown`, `max_per_life` | Repeat limits. |
| `repeatable`, `repeat` | Actions only. `repeatable: true` lets the action be done many times a year with diminishing returns (see Repeatable actions); it has no `cooldown`. `repeat` overrides the manifest curve field by field. |
| `amount` | Actions only: `{ min, max, step }`, integer expressions over the player (`step` defaults to 1, below 1 counts as 1), evaluated when the menu lists the action. The player picks an amount (money, minor units) from the shared picker before the action runs. `amount` is then bound in choice and outcome `when`, `weight`, effects and text (`{amount}` renders as money), and in no other field, including the storylet's own `when`, `text` and the range expressions. An action whose `min` exceeds the player's money is disabled. `next` does not carry the amount, so the compiler rejects a `next` that targets a storylet with an `amount`. See ADR 0005. |
| `text` | Inline English, with `{placeholders}`. |
| `choices` | Zero or more. Each has `label`, optional `when`, and `outcomes`. With no choices, the storylet has a single `outcomes` list. |
| `outcomes` | Weighted list. Each has `weight`, optional `when`, `text`, `effects`, and optional `next`. |
| `next` | Storylet id opened immediately after this outcome, for multi-step scenes. |

## Market kinds

An item kind with a `market` block is traded by amount instead of bought (no `price`, `value` or `loan`; `requires` gates buying). The shop never lists it. Its price series lives on the world, one point per **world year** (a function of the seed and year only, so an heir does not replay prices), and the next year's return is drawn in advance and stored (`forecast`).

```yaml
# items/market.yaml
- id: total-market
  label: Total market fund
  category: investments
  market:
    start: 10000        # price of one whole unit, minor units
    drift: 5%           # mean yearly return (may be negative)
    vol: 15%            # standard deviation of the yearly return
    crash: { chance: 5%, drop: 30% }       # optional
- id: acme
  label: Acme
  category: investments
  market:
    start: 2500
    drift: 1%
    vol: 25%
    beta: { of: total-market, factor: 120% }   # adds 120% of that kind's return; no loops
    jump: { chance: 2%, multiple: 10 }          # optional: price x10
    delist: 3%                                  # optional: price falls to 0 for good
- id: gov-bond-5
  label: Government bond (5 years)
  category: investments
  market:
    start: 10000
    drift: 0%
    vol: 1%
    bond: { term: 5, coupon: 3%, default: 0.5%, loss: 100% }
```

Return of a year: `drift + vol x shock + factor x (return of beta.of)`, minus `crash.drop` when the crash rolls, then the price is multiplied by `jump.multiple` when the jump rolls. All of it is the stored forecast. At settlement the price applies the forecast, then `delist` and the bond `default` roll (not part of the forecast).

**Government bonds** (`bond`): each settlement pays `coupon` on the remaining principal (`units x start`); the holding records its maturity (world year of the first purchase + `term`) and at maturity the principal is paid and the holding closes. A bond sells early at the market price. The issuer's yearly `default` chance is Pack data (a later country can set its own); a default takes `loss` (default 100%) off the remaining principal and the price, and coupons and principal follow the reduced figure. Buying more of a held bond keeps the first maturity.

Units are fixed point, 10,000 per whole unit. Names: `portfolio` (value of all the player's holdings). Functions (market kind ids): `price(k)`, `change(k)` (one-year change, basis points), `units(k)`, `holding_value(k)`, `cost_basis(k)`, `holding_years(k)`, `forecast(k)` (basis points). Effects: `trade(k, amount)`, and `grant_asset` / `remove_asset` accept market kinds.

## Cities

```yaml
# packs/core-loop/cities/cities.yaml
- id: harborview
  label: Harborview
  icon: ⚓
  cost_index: 85%     # cost of living relative to the baseline (compiled to basis points, must be above 0%)
  weight: 18          # share of the birth-city draw (integer, 1 or more)
  wage_index: 90%     # optional pay multiplier for working here, default 100%
  country: us         # optional; a plain string for now, countries are not content yet
```

Every life has a city (`Person.cityId`) and a living situation (`Person.withParents`). A new life draws its birth city by `weight` (purpose key `birth/city`), or takes the `cityId` start option (full id; god mode uses it). The family is placed in the same city and the player starts living with their parents. A city is a place only: countries, a wage index and law tags belong to the Relocation Pack, which extends this kind.

Names: `city.cost_index` (basis points, 10000 = 100%; 10000 when the life has no city), `city.id` (an id, compare with `==`), `city.label`, `city.wage_index` (basis points, 10000 when unset; pay expressions multiply by it), `city.country` (the optional `country` string, empty when unset), and `living.with_parents` (bool, true while the life lives with its parents). The names `city` and `living` are reserved.

Living with parents also ends by itself, with a journal line, once no parent is alive (checked after the NPC pass of each age-up). Nothing else moves the player out: kicks and moves are storylets.

## Standards of living

```yaml
# packs/core-loop/standards/standards.yaml
- { id: average, label: Average, icon: 🏘️, cost: 1800000, happiness: 0, health: 0, risk: 100% }
- { id: wealthy, label: Wealthy, icon: 🍷, cost: 6000000, happiness: 2, health: 1, cap: 90, risk: 90% }
```

| Field | Meaning |
|---|---|
| `cost` | Base yearly cost, minor units, before the city cost index. `0` for homeless. Standards are ordered by `cost`. |
| `happiness`, `health` | Change to the player's stat each year. A positive change stops at `cap` (default 100; a stat already above it is left alone); a negative one always applies. |
| `risk` | Multiplier for illness and death chances, as a percent (100% is neutral). Expressions read it as `living.risk` (basis points), for example `chance: 900 * living.risk / 10000`. |

The player on their own pays at settlement (after occupations pay, before loans): `cost x city cost index`, less `living.housing_share` of it when they own a home (an item of category `living.home_category`) in their current city. Homes record the city they were bought in; older saves read it as the owner's city. Moving does not sell a home, and a home in another city gives no waiver.

The player chooses a standard (`set_standard(id)`, or the **Standard of living** action); moving out takes `living.default`, or the best standard they can afford. When savings cannot cover the chosen standard, they live the best one they can afford for that year, down to the cheapest (journaled), and the next age-up tries the chosen one again. Living costs never make money negative. Nothing is charged with parents or to a player under 18 (a minor whose last parent has died is not charged; a guardian situation comes later). The lived standard's `happiness` and `health` then apply.

An occupation with `provides_housing: true` (for prison, boarding school, military) waives all of this while it is held: no cost, no standard effects, and `living.risk` reads 100%.

## Confinement

An occupation with `confines: { menus, events }` (for prison, hospital; at least one `true`) confines the player while it is held. Core then:

- locks content by whitelist: with `menus: true`, an action storylet can run only if it carries the Core-owned tag `custody-ok` (other actions show locked, "Not allowed while confined"), and the shop is locked (rows and sales); with `events: true`, only events tagged `custody-ok` are drawn (including NPC and loan-scoped events). New menus and events lock by default;
- provides housing, as `provides_housing: true` does (no living cost, no standard effects, `living.risk` reads 100%); the living situation itself is unchanged.

`start_occupation` and `end_occupation` still apply to the player; tag the actions that start or end confinement `custody-ok`. A `next:` chain is not checked after its first storylet opens. Several confining occupations combine: a lock applies when any of them sets it. The boolean name `confined` is true while the player holds any confining occupation, so other Packs' pay, schools and events can react (for example `when: not confined`).

Names: `living.standard` (id of the lived standard), `living.cost` (this year's cost, 0 with parents or provided housing), `living.risk`. Function `standard_cost(standard)`: what that standard would cost the player now (city index and home waiver applied), for example `when: standard_cost(core-loop/rich) <= money`.
## NPC careers

Entry kinds are the occupation kinds of `npc_careers.group` that no kind promotes to. A kind with `npc: false`, `confines`, `provides_housing`, `duration_years` or `loan` is never given to an NPC, nor is the `retired` kind outside retirement. Pay expressions run with the NPC as subject: `quality.*` reads their own qualities (so `raise_bonus` is 0) and `city.wage_index` their city (100% without one). A `kind: generator` item may list `jobs: [{ label, tier }]`; a spawned person gets one at random as a static job (no career), and its tier counts the same thresholds as `person.income_tier`: the number of `tiers` that yearly income (held pay, or the static tier's threshold, plus a twentieth of their money) reaches.

## Repeatable actions

A normal action is limited by `once`, `cooldown` or `max_per_life`. An action with `repeatable: true` has no `cooldown` (a build error) and stays selectable all year; its returns diminish instead. The Core counts uses per action storylet per year, and per bound person for `scope: person` actions (time with Mom and time with Dad count separately). The counters are life state (`World.uses`), reset at every age-up, rebuilt by replaying the choice log and part of the world hash.

With the curve `{ full: F, reduced: R, factor: P }`:

| Use in the year | Gains kept |
|---|---|
| 1 to F | all |
| F+1 to R | P (default 25%) |
| R+1 and later | none |

Only **gains** shrink: positive `stat.x += n` (and `-= -n`) deltas and positive `relationship(p).closeness +=` deltas, each rounded toward zero. Money never scales (pay, prizes and costs apply in full), nor do costs, negative deltas, quality changes, `stat.x = n`, flags, journal lines, spawned people or any other effect, so repeating never gets safer. A storylet chained with `next` (also across a choice, and in a saved pending choice) keeps the factor of the repeatable action that led to it, so its gains shrink at the same use count; a chained storylet that is itself repeatable takes the smaller of the two factors.

From use F+1 the Core adds "You are getting tired of this." to the outcome text; from use R+1 it adds "It no longer helps this year." Packs can write their own with `uses_this_year`.

`uses_this_year` (integer, readable in any storylet expression and text) is the number of uses of this storylet (and person) so far this year. In `when` it is the count before this use; once the action opens (its `text`, outcome `when`/`weight`/`text`/effects) it includes the current use, so the 11th use reads 11. It is 0 for non-repeatable storylets.

### Household costs

The optional `living.household` block of `pack.yaml` makes the living cost depend on who lives with the player:

```yaml
living:
  default: average
  housing_share: 40%
  home_category: homes
  household:
    dependent_role: child     # role of the people the player supports at home
    dependent_cost: 400000    # base yearly cost per dependent at home, minor units, before the city cost index
    partner_role: partner     # role of a partner who can move in and share costs
    partner_share: 50%        # share of the standard's cost (after the home's housing share) the partner pays
    guardian_roles: [sibling] # adult relatives a guardian is drawn from (only named in the journal)
```

- **Dependents:** each living person the player holds `dependent_role` toward who still lives with their parents (under 18, or `withParents`) adds `dependent_cost x city cost index`. The term disappears when the child moves out or dies.
- **Partner sharing:** `move_in()` (in a `scope: person` storylet bound to the partner) marks the player's link to that partner as living together. At settlement the partner pays `partner_share` of the standard's cost from their own money, up to what they have; the player pays the rest. `merge_money()` (same scope) moves the partner's money to the player and marks the link merged: no separate share is charged afterwards (marriage without a prenup). A prenup simply never calls it.
- **With guardian:** a minor with no living parent (the last parent died, god mode with no parents, a minor heir) lives with a guardian (`Person.withGuardian`). `move_out()` never applies under 18, it takes this path instead. The cost is waived (the same hook as `provides_housing`, so no standard, no standard effects, `living.risk` reads 100%), and the minor's money and assets sit in trust: the shop is closed until 18. At 18 the guardian situation ends and the player is on their own with the default (or best affordable) standard.
- Standard effects and `living.risk` never apply below 18.

Names: `living.dependents` (dependents at home), `living.with_guardian`. `living.cost` and `standard_cost(standard)` include both household terms.

## Year draw

At each age-up, after settlement (ADR 0003):

1. Every eligible event with `chance` rolls independently.
2. If the manifest declares `year.decisions`, the Core draws **decision slots** (below). Choice events (storylets with `choices`) then no longer compete for flavour slots; they come only from chance rolls and decision slots.
3. The Core then draws flavour slots (count from the manifest range) by `weight` from the eligible weighted events.
4. The yearly cap from the manifest limits the total. When the cap is reached, chance events are kept first, then decisions, then flavour events. If the chance hits alone exceed the cap, the survivors are a uniform random choice among the hits (purpose keys `year/chance-cap/<i>`), not id order, so no Pack is favoured; they are then delivered in id order. Nothing is drawn when the hits fit under the cap. The balance harness reports the chance events dropped by the cap per Pack.

### Decision slots

`year.decisions` is the list of "at least" probabilities: `[90%, 50%, 30%]` means P(at least 1 decision) = 90%, P(at least 2) = 50%, P(at least 3) = 30%. Probabilities must not increase. `year.decisions_min_age` (default 0) is the age reached from which slots roll; before it there are no decision slots.

Slots chain. Slot 1 fires with probability p1. Slot k rolls only if slot k-1 fired, and fires with probability p_k / p_(k-1) (slot 2: 50/90, slot 3: 30/50), so the run of fired slots reaches k with probability exactly p_k. Each roll has its own stable RNG purpose key, `decision-slot/<k>`.

Choice events that hit in the chance pass count toward the fired slots. Each remaining fired slot draws one eligible choice event with a `weight` (respecting `when`, `once`, `cooldown`, `max_per_life`; no storylet twice in a year; purpose key `decision-pick/<n>`). A fired slot with nothing eligible stays empty. Chance events can add decisions beyond the slots, so the delivered 'at least' rates are never below the targets.

The queued decisions open one after another: the player resolves each (and its `next:` chain) and the next opens. The life cannot age up until the queue is empty.

## Expressions

One small custom language is used for `when`, `weight`, `chance`, and effect statements (ADR 0004).

- Literals: integers, percents (`2.5%`, compiled to basis points out of 10,000), strings, booleans, and content ids (`job/cashier`).
- Operators: `+ - * /`, `mod` (modulo; `%` is used only by percent literals), comparisons, `and or not`, `in`, and the ternary `a ? b : c`.
- Names (scope `person` also has `person.role` as a content id, `person.alive`, and the read-only `person.closeness`, the player's highest closeness to them across their role rows, 0 with no tie; bound people have `<name>.closeness` too): `age`, `money`, `uses_this_year` (storylets), `confined` (boolean, see [Confinement](#confinement)), `stat.<id>`, `quality.<id>`, `loan.<field>` (`balance`, `payment`, `missed`) in storylets with `scope: loan`, and other scoped references inside storylets (for example `person.<field>` for a spawned person).
- Functions: a fixed whitelist (for example `min`, `max`, `clamp`, `has`, `has_occupation`, `owns`, `years_in`, `in_group`, `years_in_group`, `role_closeness(role)`: average closeness to the living people the player holds that role toward, 0 with none (an aggregate over a role, unlike `person.closeness`, which reads one person); `count_role(role, min, max)`: living people the player holds that role toward with closeness in `[min, max]`, inclusive). No user-defined functions and no loops.
- Group checks: `in_group(g)` is true while the player holds an occupation whose `group` is `g`; `years_in_group(g)` sums completed years over every occupation in `g`, held or ended (0 if none; an occupation ended within its first year adds 0). `g` must be an exclusivity group declared by the Pack or a dependency: a bare word (`in_group(school)`) or, for hyphenated names, a string (`in_group("full-time")`). There is no `end_group` effect and no `ends_groups` field; packs end occupations explicitly with `end_occupation`. Group names are not content ids, so the ids lock is unaffected.
- Integer-only. `/` truncates toward zero. A constant zero divisor is a build error. At runtime, division by zero gives 0 and overflow clamps to the safe-integer range. Dev builds and the balance harness assert on both.
- No randomness inside expressions. Rolls happen only for `chance` and `weight`, and each roll site's RNG purpose key comes from the content id.

### Text variants for 18+ mode

`mature_text` on a storylet or an outcome, and `mature_label` on a choice, replace `text` / `label` in a life that began with the player's 18+ mode switch on. The switch is recorded in the life at its start (a leading `mature` choice log entry), never read live, so replay is unaffected by later changes to the setting. There is no `mature` expression name: using it in `when`, `weight`, `chance`, effects or a placeholder is a compile error ("unknown name 'mature'"). Variants take the same `{placeholders}` as the plain text.

### Effect statements

Each statement maps to one effect in the closed Core set (ADR 0002):

```
stat.<id> += n | -= n | = n          quality.<id> += n | = v
money += n | -= n                    take_loan(loan-kind, principal)
grant_asset(item-kind) | remove_asset(item-kind)
start_occupation(kind) | end_occupation(kind)
spawn_person(role, generator) as <name>
relationship(<person>).closeness += n
move_to(city)                        move_out()
set_standard(standard)
relationship(<person>).role = role   (replaces all the player's role rows toward them; keeps the highest closeness)
move_in()                            merge_money()
journal("text")                      die("cause")
```

A `kind: generator` item in `people/` sets `first_names` (a list used for every gender, or `{ male: [...], female: [...] }` pools where non-binary people draw from both), `last_names`, `age`, optional `stats`, and an optional `gender`: a fixed value (`gender: female`) or integer weights (`gender: { male: 1, female: 3 }`; omitted genders weigh 0; default male 1, female 1). A spawned person's gender is drawn from these weights and their first name from that gender's pool, so a Pack can spawn a person of a chosen gender.

`person.money += n | -= n` (only in `scope: person`) changes that person's money, not the player's; no other `person.*` name can be assigned.

`move_to(city)` puts the player in a city (family and everyone else stay); `move_in()` and `merge_money()` (in `scope: person`, bound to a partner) move a partner in and merge their money; `move_out()` ends living with parents (under 18 a guardian takes over instead) and picks the starting standard of living; `set_standard(standard)` chooses one (ignored with parents).

## Text

- Inline English. Placeholders (`{player.first_name}`, `{money}`, or a person bound by `spawn_person(...) as <name>`) are checked at build time against what is in scope. Every person reference (`player`, `person`, a bound name) also has pronoun placeholders from that person's gender: `{n.subject}` (he/she/they), `{n.object}` (him/her/them), `{n.possessive}` (his/her/their), and capitalised `{n.Subject}`, `{n.Object}`, `{n.Possessive}` for sentence starts. A person with no gender (old saves) reads as they/them/their. Expressions read `player.gender` and `person.gender` (or `<name>.gender`) as the string `"male"`, `"female"` or `"nonbinary"` (empty when absent), for example `person.gender == "female"`. Pronouns do not conjugate verbs, so write text that works for "they" (past tense, or "{n.first_name} says").
- Localization later extracts strings keyed by content id and field path. Keyed text is not required now.

## Icons

Optional `icon`: a literal emoji (Twemoji subset) or `gameicons/<author>/<name>`. Lucide ids are rejected in Packs. The build copies only referenced icons and writes the credits manifest ([Emoji and icon policy](https://github.com/jeiang/life-sim/issues/17)).

## Build checks

The Pack compiler (Node, at build time) fails on any of:

- YAML syntax errors, schema violations (TypeBox), or duplicate ids.
- Expressions that fail to parse, reference undeclared names, or have type errors (for example an integer where a boolean is needed).
- Undeclared Pack dependencies, or dangling ids in references, `next`, or effects.
- Unknown placeholders or unknown icons.
- Ids removed or renamed without a migration entry.

The output is one JSON bundle per Pack (validated content plus expression ASTs), the icon subset, and the credits manifest.
