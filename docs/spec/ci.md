# CI and checks

Decided in [CI runner and check placement](https://github.com/jeiang/life-sim/issues/19). Tooling facts come from the [Nix flake research](https://github.com/jeiang/life-sim/blob/research/nix-flake/docs/research/nix-flake.md); buildbot facts come from `cornn-flaek/modules/buildbot/default.nix`.

## Runner

- buildbot-nix on `ricklent`, the existing cluster CI. It evaluates the flake and builds every check and package on x86_64-linux for each pull request and each push, and reports the results as GitHub status checks.
- Setup (one time): install the buildbot GitHub App on `jeiang/life-sim` (the repo is private) and add the repo topic `build-with-buildbot`. buildbot's `userAllowlist` already includes `jeiang`.
- After a merge, default-branch outputs are pushed to garret (`cache.jeiang.dev`) by a timer within about 5 minutes, so cluster deploys can download them. Pull-request outputs are not pushed.

## Checks

All checks are hermetic `checks.<system>.*` flake outputs, so `nix flake check` runs the same set locally and in CI.

| Check | What it does |
|---|---|
| `biome` | `biome ci .`, with GritQL plugins banning `Math.random`, `Date.now`, and transcendental `Math.*` in `packages/core` (ADR 0001) |
| `vitest` | Unit tests for Core and Pack tooling. Playwright specs are excluded from Vitest collection |
| `packs` | Compiles and validates all Packs (see [Pack format](pack-format.md#build-checks)) |
| `versions` | Fails when npm pins for `@playwright/test` (and `@biomejs/biome`, if kept) differ from the nixpkgs versions |
| `e2e` | Playwright on Chromium and WebKit against the built app, including the same-seed golden check |
| balance harness | Added once [Balance harness scope](https://github.com/jeiang/life-sim/issues/20) is decided |

- Tool versions (Node, pnpm, Biome, Playwright browsers) come from `flake.lock`. Bumping nixpkgs is deliberate and fails `versions` until the npm pins match.
- Playwright uses `PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}`.

## Open risk

WebKit for Playwright on x86_64-linux inside the Nix sandbox is not yet verified (darwin was verified). The first build task proves the `e2e` check on buildbot, setting `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` if needed. If it cannot run, reopen the CI decision; the fallback is a non-hermetic e2e job.

## Merge flow

- `main` is protected. Changes land through pull requests only, and every buildbot check is required to merge. Build subagents work on branches and open pull requests.
- Running `nix flake check` locally on the Mac (aarch64-darwin) before pushing is optional.
