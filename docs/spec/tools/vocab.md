# `pnpm tool vocab`

Decided in the restructure (decision 14, issue #199). Prints the state vocabulary of a Pack set as markdown sized for an agent prompt, so an agent that writes content sees every name it may use (and who owns it) without reading the Packs.

## The tool runner

```
pnpm tool                 # list tools
pnpm tool <name> [args]   # run tools/<name>.ts
```

`tools/run.ts` finds tools by listing `tools/*.ts`: a tool is a file that exports `summary` (one line, shown in the list) and `run(argv)` (returns the exit status, or a promise of it). There is no registry, so a new script is one new file. `run.ts` and `*.test.ts` are not tools. An unknown name exits 2.

## `vocab`

```
pnpm tool vocab [--packs a,b] [--packs-dir dir] [--format md|json]
```

- `--packs`: only these Packs and the Packs their capabilities require, transitively (the same closure as `pnpm harness --packs`). Default: every Pack under `packs/`.
- `--packs-dir`: Packs directory (default: the repository's `packs/`).
- `--format`: `md` (default) or `json` (the `Vocab` object exported by `tools/vocab.ts`, 2-space indented).
- Exit 0 on success, 1 when the Packs do not compile (diagnostics on stderr, nothing on stdout), 2 on a usage error.

The output is deterministic: no timestamps, paths or counters, names sorted by id (then owner Pack). `pnpm tool vocab --packs core-loop` is under 600 lines (a test holds it).

## Output

One `#` title (`# Vocabulary: <packs in dependency order>`), then a `##` section per kind of name. A section with nothing in it is left out. Every line starts `- ` with the name as an author writes it in an expression, the owning Pack in parentheses, the type and range, and, after a colon, the meaning.

| Section | Source | Line |
|---|---|---|
| Stats | bundles | `stat.<id>` label and start range |
| Qualities | bundles | `quality.<id>` type, `min..max`, default |
| Person qualities | bundles (`scope: person`) | same; also `person.quality.<id>` |
| State | bundles | `world.<id>` counter, or `table.<id>.<key>` with its keys |
| Readables | bundles and source | readable: type and source expression; slot: how terms combine, default, and the terms other Packs contribute |
| Effect macros | source `effects/*.yaml` | `<pack>.<macro>(params)` (the Pack id with `_` for `-`) |
| Kinds | bundles | kind id, fields and types, and the ids of every entry |
| Roles, Groups, Tags, Milestones | bundles and capabilities | ids with the owning Pack (roles are full ids) |
| Hooks | bundles | statements per phase and Pack |
| Settlement lines | bundles | `<pack>/<id>` income or cost |
| Functions, Effects | Core tables | signatures, assignable roots and operators, aggregators |

The **meaning** of a quality, state container, readable, slot or effect macro is its YAML comment: the `#` lines directly above the entry (no blank line between), then a `#` after it on its first line. A `# yaml-language-server` line is ignored. Write that comment when you declare a name; it is what the vocabulary shows. Names without a comment are listed bare.

Tags and milestones are the ids Packs list under `provides: tags` and `provides: milestones`, plus the tags storylets use and the milestone ids hooks subscribe to. Macros, readable expressions, contribution terms and comments are not kept in compiled bundles, so they are read from the Pack sources under `--packs-dir` (the Packs that compiled).

## Tests

`tools/vocab.test.ts` compiles the fixture Packs in `tools/fixtures/vocab/` and snapshots the markdown to `tools/fixtures/vocab/expected.md` (update it with `pnpm exec vitest run tools -u`). It also checks comment extraction, closure filtering, determinism, `--format json`, argument errors and the 600-line bound on the real `core-loop` closure.
