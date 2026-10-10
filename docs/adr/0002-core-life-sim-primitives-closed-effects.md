# Core knows life-sim primitives and owns a closed effect set

The Core is content-agnostic, but not fully generic. It has built-in models for the world (persons with a movable player pointer), yearly age-ups, money in integer minor units of one currency, loans, occupations, assets, relationships, and the journal. Packs declare stats, qualities, item kinds, occupations, people-generation data, and all storylets. Storylets change the world only through a closed set of Core effects: stat or quality, money, loan, asset, occupation, spawn person, relationship, journal, and die. We rejected a fully generic Core, where money and people are Pack-defined, because generic screens (purchase dialog with cash/loan, profile, chart) need to know what price, cash, and person mean. We rejected Pack-defined effects because a closed set can be fully checked at build time and keeps saves safe across Pack changes.

## Consequences

- A new kind of change, such as currency exchange for relocation, needs a Core release, not only a Pack.
- Death is never automatic: a Pack must ship a mortality storylet, or no one dies.
- Continuing as a child is a pointer move in the world, not a state migration.
- Amendment (confinement): occupations may declare `confines { menus, events }`. Core locks content by whitelist, not blocklist: while confined, only storylets tagged `custody-ok` (a Core-owned tag) run in a locked trigger kind, the shop is locked, and housing is provided. Core exposes the boolean `confined`. Future menus and events therefore lock by default; a Pack that wants one to work in custody tags it.

## Note (2026-10-06): trade effect and market holdings

The closed effect list gains `trade(kind, amount)`: positive buys that much cash worth of a market kind at the current price, negative sells that much cash worth (more than held sells all; buying never takes cash below 0). `grant_asset` on a market kind gives one whole unit at the current price, `remove_asset` drops the holding without proceeds. The Core gains `Person.holdings` (units x10^4, cost basis, first age) and `World.market` (price series per market kind, drawn per world year from the seed, with the next return stored in advance). Expressions gain `price`, `change`, `units`, `holding_value`, `cost_basis`, `holding_years`, `forecast` and the name `portfolio`. The market screen logs a `trade` choice-log entry. Save schema version 5.

## Note (2026-10-06): relationship role write

The closed effect list gains `relationship(person).role = id`. It replaces every role row the player holds toward that person with one row of the given role, keeping the maximum closeness of the replaced rows (no-op if there was no tie). Closeness stays writable only through `relationship(p).closeness +=`. The matching reads, `person.closeness` (read-only) and `count_role(role, min, max)` (living people, inclusive range), are expression names and functions. One Core release (ADR 0004).

## Note (2026-10-06): person money and NPC careers (#131)

Any person already carries `money`; it is now readable in `scope: person` storylets as `person.money` (and `person.income_tier`, 0 to the number of manifest `tiers`), and the closed effect list gains `person.money += n | -= n`, which moves the scoped person's money without touching the player's (a gift is `money -= n` plus `person.money += n`). No other `person.*` name is assignable.

People the player holds a role in `npc_careers.roles` toward (core-loop: `partner`, `spouse`, `child`) work a real occupation, run by Core, not by storylets. Eligibility: age at least `start_age`; entry kinds are the kinds of `npc_careers.group` that nothing promotes to, whose `requires` the person meets, and that are not `npc: false`, confining, housing-providing, fixed-duration or loan-financed (so school, prison and custody kinds are never given). Education qualities are rolled once at the first start from the manifest's `education` list, so `requires` on degrees can hold. Each year, before settlement, in person id order: retire at `retire_age` (pension kind `retired`), else a worker loses the job by `job_loss`, else after `promotion_years` rolls `promotion` to take `promotes_to`; a person with no job is started at once the first time and hired by `hire` afterwards. Pay is the normal settlement pay into `person.money`. Leaving every career role (breakup, divorce) keeps occupations and history on record but stops all rolls and pay (the cheaper option: no per-person state to migrate). Everyone else keeps the static `Person.job` (label and tier from the generator) and nothing runs for them.

Joint money reuses #148's `merge_money()`: once the player's link to a person is `household: merged` (marriage without a prenup; a prenup never calls it), that person's pay is added to the player's money at settlement instead of theirs. `relationship(p).role = ...` keeps the link's `household` value only when the new role is the household partner role or a spouse role; any other role (ex, friend) clears it. #55 reuses `person.money` for estates.

## Note (2026-10-10): pack-declared state containers (#186)

The Core stays closed over its effects but is no longer closed over where a Pack keeps its own state. A Pack declares typed containers (world counters, per-person integer tables, and `scope: person` qualities) and the Core persists, hashes, replays, validates and migrates them generically: world-scope values live in `World.state` and person-scope values in `Person.state`, both opaque trees keyed by container id, so a new container needs no change to `types.ts`, `serialize.ts` or `codec.ts`. Reads default to the declared default, trees are absent until written (the save schema stays 6), and the closed effect list gains only the assignable names `world.<id>`, `table.<id>.<key>` and `person|<bound>.quality.<id>` / `table.<id>.<key>`; operators and clamping are fixed by the declaration. See [state.md](../spec/pack-format/state.md).

## Note (2026-10-10): schedule and unschedule (#215)

The closed effect list gains `schedule(storylet, after: a-b years[, person][, lineage: true])` and `unschedule(storylet)`, one Core release (ADR 0004). `schedule` queues an event storylet (bound to a person when it is `scope: person`) that fires once, `a` to `b` years from now (`1 <= a <= b`), with a rising chance; its `when` is re-checked when due (false: it waits) and the end of the window drops it; `unschedule` cancels every queued copy. The queue is a Core-owned world state container (`_schedule` in `World.state`, see ADR 0002's state-container note), not a new `World` field, so the save schema stays 6. `lineage: true` is stored and survives the player's death; the heir hand-off is #219, and without it an entry is dropped when the life ends. Both effects compile to `["do", "schedule" | "unschedule", ...]` and work inside effect macros.

## Note (2026-10-10): pack-declared effect macros (#188)

The closed effect list is unchanged, but a Pack can now name a sequence of closed effects and call it (`<pack>.<macro>(args)`), so a cross-Pack behaviour no longer needs a Core release. A macro (`effects/*.yaml`) has integer parameters and a body of closed effects and other macros, is exported through a capability (`provides: effects`) and is expanded when the Pack is built: the compiled bundle contains only the closed effects, so the Core, saves, the world hash, the choice log and replay do not change and a macro life is identical to its inlined equivalent. Macros are checked in the owner's scope, may not form a cycle, nest at most 8 deep, and keep persons they spawn local to the expansion. A new kind of change, such as currency exchange, is still a new Core primitive and still a Core release. See [Effect macros](../spec/pack-format/effects.md).

## Note (2026-10-10): kinship (#217)

The closed function list gains `kin(person)`, `is_kin(person, id)` and `count_kin(id, min_age, max_age)`, one Core release (ADR 0004); the `person` and `kinship` parameter types are checked at build time. Parent links are the Core-owned person state container `_parents`. Details: [ADR 0006](0006-parent-links-derived-kinship.md).

## Note (2026-10-10): milestones (#216)

The closed effect and function lists gain `reach_milestone(id)` (fires a Pack-declared milestone once per life) and `milestone_reached(id)` (the readable flag), one Core release (ADR 0004), and storylets gain `trigger: milestone`. The Core emits `graduated`, `first_job`, `married`, `first_child` and `retired` from its own primitives (`start_occupation`, settlement, `merge_money`, `spawn_person` and role changes) and runs the Packs' `on_milestone` hooks; the once-per-life record is the Core-owned state container `_milestones`. Details: `docs/spec/pack-format/hooks.md#milestones`.

## Note (2026-10-10): succession and wills (#219)

The player pointer moves to an heir by `succeed(world, bundles, heirId)` ([ADR 0003](0003-saves-derived-rng-stable-ids.md), world continuation). The closed effect and function lists gain `set_will(even | spouse | charity | none)`, `will_heir(person)` and `has_will()`, one Core release (ADR 0004): the will is the Core-owned world state container `_will`. Storylets gain `trigger: succession`, lifecycle hooks gain `on_succession`, and expressions gain the read-only `deceased.*` names; none of them can be assigned, and a world that never succeeds has none of them in its state.

## Note (2026-10-10): animal roles and unlist (#224)

`animal: true` on a `kind: role` marks a role as an animal role; a person the player holds one toward is never bound by a `scope: person` storylet with no `target` or a human one (`hasTargetRole` takes the `PackIndex` for it). The closed effect list gains `unlist(person)`, which sets the optional `Person.listed` to `false`: the person stays in the world and the save, leaves the relationship lists and `count_role`, and is never bound again. Core-loop uses both for pets. A generator may omit `last_names`; its people get an empty family name. `Person.listed` is optional, so the save schema is unchanged.


## Note (2026-10-10): spawn-time qualities, can_carry, set_gender and rename (#225)

Generators (`kind: generator`) gain `qualities` (person-scoped qualities set at spawn: a fixed value or a `[min, max]` range) and `can_carry`; a manifest gains `spawn_qualities` (weighted, gender-filtered person-quality draws every generated non-animal person rolls, under the purpose key `pack/<id>/spawn/<n>`). `Person.canCarry` is stored at spawn (female yes, male no, nonbinary drawn, or fixed by the generator) and is the body, separate from the gender identity; expressions read it as `player.can_carry` / `person.can_carry`. A quality may declare `format: money`, which only changes how text prints it. The closed effect list gains `set_gender(target, gender)` and `rename(target, generator)` with `target` one of `player`, `person` or a bound name (new checker types `gender` and `target`); neither touches `can_carry`. All new `Person` and `PackBundle` fields are optional, so the save schema is unchanged.
