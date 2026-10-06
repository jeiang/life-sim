# CI and checks

Decided in [CI runner and check placement](https://github.com/jeiang/life-sim/issues/19). Tooling facts come from the [Nix flake research](https://github.com/jeiang/life-sim/blob/research/nix-flake/docs/research/nix-flake.md); buildbot facts come from `cornn-flaek/modules/buildbot/default.nix`.

## Runner

- buildbot-nix on `ricklent`, the existing cluster CI. It evaluates the flake and builds every check and package on x86_64-linux for each pull request and each push, and reports the results as GitHub status checks.
- Setup (one time): install the buildbot GitHub App on `jeiang/life-sim` (needed while the repo is private; it becomes public before the first deploy, see [deploy](deploy.md#visibility)) and add the repo topic `build-with-buildbot`. buildbot's `userAllowlist` already includes `jeiang`. Branch protection is available on the user's GitHub Pro plan.
- After a merge, default-branch outputs are pushed to garret (`cache.jeiang.dev`) by a timer within about 5 minutes, so cluster deploys can download them. Pull-request outputs are not pushed.

## Checks

All checks are hermetic `checks.<system>.*` flake outputs, so `nix flake check` runs the same set locally and in CI.

| Check | What it does |
|---|---|
| `biome` | `biome ci .`, with GritQL plugins banning `Math.random`, `Date.now`, and transcendental `Math.*` in `packages/core` (ADR 0001) |
| `vitest` | Unit tests for Core and Pack tooling. Playwright specs are excluded from Vitest collection |
| `packs` | Compiles and validates all Packs (see [Pack format](pack-format.md#build-checks)) |
| `versions` | Fails when npm pins for `@playwright/test` (and `@biomejs/biome`, if kept) differ from the nixpkgs versions |
| `e2e` | Playwright on Chromium and WebKit against the built app; axe-core on every screen kind in light and dark themes ([visual](visual.md#accessibility-wcag-22-aa)); and the in-run determinism comparison of 20 seeded lives across Node, Chromium, and WebKit ([harness](harness.md#determinism-check-in-e2e)) |
| `harness` | 1,000 seeded lives across player profiles. Fails on engine faults, and writes a balance report ([harness](harness.md)) |

- Tool versions (Node, pnpm, Biome, Playwright browsers) come from `flake.lock`. Bumping nixpkgs is deliberate and fails `versions` until the npm pins match.
- Playwright uses `PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}`.

## Open risk

Resolved (issue #30): Playwright Chromium and WebKit both run in the x86_64-linux Nix sandbox on buildbot. `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` was not needed. The `e2e` check (defined on x86_64-linux, aarch64-linux, and aarch64-darwin, where nixpkgs ships the browsers) sets:

- `PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`.
- `HOME=$TMPDIR` and `XDG_RUNTIME_DIR=$TMPDIR/xdg` (mode 700), plus a `FONTCONFIG_FILE` with DejaVu fonts.
- On Linux only, WPE WebKit aborts with "Could not create EGL display: no supported platform available" without a GPU. The fix is Mesa software rendering: `EGL_PLATFORM=surfaceless`, `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe`, `__EGL_VENDOR_LIBRARY_FILENAMES` pointing at Mesa's `50_mesa.json`, `LIBGL_DRIVERS_PATH=${pkgs.mesa}/lib/dri`, and `LD_LIBRARY_PATH` including `libglvnd` and `mesa`.

The e2e specs and a stub page live in `e2e/`; the app e2e suites extend this setup.

## Merge flow

- `main` is protected. Changes land through pull requests only, and every buildbot check is required to merge. Build subagents work on branches and open pull requests.
- Running `nix flake check` locally on the Mac (aarch64-darwin) before pushing is optional.

## Project dependency sync

`.github/workflows/project-deps.yml` (script: `.github/scripts/project-deps.cjs`, run by `actions/github-script`, pinned by commit SHA) keeps the Status field of user project #2 in sync with GitHub issue dependencies ("blocked by" links). It is the only GitHub Actions workflow; CI proper stays on buildbot.

- Triggers: `issues` closed/reopened (recomputes the issues the changed issue blocks), hourly `schedule` and `workflow_dispatch` (recompute every open project issue; catches new links and manual edits).
- Only two transitions, so it is conservative. Blocked becomes Todo when no blocker is open, with one comment, "Unblocked: all blockers are closed (#a, #b).". Todo or empty becomes Blocked when a blocker is open and the issue has no assignee and no open linked pull request. In Progress, Done, and closed issues are never touched. Re-running changes nothing.
- Token split: the default `GITHUB_TOKEN` (`issues: write`) reads issue data and posts the comment; `PROJECT_TOKEN` is used only for Projects v2 reads and updates.
- Without the `PROJECT_TOKEN` secret the job logs a notice and skips.

### `PROJECT_TOKEN` setup (one time)

`GITHUB_TOKEN` cannot write user-owned Projects v2, and fine-grained personal access tokens have no Projects permission for user-owned projects, so a classic personal access token is required.

1. GitHub, Settings, Developer settings, Personal access tokens, Tokens (classic), Generate new token (classic).
2. Scope: `project` only (the repository is public, so no `repo` scope is needed). Set an expiry and generate. Copy the token.
3. Add it as a repository secret: `gh secret set PROJECT_TOKEN --repo jeiang/life-sim` (paste when prompted), or Settings, Secrets and variables, Actions, New repository secret.
4. Optionally run it once: `gh workflow run project-deps.yml --repo jeiang/life-sim`.
