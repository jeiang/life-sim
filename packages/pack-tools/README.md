# @life/pack-tools

Build-time Pack compiler (Node). Source format: [docs/spec/pack-format.md](../../docs/spec/pack-format.md).

```
node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs
node --experimental-strip-types packages/pack-tools/src/cli.ts build packs out/
node --experimental-strip-types packages/pack-tools/src/cli.ts lock packs      # at release time
node --experimental-strip-types packages/pack-tools/src/cli.ts schema          # regenerate schema/*.json
```

`validate` exits non-zero and prints `file:line:col (item.path): message` per error. A directory under `packs/` without a `pack.yaml` and without content directories is skipped.

## Source layout additions

The spec lists `storylets/`, `occupations/`, `items/`, `people/`. The compiler adds `loans/<topic>.yaml` (loan kinds: `id`, `label`, `rate` such as `6.5%`, `term_years`, `secured`). `cities/<topic>.yaml` holds cities (`id`, `label`, `cost_index` such as `130%`, `weight` for the birth draw, optional `wage_index` and `country`). `standards/<topic>.yaml` holds standards of living (`cost`, `happiness`, `health`, `cap`, `risk`); the manifest's `living` block names the default standard, housing share and home category; an occupation may set `provides_housing: true`. Files in `people/` hold `kind: role` or `kind: generator` items. Editors pick up the JSON Schemas in `schema/*.schema.json` through a `# yaml-language-server: $schema=...` header.

- Item and occupation expressions are checked against the base names; item `value` also sees `asset.purchase_price`, `asset.value`, `asset.years`.
- Ids are unique within a Pack across all kinds. In expressions a hyphenated id must be written namespaced (`core-loop/first-job`); a bare `first-job` would parse as subtraction.
- A name bound by `spawn_person(...) as n` is visible to later effects and the text of the same outcome (`{n.first_name}`, `{n.last_name}`, `{n.age}`).

## Permanent ids

`packs/<id>/ids.lock.json` (`{ pack, version, ids[] }`) records the ids of the last release: every content id plus `stat.<id>` and `quality.<id>`. If a locked id is gone, the build fails unless `migrations.rename` (`from`, `to`) or `migrations.remove` (`id`, optional `fallback`) in `pack.yaml` names it. Run `cli.ts lock packs` after cutting a release to refresh the lock. A Pack with no lock file has not been released yet.

## Output (`build packs <out>`)

- `<pack>.json`: `PackBundle` from `@life/core` (`packages/core/src/pack.ts`). All ids are namespaced; expressions are ASTs.
- `index.json`: bundles in dependency order.
- `icons.json`: referenced icons. Twemoji SVGs are copied to `icons/twemoji/<codepoints>.svg` from the pinned `@twemoji/svg` package.
- `credits.json`: Twemoji (CC BY 4.0), per-author game-icons (CC BY 3.0, modified), Lucide (ISC) and Feather (MIT).

Gap: game-icons.net glyphs are validated by syntax only (`gameicons/<author>/<name>`) and listed with `file: null`. There is no hermetic source for the SVGs in the pnpm dependency set (the Nix build has no network), so whoever first uses a game-icons badge must vendor the SVG and extend the compiler's catalog check.
