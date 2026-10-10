# `pnpm tool scaffold`

Decided in the restructure (decision 14, issue #202). Turns a [content sheet](../../pipeline/content-sheet.md) into a storylet YAML skeleton so an implementer does not hand-write boilerplate.

```
pnpm tool scaffold <sheet.md> --pack <id> [--topic name] [--packs-dir dir] [--force] [--stdout]
```

| Option | Meaning |
|---|---|
| `--pack` | Owner Pack. Must equal the sheet's `pack` header. |
| `--topic` | File name under `packs/<id>/storylets/` (default: the sheet title as a slug, `School bully` -> `school-bully.yaml`). |
| `--packs-dir` | Packs directory (default: the repository's `packs/`). |
| `--force` | Overwrite an existing file (default: refuse). |
| `--stdout` | Print the YAML, write nothing. |

Exit 0 on success, 1 when the sheet is rejected or the target exists (nothing is written), 2 on a usage error.

## What it checks (before writing anything)

Every problem is printed as `<sheet>:<line>: <message>`, all of them at once.

1. **Grammar and fields**: the line grammar, required fields, the `event`/`action` rules, once-per-key rules and rate bands, as the sheet document defines them (parser: `tools/lib/sheet.ts`).
2. **Vocabulary**: the Packs of the `packs` header are compiled and `buildVocab` is built from them (the same closure `vocab --packs` prints). In every `when`, `weight`, `amount.*` and `effect` expression the tool rejects: an unknown `stat.<id>`, `quality.<id>` (also `person.quality.<id>`), `world.<id>` or `table.<id>.<key>`; an unknown function, effect or effect macro call; an unknown `target` role. A bare word (a readable or an id literal) is left to `pack-tools validate`.
3. **References**: a `next` must name a storylet of the sheet or an existing storylet of the Pack; a storylet id must not already exist in the Pack.

A name the sheet lists in a `needs` line is accepted: the implementer declares it in the Pack, and the tool prints the `needs` lines after writing as a to-do list.

## Output

One YAML list in the Pack's storylet format, in the field order the Packs use: `id`, `icon`, `trigger`, `menu`, `label`, `tags`, `scope`, `target`, `chance`/`weight`, `when`, repeat limits, `repeat`, `amount`, `text`, then `choices` (each `label`, `when`, `outcomes`) or `outcomes`; an outcome is `weight`, `when`, `text`, `effects`, `next`. Prose and effects are copied verbatim (quoted when YAML needs it). `opens`, `rate` and `needs` are not written. The sheet's `packs` header and `pack-tools validate` remain the final judge: run `pack-tools validate packs` after scaffolding (and after declaring `needs`).
