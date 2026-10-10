# Readables

A Pack gives a name to a value the Core computes from the world, and other Packs read it through that name. A Pack can also open a **slot**: a readable that Packs depending on it add terms to, so a rule in the owner (`when: not hiring_blocked`) reacts to state the owner knows nothing about (restructure decision 4). Readables are an expression-level extension point: no Core release, no TypeScript, no state of their own. Part of the [Pack format](index.md); terms follow [CONTEXT.md](../../../CONTEXT.md), the language change is recorded in [ADR 0004](../../adr/0004-custom-pack-expression-language.md).

## Declaring

`packs/<id>/readables/<topic>.yaml` is a list of entries, merged across files like `state/*.yaml` (schema: `packages/pack-tools/schema/readables.schema.json`). A file instead of a manifest `readables:` key, for the reason `state/` is one: concurrent edits to `pack.yaml` conflict. Three kinds:

```yaml
# kind: readable — a name for an expression
- { kind: readable, id: kin_favours, type: int, expr: sum(table.kin_favours) }
- { kind: readable, id: kin_beloved, type: bool, expr: kin_favours >= 20 }

# kind: slot — a readable other Packs add terms to
- { kind: slot, id: hiring_blocked, type: bool, default: false }
- { kind: slot, id: pay_bonus, type: int, combine: sum, default: 0 }

# kind: contribute — one term, added by a Pack that requires the slot's capability
- { kind: contribute, slot: hiring_blocked, expr: quality.criminal_record }
```

- **`readable`**: `id`, `type` (`int` or `bool`), `expr`. The expression is checked against the names this Pack can see (below) and must have the declared `type`; a mismatch is a build error. The declared type is what lets a dependent Pack type-check a use without compiling the owner's expression.
- **`slot`**: `id`, `type`, `default`, and for `int` an optional `combine: sum | max` (default `sum`). Its value is the default combined with every term: the default plus the terms (`sum`), the largest of the default and the terms (`max`), or, for `bool`, true when the default or any term is true. A slot with no contributor reads as its default.
- **`contribute`**: `slot`, `expr`. The slot must be one this Pack declares or one a required capability provides under `readables`, and `expr` must have the slot's type. A contribution has no id and is not exported.

## Using

A readable or slot is a bare name in any expression (`when`, `weight`, `chance`, readable and contribution expressions, text placeholders): `when: not hiring_blocked`, `pay_bonus >= 8`. It evaluates for the player, whatever scope the reader is in (a readable never sees `person.*`, `loan.*`, `asset.*`, `amount` or bound names), reads the world as it is now, and is never stored: it adds nothing to saves, the world hash or replay. There is no randomness inside it (ADR 0004).

## Aggregators

Four closed aggregators range over declared containers. `sum`, `count`, `max` and `min` take one argument, a container path the Pack can see:

| Source | Ranges over |
| --- | --- |
| `table.<id>` | the player's cells of a table, one per key |
| `people.quality.<id>` | the quality of every living person (the player included); the quality must be `scope: person` |
| `people.table.<id>.<key>` | one cell of a table on every living person (the player included) |

`sum` adds the values, `max` / `min` take the largest / smallest (0 over no values), and `count` is how many values are above 0 (flags: true). `sum`, `max` and `min` need integer values; `count` also takes a flag quality. A source the Pack cannot see, or one that does not exist, is an "unknown" build error naming the visible sources. `max(a, b)` and `min(a, b)` with two arguments remain the pure functions; `sum` and `count` have no other meaning. Aggregators work anywhere in an expression, not only in readables.

## Rules

- Ids are bare and shared by all Packs, like stats, qualities and state: no two Packs declare the same readable or slot id, a Pack with a `namespace` prefixes them `<namespace>_`, and an id may not be a reserved expression name (`age`, `money`, `stat`, `world`, `table`, `people`, `amount`, `confined`, ...).
- Visibility is the capability rule of [State containers](state.md): another Pack's readable or slot is usable only through a required capability that lists it under `provides: readables`. The owner exports what it means to share; its internal state stays hidden, which is the point of a readable. `provided` checks that the Pack declares each id.
- A Pack reads the names visible to it. A contribution of Pack `crime` to a slot of `core-loop` uses `crime`'s own names plus what `crime`'s required capabilities export; `core-loop` never requires `crime`. Contributions are collected from every loaded Pack, so which terms exist depends on which Packs are loaded.
- Cycles are build errors: a readable depends on the readables its expression reads, a slot on the readables its terms read, across Packs (`readables form a cycle: a -> b -> a`). `indexBundles` repeats the check, so a hand-built bundle set cannot loop.
- Readable ids appear in `ids.lock.json` as `readable.<id>`; renaming or removing one needs a migration entry (`rename`/`remove` with `readable.<old>`, see [Saves](saves.md)). Saves hold no readable value, so a migration only keeps the lock honest.

## Engine contract

For authors of the next extension points (effect macros, lifecycle hooks, settlement line items) and of the `vocab` script.

- **Compiled form.** `PackBundle.readables: ReadableDecl[]` (sorted by id) with `ReadableDecl = ExprReadableDecl | SlotDecl` and `PackBundle.contributions: ContributionDecl[]` (`{ slot, expr }`, source order); `PACK_BUNDLE_FORMAT` is 5. `PackIndex.readables: ReadonlyMap<id, ReadableEntry>`, `ReadableEntry = { decl, terms: Expr[] }` with every Pack's terms attached. `indexBundles` throws on a duplicate id, a contribution to a non-slot, or a cycle.
- **Evaluation.** In `makeEnv` (`sim/env.ts`) a bare name that is a readable evaluates `decl.expr`, or `combineSlot(decl, terms)` (`sim/readables.ts`), in a fresh player-level environment. The compiler guarantees acyclicity, so there is no runtime depth guard.
- **Aggregators.** Compiled to `["call", "agg_<op>", ["s", "<source>"]]` (`AGGREGATES`, `AGGREGATE_PREFIX` in `@life/core`; `aggregate` in `sim/readables.ts`). The checker (`pack-tools/src/expr/check.ts`) takes the visible sources from `CheckEnv.aggregates`.
- **Listing.** `idx.readables` holds the name, type, kind and (for slots) terms of everything loaded, for `vocab` (#199).
