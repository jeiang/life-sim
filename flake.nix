{
  description = "life-sim: offline life-sim PWA";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f s nixpkgs.legacyPackages.${s});
    in {
      packages = forAll (system: pkgs:
        let
          fs = pkgs.lib.fileset;
          # Only manifests + lockfile feed the fixed-output fetch, so source edits do not invalidate the pnpm store.
          depsSrc = fs.toSource {
            root = ./.;
            fileset = fs.unions [
              ./package.json
              ./pnpm-lock.yaml
              ./pnpm-workspace.yaml
              (fs.fileFilter (f: f.name == "package.json") ./packages)
              (fs.fileFilter (f: f.name == "package.json") ./apps)
            ];
          };
        in {
          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "life-sim";
            version = "0";
            src = depsSrc;
            pnpm = pkgs.pnpm_10;
            fetcherVersion = 4;
            hash = "sha256-8U22C85FvcHN/34A3XI2ZNgMbIiBuLAVi79hgWxxV9g=";
          };

          # The deployed app: $out/dist is served as-is by Caddy (docs/spec/deploy.md).
          default = pkgs.stdenvNoCC.mkDerivation {
            pname = "life-sim";
            version = "0";
            src = fs.toSource {
              root = ./.;
              fileset = fs.unions [
                ./package.json
                ./pnpm-lock.yaml
                ./pnpm-workspace.yaml
                ./tsconfig.base.json
                ./packages
                ./apps
                ./packs
              ];
            };
            inherit (self.packages.${system}) pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.pnpmConfigHook ];
            # Baked into the bundle by Vite `define` (Settings > About this install).
            LIFE_SIM_REV = self.shortRev or self.dirtyShortRev or "dev";
            # Hidden options code (bcrypt hash): unset here, so this build has no code field. The cluster sets it with overrideAttrs (docs/spec/deploy.md).
            buildPhase = ''
              runHook preBuild
              pnpm --filter @life/web build
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r apps/web/dist $out/dist
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
          fs = pkgs.lib.fileset;
          src = fs.toSource {
            root = ./.;
            fileset = fs.difference ./. (fs.unions [ ./flake.nix ./flake.lock ]);
          };
          inherit (self.packages.${system}) pnpmDeps;
        in {
          biome = pkgs.runCommand "check-biome" { nativeBuildInputs = [ pkgs.biome ]; } ''
            cp -r ${src} src && cd src
            biome ci .
            touch $out
          '';
          vitest = pkgs.stdenvNoCC.mkDerivation {
            name = "life-sim-check-vitest";
            inherit src pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.pnpmConfigHook ];
            dontBuild = true;
            doCheck = true;
            checkPhase = ''
              pnpm exec vitest run
              pnpm --filter @life/core exec tsc --noEmit
              pnpm --filter @life/pack-tools exec tsc --noEmit
              pnpm --filter @life/harness exec tsc --noEmit
            '';
            installPhase = "touch $out";
          };
          # Compile every Pack under packs/ (a directory without pack.yaml is skipped) and the fixture Packs.
          packs = pkgs.stdenvNoCC.mkDerivation {
            name = "life-sim-check-packs";
            inherit src pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.pnpmConfigHook ];
            dontBuild = true;
            doCheck = true;
            checkPhase = ''
              node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs
              node --experimental-strip-types packages/pack-tools/src/cli.ts build packages/pack-tools/test/fixtures/valid $TMPDIR/packs-out
            '';
            installPhase = "touch $out";
          };
          # 1,000 fixed seeds across the simulated profiles, on every core the build gets (docs/spec/harness.md). Fails only on engine faults; the report lands in $out.
          harness = pkgs.stdenvNoCC.mkDerivation {
            name = "life-sim-check-harness";
            inherit src pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.pnpmConfigHook ];
            dontBuild = true;
            doCheck = true;
            checkPhase = ''
              mkdir -p $TMPDIR/report
              node --experimental-strip-types packages/harness/src/cli.ts --lives 1000 --profile all --seed 20260101 --jobs "''${NIX_BUILD_CORES:-0}" --out $TMPDIR/report
            '';
            installPhase = "cp -r $TMPDIR/report $out";
          };
          versions = pkgs.runCommand "check-versions" { } ''
            pw=$(grep -m1 -A2 "'@playwright/test':" ${./pnpm-lock.yaml} | grep -m1 'version:' | sed -E "s/.*version: *([0-9.]+).*/\1/")
            echo "lockfile @playwright/test=$pw nixpkgs playwright-driver=${pkgs.playwright-driver.version}"
            test "$pw" = "${pkgs.playwright-driver.version}"
            touch $out
          '';
        } // pkgs.lib.optionalAttrs (builtins.elem system [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ]) {
          # Chromium + WebKit from nixpkgs; only systems where nixpkgs ships the browsers.
          e2e = pkgs.stdenvNoCC.mkDerivation {
            name = "life-sim-check-e2e";
            inherit src pnpmDeps;
            nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm_10 pkgs.pnpmConfigHook ];
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
            FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
            dontBuild = true;
            doCheck = true;
            checkPhase = ''
              ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
                # WPE WebKit needs an EGL display; use Mesa software rendering on a surfaceless platform.
                export EGL_PLATFORM=surfaceless LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe
                export __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json
                export LIBGL_DRIVERS_PATH=${pkgs.mesa}/lib/dri
                export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [ pkgs.libglvnd pkgs.mesa ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
              ''}
              export HOME=$TMPDIR
              export XDG_RUNTIME_DIR=$TMPDIR/xdg && mkdir -p -m 700 $XDG_RUNTIME_DIR
              (cd e2e && pnpm exec playwright test)
              # Release guard: the plain build (no VITE_E2E) must not carry the e2e hooks.
              pnpm --filter @life/web build
              node --experimental-strip-types e2e/check-prod-bundle.ts apps/web/dist
            '';
            installPhase = "touch $out";
          };
        });
    };
}
