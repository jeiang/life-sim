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

## Note (2026-10-06): decision unlocks (#143)

The closed effect list gains four things, in one Core release (ADR 0004):

- `schedule(storylet, after: a-b years[, person][, lineage: true])` queues a consequence (an event storylet, bound to a person when it is `scope: person`); `unschedule(storylet)` cancels every queued copy. The queue is life state (`World.scheduled`). A consequence fires once, in a window of `a` to `b` years from now (`1 <= a <= b`), with a rising chance; its `when` is re-checked each time it could fire (false: it waits) and the end of the window drops it. `lineage: true` marks it to carry to the heir (#132 does the hand-off); without it, it is dropped when the life ends.
- Person qualities: a manifest declares `person_qualities` (shared id space with `qualities`); `person.quality.<id>` and `<bound>.quality.<id>` are readable names and assignable (`=`, `+=` as for `quality`), acting on that person.
- Milestones: Core emits `graduated` (a `school`-group occupation ends by completing its duration), `first_job` (the player starts an occupation outside `school`), `married` and `first_child` (the player's tie to someone becomes the `core-loop/spouse` or `core-loop/child` role), and `retired` (the player starts `core-loop/retired`); like the `school` group in the obituary, those ids are Core-owned references to core-loop. Each sets a readable `milestone.<id>` flag on the person and opens the `trigger: milestone` storylets for it, once. A Pack adds ids with the manifest `milestones` list and emits one with the effect `milestone(id)` (Core's own ids cannot be emitted by hand).
