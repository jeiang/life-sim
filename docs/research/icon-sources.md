# Open-licensed emoji and icon sources

Research for ticket #6 (map: #1). Research date: 2026-10-05. All facts were read from each project's own repo/LICENSE/README via the GitHub API on that date unless marked **[INFERENCE]**.

## Question

Which emoji and SVG icon sets can be bundled offline in a private-repo PWA, and what do their licenses require? Cover native system emoji (iOS vs Android differences), Twemoji, OpenMoji, Noto Emoji, Fluent Emoji, game-icons.net, Lucide/Tabler/Phosphor: license, attribution/share-alike, size/format, offline bundling, coverage for money/school/jobs/casino/travel/baby, and how to show attribution in-app.

## Summary

- **Private repo does not remove obligations.** Attribution/notice duties attach to *distribution of the assets to users*. A self-hosted PWA serves the files to every visitor's browser, so treat it as distribution **[INFERENCE]; not legal advice**.
- **No-friction sets (permissive code-style licenses, notice only):** Lucide (ISC), Tabler (MIT), Phosphor (MIT), Fluent Emoji (MIT). Requirement: keep the copyright + permission notice with the bundled files.
- **Attribution-required sets:** Twemoji graphics (CC BY 4.0), game-icons.net (CC BY 3.0, per-author credit; a few authors CC0), Noto Emoji SVG/PNG (Apache 2.0, ship license text; font is OFL 1.1).
- **Only share-alike set: OpenMoji (CC BY-SA 4.0).** Unmodified use needs credit only, but any recolored/optimized/edited SVG is "Adapted Material" and must itself be released CC BY-SA 4.0. Not forbidden, but the only set with a copyleft burden; avoid unless OpenMoji's look is wanted.
- **Native system emoji are free (no license, no bytes) but look different on iOS (Apple Color Emoji) and Android (Noto, or OEM skin such as Samsung), and new emoji show as tofu on old OS versions.** Android ≤11 cannot update its emoji font.
- **Emoji sets key by Unicode codepoint, so every concept is covered** (💰 🎓 💼 🎰 ✈️ 👶 🎲 🪦 verified present in Twemoji, Noto, OpenMoji). Line-icon sets have no casino-specific icon except Tabler `roulette`, Phosphor (84 dice/card matches) and Lucide dice/`dices`; game-icons.net has the broadest "game-flavored" coverage (slot-machine, dice, baby-bottle, graduate-cap, etc.).
- **Size is a non-issue if subset at build time.** Even a full SVG set is 0.7–14 MB raw; Packs reference perhaps 100–500 icons, ~0.2–1.5 MB. Avoid shipping the 10 MB Noto color font and Fluent's 110 MB 3D PNGs.
- **Recommendation direction:** mono line icons (Lucide/Tabler/Phosphor) for generic UI + one consistent color emoji SVG set (Twemoji or Noto) *or* native emoji for content; game-icons.net as optional flavor with an auto-generated credits screen.

## Findings

### 1. Comparison table

| Set | Graphics license (from project) | Obligation for our use | Format / approx. size | Count |
|---|---|---|---|---|
| Native system emoji | OS fonts; no redistribution | None (we ship no art) | 0 bytes; text glyphs | all Unicode the OS supports |
| Twemoji (`jdecked/twemoji`, v17.0.3) | **Graphics CC BY 4.0**; code MIT (`package.json`: `MIT AND CC-BY-4.0`) | Credit; link license; indicate changes | SVG 4,009 files, 10.1 MB raw (avg 2.5 KB); PNG 72×72 4.2 MB | 4,009 |
| OpenMoji (`hfg-gmuend/openmoji`, 17.0.0) | **Graphics CC BY-SA 4.0**; code LGPL-3.0 | Credit **and** share-alike for adaptations | color SVG 4,565 files, 14.4 MB (avg 3.2 KB); black SVG 8.7 MB | 4,565 |
| Noto Emoji (`googlefonts/noto-emoji`) | **Fonts: SIL OFL 1.1; SVG/PNG images: Apache 2.0** (`2D/svg/LICENSE`); flags public domain | Apache: ship license text + notices, mark changes | 2D/svg 3,751 files, 41.7 MB (avg ~11 KB, heavier gradients); PNG128 21 MB; color font 10.7 MB (CBDT) / 5.0 MB (COLRv1) | ~3,750 |
| Fluent Emoji (`microsoft/fluentui-emoji`) | **MIT** (Microsoft) | Keep copyright + MIT notice | 4 styles/emoji: Color SVG, Flat SVG, High Contrast, 3D PNG. Flat SVG 17 MB (avg 5.5 KB); Color SVG 132 MB (avg 42 KB incl. skin-tone variants); 3D PNG 110 MB | 1,000 emoji dirs / 3,145 files per style |
| game-icons.net (`game-icons/icons`) | **CC BY 3.0** (some authors CC0: Viscious Speed, Zeromancer) | Credit author per icon: "Icons made by {author}" | SVG 4,239 files, 7.0 MB (avg 1.6 KB), white-on-black by default; recolorable | 4,239 |
| Lucide (`lucide-icons/lucide`) | **ISC**; Feather-derived subset MIT (Cole Bemis) | Keep notices (ISC + Feather MIT) | SVG 1,866, 0.76 MB (avg 0.4 KB), 24px stroke | 1,866 |
| Tabler (`tabler/tabler-icons`) | **MIT** (Paweł Kuna) | Keep MIT notice | outline 5,184 (3.0 MB) + filled 1,054 (0.66 MB) | 6,238 |
| Phosphor (`phosphor-icons/core`) | **MIT** | Keep MIT notice | 6 weights × 1,512 (thin/light/regular/bold/fill/duotone), ~0.45–0.94 MB per weight | 1,512 ×6 |

Sizes computed from the git tree blob sizes (raw, uncompressed, pre-minification); gzip typically shrinks SVG a lot **[INFERENCE]**.

### 2. Native system emoji

- Rendered by the OS font: Apple Color Emoji on iOS/iPadOS, Noto Color Emoji on stock Android (Android docs: "the NotoColorEmoji font is over 10 MB"). Android OEMs (e.g. Samsung) may substitute their own art **[INFERENCE from general knowledge; not verified in a primary source this session]**. Unicode itself standardises only names/codepoints, not artwork, so the same codepoint legitimately looks different per vendor.
- **Version lag is the real risk.** Android docs: "Android versions 11 (API level 30) and lower can't update the emoji font"; newer emoji appear as tofu (☐) or broken sequences. Android recommends testing on API ≤29. Test strings in that doc: Emoji 16.0 🫩 🪉, 15.0 🩷, 14.0 🫠. iOS emoji coverage tracks iOS version, not the browser **[INFERENCE]**.
- Consequences for a PWA: layout/size can differ per platform (line-height, glyph width), skin-tone/ZWJ sequences may fall back to multiple glyphs, and screenshots/QA differ per device. Mitigation: restrict Packs to a conservative Unicode baseline (e.g. Emoji ≤12.0, 2019) or bundle an SVG set.
- Zero attribution and zero bundle cost; no offline concerns.

### 3. Twemoji

- The maintained fork is `jdecked/twemoji` (v17.0, Unicode 17; `twitter/twemoji` is the original, also licensed MIT by GitHub metadata). License split verified in the fork: `LICENSE` = MIT for code, `LICENSE-GRAPHICS` = CC BY 4.0 full text; README: "Graphics licensed under CC-BY 4.0".
- README "Attribution Requirements": accepts "a mention in a project README or an 'About' section or footer… In mobile applications… Settings/About section… We would consider a mention in the HTML/JS source sufficient also." This is the owner's own interpretation, directly supports an in-app About/Credits page.
- Assets: `assets/svg/<codepoint>.svg` and `assets/72x72/<codepoint>.png`. Lookup is by lowercase hex codepoint sequence (e.g. `1f4b0.svg`, `2708.svg`).
- npm package `@twemoji/api`; or copy only the needed SVGs. No runtime network is required if the files are vendored (the library's default base URL is jsDelivr, so override `base` or skip `twemoji.parse` and reference SVGs directly).
- Style is flat, widely recognizable; consistent across platforms.

### 4. OpenMoji

- `LICENSE.txt` = CC BY-SA 4.0. README: graphics CC BY-SA 4.0; code LGPL-3.0. FAQ: attribution suggestion verbatim: "All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0"; "ShareAlike — If you remix, transform, or build upon the material, you must distribute your contributions under the same license."
- CC legal code defines Adapted Material as material "derived from or based upon the Licensed Material and in which the Licensed Material is translated, altered, arranged, transformed, or otherwise modified". Practically: recoloring, SVGO-minifying, sprite-merging OpenMoji files plausibly counts **[INFERENCE]**; the *app code* is not necessarily adapted material, but whether a bundle/sprite counts as a collection vs adaptation is a legal gray area. A private repo does not avoid the question once served to users.
- Unique value: also includes non-Unicode extras and a monochrome `black/` set; ~4,565 emoji; 14 MB color SVG.
- If chosen: ship unmodified files (or accept CC BY-SA on the modified emoji files only), keep modifications listed in a changelog.

### 5. Noto Emoji

- Repo root `LICENSE`/`2D/fonts/LICENSE` = SIL OFL 1.1 (fonts). `2D/svg/LICENSE` = Apache License 2.0 "Copyright 2013 Google". README: "Emoji fonts… SIL OFL 1.1. Tools and most image resources… Apache 2.0. Flag images… public domain or otherwise exempt."
- Apache 2.0 obligations: give recipients the license text, keep notices, state changes to modified files. No attribution slogan required beyond that.
- Assets: `2D/svg/emoji_u<codepoint>.svg` (3,751 files, 41.7 MB), PNG at 32/72/128/512 px (128px set 21 MB). Flag PNGs are pre-transformed; no SVG for flag as rendered (README).
- Color font `NotoColorEmoji.ttf` is 10.7 MB (CBDT). `Noto-COLRv1.ttf` is 5.0 MB; browser support for COLRv1 is Chromium-only in my understanding **[INFERENCE; verify before relying on it for iOS]**. Bundling a font and forcing it via `font-family` would give identical art on iOS and Android but costs 5–11 MB precache; subsetting (pyftsubset/glyphhanger) is possible and OFL allows it, but OFL renames-on-modify (Reserved Font Name) applies only if a reserved name is declared **[INFERENCE]**.
- Look: Android-native style, so Android users see no change.

### 6. Fluent Emoji

- `LICENSE` = MIT, "Copyright (c) Microsoft Corporation". README is minimal and states no extra terms.
- Structure: `assets/<Name>/{Color,Flat,High Contrast,3D}/<name>_<style>.<svg|png>` plus `metadata.json` with `unicode`, `glyph`, `keywords`, `group`. Example: `assets/Money bag/` has Color 12.6 KB, Flat 1.9 KB.
- **3D PNGs are 110 MB total and Color SVGs 132 MB** because of skin-tone dirs and heavy gradients; subsetting at build time is mandatory. Flat SVG (17 MB total) is the practical set.
- Non-Unicode "Fluent" naming uses folder names with spaces; need a build-time mapping from codepoint via `metadata.json`.
- Broadest MIT-licensed full-color option (1,000 emoji concepts).

### 7. game-icons.net

- `license.txt` in repo: "Icons provided under the Creative Commons 3.0 BY or CC0 if mentioned below." Lists ~50 authors, each with a repo folder; CC0 for Viscious Speed and Zeromancer. "Please, include a mention 'Icons made by {author}' in your derivative work." The site About page says the same: "A mention like 'Icons made by {author;}. Available on https://game-icons.net' is fine." Repo folders: delapouite 2,022, lorc 1,429, skoll 172, caro-asercion 127, viscious-speed (CC0) 121, …
- Format: SVG, white glyph on black square background by default; repo ships `colorize-svgs.sh` to recolor/transparent. Author is encoded in the directory path (`delapouite/baby-bottle.svg`), which makes auto-generated credits trivial.
- Coverage: strongest for game/fantasy motifs: `caro-asercion/slot-machine`, ~36 dice/card matches (`delapouite/dice-six-faces-*`, `perspective-dice-*`), `baby-bottle`, `baby-face`, `graduate-cap`, coins/money bags, 54 skull/grave/coffin hits. Weak at generic UI chrome. Style: heavy, dark, "RPG"; tone may mismatch a BitLife-like light UI.
- CC BY 3.0 (not 4.0): credit must name the author, give the license, and link. Use the per-icon author list.

### 8. Lucide / Tabler / Phosphor

- Lucide: `LICENSE` = ISC (Copyright 2026 Lucide Icons and Contributors) + a Feather-derived subset under MIT (Cole Bemis); both require keeping the notices. 24×24 stroke icons, ~0.4 KB each. Present (file existence verified): `baby`, `graduation-cap`, `dices`, `dollar-sign`, `coins`, `plane`, `briefcase`, `landmark`, `heart-pulse`. Casino-adjacent: `cherry`, `spade`, `club`, `diamond`, `dices` (no slot-machine/roulette); only `skull`/`ghost` for death.
- Tabler: MIT (Paweł Kuna, 2020-2026). Outline 5,184 and filled 1,054. Has `roulette`, `baby-carriage`, `baby-bottle`; 131 money-ish and 82 travel-ish matches. Largest outline set.
- Phosphor: MIT (2023 Phosphor Icons). Six weights (thin, light, regular, bold, fill, duotone) from one source: cheap theming (e.g. regular for idle, fill for active). `baby`, `baby-carriage`, `graduation-cap`, 84 dice/casino/card matches, 348 travel matches. npm: `@phosphor-icons/core`.
- All three: single-color via `currentColor`, ideal for tab bars, menu rows, charts legends. They do not cover emotive life events (e.g. 🥳 😢), which is where emoji fit.

### 9. Coverage for life-sim concepts

Emoji sets (Twemoji / Noto / OpenMoji, verified by file existence): 💰 `1f4b0`, 🎓 `1f393`, 🧑‍🎓 `1f9d1-200d-1f393`, 💼 `1f4bc`, 🎰 `1f3b0`, 🎲 `1f3b2`, ✈️ `2708`, 👶 `1f476`, 🪦 `1faa6`, 🏦 `1f3e6`, plus recent additions 🫠 `1fae0` (Emoji 14), 🫨 `1fae8` (15), 🩷 `1fa77` (15) also present in all three.

Keyword counts for filename matches in line/game icon sets (rough indicator, not hand-curated): money (Lucide 17 / Tabler 131 / Phosphor 132 / game-icons 13), school-books (43/35/192/22), jobs-briefcase (34/11/144/10), casino-dice-card (13/16/84/36), travel (30/82/348/20), baby (5/4/24/4), death (1/4/12/54), wedding/ring/church (7/17/60/53). Fluent matches the emoji list one-for-one (1,000 concepts).

### 10. Offline bundling approach (common to all)

1. Vendor chosen assets via npm/flake input or a pinned copy in repo (`assets/icons/<set>/…`), with the upstream LICENSE file beside them.
2. At build time, collect icon IDs referenced by Packs, copy only those SVGs (optionally SVGO-minify; for OpenMoji this is an "adaptation").
3. Inline as a single SVG `<symbol>` sprite or hashed files precached by the service worker. Total for a few hundred icons ≈ tens to hundreds of KB.
4. Emit a generated `CREDITS.json` (set, license, author, URL, files used) from the same build step, so Pack authors cannot ship an icon without its credit.
5. Never load from jsDelivr/unpkg/Google Fonts at runtime (breaks offline; Twemoji's default `base` is jsDelivr).

### 11. How attribution would be shown in-app

- A **Settings → About → Credits** screen (reachable offline), generated from `CREDITS.json`. Maps to every project's own stated guidance (Twemoji: Settings/About; OpenMoji: About/footer; game-icons: "Icons made by {author}").
- Content: per set, name + copyright holder + license name linked to its URL + "changes made: …" if any. For game-icons list authors actually used (derived from folder). Include full license texts for MIT/ISC/Apache (needed for notice-keeping) in an expandable "Licenses" view or `/licenses.txt` shipped in the precache.
- Sample strings: "Emoji graphics: Twemoji © Twitter, Inc. and contributors, CC BY 4.0 (changes: optimized)"; "Icons made by Lorc, Delapouite, Skoll… from game-icons.net, CC BY 3.0"; "UI icons: Lucide (ISC)".
- Also put a comment/header in the built sprite and a `LICENSES` file at the site root (Twemoji accepts "HTML/JS source").
- Generic screens (feed/menu/purchase/chart) need no per-screen credit; one Credits screen suffices per the owners' stated rules (Twemoji, OpenMoji).

## Implications for open decisions

- **Emoji strategy:** choose between (a) native emoji (free, inconsistent, tofu on old Android → pin Packs to an old Unicode version) and (b) vendored SVG emoji (consistent, small after subsetting). If (b), Twemoji (CC BY, 2.5 KB avg) and Noto (Apache, 11 KB avg) are the lowest-friction; Fluent Flat (MIT) if a modern look is wanted; OpenMoji only if CC BY-SA is acceptable.
- **Icon strategy:** Core UI chrome from one stroke set (Phosphor offers weights and many travel/money icons; Lucide is smallest; Tabler is largest) is a license no-op beyond notices. game-icons.net is an additive flavor source, not a primary set, because of mood and per-author credits.
- **Pack schema:** icons should be referenced by an abstract id (`emoji:1f4b0`, `icon:phosphor/airplane`, `gameicon:delapouite/baby-bottle`) so the swap of sets or native emoji fallback is a Core renderer concern, and credits can be generated.
- **Build:** a Nix-pinned input for icon sets plus a codegen step produces sprite + `CREDITS.json`; this affects the stack decision (Vite/esbuild plugins or a Nix derivation).
- **Legal posture:** private repo ≠ private distribution. Keep all notice files; avoid CC BY-SA unless the user wants the share-alike burden.

## Open questions surfaced

- Final stack choice: native emoji, vendored SVG emoji, or both? Depends on UX consistency priority vs size.
- Is a bundled/subset emoji font (Noto COLRv1/CBDT, OFL) preferable to per-icon SVGs, and does Safari render COLRv1? (needs a device test, not verified here).
- Minimum emoji Unicode baseline if native emoji is used (Android 11 and lower can't update the emoji font).
- Does the user want the game-icons.net aesthetic at all, or only UI-chrome icons?
- Legal question for later grilling: acceptable to ship CC BY-SA OpenMoji in a sprite? (Recommend not deciding without counsel.)

## Sources

- Twemoji (fork): https://github.com/jdecked/twemoji (`LICENSE`, `LICENSE-GRAPHICS`, README "Attribution Requirements", `package.json`)
- OpenMoji: https://github.com/hfg-gmuend/openmoji (`LICENSE.txt`, README "Attribution Requirements"/"License", `FAQ.md`), https://openmoji.org/
- Noto Emoji: https://github.com/googlefonts/noto-emoji (`README.md`, root `LICENSE`, `2D/svg/LICENSE`, `2D/fonts/LICENSE`, `third_party/region-flags/LICENSE`)
- Fluent Emoji: https://github.com/microsoft/fluentui-emoji (`LICENSE`, `assets/**/metadata.json`)
- game-icons.net: https://github.com/game-icons/icons (`license.txt`, `README.md`), https://game-icons.net/about.html
- Lucide: https://github.com/lucide-icons/lucide (`LICENSE`)
- Tabler Icons: https://github.com/tabler/tabler-icons (`LICENSE`)
- Phosphor Icons core: https://github.com/phosphor-icons/core (`LICENSE`, `README.md`)
- Android emoji support: https://developer.android.com/develop/ui/views/text-and-emoji/emoji2
- Unicode TR51 (Emoji): https://www.unicode.org/reports/tr51/
- CC BY-SA 4.0 legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en
- Counts/sizes: GitHub git-tree API for each repo at default branch, 2026-10-05.
