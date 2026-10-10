# Pack format: manifest, composition and capabilities

The `pack.yaml` manifest, how Packs compose, and capability files. Part of the [Pack format](index.md).

## Manifest (`pack.yaml`)

| Field | Meaning |
|---|---|
| `id` | Pack id; equals the directory name. A Pack has no integer version: what a Pack offers is its capabilities, and the Packs it uses are derived from their `requires`. |
| `namespace` | Optional id prefix. Every stat and quality the Pack declares must start with `<namespace>_`; two Packs may not share a namespace. `core-loop` is exempt. |
| `currency` | Symbol and minor-unit digits (singleton, see Singleton blocks). |
| `stats` | Declared stats: id, label, icon, start range. Always 0 to 100. |
| `living` | Living costs: `default` (standard chosen on moving out), `housing_share` (percent of the cost an owned home removes) `home_category` (item kind category that counts as a home) and an optional `household` block (see Household costs). Needs `standards`. Singleton block. |
| `exclusivity` | Occupation exclusivity groups (for example `school`, `full-time`). Singleton block. |
| `repeat` | Default curve for repeatable actions: `{ full: 10, reduced: 20, factor: 25% }` (see Repeatable actions). Any field left out takes the value shown. Singleton block. |
| `year` | Singleton block. Event draw settings: flavour slot count range and the yearly event cap, `decisions` / `decisions_min_age` (decision slots per year, see Year draw), plus optional `quiet` lines the Core journals for a year in which nothing else happened (every age gets a journal group). |
| `npc_careers` | Singleton block. Who gets a simulated career and how it runs: `roles`, `start_age`, `retire_age`, `group` (exclusivity group of NPC jobs), `retired` (pension kind), yearly percents `hire`, `promotion`, `job_loss`, ascending `tiers` (yearly-income thresholds in minor units), `education` (flag qualities rolled once at career start, each with `chance` and optional `needs`). See [NPC careers](content-kinds.md#npc-careers). |

## Composition

- Add-only. A Pack can add content and reference ids that the Packs it requires export through capabilities. It cannot override or patch another Pack's content.
- Stat and quality ids are bare and shared by every loaded Pack, so no two Packs may declare the same one. The compiler (and `indexBundles` at load) rejects a duplicate with an error naming both Packs and the id. Convention: a Pack prefixes its own qualities with its short name (`vac_`, `gambling_`, `moved_`). A quality several Packs need (for example `criminal_record`) is declared once in `core-loop`, and other Packs require a `core-loop` capability that provides it.
- Content ids are permanent. A shipped id that disappears without an entry in a `migrations/<name>.yaml` fails the build (compared against the previous release's id list). See [Saves and migrations](saves.md).

## Singleton blocks

`year`, `family`, `npc_careers`, `living`, `repeat`, `currency` and `exclusivity` are singleton blocks: the game has one of each. At most one loaded Pack may declare each, and that Pack must own it with a capability file entry `provides: singletons: [year]` (a Pack may own several). Errors: a second Pack declaring a block (names both Packs), a Pack declaring a block without providing it, and a Pack providing a block it does not declare. The owner is whoever provides the block, not a fixed Pack id; `core-loop` provides all seven in `capabilities/singletons.yaml`. `indexBundles` repeats the check at load, so no loader silently takes the first declaration.

## Id ownership

- Stats, qualities and state containers (see [State containers](state.md)) are bare ids shared by all Packs. A Pack with a `namespace` must prefix all three with `<namespace>_` (`vac_`, `gambling_`); the compiler reports each id that does not. Without a `namespace` the prefix is not enforced, and the cross-Pack duplicate check (see Composition) still applies. Content ids are always `<pack>/<id>`.
- Reading another Pack's quality, stat or group needs a required capability that provides it (see Capabilities, Visibility).

## Qualities

`packs/<id>/qualities/<topic>.yaml` holds a list of quality declarations (schema: `packages/pack-tools/schema/qualities.schema.json`), merged across files like `storylets/*.yaml`. Each is `{ id, type, default }` with `type: int` (optional `min` / `max`) or `type: flag`, and an optional `scope: person` that also makes it readable and assignable on a scoped or bound person (`person.quality.<id>`, see [State containers](state.md)). A quality id is unique within its Pack; across Packs see Composition. A `qualities` key in `pack.yaml` is an error that names the file to move the list into.

```yaml
- { id: gambling_heat, type: int, min: 0, max: 100, default: 0 }
- { id: gambling_addicted, type: flag, default: false }
```

## Capabilities

`packs/<id>/capabilities/<feature>.yaml` declares one feature of a Pack. Its id is `<pack>/<feature>` (the file stem). Schema: `packages/pack-tools/schema/capability.schema.json`.

```yaml
provides:
  qualities:
    - criminal_record
    - wanted
  roles:
    - parent
requires:
  - core-loop/stats
```

- `provides` lists the bare ids this feature exports, per category: `stats`, `qualities`, `state` (state containers), `groups` (exclusivity groups), `tags`, `milestones`, `roles`, `generators`, `cities`, `occupations`, `items` (item kinds and markets), `loans`, `standards`, `storylets`, `singletons` (see Singleton blocks). Every id except `tags` and `milestones` (opaque labels, not checked) must exist in the providing Pack. A feature of a Pack may not export an id another feature of that Pack already exports. Every key is optional; a file with neither key is valid.
- `requires` lists capability ids (`<pack>/<feature>`) of other Packs. Each must be provided by a loaded Pack. A missing one fails the build with the Pack and the capability named (`Pack 'x' requires capability 'y/z', but Pack 'y' has no capabilities/z.yaml`).
- Lists are block lists only, one entry per line (a flow list `[a, b]` is an error), so that two branches adding a line merge cleanly. Adding a capability file, or a line to one, never edits another Pack's files.
- Visibility: a Pack may use another Pack's stats, qualities and exclusivity groups (in expressions) and content ids (in references) only when a capability of that Pack, required by one of the using Pack's own capability files, provides them. Anything else is a compile error saying the id is not exported by a required capability. Own-Pack ids need no capability.
- Pack order is derived: a Pack compiles after every Pack whose capabilities it requires. A cycle between Packs is an error. The bundle (`PackBundle`) records `capabilities` (ids provided), `requires` (ids required) and `depends` (the derived Pack ids).
