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
            hash = "sha256-fDjXvVacNDypOM9rbHPNwAHxVQF3fGuPpEDycKIuJsA=";
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
            '';
            installPhase = "touch $out";
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
            dontBuild = true;
            doCheck = true;
            checkPhase = ''
              export HOME=$TMPDIR
              cd e2e && pnpm exec playwright test
            '';
            installPhase = "touch $out";
          };
        });
    };
}
