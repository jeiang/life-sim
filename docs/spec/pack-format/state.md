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

## The schedule queue

The `schedule(...)` queue ([Scheduled consequences](storylets.md#scheduled-consequences)) is the one container the Core declares itself. It lives in `World.state` under the reserved id `_schedule` (a pack state id matches `^[a-z]`, so none can collide), shaped `{ <storylet id>: { <person id or "-">: { seq, wait, left, lineage } } }`: `seq` is the queue order, `wait` the age-ups before the window opens, `left` the age-ups the window still has, `lineage` a flag. It is absent until the first `schedule` and removed again when it empties, so a world that never schedules (or cancelled everything) is byte-identical to one that never had it. `checkWorldState` validates its shape (an unreadable queue rejects the save) and Pack migrations rename or remove its storylet ids. Access: `scheduledEntries` / `setScheduled` (`state/schedule.ts`), never by hand.

## Engine contract

For authors of the next extension points (readables, effect macros, lifecycle hooks, settlement line items, content kinds).

- **Compiled form.** `PackBundle.state: StateDecl[]` (sorted by id; `PACK_BUNDLE_FORMAT` is 6). `StateDecl = CounterDecl | TableDecl`, both carrying `kind` and `id`. `PackBundle.qualities[*].scope?: "person"`. `PackIndex.state: ReadonlyMap<id, StateDecl>` (a duplicate id across bundles throws).
- **Storage.** `World.state?: StateTree` holds world-scope containers (counters) and `Person.state?: StateTree` holds person-scope containers (tables), where `StateTree = Record<id, StateValue>` and `StateValue = number | boolean | { [k]: StateValue }`. Both are absent until the first write, and a read of a missing value is the declared default, so no existing world, save or hash changes and the save schema stays 6. Person qualities stay in `Person.qualities`.
- **Generic handling.** `canonicalStringify` (hash, save text) and `deserializeWorld` handle any container tree (integers, booleans, nested records; floats are rejected). `validateImport(save, bundles)` runs the Pack migrations, then `checkWorldState(world, idx.state)`: an id nothing declares, the wrong scope, a wrong value shape or a table key the declaration lacks rejects the save. `applyPackMigrations` renames and drops container ids (`state.<id>`).
- **Access.** Read and write only through `counterValue` / `setCounter` and `cellValue` / `setCell` (`packages/core/src/state/containers.ts`), which clamp to `min` / `max` and reject an unknown table key. Expressions read `world.*` and `table.*` in `sim/env.ts`; the effect interpreter writes them in `assignState` (`sim/effects.ts`). The compiler checks assignments with `assignOps` (`@life/core`).
- **Adding a container kind.** Add a declaration type to `StateDecl` (`pack.ts`), a member to `StateSchema` (`pack-tools/src/schema.ts`), its expression names in `PackCompiler.addDecls`, a read/write helper and a `checkWorldState` branch in `state/containers.ts`, and the `env.ts` / `assignState` cases. `types.ts`, `serialize.ts` and `save/codec.ts` do not change.

## The milestone record

The milestones a life has reached ([Milestones](hooks.md#milestones)) are the second container the Core declares itself: the reserved world state id `_milestones`, shaped `{ <milestone id>: true }`. It is absent until the first milestone, and succession drops it so the heir's life starts empty. Saves, the canonical serializer and the world hash carry it as state; a malformed record (an id that is not a milestone id, a value that is not `true`) rejects the save.

## Parent links

The family tree is the third container the Core declares itself: the reserved person state id `_parents` (`Person.state._parents`), shaped `{ "<parent person id>": <kind> }` with kind `1` birth, `2` adopted, `3` step. It is absent on a person with no recorded parent, is never dropped (succession keeps the tree), and the saves, canonical serializer and world hash carry it as state. A malformed table (a key that is not an existing person other than the owner, a kind outside 1-3) rejects the save. Kinship is derived from it, never stored ([Expressions](expressions.md#kinship), [ADR 0006](../../adr/0006-parent-links-derived-kinship.md)). A Pack cannot read or write it directly; `spawn_person` and `relationship(p).role` with a `parent`, `sibling`, `child` or `grandparent` role keep it in step.

## The will

The player's will ([Expressions](expressions.md#effect-statements): `set_will`, `will_heir`) is the fourth container the Core declares itself: the reserved world state id `_will`, shaped `{ mode: <code>, heir?: <person id> }` with mode `1` one named heir (`heir` is that person), `2` an even split among the children, `3` all to the spouse, `4` charity. It is absent until the player makes a will, and succession reads it for the estate ([core-loop](../core-loop.md#the-estate)) and then drops it, so the heir starts with none. Saves, the canonical serializer and the world hash carry it as state; a malformed will (an unknown mode code, a mode `1` without an existing person, or an `heir` on another mode) rejects the save with a message naming the path.

The dead player the heir succeeded is not a container: it is the optional world field `World.deceased` (`{ person, cause, money }`), read as [`deceased.*`](expressions.md#the-deceased).
