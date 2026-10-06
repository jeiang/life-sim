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
| `living` | Living costs: `default` (standard chosen on moving out), `housing_share` (percent of the cost an owned home removes) and `home_category` (item kind category that counts as a home). Needs `standards`. |
| `exclusivity` | Occupation exclusivity groups (for example `school`, `full-time`). |
| `year` | Event draw settings: flavour slot count range and the yearly event cap, `decisions` / `decisions_min_age` (decision slots per year, see Year draw), plus optional `quiet` lines the Core journals for a year in which nothing else happened (every age gets a journal group). |
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
| `id`, `icon`, `tags` | Identity; optional icon (see Icons); free tags for grouping. |
| `trigger` | `event` (drawn at age-up) or `action` (offered in a menu). |
| `menu` | For actions: the menu path, `<top>` or `<top>/<submenu>`, where the top is one of `occupation`, `assets`, `relationships`, `activities` (see [screens](screens.md#menu-ids)). |
| `scope` | Optional binding, evaluated once per bound item. `loan` (events only): once per loan the player holds, with `loan` bound (for example a missed-payment event). `person`: once per non-player person during the NPC yearly pass, with `person` bound (NPC storylets); on an action, the UI offers it for a chosen person. `die(...)` kills the bound person, and `relationship(person).closeness += n` changes the tie to them. Without `scope`, only the player and storylet-local names are in scope. |
| `target` | With `scope: person`: role ids the person must hold toward the player (for example `[core-loop/parent]`). `person.role`, `person.alive` and `person.age` are readable. |
| `when` | Eligibility condition (boolean expression). |
| `chance` | Event that rolls independently each year at this probability. |
| `weight` | Event that competes for a flavour slot with this weight. An event has exactly one of `chance` or `weight`. |
| `once`, `cooldown`, `max_per_life` | Repeat limits. |
| `text` | Inline English, with `{placeholders}`. |
| `choices` | Zero or more. Each has `label`, optional `when`, and `outcomes`. With no choices, the storylet has a single `outcomes` list. |
| `outcomes` | Weighted list. Each has `weight`, optional `when`, `text`, `effects`, and optional `next`. |
| `next` | Storylet id opened immediately after this outcome, for multi-step scenes. |

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

Names: `living.standard` (id of the lived standard), `living.cost` (this year's cost, 0 with parents or provided housing), `living.risk`. Function `standard_cost(standard)`: what that standard would cost the player now (city index and home waiver applied), for example `when: standard_cost(core-loop/rich) <= money`.

## Year draw

At each age-up, after settlement (ADR 0003):

1. Every eligible event with `chance` rolls independently.
2. If the manifest declares `year.decisions`, the Core draws **decision slots** (below). Choice events (storylets with `choices`) then no longer compete for flavour slots; they come only from chance rolls and decision slots.
3. The Core then draws flavour slots (count from the manifest range) by `weight` from the eligible weighted events.
4. The yearly cap from the manifest limits the total. When the cap is reached, chance events are kept first, then decisions, then flavour events, in id order.

### Decision slots

`year.decisions` is the list of "at least" probabilities: `[90%, 50%, 30%]` means P(at least 1 decision) = 90%, P(at least 2) = 50%, P(at least 3) = 30%. Probabilities must not increase. `year.decisions_min_age` (default 0) is the age reached from which slots roll; before it there are no decision slots.

Slots chain. Slot 1 fires with probability p1. Slot k rolls only if slot k-1 fired, and fires with probability p_k / p_(k-1) (slot 2: 50/90, slot 3: 30/50), so the run of fired slots reaches k with probability exactly p_k. Each roll has its own stable RNG purpose key, `decision-slot/<k>`.

Choice events that hit in the chance pass count toward the fired slots. Each remaining fired slot draws one eligible choice event with a `weight` (respecting `when`, `once`, `cooldown`, `max_per_life`; no storylet twice in a year; purpose key `decision-pick/<n>`). A fired slot with nothing eligible stays empty. Chance events can add decisions beyond the slots, so the delivered 'at least' rates are never below the targets.

The queued decisions open one after another: the player resolves each (and its `next:` chain) and the next opens. The life cannot age up until the queue is empty.

## Expressions

One small custom language is used for `when`, `weight`, `chance`, and effect statements (ADR 0004).

- Literals: integers, percents (`2.5%`, compiled to basis points out of 10,000), strings, booleans, and content ids (`job/cashier`).
- Operators: `+ - * /`, `mod` (modulo; `%` is used only by percent literals), comparisons, `and or not`, `in`, and the ternary `a ? b : c`.
- Names (scope `person` also has `person.role` as a content id, `person.alive`): `age`, `money`, `stat.<id>`, `quality.<id>`, `loan.<field>` (`balance`, `payment`, `missed`) in storylets with `scope: loan`, and other scoped references inside storylets (for example `person.<field>` for a spawned person).
- Functions: a fixed whitelist (for example `min`, `max`, `clamp`, `has`, `has_occupation`, `owns`, `years_in`, `role_closeness(role)`: average closeness to the living people the player holds that role toward, 0 with none; `role_count(role)`: how many of them are alive). No user-defined functions and no loops.
- Integer-only. `/` truncates toward zero. A constant zero divisor is a build error. At runtime, division by zero gives 0 and overflow clamps to the safe-integer range. Dev builds and the balance harness assert on both.
- No randomness inside expressions. Rolls happen only for `chance` and `weight`, and each roll site's RNG purpose key comes from the content id.

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
journal("text")                      die("cause")
```

`move_to(city)` puts the player in a city (family and everyone else stay); `move_out()` ends living with parents and picks the starting standard of living; `set_standard(standard)` chooses one (ignored with parents).

## Text

- Inline English. Placeholders (`{player.first_name}`, `{money}`, or a person bound by `spawn_person(...) as <name>`) are checked at build time against what is in scope.
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
