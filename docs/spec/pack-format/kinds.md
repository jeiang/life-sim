# Pack format: declared content kinds

A Pack may define a new kind of content by schema, with no Core change: the declaration names typed fields, entries supply the values, and the compiler validates both generically. Part of the [Pack format](index.md). Cities, standards, markets, repeat curves and NPC careers are still built-in kinds ([Content kinds](content-kinds.md)); they move onto this mechanism when a change touches them.

## Declaring a kind

One file per kind, `kinds/<kind>.yaml`; the file stem is the kind id (`^[a-z][a-z0-9_]*$`).

```yaml
# packs/world/kinds/countries.yaml
label: Country            # optional
fields:
  name: { type: string }
  rank: { type: int }
  tax: { type: expr, returns: int }     # a Pack expression, evaluated on every read
  open: { type: expr, returns: bool }
  capital: { type: ref, to: city }      # an id of a content kind...
  friend: { type: ref, to: countries }  # ...or of a declared kind
```

| Field type | Entry value | Reads as |
|---|---|---|
| `int` | integer | `int` |
| `string` | string | `string` |
| `ref` (`to`) | id of an item of the content kind `to` (`storylet`, `occupation`, `item`, `market`, `loan`, `city`, `standard`, `role`, `generator`) or of an entry of the declared kind `to`; short or `<pack>/<id>` | `id` |
| `expr` (`returns: int` or `bool`) | expression source | `int` or `bool` |

Every field is required in every entry. `id` and `label` are reserved field names. A kind id may not be a Pack directory name (`storylets`, `items`, `state`, `kinds`, `test`, ...) or a built-in content kind (`city`, `item`, ...), because entries live in a directory named after the kind.

## Entries

`packs/<pack>/<kind>/<topic>.yaml` holds a list of entries, validated against a schema built from the declared fields (unknown or missing fields, wrong value types and dangling refs are build errors).

```yaml
# packs/world/countries/countries.yaml
- id: us
  label: United States   # optional
  name: States
  rank: 1
  tax: 10 + stat.happiness / 10
  capital: harbor
  friend: ca
```

An entry's full id is `<pack>/<id>`, in the same id space as storylets and items (an entry id may not repeat another item's id in its Pack). A Pack writes entries for a kind it declares or for one it sees through a required capability (see Visibility); it never edits another Pack's entries. Entries from every loaded Pack are merged, so which entries exist depends on which Packs are loaded.

## Reading a kind

`kind("<kind>", <id>).<field>` works in every expression: `when`, effects, readables, settlement lines, hook effects, effect macros.

```yaml
when: kind("countries", us).tax < 5 and kind("countries", world/ca).open
```

- The kind is a quoted literal and must be visible; the field must exist (the build error lists the kind's fields). The id is an id literal (a bare word reads in the Pack's own namespace, otherwise `<pack>/<id>`; a literal is checked to exist and to be exported) or any expression of type `id`: `city.id`, or another read of a `ref` field (`kind("countries", kind("countries", us).friend).rank`). The result has the field's type.
- An `expr` field is evaluated on every read, in the player-level scope (the same names as a readable, whatever scope the caller is in). It is never stored and uses no randomness.
- An id that names no entry (a computed id) reads as the type's zero: `0`, `false`, `""`.
- Entry expressions see stats, qualities, state, `age`, `money` and the other player-level names, but not readables and not `kind(...)`: that rule makes cycles impossible, so there is no runtime depth guard.

## Visibility

Same rule as state and readables. The kind id is shared by all Packs (no two declare it; a Pack with a `namespace` prefixes it `<namespace>_`). Another Pack sees a kind, and reads or extends it, only through a required capability that lists it under `provides: kinds`; the entries of the providing Pack are exported with it. A Pack that writes entries into a kind of another Pack lists the kind in its own capability's `provides: kinds` to export its entries (the build checks the Pack declares the kind or has entries for it).

## Ids lock and migrations

Entry ids appear in `ids.lock.json` as `<pack>/<id>` and kind ids as `kind.<id>`. Removing or renaming one needs a migration entry like any other id (`kind.<old>` for a kind). Saves hold no kind data.

## Engine contract

For the `vocab` script (#199) and later extensions.

- **Compiled form.** `PackBundle.kinds: KindDecl[]` (`{ id, label?, fields: KindFieldDecl[] }`, fields in declaration order, sorted by kind id) and `PackBundle.kindEntries: KindEntry[]` (`{ kind, id, label?, values }`, sorted by full id; ref values are full ids, `expr` values are compiled `Expr`s); `PACK_BUNDLE_FORMAT` is 6.
- **Index.** `PackIndex.kinds: ReadonlyMap<kindId, KindIndexEntry>`, `KindIndexEntry = { decl, owner, entries: ReadonlyMap<fullId, KindEntry> }` with every Pack's entries. `indexBundles` throws on a duplicate kind, an entry of an undeclared kind or a duplicate entry.
- **Evaluation.** A read compiles to `["call", "kind", ["s", "<kind>"], <id expr>, ["s", "<field>"]]` (`KIND_CALL` in `@life/core`); `makeEnv` (`sim/env.ts`) answers it with `kindValue` (`sim/kinds.ts`).
- **Checker.** `CheckEnv.kinds` (kind -> field -> type) enables the call; the parser accepts `.field` after the call `kind(...)` only.
