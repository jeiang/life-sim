# Deployment

Decided in [Deployment path to the cluster](https://github.com/jeiang/life-sim/issues/15). Cluster facts come from the [cluster serving research](https://github.com/jeiang/life-sim/blob/research/cluster-serving/docs/research/cluster-serving.md) (cluster repo `cornn-flaek`, published as the public `jeiang/.dotfiles`).

## Visibility

`jeiang/life-sim` becomes **public** before the first deploy. This is a build task, done with explicit approval at that time. As a result, the cluster flake input needs no credentials (same as the other static-site inputs), and the Mac, cornn-flaek CI, and buildbot need no tokens.

Before the flip, review everything that becomes public: all branches (including `research/*` and `prototype/*`), all issues and comments, and the project board. The cluster details there (host names, edge layout, buildbot and garret endpoints, the garret OIDC client id) already appear in the public cluster repo `jeiang/.dotfiles`. Check anyway that no secret values or personal data were written down, and offer to delete throwaway branches or redact issue text before running `gh repo edit --visibility public`.

## Hosting

- URL: `https://life-sim.jeiang.dev`, served by Caddy on the edge node `alda`. The existing `*.jeiang.dev` wildcard DNS record and DNS-01 certificate cover it; no DNS or TLS change is needed.
- Ungated: no Anubis, because the manifest, the service worker, and its fetches cannot solve a challenge. Same treatment as `bill-split`.
- The life-sim flake exports `packages.x86_64-linux.default` with the built app in `$out/dist` (`index.html`, `sw.js`, `manifest.webmanifest`, `registerSW.js`, hashed `assets/`).

## Cluster wiring (one cornn-flaek PR)

| File | Change |
|---|---|
| `flake.nix`, `flake.lock` | `inputs.life-sim.url = "github:jeiang/life-sim"`, **without** `inputs.nixpkgs.follows`, so the derivation matches what buildbot built and pushed to garret |
| `modules/edge/default.nix` | Hostname in `publicHostnames`, a `let` binding, and a site block with `root * <package>/dist` and `file_server` |
| `modules/gatus/default.nix` | Status probe following the existing static-site precedent |
| `modules/glance.nix` | Optional dashboard tile |

Cache headers in the site block:

| Path | `Cache-Control` |
|---|---|
| `/assets/*` (content-hashed) | `public, max-age=31536000, immutable` |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/registerSW.js` | `no-cache` |
| Anything else (unhashed icons) | `no-cache` |

The service worker is registered with `updateViaCache: 'none'` and stays at `/sw.js`; its URL never changes.

## Release flow

1. A change merges to life-sim `main`. buildbot builds it and pushes the outputs to garret within about 5 minutes ([CI](ci.md)).
2. A build agent (or you) opens a cornn-flaek PR from `nix flake update life-sim`, following that repo's AGENTS.md (signed Conventional Commits, PR to protected main).
3. You merge after cornn-flaek CI passes and run `just deploy alda --skip-checks --remote-build`. alda downloads the build from garret.
4. Rollback: switch to the previous NixOS generation.

Agents prepare cornn-flaek PRs. Merging and deploying stay your explicit actions.

## Version skew

Workbox precaches the whole build when the service worker installs, so an open client keeps running entirely from its cache after a deploy removes the old hashed files. Clients switch only when the user accepts the "Update available, reload" prompt (ADR 0003). The server keeps no older releases.
