# Saves and migrations

Part of the [Pack format](index.md). Core: `packages/core/src/save/`; ADR [0003](../../adr/0003-saves-derived-rng-stable-ids.md).

## No compatibility before the first release tag

Save schema version 6 was a one-time reset. **No save compatibility is promised before the first `v<N>` release tag.** A save from an older schema is rejected on load with a clear message (the web app lists it among the lives that failed to load, and an import shows the same text); a save from a newer schema is rejected as coming from a newer build. There is no upgrade chain. From the first `v<N>` tag, a schema change must ship with a migration again.

## What a save records

- `schemaVersion`: the Core save schema (`SCHEMA_VERSION`), on the file and on every World.
- `capabilities`: sorted capability ids (`<pack>/<feature>`) the life was made with. Importing a save that needs a capability the build does not include is refused.
- `appliedMigrations`: sorted ids (`<pack>/<name>`) of the Pack migrations already applied to the world. A new life records every migration of the loaded Packs, since it never held an older id.

Packs carry no integer version.

## Pack migrations

`packs/<id>/migrations/<name>.yaml` holds one migration; its id is `<pack>/<name>` (`name` matches `^[a-z0-9][a-z0-9_-]*$`). Schema: `packages/pack-tools/schema/migration.schema.json`. One file per migration, so concurrent changes merge without conflicts.

```yaml
rename:
  - { from: old-job-offer, to: first-job-offer }
remove:
  - { id: retired-event, fallback: first-job-offer }   # fallback optional: without it the content is dropped
```

- Ids belong to the declaring Pack; `stat.<id>` and `quality.<id>` names are allowed.
- A rename's target must exist, and neither a renamed nor a removed id may still exist.
- A fallback is a full or short content id, or a declared `stat.`/`quality.` name.
- On load, every installed migration whose id is not in the world's `appliedMigrations` is applied once (persons, relationships, the open storylet, storylet log, repeatable-action counters, the obituary), then its id is recorded. Applying is pure and idempotent.
- A shipped id (`ids.lock.json`) that disappears needs an entry in some migration file or the build fails.
