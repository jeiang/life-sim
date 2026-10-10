# Pack format

Decided in [Pack format and expression language](https://github.com/jeiang/life-sim/issues/10). Terms follow [CONTEXT.md](../../../CONTEXT.md). Exact field-level schemas are defined in code (TypeBox) during the build; this document fixes the shape and the rules.

## Files

```
packs/<pack-id>/
  pack.yaml                  # manifest (no qualities: they live in qualities/)
  capabilities/<feature>.yaml  # one file per feature: provides and requires (see Capabilities)
  migrations/<name>.yaml     # one file per migration: renamed and removed ids (see saves.md)
  qualities/<topic>.yaml     # list of quality declarations (see Qualities)
  CONTEXT.md                 # glossary of the terms this Pack owns
  BALANCE.md                 # balance targets, harness profiles and report notes
  test/*.test.ts             # the Pack's own vitest tests
  storylets/<topic>.yaml     # list of storylets
  occupations/<topic>.yaml   # occupation kinds
  items/<topic>.yaml         # item kinds
  people/<topic>.yaml        # people-generation data (names, stat ranges, roles)
  loans/<topic>.yaml         # loan kinds
  cities/<topic>.yaml        # cities (see Cities)
  standards/<topic>.yaml     # standards of living (see Standards of living)
```

- YAML 1.2 only, read with a strict parser (no implicit `yes`/`no` booleans, no duplicate keys).
- A file holds many items of one kind. Every item has an explicit `id`, unique within its Pack.
- Full ids are namespaced: `<pack-id>/<id>` (for example `core-loop/first-job-offer`). Inside its own Pack, an item may use the short id.

## Topics

- [Manifest, composition and capabilities](manifest.md): `pack.yaml`, qualities, composition rules, capability files.
- [Storylets and the year draw](storylets.md): storylets, repeatable actions, year draw and decision slots.
- [Content kinds](content-kinds.md): market kinds, cities, standards of living, household costs, confinement, NPC careers.
- [Expressions and effects](expressions.md): the expression language, 18+ text variants, effect statements.
- [Text and icons](text-and-icons.md)
- [Build checks](build-checks.md)
