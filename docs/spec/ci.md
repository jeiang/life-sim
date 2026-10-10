# CI and checks

Decided in [CI runner and check placement](https://github.com/jeiang/life-sim/issues/19). Tooling facts come from the [Nix flake research](https://github.com/jeiang/life-sim/blob/research/nix-flake/docs/research/nix-flake.md); buildbot facts come from `cornn-flaek/modules/buildbot/default.nix`.

## Runner

- Pull requests are gated by GitHub Actions on GitHub-hosted `ubuntu-latest` runners (`.github/workflows/ci.yml`, workflow `ci`). Nix comes from `cachix/install-nix-action`; the Nix store is cached per leg with `nix-community/cache-nix-action` (GitHub's Actions cache, no secret). Actions are pinned by commit SHA and the workflow has `permissions: contents: read`.
- Jobs: `eval` (`nix flake check --no-build`), `check (<name>)` (a matrix leg per flake check below, each `nix build .#checks.x86_64-linux.<name>`), and `package` (`nix build .#packages.x86_64-linux.default`). Runs are cancelled per ref when a newer push arrives.
- `ids-lock` runs `pack-tools validate packs` on a full clone with tags, so the shipped-id check (against `ids.lock.json` at the last `v<N>` tag) runs; the hermetic `packs` check has no git history and skips it. Pull requests do not edit `ids.lock.json`.
- buildbot-nix on `ricklent` (cluster CI) builds only `main` after a merge and pushes the outputs to garret (`cache.jeiang.dev`) within about 5 minutes so cluster deploys can download them. It never builds pull requests and is not a required check.
- The separate `harness-10k` workflow (10,000 lives) is informational and not required.

## Checks

All checks are hermetic `checks.<system>.*` flake outputs, so `nix flake check` runs the same set locally and in CI.

| Check | What it does |
|---|---|
| `biome` | `biome ci .`, with GritQL plugins banning `Math.random`, `Date.now`, and transcendental `Math.*` in `packages/core` (ADR 0001) |
| `typecheck` | `tsc` for every workspace package (including Core's test project) and for `packs/*/test` (`packs/tsconfig.json`) |
| `vitest` | Unit tests for Core and Pack tooling, plus each Pack's own `packs/<id>/test/`. Tests of a real Pack compile it with `compilePacks({ only })` (its required closure), so another Pack's content cannot break them. Playwright specs are excluded from Vitest collection |
| `packs` | Compiles and validates all Packs (see [Pack format](pack-format/build-checks.md#build-checks)) |
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

## GitHub Actions: release (`v<N>`)

`.github/workflows/release.yml` runs when the user pushes a `v<N>` tag (decision 10), and on `workflow_dispatch` as a dry run (smaller sizes, a throwaway `tag` input only used for the seed, and it never pushes a branch or touches a release). Nobody else cuts releases.

- `prepare` derives the seed from the tag (`20260101 + N`, so a re-run reproduces the report) and the lists of shards and forced scripts (`harness --list-scripts`).
- `shards`: 8 shards of 12,500 lives (100,000 lives, `--profile all`, `--shard i/8`), one runner each. A shard fails on engine faults.
- `scripts`: each forced script (`<pack>/<name>`) runs by itself, 1,000 lives, and fails on faults or a forced entry that never matched.
- `merge`: `harness merge --fail-on faults,never-fired` over the shard artifacts, so content no life reached fails the release. It writes the job summary and uploads the `release-report` artifact (`report.md`, `report.json`, `summary.md`) even when it fails.
- `locks`: `pack-tools lock packs` on a full clone, uploaded as the `ids-locks` artifact.
- `publish` (tag pushes, all of the above green): commits the refreshed `ids.lock.json` files to the branch `release/v<N>-locks` (one commit on top of the tagged commit; a PR to `main` is opened when the repository lets Actions create PRs), and attaches the merged report, each script's report and the summary to the `v<N>` GitHub release (created if absent).
- The tag is **not** moved. The compiler reads locks from `git show v<N>:packs/<id>/ids.lock.json`, so the locks take effect as the baseline only once the tag points at a commit that contains them; until then the check for a Pack with no lock at the tag compares nothing. To make `release/v<N>-locks` the baseline, move the tag to it (`git tag -f v<N> origin/release/v<N>-locks && git push -f origin v<N>`; the workflow runs again and finds the locks unchanged).
- Dry run: `gh workflow run release.yml --ref <branch> -f tag=v0-test -f lives=400 -f shards=2`; add `-f inject_fault=true` to include `.github/release-fixtures/never-matched.yaml`, a forced script whose step never matches, which must turn the run red.

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
