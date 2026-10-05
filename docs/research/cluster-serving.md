# Serving a static PWA from the NixOS cluster

## Question

How would a static PWA built by this repo's flake be served from the user's personal NixOS cluster? Find the cluster configuration and determine the existing web server / ingress pattern, TLS and domain setup (HTTPS is mandatory for service workers), how a private-repo flake can be consumed as an input, and correct cache headers for a service-worker app. Read-only: nothing on the cluster was changed.

## Summary

- **Cluster config found:** `/Users/aidanp/Projects/cornn-flaek` (remote `git@github.com:jeiang/.dotfiles.git`, flake-parts + import-tree). `/Users/aidanp/Projects/dot` is an identical checkout of the same repo (differs only by `.DS_Store` and `.claude/`). It describes `alda`, `vida`, `zantark`, `peria` (Hetzner "Legion" servers) plus `ricklent`, `artemis`, `zakkart`.
- **Ingress is Caddy on `alda`**, the single public edge (`legion.services.caddy.edge = true`), declared in `modules/edge/default.nix`. No Kubernetes, no Traefik, no nginx. Static sites are served by Caddy `file_server` straight from Nix store paths of flake inputs; this is exactly the pattern for `bill-split.jeiang.dev`, `mdtable.jeiang.dev`, `rivals.jeiang.dev`, and `jeiang.dev`.
- **TLS/domains:** `jeiang.dev` and `*.jeiang.dev` get a Let's Encrypt DNS-01 wildcard (Cloudflare API token from sops). The Cloudflare wildcard `A`/`AAAA *` record to `alda` is orange-clouded, so a new `life-sim.jeiang.dev` needs **no DNS or cert change**. It does need a Caddy site block and an entry in `publicHostnames`.
- **Adding the app = ~4 files:** `flake.nix` (input), `flake.lock`, `modules/edge/default.nix` (hostname + `let` binding + site block), optionally `modules/gatus/default.nix` and `modules/glance.nix` (status/dashboard tiles). Deploy via the repo's PR → CI → `just deploy alda --skip-checks --remote-build` flow.
- **Private repo is the real wrinkle.** Every existing static input (`website`, `bill-splitter`, `character-randomizer`, `markdown-table-live-editor`) is a **public** GitHub repo (verified with `gh repo view`). `jeiang/life-sim` is PRIVATE, and the cluster repo has no `access-tokens`, `netrc`, or `git+ssh` precedent. Someone must supply credentials to: the Mac (eval/deploy), GitHub Actions CI, and possibly buildbot. Options below.
- **Do not put the PWA behind Anubis.** `mkContentSite` wraps website/portfolio in an Anubis proof-of-work gate. Anubis challenges non-browser-like fetches (the manifest, SW script and SW-initiated fetches can't solve a challenge), and the repo's own rule is that machine-consumed routes stay ungated. Serve it like `bill-split`/`mdtable` (ungated).
- **Cache headers:** `index.html`, `sw.js` (and `manifest.webmanifest`) `no-cache`; content-hashed assets `public, max-age=31536000, immutable`. Cloudflare will **not** cache anything `no-cache`, and will cache JS/CSS/images by extension, so these headers also behave sensibly through the CF proxy. Caddy omits `ETag`/`Last-Modified` for Nix-store files (mtime 0/1), so `no-cache` means a full (small) re-download, never a stale 304.

## Findings

### 1. Where the cluster config is

Searched `/Users/aidanp/Projects/*/flake.nix` (13 flakes) and `~`. Candidates by `AGENTS.md`/`README.md`: `cornn-flaek` and `dot` are the NixOS fleet repo (README: "Personal Nix flake for `artemis`..., `zakkart`..., and the Legion servers (`alda`, `vida`, `zantark`, `peria`; Hetzner Cloud)"); `dot` is a byte-identical second checkout. `garret` (Nix binary cache server), `portfolio` (a site flake consumed by the cluster), `website`-type repos are not the cluster. Both fleet checkouts have origin `git@github.com:jeiang/.dotfiles.git`. Paths below are relative to the `cornn-flaek` root.

Hosts (from `AGENTS.md`):

| Host | Role relevant to hosting |
| --- | --- |
| `alda` | Legion server, Hetzner Cloud. **Caddy edge** (public 80/443). |
| `vida` | NetBird server/relay/proxy, Pocket ID, Blocky; also runs the `portfolio` app. |
| `zantark` | Monitoring (Grafana). |
| `peria` | garret (Nix cache), Actual Budget, atuin, hath, glance, gatus. |
| `ricklent` | Arct node (London); buildbot-nix, NetBird relay, qBittorrent exit. |
| `artemis` | Home gaming box (not a hosting target). |

### 2. Web server / ingress pattern

- Declared in `modules/edge/default.nix`: `legion.services.caddy = { node = "alda"; module = "edge"; edge = true; publicHostnames = [...]; firewall = [80, 443 public, metrics private]; }` and `nixos.modules.edge` configures `services.caddy` with a **custom Caddy build** (`modules/packages/caddy.nix`: caddy-dns/cloudflare, caddy-cloudflare-ip, crowdsec bouncer http+appsec, via `pkgs.caddy.withPlugins`).
- The whole site config is one Caddyfile string in `services.caddy.extraConfig` inside that file; secrets via `sops.templates."caddy.env"` (`CLOUDFLARE_API_TOKEN`, CrowdSec LAPI creds; names only here, values are sops-encrypted in `modules/edge/secrets.yaml`).
- `legion.services.<name>` (type in `modules/hosts/legion/services.nix`) asserts hostnames are unique across services (`publicHostnames` must not be reused), and `modules/hosts/legion/default.nix` derives firewall/backup/module imports from it. New public hostnames must be added to `publicHostnames` in `modules/edge/default.nix`.
- Static-site precedent (verbatim shape from `modules/edge/default.nix`):
  ```
  let billSplitter = "${inputs.bill-splitter.packages.${system}.default}/dist"; ... in
  bill-split.jeiang.dev {
    ${logLine}${crowdsecLine}${appsecLine}root * ${billSplitter}
    file_server
  }
  ```
  The same file wires `mdtable.jeiang.dev` (`root * ${mdTableEditor}`), `rivals.jeiang.dev` (a pinned build plus a daily-synced state-dir overlay, using `@cachedHero` matcher + `handle`), and the NetBird dashboard SPA, which demonstrates SPA routing: `try_files {path} {path}.html {path}/index.html /index.html` then `file_server`.
- Each site has `log` (access log to journald, CrowdSec acquisition), `crowdsec` (bouncer) and `appsec` lines (`logLine`, `crowdsecLine`, `appsecLine` helper strings). A new site should include the same three for consistency.
- Input wiring: `flake.nix` declares e.g. `bill-splitter.url = "github:jeiang/bill-splitter"; bill-splitter.inputs.nixpkgs.follows = "nixpkgs";`; the package is consumed as `inputs.<name>.packages.${system}.default`. Life-sim's flake would need to expose a static-site package (a derivation whose output contains `index.html`, `sw.js`, `manifest.webmanifest`, hashed assets) for `x86_64-linux` (alda's system; the repo uses `pkgs.stdenv.hostPlatform.system`).
- Monitoring convention for static sites: `modules/gatus/default.nix` has `(ok "Bill Splitter" "Web" "https://bill-split.jeiang.dev")` lines; `modules/glance.nix` lists them as tiles. Both optional but conventional. `AGENTS.md`: "Blackbox probes target private backend addresses, never public URLs", which is in tension with these public `ok` probes; check the gatus module before copying.
- The topology diagrams (`docs/topology/`) are generated (`just topology`); `AGENTS.md` says re-run it only when hosts/networks/services change. A static site on the existing edge is likely not a service change.

### 3. TLS and domains

- Caddy block `jeiang.dev, *.jeiang.dev { tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} } ... }` issues a DNS-01 wildcard; a comment in the file states Caddy 2.10+ reuses it for the other `jeiang.dev` blocks, so none needs its own `tls` directive. `acmeCA` is pinned to Let's Encrypt because CAA only permits `letsencrypt.org`.
- DNS source of truth is `dns/dnsconfig.js` (DNSControl; CI applies on merge with full purge). It has `A("*", ALDA_V4, CF_PROXY_ON)` / `AAAA("*", ALDA_V6, CF_PROXY_ON)`: every `*.jeiang.dev` name hits `alda` through the Cloudflare proxy. **`life-sim.jeiang.dev` (or any subdomain) works with zero DNS edits**; only a hostname outside the zone (e.g. a new domain) would need `dns/dnsconfig.js` plus a `tls` block.
- Browser sees Cloudflare's certificate (proxied); origin uses the Let's Encrypt cert. Whether Cloudflare SSL mode is Full (strict) is not visible in the repo [UNVERIFIED]; the DNS-01 cert would satisfy it.
- Grey-cloud only if needed (precedents: `cache`, `cache-push`, `speed`, `netbird` are `CF_PROXY_OFF`); not needed for a static PWA.
- `*.jeiang.dev` catch-all handle is `respond 404`; named site blocks (like `bill-split.jeiang.dev`) are more specific than the wildcard, so a new block wins.
- A custom non-`jeiang.dev` domain would follow `aidanpinard.co`: add a site block with its own `tls { dns cloudflare ... }`, plus a zone in `dns/dnsconfig.js` and a CAA record.
- Caddy trusts Cloudflare IPs via `trusted_proxies cloudflare` and `client_ip_headers Cf-Connecting-Ip`, so CrowdSec sees real clients.

### 4. Content gating (Anubis) vs. a PWA

`modules/anubis.nix` + `mkContentSite` in `modules/edge/default.nix` put website/portfolio behind Anubis, exempting only `/.well-known/*`, `/robots.txt`, sitemap/feed paths, `/favicon.ico`. `AGENTS.md`: "Anubis gates only the static content sites. Never put it in front of a machine client..." and the file comment before `auth.jeiang.dev` says everything below is deliberately not behind Anubis because "a proof-of-work interstitial in front of a non-browser client is an outage". [INFERENCE] A manifest fetched without credentials, SW script/update fetches and install-time precache requests would be redirected to the challenge page and break install/updates; offline PWA should not be gated. Follow the `bill-split` pattern (no Anubis, but with CrowdSec). Game state stays on-device, so no auth layer (tinyauth/forward_auth) is needed either.

### 5. Consuming a private GitHub repo as a flake input

Nix mechanisms (primary: Nix manual, flake reference + `access-tokens` setting):

1. `github:jeiang/life-sim` + `access-tokens = github.com=<PAT>` in `nix.conf`. The Nix manual documents `access-tokens` (with the `github.com=<token>` form) as the way to authenticate the `github:`/`gitlab:` fetchers. Fine-grained PAT with read-only "Contents" on the single repo is enough. The token can be supplied without being in the store via `!include` of a file outside the config (manual: "Other files can be included ... A missing file is an error unless `!include` is used instead").
2. `git+ssh://git@github.com/jeiang/life-sim` with a read-only deploy key / the operator's SSH key. The Nix manual lists `git+ssh://git@github.com/NixOS/nix?ref=...` as a valid flake ref. Needs no token in `nix.conf`, but locks as a Git input (`rev` + `narHash`, no `lastModified`-via-archive API), and fetching copies the whole repo history unless `shallow`.
3. Public mirror/dist repo or flip the repo public at release. Avoids credentials entirely.
4. Decouple from the source: life-sim CI builds the PWA and pushes the closure to garret, `cornn-flaek` only references a store path or a public artifact (see §6).

Where credentials would be needed in the cluster repo:

- **Operator's Mac (`zakkart`)**: `just deploy` evaluates locally; `zakkart` Nix settings are `determinateNix.customSettings` in `modules/nix.nix` (note: AGENTS says it does not merge, so use `extra-*` keys; `extra-access-tokens` would be the key). The operator's `~/.config/nix/nix.conf` (outside the repo) would also work; or SSH agent for option 2.
- **GitHub Actions** (`.github/workflows/ci.yml`): `install-nix-action` accepts `extra_nix_config`; a repo secret (e.g. a PAT) can be interpolated there, or `github_access_token`. Note the default `GITHUB_TOKEN` is scoped to the workflow's own repository (GitHub docs, "Automatic token authentication"), so it cannot read `jeiang/life-sim`; a PAT, deploy key, or GitHub App installation token is needed. CI evaluates in pure mode ("CI evaluates in pure mode"), unaffected: the locked, authenticated fetch is still pure.
- **`alda` itself (and `peria`/others)**: deploys are `--remote-build` after CI has pushed closures to garret (`cache.jeiang.dev`), so targets substitute. [INFERENCE] Evaluation happens on the operator's Mac or CI, so the server may not need the token at all; if alda ever evaluates the flake itself (it is not set up to), it would.
- **buildbot-nix on `ricklent`** (`modules/buildbot/default.nix`): builds repos with topic `build-with-buildbot` owned by `jeiang`. Is separate from this question unless life-sim itself is built there; its GitHub App would need access to the private repo.
- `flake.lock` pins `life-sim` by `rev`; updating = `nix flake update life-sim` on a machine with the token, then PR.

### 6. How the build gets to the edge: options

| Option | Shape | Pros | Cons |
| --- | --- | --- | --- |
| **A. Flake input + Caddy `file_server` on `alda` (existing pattern)** | `inputs.life-sim` private; `root * ${inputs.life-sim.packages.${system}.default}/dist` in `modules/edge/default.nix` | Zero new infra; atomic rollbacks (NixOS generations); matches `bill-split`/`mdtable`; TLS/DNS already done | Every PWA release = cluster-repo PR + lockfile bump + `just deploy alda`; needs private-repo creds on Mac + CI; old hashed assets vanish on deploy, so a client with an old SW cache must have precached everything (acceptable, since offline-first precaches the full set) |
| **B. Same, but life-sim CI pushes build to garret; cluster repo consumes via public artifact/flake** | life-sim workflow added to `modules/garret/default.nix` `job_workflow_refs` (pinned by repository id) | Source stays private; deploy substitutes instead of building | Needs garret allowlist change; the flake input still needs source access to evaluate unless the artifact is referenced by store path / fixed-output fetch from a public location |
| **C. Separate public "dist" repo/release** | life-sim CI publishes dist to a public repo; cluster pins `github:jeiang/life-sim-dist` or `fetchzip` | No credentials in cluster CI; works like existing inputs | Extra repo and publish step; built artifact public (a client-side PWA is public anyway once served) |
| **D. Make `jeiang/life-sim` public (or flip when releasing)** | `github:jeiang/life-sim` | Simplest; identical to peers | Source visibility change; user decision |
| **E. Run an app container/node (vida/peria) and reverse_proxy** | like `portfolio` (`legion.services.portfolio`, `reverse_proxy`) | Independent deploy cadence possible | Overkill for static files; needs `legion.services` entry, ports, firewall, and backups assertions; not warranted since no server state |
| **F. Dedicated hosting (GitHub Pages/Cloudflare Pages)** | off-cluster | No cluster change | Violates stated self-hosting constraint; private-repo Pages plan limits |

[INFERENCE] Recommended default for the later decision: **A with credential option 1 or 2**, falling back to C/D if the credential plumbing is judged too costly. B is an optimisation on top of A.

### 7. Cache headers for a service-worker PWA

Sources: Caddy `header` docs; web.dev service-worker-lifecycle; Cloudflare default cache behaviour.

Facts:

- Browsers (Chrome 68+ and most others) by default **ignore HTTP caching headers when checking the registered SW script for updates** (`updateViaCache` defaults to `'imports'`), but still respect caching for scripts pulled in with `importScripts()` (web.dev). The SW is updated when the file is byte-different.
- Cloudflare does **not** cache a response when `Cache-Control` is `private`, `no-store`, `no-cache`, or `max-age=0`, or when `Set-Cookie` is present; it caches when `public` with `max-age>0`. By default it caches by file extension (JS, CSS, PNG, SVG, WOFF2, ICO, ... included) and does **not** cache HTML or JSON by default (Cloudflare docs). `.webmanifest` is not in the default extension list [verified from the list on that page].
- Caddy `header` sets/overwrites by default, `?Name` sets only if absent, `-Name` deletes, and it accepts a path matcher (`header /static/* Cache-Control max-age=31536000` is the doc example). Use `route` to control ordering when multiple `header` directives target the same field (doc example).
- Caddy's `file_server` sets `ETag`/`Last-Modified` from mtime + size but skips them when mtime is 0 or 1 (source: `usefulModTime` in `modules/caddyhttp/fileserver/staticfiles.go`, issues #5548/#7730). Nix store paths have fixed mtime 1 [Nix store normalisation; inference, not re-verified], so files from the store are served **without validators**: `no-cache` revalidation therefore refetches the full small file, never a bogus 304. If conditional requests are wanted, `file_server { etag_file_extensions .etag }` reads sidecar files emitted by the build (values must be quoted per RFC 7232).

Recommended policy (Caddyfile fragment, as a shape; not applied):

```
life-sim.jeiang.dev {
  log
  crowdsec
  appsec
  root * <store path of life-sim package>
  encode zstd gzip

  @immutable path /assets/*            # build tool's content-hashed dir
  header @immutable Cache-Control "public, max-age=31536000, immutable"

  @revalidate path / /index.html /sw.js /manifest.webmanifest /registerSW.js
  header @revalidate Cache-Control "no-cache"

  header ?Cache-Control "no-cache"      # default for anything unmatched (icons not hashed)
  try_files {path} /index.html          # only if the app uses client-side routing; single screen set may not
  file_server
}
```

Rules of thumb, with reason:

- **`sw.js`: `no-cache`** (never `immutable`, never a long `max-age`, and never hashed in its URL; a changed SW URL leaves old SWs orphaned — web.dev advises against changing the worker URL). Registration should use `updateViaCache: 'none'` to be robust against intermediaries. 
- **`index.html`: `no-cache`** so a new deploy is discovered on next load; it references hashed assets.
- **`manifest.webmanifest`: `no-cache`** (or short `max-age`), served as `application/manifest+json` (Caddy's mime-type table covers `.webmanifest` [UNVERIFIED]; check with `curl -I` after deploy).
- **Hashed bundles/CSS/icons/fonts: `public, max-age=31536000, immutable`**, which is also what lets Cloudflare edge-cache them.
- Unhashed icons (`icon-192.png`, `apple-touch-icon.png`): short TTL or `no-cache`.
- Always HTTPS-only, no `Cache-Control` `private` on assets.
- `Service-Worker-Allowed` header only needed if the SW lives outside the scope root; avoid by serving `sw.js` at `/`.
- Cloudflare: because `sw.js`/HTML are `no-cache`, they bypass edge cache and hit `alda` each time; negligible load. If a Cloudflare Cache Rule ("cache everything") were added later, it would need to exclude `sw.js`/HTML.

### 8. Files/modules a deploy would touch (cluster repo, `cornn-flaek`; none modified)

| File | Change |
| --- | --- |
| `flake.nix` | add `life-sim.url = "github:jeiang/life-sim";` (or `git+ssh://...`) with `inputs.nixpkgs.follows = "nixpkgs"`, mirroring `bill-splitter`. |
| `flake.lock` | pin updated by `nix flake lock --update-input life-sim` (needs creds). |
| `modules/edge/default.nix` | (1) add `"life-sim.jeiang.dev"` (name TBD) to `legion.services.caddy.publicHostnames`; (2) add `lifeSim = "${inputs.life-sim.packages.${system}.default}/dist";` in the `let` next to `billSplitter`; (3) add the site block with headers above, `${logLine}${crowdsecLine}${appsecLine}`. |
| `modules/gatus/default.nix` | optional `ok "Life Sim" "Web" "https://<host>"`. |
| `modules/glance.nix` | optional tile (cf. lines for bill-split/mdtable). |
| `modules/nix.nix` | only if the Mac needs `extra-access-tokens`/include for the private input (`determinateNix.customSettings`). Token itself via a file outside the repo/sops secret, not committed. |
| `modules/edge/secrets.yaml` | **no change** unless a new DNS provider token is needed (it is not). |
| `dns/dnsconfig.js` | **no change** for a `*.jeiang.dev` hostname (wildcard exists). |
| `.github/workflows/ci.yml` | add credentials for the private input (secret name only, e.g. `extra_nix_config` with `access-tokens`, or SSH key) to the `discover`/`build`/`build-macos` `install-nix-action` steps, since they evaluate the host closures. |
| `modules/garret/default.nix` | only for option B (add life-sim `ci.yml` workflow ref). |
| `docs/topology/` | re-run `just topology` only if services change. |

Deploy flow per `AGENTS.md`: branch + PR (main protected, signed commits, Conventional Commits), wait for CI to push closures to garret, then the operator runs `just deploy alda --skip-checks --remote-build` (deploy needs explicit approval; deploy-rs magic rollback covers a live switch). Rollback: previous NixOS generation.

## Implications for open decisions

- **Hosting target:** use the existing Caddy edge on `alda`; no new node, no Kubernetes, no extra TLS work. Node/container hosting (option E) is unjustified for static files.
- **Flake outputs the life-sim repo must provide:** a `packages.x86_64-linux.default` (or named) derivation whose output is the web root (with `sw.js`, `manifest.webmanifest`, hashed `/assets`); deployable irrespective of the stack choice (any bundler that emits content-hashed filenames and a static `sw.js` name works). The service worker must not rely on server-side rewrites beyond optional SPA fallback.
- **Hostname choice:** any `*.jeiang.dev` subdomain is free; other domains need DNS+TLS work. Pick one (ticket #15 consumer).
- **Private repo credential strategy** is the main open item: PAT vs deploy key vs public dist vs making repo public. Also decide who may read the token (Mac, CI; not alda).
- **Release cadence:** cluster changes require a cluster-repo PR and deploy per PWA release; this is acceptable for a single-user game but coupled to the user's deploy approval flow.
- **Anubis:** explicitly exclude; confirm CrowdSec/appsec lines are acceptable for a PWA (they are for `bill-split`).
- **SW update UX / versioning:** since old hashed assets vanish on each deploy (Nix store GC / new path) and `sw.js` is revalidated, the app should precache everything in install and prompt/refresh on SW `waiting`; a stale client with an old shell calling removed asset URLs would 404 unless the SW has them cached.

## Newly surfaced questions for later tickets

- Should the PWA hostname be `life-sim.jeiang.dev` or another (does the user want a vanity domain)? 
- Credential strategy for the private input (see §5), and whether to enable a read-only PAT in CI.
- Does the build's stack emit a stable `sw.js` name and content-hashed assets (Workbox/vite-plugin-pwa vs hand-rolled SW)? Affects header policy and update flow.
- Whether the SW should handle a version-skew fallback (old client fetching purged assets after a deploy).
- Check Cloudflare SSL mode / any Cache Rules in the Cloudflare dashboard (not visible in repo).
- The `AGENTS.md` rule "Blackbox probes target private backend addresses" vs the existing public-URL `ok` probes in `modules/gatus/default.nix`: confirm before adding a status probe.

## Sources

Local (read-only; paths in `cornn-flaek`, remote `git@github.com:jeiang/.dotfiles.git`; no secret values read or reproduced):

- `AGENTS.md`, `README.md`, `flake.nix`, `justfile`, `.github/workflows/ci.yml`
- `modules/edge/default.nix`, `modules/anubis.nix`, `modules/packages/caddy.nix`, `modules/portfolio/default.nix`
- `modules/hosts/legion/services.nix`, `modules/hosts/legion/default.nix`, `modules/nix.nix`, `modules/buildbot/default.nix`, `modules/gatus/default.nix`, `modules/glance.nix`
- `dns/dnsconfig.js`
- `gh repo view` visibility of `jeiang/website`, `bill-splitter`, `character-randomizer`, `markdown-table-live-editor` (PUBLIC) and `jeiang/life-sim` (PRIVATE)

External:

- Nix manual, flake references (github/git+ssh examples): https://nix.dev/manual/nix/stable/command-ref/new-cli/nix3-flake.html
- Nix manual, `nix.conf` (`access-tokens`, `!include`): https://nix.dev/manual/nix/stable/command-ref/conf-file.html
- Caddy `header` directive: https://caddyserver.com/docs/caddyfile/directives/header
- Caddy `file_server` directive: https://caddyserver.com/docs/caddyfile/directives/file_server
- Caddy source, ETag/mtime handling: https://github.com/caddyserver/caddy/blob/master/modules/caddyhttp/fileserver/staticfiles.go
- web.dev, service worker lifecycle (update checks, `updateViaCache`): https://web.dev/articles/service-worker-lifecycle
- Cloudflare, default cache behaviour: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- GitHub Actions automatic token authentication: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication
