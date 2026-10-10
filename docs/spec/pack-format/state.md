# State containers

A Pack adds persisted state by declaring it, never by editing the Core's state types, serializer or save codec (restructure decision 4). The engine stores, canonically serializes, hashes, replays, validates and migrates every container the same way. Terms follow [CONTEXT.md](../../../CONTEXT.md); the amendment to the Core model is in [ADR 0002](../../adr/0002-core-life-sim-primitives-closed-effects.md).

## What can be declared

| Container | Declared in | Scope | Names in expressions |
| --- | --- | --- | --- |
| Quality (existing) | `qualities/<topic>.yaml` | the player; or any person with `scope: person` | `quality.<id>`; with `scope: person` also `person.quality.<id>` and `<bound>.quality.<id>` |
| Counter | `state/<topic>.yaml`, `kind: counter` | the world | `world.<id>` |
| Table | `state/<topic>.yaml`, `kind: table` | each person | `table.<id>.<key>` (the player), `person.table.<id>.<key>`, `<bound>.table.<id>.<key>` |

`packs/<id>/state/<topic>.yaml` is a list of declarations, merged across files like `qualities/*.yaml` (schema: `packages/pack-tools/schema/state.schema.json`). This replaces the planned manifest `state:` key; as with qualities, a list in `pack.yaml` would fight concurrent edits.

```yaml
- { id: kin_scandals, kind: counter, type: int, min: 0, max: 99, default: 0 }   # world.kin_scandals
- { id: kin_festival, kind: counter, type: flag, default: false }               # world.kin_festival
- id: kin_favours                                                               # table.kin_favours.food
  kind: table
  keys: [food, help, gossip]
  min: 0
  max: 50
  default: 0
```

### Counter

One value for the whole world. `type: int` takes optional `min` / `max` (the default must lie inside them) or `type: flag`. It persists across generations (succession keeps the world) and starts at its default in every new life. Operators: ints `+= -= =`, flags `=`; results clamp to `min` / `max`.

### Table

A record of integers per person under a closed `keys` list (at least one; ids match `^[a-z][a-z0-9_]*$`), all cells sharing one `default`, `min` and `max`. `table.<id>.<key>` reads or assigns the player's cell; `person.table.<id>.<key>` the scoped person's; `<name>.table.<id>.<key>` a person bound by `spawn_person(...) as <name>`. Operators `+= -= =`; results clamp. A key outside the list is a compile error (an unknown name).

### Person qualities

Every person already carries `qualities`; `scope: person` on a quality declaration (`qualities/*.yaml`) makes it addressable on a scoped or bound person. Without it only the player's value (`quality.<id>`) is reachable. Operators are the quality ones (`+= =`; flags `=`), clamped to `min` / `max`. Reading a quality that was never written gives the declared default.

```yaml
- { id: kin_grudge, type: int, min: 0, max: 10, default: 0, scope: person }
```

```
n.quality.kin_grudge += 3                 # n bound by spawn_person(...) as n
person.table.kin_favours.food -= 1        # in scope: person
world.kin_scandals += 1
when: world.kin_scandals >= 2 and person.quality.kin_grudge > 0
```

An assignment to `person.*` or `<bound>.*` with no person in scope does nothing, like `person.money`.

## Rules

- Ids are bare and shared by all Packs, exactly like stats and qualities: no two Packs declare the same state id, a Pack with a `namespace` prefixes every state id with `<namespace>_`, and a container id is unique within its Pack. Counters and tables share one id space.
- Another Pack's container is visible only through a required capability that lists it under `provides: state` (qualities stay under `provides: qualities`). The capability file lists the ids the Pack exports; `provided` checks that the Pack declares each.
- Declared names appear in `ids.lock.json` as `state.<id>`; renaming or removing one needs a migration entry (`rename`/`remove` with `state.<old>`, see [Saves](saves.md)). A removed container's values are dropped from saves.
- Unknown ids, keys, scopes or operators fail the build with the usual "unknown name" or "cannot be assigned" diagnostics. `world`, `table` are reserved and cannot name a spawned person.

## Engine contract

For authors of the next extension points (readables, effect macros, lifecycle hooks, settlement line items, content kinds).

- **Compiled form.** `PackBundle.state: StateDecl[]` (sorted by id; `PACK_BUNDLE_FORMAT` is 5). `StateDecl = CounterDecl | TableDecl`, both carrying `kind` and `id`. `PackBundle.qualities[*].scope?: "person"`. `PackIndex.state: ReadonlyMap<id, StateDecl>` (a duplicate id across bundles throws).
- **Storage.** `World.state?: StateTree` holds world-scope containers (counters) and `Person.state?: StateTree` holds person-scope containers (tables), where `StateTree = Record<id, StateValue>` and `StateValue = number | boolean | { [k]: StateValue }`. Both are absent until the first write, and a read of a missing value is the declared default, so no existing world, save or hash changes and the save schema stays 6. Person qualities stay in `Person.qualities`.
- **Generic handling.** `canonicalStringify` (hash, save text) and `deserializeWorld` handle any container tree (integers, booleans, nested records; floats are rejected). `validateImport(save, bundles)` runs the Pack migrations, then `checkWorldState(world, idx.state)`: an id nothing declares, the wrong scope, a wrong value shape or a table key the declaration lacks rejects the save. `applyPackMigrations` renames and drops container ids (`state.<id>`).
- **Access.** Read and write only through `counterValue` / `setCounter` and `cellValue` / `setCell` (`packages/core/src/state/containers.ts`), which clamp to `min` / `max` and reject an unknown table key. Expressions read `world.*` and `table.*` in `sim/env.ts`; the effect interpreter writes them in `assignState` (`sim/effects.ts`). The compiler checks assignments with `assignOps` (`@life/core`).
- **Adding a container kind.** Add a declaration type to `StateDecl` (`pack.ts`), a member to `StateSchema` (`pack-tools/src/schema.ts`), its expression names in `PackCompiler.addDecls`, a read/write helper and a `checkWorldState` branch in `state/containers.ts`, and the `env.ts` / `assignState` cases. `types.ts`, `serialize.ts` and `save/codec.ts` do not change.
