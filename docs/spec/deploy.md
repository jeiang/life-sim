# Deployment

Decided in [Deployment path to the cluster](https://github.com/jeiang/life-sim/issues/15). Cluster facts come from the [cluster serving research](https://github.com/jeiang/life-sim/blob/research/cluster-serving/docs/research/cluster-serving.md) (cluster repo `cornn-flaek`, published as the public `jeiang/.dotfiles`).

## Visibility

`jeiang/life-sim` becomes **public** before the first deploy. This is a build task, done with explicit approval at that time. As a result, the cluster flake input needs no credentials (same as the other static-site inputs), and the Mac and cornn-flaek CI need no tokens.

Before the flip, review everything that becomes public: all branches (including `research/*` and `prototype/*`), all issues and comments, and the project board. The cluster details there (host names and edge layout) already appear in the public cluster repo `jeiang/.dotfiles`. Check anyway that no secret values or personal data were written down, and offer to delete throwaway branches or redact issue text before running `gh repo edit --visibility public`.

## Hosting

- URL: `https://life-sim.jeiang.dev`, served by Caddy on the edge node `alda`. The existing `*.jeiang.dev` wildcard DNS record and DNS-01 certificate cover it; no DNS or TLS change is needed.
- Ungated: no Anubis, because the manifest, the service worker, and its fetches cannot solve a challenge. Same treatment as `bill-split`.
- The life-sim flake exports `packages.x86_64-linux.default` with the built app in `$out/dist` (`index.html`, `sw.js`, `manifest.webmanifest`, `registerSW.js`, hashed `assets/`).

## Cluster wiring (one cornn-flaek PR)

| File | Change |
|---|---|
| `flake.nix`, `flake.lock` | `inputs.life-sim.url = "github:jeiang/life-sim"`; alda builds the package itself at deploy time |
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

Observed after the first deploy: Cloudflare's Browser Cache TTL rewrites `/sw.js` (a `.js` file) to `cache-control: max-age=14400` at the edge, although Caddy sends `no-cache`. The edge itself revalidates with the origin (`cf-cache-status: EXPIRED`, not `HIT`), and `updateViaCache: 'none'` makes browsers skip the HTTP cache on service-worker update checks, so updates are not delayed in practice. To make the served header match this table, add a Cloudflare Cache Rule for `life-sim.jeiang.dev` paths `/sw.js`, `/index.html`, `/manifest.webmanifest`, `/registerSW.js`: Browser TTL "respect origin" (or bypass cache). This is a dashboard setting outside both repos.

## Release flow

1. A change merges to life-sim `main` through a pull request gated by [CI](ci.md). No CI system builds or caches the flake for the cluster.
2. A build agent (or you) opens a cornn-flaek PR from `nix flake update life-sim`, following that repo's AGENTS.md (signed Conventional Commits, PR to protected main).
3. You merge after cornn-flaek CI passes and run `just deploy alda --skip-checks --remote-build`, which builds life-sim on alda.
4. Rollback: switch to the previous NixOS generation.

Agents prepare cornn-flaek PRs. Merging and deploying stay your explicit actions.

## Hidden options code

The code that opens Settings > Hidden options (god mode, 18+ mode) is checked in the browser with bcrypt against a hash given to the build as `VITE_HIDDEN_CODE_HASH`. The plain code is never in the repo, bundle, PRs or logs; the hash is in the bundle. A build without the variable shows no code field. The default package leaves it unset.

Make a hash with the helper (cost 12 by default; `COST=10` changes it). It reads the code without echo from a prompt, or from stdin (`printf '%s' "$code" | ...`) or env `CODE`, never from the command line, so the code stays out of shell history and `ps`. It prints only the hash:

```
nix develop -c pnpm --filter @life/web --silent hash-code
```

Cost 12 verifies in about 0.35 s in Node on a Mac (pure JS `bcryptjs`); phones are slower, so expect roughly 1 s there. Use `COST=10` (4x faster) if that feels long. Both `$2a$` and `$2b$` hashes verify.

The cluster build (cornn-flaek `modules/edge/default.nix`) passes it by overriding the package:

```nix
lifeSim = "${inputs.life-sim.packages.${system}.default.overrideAttrs (_: { VITE_HIDDEN_CODE_HASH = "$2b$12$..."; })}/dist";
```

That derivation is built on alda by `just deploy alda --skip-checks --remote-build`, like any other life-sim build. The e2e build uses a throwaway code and hash (`e2e/playwright.config.ts`).

## Version skew

Workbox precaches the whole build when the service worker installs, so an open client keeps running entirely from its cache after a deploy removes the old hashed files. Clients switch only when the user accepts the "Update available, reload" prompt (ADR 0003). The server keeps no older releases.
