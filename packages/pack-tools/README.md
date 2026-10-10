# @life/pack-tools

Build-time Pack compiler (Node). Source format: [docs/spec/pack-format/index.md](../../docs/spec/pack-format/index.md).

```
node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs
node --experimental-strip-types packages/pack-tools/src/cli.ts build packs out/
node --experimental-strip-types packages/pack-tools/src/cli.ts lock packs      # tag workflow only
node --experimental-strip-types packages/pack-tools/src/cli.ts schema          # regenerate schema/*.json
```

`validate` exits non-zero and prints `file:line:col (item.path): message` per error. A directory under `packs/` without a `pack.yaml` and without content directories is skipped.

## Source layout additions

`qualities/<topic>.yaml` holds quality declarations (a list, merged across files); `qualities` in `pack.yaml` is an error. `compilePacks(dir, { only: ["gambling"] })` compiles the named Packs and the Packs their capabilities require; `packs/<id>/test/*.test.ts` are collected by the root vitest config.

The spec lists `storylets/`, `occupations/`, `items/`, `people/`. The compiler adds `loans/<topic>.yaml` (loan kinds: `id`, `label`, `rate` such as `6.5%`, `term_years`, `secured`). `cities/<topic>.yaml` holds cities (`id`, `label`, `cost_index` such as `130%`, `weight` for the birth draw, optional `wage_index` and `country`). `standards/<topic>.yaml` holds standards of living (`cost`, `happiness`, `health`, `cap`, `risk`); the manifest's `living` block names the default standard, housing share and home category; an occupation may set `provides_housing: true` or `confines: { menus, events }` (see the pack-format spec). Files in `people/` hold `kind: role` or `kind: generator` items. Editors pick up the JSON Schemas in `schema/*.schema.json` through a `# yaml-language-server: $schema=...` header.

- Item and occupation expressions are checked against the base names; item `value` also sees `asset.purchase_price`, `asset.value`, `asset.years`.
- Ids are unique within a Pack across all kinds. In expressions a hyphenated id must be written namespaced (`core-loop/first-job`); a bare `first-job` would parse as subtraction.
- A name bound by `spawn_person(...) as n` is visible to later effects and the text of the same outcome (`{n.first_name}`, `{n.last_name}`, `{n.age}`).

## Permanent ids

`packs/<id>/ids.lock.json` (`{ pack, ids[] }`) records the ids of a release: every content id plus `stat.<id>`, `quality.<id>`, `state.<id>`, `readable.<id>` and `kind.<id>`. **Pull requests never edit it.** Only the tag workflow rewrites it (`cli.ts lock packs`) and commits it with the `v<N>` tag.

The compiler reads the lock as committed at the last release tag (`git show <tag>:packs/<id>/ids.lock.json`; the tag with the highest `v<N>`), not from the working tree. If a locked id is gone, the build fails unless a `migrations/<name>.yaml` names it with `rename` (`from`, `to`) or `remove` (`id`, optional `fallback`). With no `v<N>` tag, outside a git checkout (the hermetic Nix checks), or for a Pack with no lock at the tag, nothing is compared; `validate` prints `note: ...` saying so. The `ids-lock` CI job runs `validate` on a full clone with tags, so removals fail on pull requests.

## Output (`build packs <out>`)

- `<pack>.json`: `PackBundle` from `@life/core` (`packages/core/src/pack.ts`). All ids are namespaced; expressions are ASTs.
- `index.json`: bundles in requirement order (`{ packs: [{ id, file }] }`).
- `icons.json`: referenced icons. Twemoji SVGs are copied to `icons/twemoji/<codepoints>.svg` from the pinned `@twemoji/svg` package.
- `credits.json`: Twemoji (CC BY 4.0), per-author game-icons (CC BY 3.0, modified), Lucide (ISC) and Feather (MIT).

Gap: game-icons.net glyphs are validated by syntax only (`gameicons/<author>/<name>`) and listed with `file: null`. There is no hermetic source for the SVGs in the pnpm dependency set (the Nix build has no network), so whoever first uses a game-icons badge must vendor the SVG and extend the compiler's catalog check.
