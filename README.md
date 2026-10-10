# life-sim

Offline BitLife-style life sim PWA. TypeScript Core, Preact + signals web app, pnpm workspace, Nix flake. See `CONTEXT.md`, `docs/adr/`, `docs/spec/`. Agents adding content follow [docs/pipeline/README.md](docs/pipeline/README.md).

## Layout

- `packages/core`: pure game Core (no DOM types)
- `packages/pack-tools`: Pack compile/validate tooling
- `packages/harness`: headless balance harness
- `apps/web`: Vite + Preact PWA
- `packs/core-loop`: the core-loop Pack

## Development

```sh
nix develop            # node, pnpm_10, biome, Playwright browsers
pnpm install
pnpm test              # vitest (unit tests are *.test.ts; Playwright specs are *.spec.ts)
pnpm build             # build apps/web
biome check .          # lint + format (biome comes from nixpkgs, not npm)
nix flake check        # biome, vitest, versions (same as CI)
```

## Nix notes

- `@playwright/test` is pinned to exactly nixpkgs' `playwright-driver.version`; the `versions` check fails on drift.
- After changing `pnpm-lock.yaml`, regenerate the pnpm deps hash: set `hash = lib.fakeHash` for `packages.<system>.pnpmDeps` in `flake.nix`, run `nix build .#pnpmDeps`, and copy the `got:` hash.
