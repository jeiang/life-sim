# CI and checks

Decided in [CI runner and check placement](https://github.com/jeiang/life-sim/issues/19). Tooling facts come from the [Nix flake research](https://github.com/jeiang/life-sim/blob/research/nix-flake/docs/research/nix-flake.md); buildbot facts come from `cornn-flaek/modules/buildbot/default.nix`.

## Runner

- Pull requests are gated by GitHub Actions on GitHub-hosted `ubuntu-latest` runners (`.github/workflows/ci.yml`, workflow `ci`). Nix comes from `cachix/install-nix-action`; the Nix store is cached per leg with `nix-community/cache-nix-action` (GitHub's Actions cache, no secret). Actions are pinned by commit SHA and the workflow has `permissions: contents: read`.
- Jobs: `eval` (`nix flake check --no-build`), `check (<name>)` (a matrix leg per flake check below, each `nix build .#checks.x86_64-linux.<name>`), and `package` (`nix build .#packages.x86_64-linux.default`). Runs are cancelled per ref when a newer push arrives.
- buildbot-nix on `ricklent` (cluster CI) builds only `main` after a merge and pushes the outputs to garret (`cache.jeiang.dev`) within about 5 minutes so cluster deploys can download them. It never builds pull requests and is not a required check.
- The separate `harness-10k` workflow (10,000 lives) is informational and not required.

## Checks

All checks are hermetic `checks.<system>.*` flake outputs, so `nix flake check` runs the same set locally and in CI (the `typecheck` step runs inside `vitest`).

| Check | What it does |
|---|---|
| `biome` | `biome ci .`, with GritQL plugins banning `Math.random`, `Date.now`, and transcendental `Math.*` in `packages/core` (ADR 0001) |
| `vitest` | Unit tests for Core and Pack tooling. Playwright specs are excluded from Vitest collection |
| `packs` | Compiles and validates all Packs (see [Pack format](pack-format.md#build-checks)) |
| `versions` | Fails when npm pins for `@playwright/test` (and `@biomejs/biome`, if kept) differ from the nixpkgs versions |
| `e2e` | Playwright on Chromium and WebKit against the built app; axe-core on every screen kind in light and dark themes ([visual](visual.md#accessibility-wcag-22-aa)); and the in-run determinism comparison of 20 seeded lives across Node, Chromium, and WebKit ([harness](harness.md#determinism-check-in-e2e)) |
| `harness` | 1,000 seeded lives across player profiles. Fails on engine faults, and writes a balance report ([harness](harness.md)) |

- The full 10,000-life run is not a flake check. It runs on GitHub Actions (below).
- Tool versions (Node, pnpm, Biome, Playwright browsers) come from `flake.lock`. Bumping nixpkgs is deliberate and fails `versions` until the npm pins match.
- Playwright uses `PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}`.

## GitHub Actions: 10,000-life harness

`.github/workflows/harness.yml` (job `harness-10k`) runs on every pull request, every push to `main`, and on demand. The repository is public, so the free `ubuntu-latest` runner is used. Actions are pinned by commit SHA, the token has `contents: read` and `pull-requests: write` (plus `actions: read` to fetch main's last report), and a new push to a pull request cancels its in-progress run.

- It installs Node 24 and pnpm 10 (pnpm store cached by `actions/setup-node`), runs `pnpm install --frozen-lockfile`, then `harness --lives 10000 --profile all --seed 20260101 --jobs $(nproc)` ([harness](harness.md)).
- The full `report.md`, `report.json` and console output are uploaded as the `harness-report` artifact. On pull requests from this repository, one sticky comment (marker `<!-- harness-10k -->`) is created and then updated with headline balance numbers, any faults, and a column from main's last successful run. Every run also writes the same text to the job summary. The text comes from `.github/scripts/harness-summary.mjs`.
- The job fails on engine faults only (the CLI's exit status). There are no machine-checkable balance targets yet, so none are enforced.
- `harness-10k` is not (yet) a required status check on `main`: pull requests opened before the workflow landed have no run until they next push, so requiring it would block them. `workflow_dispatch` runs on a branch (and comments on its open PR) only if the branch already contains the workflow file.
- Agents tune locally with `--lives 2000 --jobs 4`; the final 10,000-life numbers in `BALANCE.md` come from the CI report on the pull request.

## Open risk

Resolved (issue #30): Playwright Chromium and WebKit both run in the x86_64-linux Nix sandbox on buildbot. `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` was not needed. The `e2e` check (defined on x86_64-linux, aarch64-linux, and aarch64-darwin, where nixpkgs ships the browsers) sets:

- `PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`.
- `HOME=$TMPDIR` and `XDG_RUNTIME_DIR=$TMPDIR/xdg` (mode 700), plus a `FONTCONFIG_FILE` with DejaVu fonts.
- On Linux only, WPE WebKit aborts with "Could not create EGL display: no supported platform available" without a GPU. The fix is Mesa software rendering: `EGL_PLATFORM=surfaceless`, `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`, `__EGL_VENDOR_LIBRARY_FILENAMES` pointing at Mesa's `50_mesa.json`, `LIBGL_DRIVERS_PATH=${pkgs.mesa}/lib/dri`, and `LD_LIBRARY_PATH` including `libglvnd` and `mesa`.

The e2e specs and a stub page live in `e2e/`; the app e2e suites extend this setup.

## Merge flow

- `main` is protected. Changes land through pull requests only. Required status contexts: `eval`, `package`, and `check (biome)`, `check (vitest)`, `check (versions)`, `check (packs)`, `check (e2e)`, `check (harness)`. Not strict (an up-to-date branch is not required) and enforced for admins. Adding a flake check means adding it to the matrix and to the required contexts.
- Build subagents work on branches, open pull requests, and merge them when the `ci` checks are green.
- Running `nix flake check` locally on the Mac (aarch64-darwin) before pushing is optional.
