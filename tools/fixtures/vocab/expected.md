# Vocabulary: core-loop, kin

Packs in dependency order. `(pack)` is the owner; ids are bare unless a full id is shown.

## Stats
Read `stat.<id>`; assign `+= -= =`. Range 0-100.
- `stat.happiness` (core-loop) Happiness, start 50-100
- `stat.smarts` (core-loop) Smarts, start 0-100

## Qualities
Read `quality.<id>`; assign `+= =` (flags `=`), clamped to the range.
- `quality.degree` (core-loop) flag = false: Finished university.
- `quality.luck` (core-loop) int 0..5 = 0: Starts at 1 for everyone; luck of the draw in chance events.

## Person qualities
Also on a scoped or bound person: `person.quality.<id>`, `<bound>.quality.<id>`.
- `quality.kin_grudge` (kin) int 0..10 = 0: How much a person resents the player (0 none, 10 feud).

## State
Counter `world.<id>` (whole world); table `table.<id>.<key>` (per person; `person.table...` for another).
- `table.kin_favours.<key>` (kin) keys food, help 0..50 = 0: Favours owed, per kind.
- `world.kin_scandals` (kin) int 0..99 = 0: Scandals this world has seen.

## Readables
A bare name in any expression; read-only. A slot sums or maxes its default and the terms Packs add.
- `hiring_blocked` (core-loop) slot bool (any, default false): Jobs refuse a candidate while this is true. Packs add terms. [terms: kin `world.kin_scandals > 2`]
- `kin_favour_total` (kin) readable int = `sum(table.kin_favours)`: All favours owed, added up.

## Effect macros
An effect statement: `<pack>.<macro>(args)`, integer arguments.
- `core_loop.cheer(step, limit)` (core-loop): Lift the player's mood by a step, capped at the limit.
- `kin.scandal()` (kin): A scandal breaks: counts it and cheers nobody.

## Kinds
Read `kind("<kind>", <id>).<field>`.
- `kin_clans` (kin) Clan: size: int; rank: expr int
  - entries: kin/heron

## Roles
Ids of people roles (`has`, `role_closeness`, `count_role`, `spawn_person`).
- `core-loop/friend` Friend

## Groups
Exclusivity groups (`in_group`, `years_in_group`): an occupation of a group excludes another of it.
- `full-time` (core-loop)
- `school` (core-loop)

## Tags
Storylet tags.
`job`, `scandal`, `school`

## Milestones
Ids for `on_milestone` hooks.
- `graduated` (core-loop)

## Hooks
Statements per lifecycle phase, run in Pack order.
- core-loop: `on_birth` x1
- core-loop: `on_milestone/graduated` x1

## Settlement lines
Yearly lines Packs add after the Core lines.
- `core-loop/rent` cost: Rent

## Functions
Expression functions.
- `min(int, int) -> int`
- `max(int, int) -> int`
- `clamp(int, int, int) -> int`
- `has(id) -> bool`
- `has_occupation(id) -> bool`
- `owns(id) -> bool`
- `years_in(id) -> int`
- `standard_cost(id) -> int`
- `role_closeness(id) -> int`
- `has_remote_job() -> bool`
- `in_group(group) -> bool`
- `years_in_group(group) -> int`
- `count_role(id, int, int) -> int`
- `price(id) -> int`
- `change(id) -> int`
- `units(id) -> int`
- `holding_value(id) -> int`
- `cost_basis(id) -> int`
- `holding_years(id) -> int`
- `forecast(id) -> int`

## Effects
Effect calls. Assign roots: `stat += -= =`, `quality += =`, `money += -=`, `person += -= =`, `world += -= =`, `table += -= =`. Aggregators over containers: `sum`, `count`, `max`, `min`.
- `take_loan(id, int) -> bool`
- `grant_asset(id) -> bool`
- `remove_asset(id) -> bool`
- `start_occupation(id) -> bool`
- `end_occupation(id) -> bool`
- `spawn_person(id, id) -> bool`
- `journal(string) -> bool`
- `die(string) -> bool`
- `move_to(id) -> bool`
- `move_out() -> bool`
- `move_in() -> bool`
- `merge_money() -> bool`
- `set_standard(id) -> bool`
- `trade(id, int) -> bool`
- `unschedule(id) -> bool`
- `schedule(id, after: <a>-<b> years[, person][, lineage: true]) -> bool`
