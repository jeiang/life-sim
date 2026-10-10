# Pack format: content kinds

Market kinds, cities, standards of living, household costs, confinement and NPC careers. Part of the [Pack format](index.md).

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
    delist: 3%                                  # optional: delistable (price 0, holdings written off)
    relist_after: 5                             # optional, needs delist: back at `start` 5 years later
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

**Price floor and delisting.** A price is never below 1 minor unit while listed, and a positive return always moves it by at least 1 so a price at the floor can recover. A kind with `delist` is delistable: its price falls to 0 when the `delist` chance rolls or when a move would take it below 1 minor unit (a -100% year). Delisting writes every holding off to nothing (units and cost gone, a journal line for the player), the kind leaves the market screen while nobody holds it, and buying it does nothing. With `relist_after: N` (1 to 99, needs `delist`) the kind relists at `start` N world years after delisting, as a fresh series. A kind without `delist` (index funds, bonds) cannot reach the floor in one move: its yearly return is clamped to -99% or more.

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

## Household costs

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

## Confinement

An occupation with `confines: { menus, events }` (for prison, hospital; at least one `true`) confines the player while it is held. Core then:

- locks content by whitelist: with `menus: true`, an action storylet can run only if it carries the Core-owned tag `custody-ok` (other actions show locked, "Not allowed while confined"), and the shop is locked (rows and sales); with `events: true`, only events tagged `custody-ok` are drawn (including NPC and loan-scoped events). New menus and events lock by default;
- provides housing, as `provides_housing: true` does (no living cost, no standard effects, `living.risk` reads 100%); the living situation itself is unchanged.

`start_occupation` and `end_occupation` still apply to the player; tag the actions that start or end confinement `custody-ok`. A `next:` chain is not checked after its first storylet opens. Several confining occupations combine: a lock applies when any of them sets it. The boolean name `confined` is true while the player holds any confining occupation, so other Packs' pay, schools and events can react (for example `when: not confined`).

Names: `living.standard` (id of the lived standard), `living.cost` (this year's cost, 0 with parents or provided housing), `living.risk`. Function `standard_cost(standard)`: what that standard would cost the player now (city index and home waiver applied), for example `when: standard_cost(core-loop/rich) <= money`.

## NPC careers

Entry kinds are the occupation kinds of `npc_careers.group` that no kind promotes to. A kind with `npc: false`, `confines`, `provides_housing`, `duration_years` or `loan` is never given to an NPC, nor is the `retired` kind outside retirement. Pay expressions run with the NPC as subject: `quality.*` reads their own qualities (so `raise_bonus` is 0) and `city.wage_index` their city (100% without one). A `kind: generator` item may list `jobs: [{ label, tier }]`; a spawned person gets one at random as a static job (no career), and its tier counts the same thresholds as `person.income_tier`: the number of `tiers` that yearly income (held pay, or the static tier's threshold, plus a twentieth of their money) reaches.
