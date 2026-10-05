# Offline PWA persistence on iOS and Android

Research for ticket #2 (map: #1). Researched 2026-10-05. Items marked **[INFERENCE]** are my reasoning, not stated by a source.

## Question

Can a web PWA run **fully offline** on both iPhone (Safari / home-screen install) and Android (Chrome) and keep saves safe long-term? Covers: service worker caching and update flow; storage options and quotas; eviction rules (iOS 7-day cap, `navigator.storage.persist()`); install-to-home-screen behaviour; export/import as a backup path; and any hard blocker that would force a native wrapper (Capacitor etc.) and its cost.

## Summary

- **Yes, no hard blocker.** A pure-web PWA can run fully offline on iOS Safari/home-screen and Android Chrome. Service workers + Cache API + IndexedDB are supported on both; the game is static, build-time content, so a precache of the whole app is small and simple. **No native wrapper is forced.**
- **The iOS 7-day script-writable-storage cap applies to Safari *tabs* only.** WebKit states home-screen web apps have their own use counter, are exempt from ITP's cap, and have storage isolated from Safari. A game played in a Safari tab and not touched for 7 days of Safari use *can* lose IndexedDB, localStorage and the service worker cache. Installing to the Home Screen is the mitigation.
- **Quotas are generous.** Safari 17+/iOS 17+: per-origin up to ~60% of disk (home-screen app uses the same 60%), Chromium: up to 60% of disk. A text sim save is KBs–low MBs; quota is irrelevant. localStorage is capped ~5 MiB, so use IndexedDB.
- **`navigator.storage.persist()` is supported on both** (Chrome Android 55+, Safari/iOS 15.2+). Neither prompts the user; both decide by heuristics (Chromium: engagement, installed/bookmarked, notifications; WebKit: e.g. opened as a Home Screen web app). Call it, but treat `false` as normal and never rely on it.
- **Install differs:** Android Chrome fires `beforeinstallprompt` (custom in-app Install button, installs as a WebAPK); iOS has no such event, so an in-app "Share → Add to Home Screen" hint is required. iOS 26 makes *every* Home Screen site open as a web app by default.
- **Update flow:** service worker update is checked on navigation; new worker waits until old clients close unless `skipWaiting()`. For a save-bearing game, prefer "prompt to reload" over silent `skipWaiting()` mid-session. Content-hashed assets + Workbox precaching handles the file list.
- **Backups are a must, not optional.** Best-effort storage can be wiped by the user, Safari ITP (tab case), or storage pressure. Export/import as a file works on both: download/`<input type=file>` everywhere; `navigator.share({files})` on iOS 12.2+/Android; File System Access `showSaveFilePicker` is **not** available on iOS.
- **Capacitor would add cost, and does not obviously improve durability:** US$99/yr Apple Developer Program, US$25 one-time Google Play fee, Xcode/macOS for iOS builds **[INFERENCE]**, App Review, and Capacitor's own docs say WebView localStorage/IndexedDB must be considered transient on iOS (use a native plugin like Preferences/SQLite instead). Recommendation: stay PWA.

## Findings

### 1. Service worker caching and update flow

- **Lifecycle** (Jake Archibald, web.dev): `install` is the place to precache; if the `waitUntil` promise rejects the worker is discarded. A newly installed worker **waits** until the old worker controls zero clients; a plain refresh does not suffice because old/new pages overlap during navigation. `self.skipWaiting()` skips waiting; `clients.claim()` takes over uncontrolled pages. First load is uncontrolled (the first service worker only controls pages after the next load unless `clients.claim()` is used). [web.dev SW lifecycle]
- **Update checks** are triggered by navigations to in-scope pages, and by functional events (push/sync) at most once per 24 h; also manually via `registration.update()` (poll hourly if the app stays open long). Chrome 68+ ignores HTTP caching headers for the SW script by default; script is "updated" if byte-different. Don't change the SW script's URL. [web.dev SW lifecycle]
- **Precaching with Workbox:** `workbox-precaching` takes a manifest of `{url, revision}`, downloads during `install`, uses a cache-first route, and cleans stale entries on `activate`; only changed files are re-downloaded. Files with content hashes in the URL need no revision. [Chrome for Developers: workbox-precaching]
- **Safe-update pattern for a game with saves [INFERENCE from the above]:** (1) keep saves in IndexedDB, not the Cache API, so SW cache resets/replacement never touch them; (2) version the save schema and migrate in app code (not in `activate`), (3) show "Update available → Reload" and let the user pick the moment, calling `skipWaiting` via `postMessage` as web.dev suggests; (4) because Packs are build-time content shipped in the bundle, a new SW = new Pack = a save-compatibility concern for the Core's loader (relevant to later schema tickets).
- **Cache API is wiped together with the rest of the origin** on eviction (MDN: all of an origin's data is deleted at once), so a full eviction removes both the app shell and saves; recovery then requires network once. That makes the offline guarantee "after first successful load, as long as storage isn't evicted".

### 2. Storage options and quotas

| Option | Limits | Notes |
|---|---|---|
| localStorage / sessionStorage | ~5 MiB each per origin (MDN: 10 MiB max across browsers) | Sync, string-only; fine for tiny settings, poor for saves. |
| IndexedDB | Origin quota (below) | Best-supported structured store; recommended for saves. |
| Cache API | Origin quota | For app shell; same eviction unit as IDB. |
| OPFS (`navigator.storage.getDirectory()`) | Origin quota; cleared when site data cleared | `getDirectory`: Safari/iOS 15.2+, Chrome Android 109+. `createWritable`: Safari/iOS **26+**, Chrome Android 109+ (MDN BCD 8.1.4). Sync access handle (workers) Safari 15.2+. Only needed for SQLite-WASM-style storage. |
| `StorageBucketManager` | n/a | Chromium only (122+); **not** Safari/iOS. Don't rely on it. |

- **Quota, Safari/WebKit (17.0 / iOS 17, Aug 2023):** browser app: origin up to 60% of disk, overall up to 80%; other apps (WKWebView embeds) 15% / 20%. **A Home Screen web app has the same quotas as the browser app.** Cross-origin frames get 10% of the main frame's quota. Quota values vary to limit fingerprinting. Safari 17 no longer prompts about using more space. [WebKit blog: Updates to Storage Policy, 2023-08-10; MDN quotas]
- **Quota, Chromium:** up to 60% of total disk per origin, both modes (MDN). **Firefox:** min(10% disk, 10 GiB) best-effort (n/a to the mobile targets here, mentioned for completeness).
- `QuotaExceededError` must be handled on every write (MDN, WebKit). `navigator.storage.estimate()`: Chrome Android 61+, Safari/iOS 17+.
- For this game the working set is orders of magnitude below any limit **[INFERENCE]**; the practical risk is eviction, not size.

### 3. Eviction rules

**General (MDN):** two modes, *best-effort* (default) and *persistent*. Best-effort data is evicted under storage pressure (LRU by origin), when the browser's overall cap is exceeded, or (Safari only) proactively for origins unused for 7 days. Eviction is per-origin all-or-nothing. Chrome's own research says automatic clearing is very rare; users manually clearing storage is far more common. [MDN quotas; web.dev persistent storage, last updated 2020-05-12]

**iOS Safari, in a browser tab:** ITP "7-Day Cap on All Script-Writeable Storage": all script-writable storage (IndexedDB, localStorage, media keys, sessionStorage, **service worker registrations and cache**) is deleted after **7 days of Safari use without user interaction** (tap/click/keypress; scrolling doesn't count) on the site. Counter is days of Safari *use*, not wall-clock days. [WebKit blog 2020-03-24; webkit.org/tracking-prevention]

**iOS Home Screen web app:** WebKit states home-screen apps "have their own counter of days of use", that their first-party domain is **exempt** from ITP's 7-day cap, and that their website data is **isolated from Safari**; deletion in a home-screen app would be considered "a serious bug". [WebKit blog 2020-03-24; webkit.org/tracking-prevention, mod. 2023-04-27] **Caveat:** isolation means a save created in a Safari tab is **not visible** in the installed app (and vice versa) — users who start in a tab then install will appear to lose their game unless export/import is offered. (Isolation stated by WebKit; the UX consequence is my **[INFERENCE]**.) The 7-day exemption wording is from 2020/2023 docs; I found no 2025–26 WebKit post revising it. Safari 26 blog (2025-06-09) discusses home-screen apps without changing storage policy.

**iOS storage-pressure eviction (WebKit 2023):** eviction when over the overall quota, under system storage pressure, or after long non-interaction. Origins are evicted whole in LRU order (last user interaction or last storage op). **Excluded from eviction: origins with an active page, or in persistent mode.** [WebKit blog 2023-08-10]

**Android Chrome:** only the generic rules apply: storage-pressure LRU eviction of non-persistent origins; no time-based proactive eviction (MDN: proactive eviction "happens only in Safari"). Users clearing site data/app data in Settings deletes everything regardless of persistence.

**`navigator.storage.persist()`:**
- Support: Chrome/Chrome Android 55+, Edge 79+, Firefox 57+, Safari/iOS 15.2+ (web.dev; MDN BCD). `persisted()` the same.
- Chromium: silent grant/deny by heuristics — site engagement, installed or bookmarked, notification permission; can be re-requested. [web.dev persistent storage]
- WebKit: "grants a request based on heuristics like whether the website is opened as a Home Screen Web App". [WebKit blog 2023-08-10]
- Persistent mode protects Cache API, cookies, localStorage, OPFS, IndexedDB, SW registrations from *browser* eviction; user-initiated clearing still deletes. No API to un-persist. [web.dev, MDN]
- Practical: request after the first real save (user gesture is recommended by web.dev), log/offer result, and show "Back up your save" nudges when `persisted()` is false. **In a Safari tab the request probably returns false [INFERENCE from WebKit's heuristic wording — not tested; verify on a device].**

### 4. Install behaviour

- **Android (Chrome):** installable if served over HTTPS with a manifest containing name/short_name, icons incl. 192 px and 512 px, `start_url`, `display`/`display_override`, and no `prefer_related_applications: true`. Chrome with Google Mobile Services installs as a **WebAPK** (own launcher entry); other browsers/non-GMS devices add only a browser shortcut. `beforeinstallprompt` allows a custom Install button. A service worker is **not** required for installability. [MDN: Making PWAs installable]
- **iOS:** installs via Share → Add to Home Screen (Safari, and since iOS 16.4 also Chrome/Edge/Firefox/Orion with the browser entitlement). **No `beforeinstallprompt`** (MDN BCD: unsupported on Safari iOS) so the app must show its own instructions. [MDN; WebKit blog 2023-02-16]
- **iOS 26 (WWDC25, 2025-06-09):** every site added to the Home Screen opens as a web app by default (toggle "Open as Web App" can be turned off, in which case it's a plain bookmark). Manifest still honoured (icons, etc.); service workers still supported; SVG icons supported in Safari 26. [WebKit blog: News from WWDC25]
- **EU:** Apple's developer EU page (fetched 2026-10-05) lists alternative browser engines (non-WebKit) for EU; per MDN, in those cases that engine's policies apply instead of WebKit's. Does not change the plan; just note storage policy can differ for EU alt-engine browsers.
- Self-hosting requirement: HTTPS with valid cert is mandatory for SW/installability (localhost excepted) — a cluster ingress/cert-manager concern for a later infra ticket.

### 5. Export/import as backup

- **Export:** generate a JSON (optionally gzip via `CompressionStream`, Safari/iOS 16.4+, Chrome Android 80+) and offer (a) `navigator.share({files:[file]})` after `canShare` check — Safari/iOS 12.2+ (`canShare` 14+), Chrome Android 61+/75+; needs transient user activation — which gives iOS users "Save to Files", AirDrop, email, etc.; and (b) fallback `<a download>` of a Blob URL. [MDN Navigator.share; MDN BCD 8.1.4]
- **Import:** `<input type="file">` works everywhere. `showSaveFilePicker`/`showOpenFilePicker` exist on Chrome Android 132+ but **not** iOS Safari, so don't depend on File System Access. [MDN BCD 8.1.4]
- **Design requirements [INFERENCE]:** include save-schema version + Pack id/version in the file; validate on import; allow import into a Home Screen install (solves the tab→installed isolation above); consider a nag when `persisted()` is false or last export is old.
- Server-side sync/accounts would be an alternative backup but is out of scope for a fully offline game and not required.

### 6. Does anything force a native wrapper?

No capability found that the game needs and the PWA lacks: static content, text UI, local saves, offline. Possible reasons to wrap anyway, all non-blocking:

- **App Store/Play presence & discoverability.** PWAs can be packaged (PWABuilder; Google Play via TWA) — MDN lists Play, Microsoft Store, Meta Quest and iOS App Store paths.
- **Storage durability on iOS** — wrapper doesn't automatically help: Capacitor docs (v8) say localStorage "must be considered transient" and that the OS can reclaim WebView storage when low on space, "the same can be said for IndexedDB at least on iOS"; their fix is native Preferences (small) or SQLite plugins. So a wrapper only helps if saves move to native storage, which forks the persistence layer between web and native **[INFERENCE]**. (Note WebKit says the 15% non-browser-app quota applies to WKWebView apps; the origin in Capacitor is app-local.)
- **Cost of Capacitor path:** Apple Developer Program US$99/year (Apple, fetched 2026-10-05); Google Play one-time US$25 (Google, fetched 2026-10-05; new personal accounts also have closed-testing and device-verification requirements); Capacitor needs `package.json`, a built `webDir`, and `cap add ios/android` + `cap sync`; iOS build requires Xcode (macOS) **[INFERENCE: standard]**; App Review friction; two release channels besides the self-hosted web release; conflicts with "self-hosted on user's cluster, Nix flake outputs" simplicity.

## Implications for open decisions

- **Stack:** any stack that emits a static bundle works. Requirement is just a manifest + SW with precache of hashed assets (Workbox or equivalent). Prefer stacks with a mature PWA plugin. SW + HTTPS are mandatory; Nix build should emit the asset manifest deterministically.
- **Persistence layer (ticket #12 / #8 blockers per map):** use IndexedDB (or a thin wrapper) for saves, not localStorage/Cache API/OPFS; OPFS adds nothing unless SQLite-WASM is wanted, and `createWritable` needs iOS 26+.
- **Save format:** versioned, Pack-aware, exportable as a single file; migration logic lives in app code. Decide whether saves reference Pack versions (Pack updates arrive with SW updates).
- **Update UX:** user-controlled "update available" reload; never `skipWaiting` silently mid-session.
- **Onboarding:** in-app "Install" button on Android; iOS instruction card (Share → Add to Home Screen); warn that a tab save and an installed save are separate and offer export/import to migrate. Request `persist()` after first save.
- **Native wrapper:** do not adopt; revisit only if store distribution becomes a goal. If revisited, plan on native storage for saves.
- **Hosting:** HTTPS required; serve `sw.js` and `manifest` with sensible cache headers (no long-lived caching of `sw.js`/`index.html`; hashed assets immutable).

## Gaps / to verify on device (not tested here)

- Whether `persist()` returns true for a Safari tab vs installed app on current iOS 26.x.
- Exact behaviour of home-screen web app data when the user uses "Clear History and Website Data" in Settings → Safari (WebKit says isolated from Safari; not verified empirically).
- Any 2025–2026 WebKit changes to the ITP 7-day rule (none found in sources reviewed).
- I did not find an official Android-specific Chrome doc on eviction beyond MDN/web.dev's general text.

## Sources

- WebKit — Full Third-Party Cookie Blocking and More (7-day cap, home-screen note), 2020-03-24: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- WebKit — Tracking Prevention in WebKit (ITP; home-screen exemption; modified 2023-04-27): https://webkit.org/tracking-prevention/
- WebKit — Updates to Storage Policy, 2023-08-10 (modified 2023-09-18): https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit — Web Push for Web Apps on iOS and iPadOS, 2023-02-16: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit — News from WWDC25: WebKit in Safari 26 beta, 2025-06-09: https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- MDN — Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN — Origin private file system: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- MDN — Making PWAs installable: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- MDN — Navigator.share(): https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- MDN browser-compat-data v8.1.4 (npm `@mdn/browser-compat-data`, fetched 2026-10-05): https://unpkg.com/@mdn/browser-compat-data/data.json
- web.dev — Persistent storage (last updated 2020-05-12): https://web.dev/articles/persistent-storage
- web.dev — The service worker lifecycle: https://web.dev/articles/service-worker-lifecycle
- Chrome for Developers — workbox-precaching: https://developer.chrome.com/docs/workbox/modules/workbox-precaching
- Capacitor docs v8 — Storage: https://capacitorjs.com/docs/guides/storage
- Capacitor docs v8 — Installing Capacitor: https://capacitorjs.com/docs/getting-started
- Apple — Apple Developer Program membership details (US$99/yr): https://developer.apple.com/programs/whats-included/
- Apple — Changes for apps in the EU (alternative browser engines): https://developer.apple.com/support/apps-in-the-eu/
- Google — Get started with Play Console (US$25 fee): https://support.google.com/googleplay/android-developer/answer/6112435
