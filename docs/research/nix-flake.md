# Nix flake packaging for the chosen stack

## Question

How does the chosen stack (ADR 0001: pnpm workspace on Node, Vite + vite-plugin-pwa app, Vitest, Playwright on Chromium + WebKit, Biome with GritQL plugins) build reproducibly in a Nix flake: dev shell, a static `dist/` package output, and `nix flake check` checks for lint, tests, and Pack validation? Ticket #14.

## Summary

- **Use the current helpers**: top-level `fetchPnpmDeps` + `pnpmConfigHook` (+ optional `pnpmBuildHook`), `fetcherVersion = 4`, `pnpm_10` (or `pnpm_11`) pinned. The old `pnpm.fetchDeps` / `pnpm.configHook` attributes still exist but are deprecated aliases (they warn). `fetcherVersion` 1 and 2 were *removed* in the 26.11 release; `fetcherVersion` is mandatory.
- **Verified end to end on `aarch64-darwin`** with a throwaway pnpm workspace (Preact + Vite 7 + vite-plugin-pwa 1.3, vitest, Playwright 1.63, Biome) and a flake on nixpkgs `nixos-unstable` (rev `a7868a7`): `nix build` produced a `dist/` containing `index.html`, hashed `assets/`, `sw.js`, `workbox-*.js`, `manifest.webmanifest`, `registerSW.js` (44 KB); `nix build --rebuild` reproduced it bit-for-bit (exit 0); Biome, Vitest, Pack-validation, and a Playwright **Chromium + WebKit** e2e run all passed as flake checks. Linux was only evaluated, never built (no Linux builder on this machine).
- **Playwright**: use `pkgs.playwright-driver.browsers` with `PLAYWRIGHT_BROWSERS_PATH`, and keep the npm `@playwright/test` pinned to *exactly* `pkgs.playwright-driver.version` (browser revisions are version-keyed). nixpkgs ships WebKit for `x86_64-linux`, `aarch64-linux`, and `aarch64-darwin` (not `x86_64-darwin`). Darwin WebKit was verified here; Linux WebKit is cited only.
- **Biome: take it from nixpkgs, not npm.** GritQL plugins work in the nixpkgs build (verified). nixpkgs lags npm by a patch release at times (2.5.14 vs npm 2.5.15 on the day), so add a version-agreement check or drop the npm copy.
- **Cluster consumption**: expose `packages.<system>.default` whose output holds `dist/` (so `"${pkg}/dist"` is the Caddy `root`), exactly the shape `bill-splitter` uses in the cluster repo.

## Findings

### 1. pnpm helpers in current nixpkgs

Checked against nixpkgs `nixos-unstable` (lib version `26.11.20260923`), reading the manual source `doc/languages-frameworks/javascript.section.md`, `doc/hooks/pnpm.section.md`, and `pkgs/build-support/node/fetch-pnpm-deps/`.

- **Names.** The manual's "pnpm" section documents `fetchPnpmDeps` (fetcher) and `pnpmConfigHook` (setup hook), both top-level, plus `pnpmBuildHook` ("overrides the default build phase for building packages that use pnpm", `doc/hooks/pnpm.section.md`). In `pkgs/development/tools/pnpm/generic.nix` the old `pnpm.fetchDeps` and `pnpm.configHook` are kept as deprecated passthru attributes whose messages say "The package attribute is deprecated. Use the top-level fetchPnpmDeps / pnpmConfigHook attribute instead".
- **pnpm versions.** Top-level `pnpm` plus `pnpm_9`, `pnpm_10`, `pnpm_10_29_2`, `pnpm_11`. The manual: "It is recommended to pin pnpm to a major version, due to regular breaking changes in the store format". Pass the same `pnpm` to both `fetchPnpmDeps` (`inherit pnpm`) and `nativeBuildInputs`. The fetcher aborts if the lockfile's `lockfileVersion` major exceeds the pnpm major (`fetch-pnpm-deps/default.nix`). Release note (`rl-2611`): `pnpm_10` moved to 10.34.1+ with stricter integrity checks, with `pnpm_10_34_0` as a fallback for `ERR_PNPM_MISSING_TARBALL_INTEGRITY`. Locally `pnpm_10` = 10.34.5, `pnpm_11` also available.
- **`fetcherVersion`** (manual section "pnpm `fetcherVersion`"): "Use `4` for new packages". 1 and 2 are removed in 26.11 (evaluation throws); 3 = reproducible tarball (NixOS/nixpkgs#469950); 4 = dumps the pnpm 11 SQLite index to SQL text (NixOS/nixpkgs#522703). Version 3 is rejected with pnpm 11+ (assert in `default.nix`). "When upgrading to a newer `fetcherVersion`, you need to regenerate the hash." Not setting it throws.
- **How the fetcher works** (source `fetch-pnpm-deps/default.nix`): a fixed-output derivation (`outputHashMode = "recursive"`) running `pnpm install --force --ignore-scripts --frozen-lockfile` into a throwaway store dir, then normalising (sorted JSON, stripped `checkedAt`, fixed permissions) and packing a reproducible `pnpm-store.tar.zst`. `--force` fetches optionalDependencies for *all* platforms, so one hash covers Linux and darwin. `--ignore-scripts` means postinstall scripts run later in the hook-less build, not at fetch. Options: `pnpmWorkspaces` (adds `--filter=<name>` flags), `pnpmInstallFlags`, `prePnpmInstall`, `sourceRoot`/`pnpmRoot`.
- **`pnpmConfigHook`** (`pnpm-config-hook.sh`): unpacks the tarball to a temp store, sets `store-dir`, `package-import-method clone-or-copy`, platform/arch env from the target platform, runs `pnpm install --offline --frozen-lockfile --ignore-scripts`, then `patchShebangs node_modules`. Then `buildPhase` runs whatever you write (or `pnpmBuildHook`).
- **Workspaces.** Manual: set `pnpmWorkspaces` and build with `pnpm --filter=<name> build` ("`npmHooks.npmBuildHook` may not work"). In the experiment I left `pnpmWorkspaces` empty (install all packages, needed because the check derivations also run Vitest/Biome tooling from the root) and built with `pnpm --filter @life/app build`.
- **Hash workflow** (observed): write `hash = lib.fakeHash` (or `""`), run `nix build .#pnpmDeps`, copy the `got: sha256-...` from the mismatch error. Re-do whenever `pnpm-lock.yaml`, the pnpm version, or `fetcherVersion` changes. Observed: first fetch of a 458-package lock took about 47 s wall time including toolchain download.
- **Keep source edits from invalidating the hash.** The FOD's *derivation* hash includes `src`; a changed `src` forces a re-fetch (the output hash would not change but the download re-runs). The experiment passes `fetchPnpmDeps` a `lib.fileset.toSource` containing only `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and each workspace member's `package.json` (the same file subset pnpm needs for `--frozen-lockfile`), and the build gets the full tree. This worked. [INFERENCE: with `lib.fileset`, adding a new workspace package means adding its `package.json` to that list; a `fs.fileFilter (f: f.name == "package.json")` would avoid forgetting.]
- **Alternatives considered.** `buildNpmPackage` (npm lock only), `bun2nix` / `pnpm2nix`-style generators and `dream2nix`: not needed because ADR 0001 fixed pnpm and nixpkgs has first-party pnpm support. The Rust/Zig WASM toolchains named in the ticket are moot because ADR 0001 chose a TypeScript Core.

### 2. Package output (static `dist/`)

Experiment flake (kept to the essentials; full file in Appendix A):

```nix
pnpmDeps = pkgs.fetchPnpmDeps {
  pname = "life-sim"; version = "0"; src = depsSrc;   # manifests + lockfile only
  pnpm = pkgs.pnpm_10; fetcherVersion = 4; hash = "sha256-...";
};
default = pkgs.stdenvNoCC.mkDerivation {
  pname = "life-sim-dist"; version = "0"; inherit src pnpmDeps;
  nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.pnpmConfigHook ];
  buildPhase = ''pnpm --filter @life/app build'';
  installPhase = ''mkdir -p $out && cp -r packages/app/dist $out/dist'';
};
```

What was **actually built** (aarch64-darwin, nixos-unstable `a7868a727837`, node 24.21.0, pnpm 10.34.5, Vite 7.3.6, vite-plugin-pwa 1.3.0): `nix build .#default` OK in about 17 s once the store was fetched; output tree `dist/{index.html,sw.js,workbox-2fbc6a65.js,registerSW.js,manifest.webmanifest,assets/index-BLI9cPDs.js}`, 44 KB; workbox reported "precache 4 entries (11.72 KiB)". `nix build .#default --rebuild` (rebuild and compare) exited 0, so the Workbox revision hashes and SW were deterministic in this trivial app. [INFERENCE: stays true with larger apps provided Vite config has no timestamps/random; re-check with the real app.] Wrapping in `$out/dist` is a convention choice made to match the cluster's `"${pkg}/dist"` pattern.

Notes:
- `stdenvNoCC` suffices (no C compiler needed) unless some dependency compiles native code (`pnpmConfigHook` runs install with `--ignore-scripts`, so native postinstalls are skipped; esbuild and Rollup ship prebuilt platform binaries as optionalDependencies and worked).
- On Linux the Nix sandbox forbids network: the build must not call out (no Google Fonts, no `workbox` CDN). This host runs with `sandbox = false` (from `nix show-config`), so a network violation would **not** have been caught here.
- Build the app with a `VITE_`/`define` of the git revision from `self.shortRev` if wanted; none was tried.

### 3. Dev shell

```nix
devShells.default = pkgs.mkShell {
  packages = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.biome ];
  PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
};
```

`nix develop -c ...` printed node v24.21.0, pnpm 10.34.5, biome 2.5.15, and a `PLAYWRIGHT_BROWSERS_PATH` containing `chromium-1243 chromium_headless_shell-1243 ffmpeg-1011 firefox-1543 webkit-2359` (verified). The same Node major should be used in the build derivation (`nodejs_24` above) and the dev shell; pin one `nodejs` variable shared by both. The lockfile's `packageManager` field in the experiment was `pnpm@10.34.5`; pnpm's own manage-package-manager-versions behaviour is disabled by the hook (`pnpm config set manage-package-manager-versions false`), so a mismatch between that field and Nix's pnpm does not try to download a different pnpm. Enable `packageManager` only as documentation and keep Nix authoritative.

### 4. Checks in `nix flake check`

Every check below was written and **run on aarch64-darwin** (all four passing after fixing my own sample code; the failures are informative, see below). Linux and aarch64-linux were evaluated with `nix flake check --all-systems --no-build` only.

| Check | How | Observed |
| --- | --- | --- |
| `biome` | `runCommand` with `pkgs.biome`, `cp` the source, `biome ci .` | First run failed on my deliberately unformatted sample code (10 errors, build exit 1), passed after `biome check --write`. So a failing lint fails the check. |
| `vitest` | `stdenvNoCC` + `pnpmConfigHook`, `checkPhase = pnpm exec vitest run packages/core` | Passed. The first attempt ran `vitest run` unscoped and failed because Vitest also collected the Playwright `*.spec.ts` and threw "Playwright Test did not expect test() to be called here". Real repo needs a Vitest `exclude`/project split between unit and e2e. |
| `packs` | same shape, `node --experimental-strip-types packages/pack-tools/src/validate.ts packs` | Passed ("packs ok"). Node 24 strips TypeScript types natively, so the Pack validator can run without a build step. [INFERENCE: whether the real Pack tool needs a compile step depends on its `tsconfig` (enums, path aliases are not stripped).] |
| `versions` | `runCommand` comparing `pnpm-lock.yaml`'s `@playwright/test` and `package.json`'s `@biomejs/biome` to `pkgs.playwright-driver.version` / `pkgs.biome.version` | Playwright matched (1.63.0 = 1.63.0); Biome **mismatched** (package.json pinned 2.5.14, flake's nixpkgs has 2.5.15) and the check correctly failed. This is exactly the drift the ADR consequence warns about. |
| `e2e` | `pnpmConfigHook` build + `pnpm exec playwright test` against `vite preview` with `PLAYWRIGHT_BROWSERS_PATH` | Passed, Chromium 153.0.8010.12 and WebKit 26.6 (UA `Version/26.6 Safari/605.1.15`) both rendered the page (`2 passed (3.1s)`). |

Design notes:
- Check derivations that need `node_modules` reuse `pnpmDeps` and the hook, so no extra network fetch.
- `nix flake check` builds every `checks.<system>` for the *current* system only (plus evals the rest). Checks named `e2e` need a platform with Playwright browsers in nixpkgs (`x86_64-linux`, `aarch64-linux`, `aarch64-darwin`).
- The determinism golden check from the ADR (same seed gives identical output on WebKit) belongs in the `e2e` check; the experiment only exercised a trivial smoke test.
- Pack validation could equally be a `packages.<system>.packs-validated` build step feeding `dist`, so a bad pack breaks the build itself, not just `flake check`. Both are one-line changes.

### 5. Playwright in Nix

Sources: nixpkgs `pkgs/development/web/playwright/{driver.nix,browsers.json,webkit.nix,chromium.nix,browser-downloads.nix,update.sh}` and Playwright `v1.63.0` `packages/playwright-core/src/server/registry/index.ts`.

- **Attributes.** `playwright-driver` (= `playwright-core`, version 1.63.0 here), `playwright-driver.browsers` (link farm of every browser at the matching revision), `playwright-driver.browsers-chromium` (Chromium only), `playwright-driver.selectBrowsers { withFirefox = false; ... }` (`withChromium`, `withChromiumHeadlessShell`, `withFirefox`, `withWebkit`, `withFfmpeg`), and `pkgs.playwright-test` (a wrapped `playwright` CLI that already sets `PLAYWRIGHT_BROWSERS_PATH`). To save closure size use `playwright-driver.selectBrowsers { withFirefox = false; }`; Firefox is not needed by ADR 0001.
- **Revision matching.** The link farm names directories `chromium-1243`, `webkit-2359`, etc. (`browsers.json`). Playwright looks for the directory name that *its own* `browsers.json` demands, so the npm `@playwright/test` must equal the nixpkgs Playwright version (1.63.0 on this nixpkgs). `update.sh` bumps driver + browsers together. nixpkgs strips `revisionOverrides` from its driver build so it only needs the top-level revisions. Handling in the flake: pin `@playwright/test` to the exact version (no caret) in `package.json`, and run the `versions` check above; when nixpkgs bumps, the check fails and tells you to update the npm pin and re-hash. npm `latest` is also 1.63.0 (`npm view`) today, so there is currently no lag.
- **Env.** `PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}`; `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true` avoids the Ubuntu-library validation (nixpkgs patches out the `ldconfig` check but the flag is the documented workaround, message observed in the run log); `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` prevents `pnpm install` from trying to download. Without the skip flag the hook does not run `playwright install` anyway since fetch/config use `--ignore-scripts`.
- **Chromium.** Nix `autoPatchelfHook`-patches the Linux Chrome-for-Testing zip (x86_64 and aarch64 Linux); darwin takes the unpatched `.app`.
- **WebKit on Linux.** nixpkgs `webkit.nix` has `webkit-linux` for `x86_64-linux` and `aarch64-linux`: the Playwright-patched WebKit **WPE `minibrowser-wpe`** build, patched with `autoPatchelfHook` and a long `buildInputs` list (gstreamer, libsoup_3, libjxl, libwpe-fdo, woff2, icu74, ...). `driver.nix` annotates `withWebkit` with the comment `# may require export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="ubuntu-24.04"`. Playwright's registry has download paths for specific Ubuntu/Debian host platforms and `'<unknown>': undefined` for others, so a host that is not detected as one of them (NixOS) can fail to resolve the WebKit executable; the override forces a known platform. [Not verified here: I had no Linux builder, so WebKit on Linux was not run.] A WPE WebKit is a different port from Safari's WebKit on iOS (JavaScriptCore the same, platform layer different). [INFERENCE: it catches JS-engine-level drift, but not every iOS Safari behaviour.]
- **WebKit on darwin.** `webkit-darwin` for `aarch64-darwin` only: the upstream `webkit-mac-15-arm64.zip` unpatched. **Verified**: with `PLAYWRIGHT_BROWSERS_PATH` pointing at the Nix store link farm, the WebKit project ran and passed on this machine (macOS arm64, `sandbox = false`), reporting `Version/26.6`. nixpkgs has no `x86_64-darwin` entry in `browser-downloads.nix` (`throwSystem`), so Intel Macs cannot use the Nix browsers. [Not tested: running these Playwright browsers inside the darwin Nix sandbox (`sandbox = true`) where GUI/Mach services may be blocked.]
- **Practical consequence.** The ADR's cross-engine golden check can run in Nix on darwin (verified) and on Linux CI (needs verification). CI on Linux (GitHub Actions `ubuntu-24.04` with Nix) is the likely home; `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` may need setting there. An escape hatch is to run the e2e job outside the Nix sandbox with Playwright's own `npx playwright install webkit` and keep Nix for everything else. That is not hermetic.

### 6. Biome: nixpkgs vs npm

- **nixpkgs** builds `biome` from source (`pkgs/by-name/bi/biome/package.nix`: `cargoBuildFlags = [ "-p=biome_cli" ]`, tag `@biomejs/biome@${version}`), also installing `share/schema.json`. It had 2.5.14 in one nixpkgs revision and 2.5.15 in the locked one used by the flake; npm `latest` is 2.5.15. So nixpkgs trails by days to weeks.
- **GritQL plugins work with the nixpkgs binary** (verified): a `biome.json` with `"plugins": ["./no-random.grit"]` and a pattern `` `Math.random()` where { register_diagnostic(...) } `` flagged `Math.random()` as an error with the nixpkgs 2.5.14 CLI. So the ADR's plugin bans (`Math.random`, `Date.now`) do not require the npm package.
- **npm** (`@biomejs/biome`) ships per-platform binaries as optionalDependencies; on darwin it ran inside the Nix build here (not exercised, only fetched). [INFERENCE: the Linux binary is glibc-linked ELF expecting `/lib64/ld-linux-*`, which will not run on NixOS or in a Nix sandbox without `nix-ld`/patching; the musl variant may run. Not tested.]
- **Recommendation shape**: Biome from nixpkgs in the dev shell and the `biome` check, *no* npm copy. If editors (VS Code extension) look for `node_modules/.bin/biome`, either accept the extension's configured binary path (`biome.lsp.bin`) pointing at the dev shell binary, or keep npm Biome pinned to the same version and rely on the `versions` check to fail on drift. The shared version also keeps `$schema` in `biome.json` valid.

### 7. Consumption by the cluster

From `git show origin/research/cluster-serving:docs/research/cluster-serving.md`:
- The cluster edge (Caddy on `alda`) serves static sites via `root * ${inputs.<name>.packages.${system}.default}/dist` and `file_server`, taken from flake inputs declared as `inputs.<name>.url = "github:jeiang/<name>"; inputs.nixpkgs.follows = "nixpkgs"`. `alda`'s system is `x86_64-linux`.
- Therefore the life-sim flake must export `packages.x86_64-linux.default` with a `dist/` subdirectory containing `index.html`, `sw.js`, `manifest.webmanifest`, and hashed `assets/`; this experiment's output has exactly that shape (checked by listing the store path).
- Cache-header policy (`/assets/*` immutable, `index.html`, `sw.js`, `manifest.webmanifest` `no-cache`) is applied in the cluster's Caddy block and needs the file names above to be stable: confirm `sw.js` and `manifest.webmanifest` names with the real vite-plugin-pwa config (default names matched in the experiment: `sw.js`, `manifest.webmanifest`, `registerSW.js`, `workbox-<hash>.js`).
- Build targets: because the cluster builds with `--remote-build` and pushes to the garret cache, the package needs to build on `x86_64-linux`, so the pnpm hash must be Linux-reproducible. `fetchPnpmDeps` tarball normalisation (fetcherVersion 3+) exists for this purpose, and `--force` makes the dependency set platform-independent; I verified only that the darwin-computed hash and an `--rebuild` agree on darwin. [Unverified: the same hash on `x86_64-linux`; a one-time Linux build (CI or `ricklent`/`alda`) confirms it, and a mismatch would show up as a hash error with the right hash printed.] The private-repo input issue is covered in the cluster-serving doc and is unchanged by this.
- `nixpkgs.follows` from the cluster would make life-sim use the cluster's nixpkgs revision; the pnpm hash then holds only if that revision's pnpm and `fetchPnpmDeps` produce the same store. It could drift across nixpkgs bumps (e.g. fetcherVersion changes, SQLite version for version 4). [INFERENCE] Safer: the cluster declares `life-sim.inputs.nixpkgs` *without* `follows` (or the package output is pre-built and cached by life-sim CI).

## Implications for open decisions

1. **Packaging approach**: decide `fetchPnpmDeps`/`pnpmConfigHook` (`fetcherVersion = 4`, `pnpm_10` or `pnpm_11`, pinned) as the standard; no third-party generators needed.
2. **Playwright pin**: either (a) pin npm `@playwright/test` to `pkgs.playwright-driver.version` (exact), gated by a `versions` flake check, or (b) use `pkgs.playwright-test` and drop the npm dependency for the CLI. (a) keeps `playwright.config.ts` types; the check makes the coupling explicit.
3. **nixpkgs pin policy**: because Playwright browsers, Biome, and pnpm all move with nixpkgs, `flake.lock` is the single source of truth for tool versions; bumps are deliberate and fail `versions` until npm pins are updated.
4. **Linux WebKit verification**: before relying on the ADR's WebKit golden check in CI, run one real build on `x86_64-linux` (CI runner) and confirm WebKit launches (maybe with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE`). Until then it is the main unproven link.
5. **Where e2e runs**: `nix flake check` (hermetic, slow) versus a separate CI job with the same dev shell. The `e2e` check passes on darwin without the sandbox; Linux sandbox behaviour is unverified.
6. **Biome**: drop npm Biome (nixpkgs only) unless editor integration requires otherwise.
7. **Cluster handoff**: export `packages.x86_64-linux.default` with `$out/dist`; decide between `nixpkgs.follows` and an independent nixpkgs pin (finding 7).

## Appendix A: the experimental flake (as built and run)

```nix
{
  description = "life-sim packaging experiment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f s nixpkgs.legacyPackages.${s});
    in {
      packages = forAll (system: pkgs:
        let
          inherit (pkgs) lib;
          pnpm = pkgs.pnpm_10;
          fs = lib.fileset;
          # Only manifests + lockfile feed the fixed-output fetch, so source edits do not invalidate the pnpm store.
          depsSrc = fs.toSource {
            root = ./.;
            fileset = fs.unions [
              ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml
              ./packages/core/package.json ./packages/app/package.json ./packages/pack-tools/package.json
            ];
          };
          src = fs.toSource {
            root = ./.;
            fileset = fs.difference ./. (fs.unions [ ./flake.nix ./flake.lock ]);
          };
          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "life-sim";
            version = "0";
            src = depsSrc;
            inherit pnpm;
            fetcherVersion = 4;
            hash = "sha256-0iBrkowrjc/cX3yGsRVL6oqrDNYOWqy+owJ+p5+aUKk=";
          };
        in {
          inherit pnpmDeps;
          default = pkgs.stdenvNoCC.mkDerivation {
            pname = "life-sim-dist";
            version = "0";
            inherit src pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pnpm pkgs.pnpmConfigHook ];
            buildPhase = ''
              runHook preBuild
              pnpm --filter @life/app build
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r packages/app/dist $out/dist
              runHook postInstall
            '';
          };
        });

      devShells = forAll (system: pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.biome ];
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        };
      });

      checks = forAll (system: pkgs:
        let
          inherit (self.packages.${system}) pnpmDeps;
          pnpm = pkgs.pnpm_10;
          # Run a shell script with node_modules installed from the pre-fetched store.
          mkCheck = name: extra: script: pkgs.stdenvNoCC.mkDerivation ({
            name = "life-sim-check-${name}";
            src = self.packages.${system}.default.src;
            inherit pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pnpm pkgs.pnpmConfigHook ] ++ (extra.nativeBuildInputs or [ ]);
            dontBuild = true;
            doCheck = true;
            checkPhase = script;
            installPhase = "touch $out";
          } // removeAttrs extra [ "nativeBuildInputs" ]);
        in {
          biome = pkgs.runCommand "check-biome" { nativeBuildInputs = [ pkgs.biome ]; } ''
            cp -r ${self.packages.${system}.default.src} src && cd src
            biome ci .
            touch $out
          '';
          vitest = mkCheck "vitest" { } ''
            pnpm exec vitest run packages/core
          '';
          packs = mkCheck "packs" { } ''
            node --experimental-strip-types packages/pack-tools/src/validate.ts packs
          '';
          versions = pkgs.runCommand "check-versions" { } ''
            pw=$(grep -m1 -A2 "'@playwright/test':" ${./pnpm-lock.yaml} | grep -m1 'version:' | sed -E "s/.*version: *([0-9.]+).*/\1/")
            echo "lockfile @playwright/test=$pw nixpkgs playwright-driver=${pkgs.playwright-driver.version}"
            test "$pw" = "${pkgs.playwright-driver.version}"
            bm=$(sed -nE 's/.*"@biomejs\/biome": *"([^"]+)".*/\1/p' ${./package.json})
            echo "package.json biome=$bm nixpkgs biome=${pkgs.biome.version}"
            test "$bm" = "${pkgs.biome.version}"
            touch $out
          '';
          e2e = mkCheck "e2e" {
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          } ''
            pnpm --filter @life/app build
            cd packages/app && pnpm exec playwright test
          '';
        });
    };
}
```

The sample workspace (not kept): `packages/{core,app,pack-tools}`, a `packs/base.json`, `biome.json`, `pnpm-workspace.yaml` with `packages/*`; `app` used Preact, `@preact/preset-vite`, Vite 7, vite-plugin-pwa (`registerType: "prompt"`) and a two-project (`chromium`, `webkit`) `playwright.config.ts` using `vite preview`.

## Sources

- nixpkgs manual, JavaScript/pnpm: <https://nixos.org/manual/nixpkgs/unstable/#javascript-pnpm> (read from `doc/languages-frameworks/javascript.section.md` at nixpkgs rev `4975466`, 26.11)
- `fetchPnpmDeps` / `pnpmConfigHook` source: <https://github.com/NixOS/nixpkgs/tree/master/pkgs/build-support/node/fetch-pnpm-deps>
- `pnpmBuildHook` docs: <https://nixos.org/manual/nixpkgs/unstable/#pnpm-build-hook>
- fetcherVersion PRs: <https://github.com/NixOS/nixpkgs/pull/469950>, <https://github.com/NixOS/nixpkgs/pull/522703>
- nixpkgs Playwright: <https://github.com/NixOS/nixpkgs/tree/master/pkgs/development/web/playwright>
- Playwright registry source (v1.63.0): <https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/registry/index.ts>
- nixpkgs Biome: <https://github.com/NixOS/nixpkgs/blob/master/pkgs/by-name/bi/biome/package.nix>
- Biome: <https://biomejs.dev/>
- Cluster serving research: branch `origin/research/cluster-serving`, `docs/research/cluster-serving.md`
- ADR: `docs/adr/0001-typescript-preact-pwa-stack.md`
- Local experiments (this document, run 2026-10-05 on `aarch64-darwin`, Determinate Nix 3.21.9 / nix 2.34.8, `sandbox = false`), temporary and deleted afterwards.
