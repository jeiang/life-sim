# Core engine language options

## Question

Which language/runtime options suit a content-agnostic, deterministic Core that runs in a phone browser offline: TypeScript vs Rust/Zig/Go compiled to WASM (and hybrids)? Compare on bundle size and startup on mobile, seeded RNG and determinism, testing and headless simulation (balance harness), build-time Pack schema validation, coding-agent friendliness, Nix packaging maturity, and pairing with lightweight UI frameworks (Svelte, Solid, Preact, React). (Ticket #3; blocks #8.)

## Summary

- **Size is not a differentiator for TS vs Rust/Zig; it is the disqualifier for stock Go.** Measured: stock Go `GOOS=js GOARCH=wasm` hello-world+`math/rand` is 2.66 MB raw / 0.76 MB gzip (plus `wasm_exec.js`). Hand-written Zig wasm is hundreds of bytes; Rust is typically 10-100 KB; a TS Core of this kind is likely tens of KB gzip. All are trivially cacheable offline, so download size matters little after first load; startup parse/instantiate matters more for Go.
- **Determinism is easy in all candidates *if* you ship your own PRNG** (`Math.random` is unseedable). The one real TS hazard is transcendental `Math.*` functions, which ECMAScript leaves implementation-approximated; avoid them or use integer/fixed-point math in sim logic. WASM is deterministic apart from a few NaN-bit-pattern/relaxed-SIMD/threads cases, so it buys cross-engine reproducibility for float-heavy sims, which a text life-sim rarely needs.
- **Headless balance harness:** TS runs the *same* Core code in Node/Bun/Deno with no bridge; Rust/Zig/Go can run native (fast, millions of lives) but then native and WASM builds are two targets to keep bit-identical. For a text sim, TS speed (Node/V8) is almost certainly sufficient for Monte-Carlo balance runs.
- **Build-time Pack validation** is a native strength of TS (valibot/zod/ajv + `tsc`, JSON Schema, same types shared with Core and UI). In Rust (serde + schemars) it is equally solid but types must be re-exported to the TS UI (ts-rs/tsify/wasm-bindgen), adding a seam.
- **Hybrid (TS UI + WASM Core)** adds a JS<->WASM serialization boundary, a second toolchain in the Nix flake and CI, and `wasm-bindgen`/`wasm-pack` glue; payoff is only real if Core is compute-heavy. Not indicated by the stated app (text-first, generic screens, content in Packs).
- **Agent-friendliness:** TS has the largest training corpus and fastest feedback loop (type-check in ms, no borrow-checker fights, no FFI glue); Rust is well-supported but slower iteration; Zig is the weakest (pre-1.0, breaking changes between releases, e.g. this machine has 0.16.0); Go is strong but wasm target is the awkward part.
- **Nix:** TS via `buildNpmPackage`/pnpm fetchDeps and Rust via `rustPlatform` + wasm32 target are both mature; Go (`buildGoModule`) is mature but wasm needs `GOOS=js`/TinyGo; Zig is workable but least polished and fast-moving.
- **UI pairing:** all four frameworks are TS-first; only TS Core shares types natively. Measured minimal gzip: Preact ~5.3 KB (incl. hooks), Solid ~4.7 KB, Svelte 5 ~16.7 KB (min component; runtime grows sub-linearly), React 19 ~68.9 KB. Any of the three small ones fit; React is 4-14x bigger.
- **Recommendation (non-binding; decision belongs to a grilling ticket):** TypeScript Core, a shipped seeded integer PRNG (e.g. sfc32/mulberry32/PCG), integer or fixed-point sim math, Pack validation via a schema library at build time, Preact or Solid (or Svelte) UI. Keep Core a pure `step(state, choice, rng) -> state` module so a WASM swap remains possible later.

## Findings

### Comparison table

Legend: size numbers marked **[measured]** were produced by me on 2026-10-05 (esbuild 0.28 `--bundle --minify`, gzip -9; Go 1.26.7, Zig 0.16.0, Svelte 5.57.1, Preact 11.0.0, Solid 1.9.15, React 19.3.0, valibot 1.5.0, zod 4.6.5). **[cited]** = from the linked primary source. **[inference]** = my judgement.

| Dimension | TypeScript (JS) | Rust -> WASM | Zig -> WASM | Go -> WASM (stock / TinyGo) | Hybrid: TS UI + WASM Core |
|---|---|---|---|---|---|
| **Core artifact size** | Text-sim Core of this kind: likely 10-60 KB gz **[inference]**; no runtime | Rust book example: 29,410 B -> 17,317 B -> 9,045 B after LTO/opt-level/wasm-opt **[cited]**; real Core with serde + RNG: tens to ~100+ KB **[inference]** | Freestanding LCG export: **137 B** **[measured]**; realistic Core maybe 5-30 KB **[inference]** | Stock Go: **2,655,906 B raw, 762,128 B gz** (`-s -w`: 2,605,186 / 745,961) **[measured]**, plus `wasm_exec.js`. TinyGo much smaller (docs say it targets browser WASM) but I did not measure it (not installed) | WASM size above + JS glue (wasm-bindgen) + UI framework |
| **Startup on mobile** | Parse/JIT of small JS: negligible; no instantiate step | Compile+instantiate small module ms-scale; browsers stream-compile **[inference]** | Same as Rust, smallest | Stock Go: 2.6 MB module compile + Go runtime init on every launch; the clear weak spot **[inference]** | Two loads (JS + wasm) but both cached by service worker |
| **Seeded RNG** | Must supply own (`Math.random` cannot be seeded); trivial 32-bit PRNGs via `Math.imul`. valibot-sized deps not needed | `rand`/`rand_pcg`/`rand_chacha` crates give specified, portable seeded streams (e.g. ChaCha is value-stable); or hand-roll | Hand-roll or `std.Random` (stream stability across Zig releases not guaranteed **[inference]**) | `math/rand` with `rand.NewSource(seed)` compiled and ran in my test; `math/rand/v2` has PCG/ChaCha8 sources | Single RNG in WASM keeps one stream |
| **Determinism hazards** | `+ - * /` IEEE-754 identical everywhere. `Math.sin/exp/pow` etc. are *implementation-approximated* per ECMA-262 (cross-engine/CPU may differ in last bits) **[cited]**. Use ints/fixed-point or own tables. Object key order is spec-defined for string keys; Map/Set iterate in insertion order | WASM numerics deterministic except NaN payloads and relaxed-SIMD/threads, per the spec's explicit "nondeterminism" sections **[cited]**; libm compiled in, so same results everywhere | Same WASM guarantees; compiler-rt math in-binary | Same WASM guarantees; Go map iteration is randomized by design: sort keys in sim code **[inference]** | Same as the WASM side; JS side only does rendering |
| **Headless sim / balance harness** | Same source runs in Node/Bun/Deno; no build step with tsx/Bun; fast enough for 10^5-10^6 lives of text sim **[inference]** | `cargo run --release` native, very fast; need parity tests native vs wasm (wasm-bindgen-test / wasmtime) | `zig build run` native; same parity concern | `go test` / native binary trivially; stock Go WASM can also run under Node via `wasm_exec.js` | Run WASM module in Node directly (same binary as shipped) or native build |
| **Build-time Pack schema validation** | Best fit: valibot (**2,958 B raw / 1,265 B gz** tree-shaken sample **[measured]**), zod 4 (**456 KB raw / 94 KB gz** for full `import {z} from "zod"` sample **[measured]**; build-time only so irrelevant to runtime), ajv/JSON Schema; validate in a Node build script and emit typed JSON; `tsc` types shared with Core and UI | serde + schemars (JSON Schema) or a `build.rs`; strong, but TS UI needs generated types (ts-rs, tsify) | No mature schema ecosystem; would validate in a separate script (TS/JSON Schema) anyway | `encoding/json` + struct tags, jsonschema libs; Go->TS types need codegen | Validate in whichever language owns the types; usually still TS script + JSON Schema for the Packs |
| **Agent-friendliness** | Highest: largest corpus, instant `tsc`/vitest feedback, no FFI | Good, but borrow checker + wasm-bindgen/toolchain friction slow loops **[inference]** | Weakest: pre-1.0, std/build API churn between releases **[inference]** | Good; simple language, fast compile; wasm specifics (wasm_exec.js, GOOS=js) less common | Worst of both: two languages, boundary bugs, build-glue to maintain |
| **Nix packaging** | `buildNpmPackage`, `pnpm.fetchDeps`, `importNpmLock`, dev shell with node/bun; mature; static `dist/` output is a plain derivation | `rustPlatform.buildRustPackage`, `wasm-bindgen-cli` + `wasm-pack` in nixpkgs, wasm32 target needs overlay (fenix/rust-overlay) or `pkgsCross`; mature but extra moving parts | `zig` + `zig.hook` in nixpkgs; wasm target is supported by compiler itself; dependency fetching (`build.zig.zon`) and version churn make it the least polished | `buildGoModule` very mature; stock wasm is `GOOS=js GOARCH=wasm` (works with it); TinyGo is in nixpkgs | All of the left-hand column for JS plus the chosen WASM toolchain, all in one flake (doable, more surface) |
| **UI framework pairing** | Native: Preact, Solid, Svelte, React all TS-first, shared types | UI still TS; types via codegen | Same | Same | Same; boundary calls should be coarse (pass state JSON / typed arrays), not per-field |

### Framework sizes (UI layer, mobile download)

Measured with esbuild minify + gzip -9 on minimal programs that import only the hello-world API surface **[measured]**:

| Framework | raw | gzip | Notes |
|---|---|---|---|
| Preact 11 + hooks | 12,544 B | 5,348 B | React-compatible API via `preact/compat` |
| Solid 1.9 (`createSignal`, `createEffect`, `render`, `template`, `insert`) | 11,831 B | 4,727 B | Needs the Solid compiler (babel/vite plugin) for JSX |
| Svelte 5 minimal `$state` + `mount` | 44,474 B | 16,730 B | Needs the Svelte compiler; per-component code grows slower than runtime |
| React 19 + react-dom/client | 222,757 B | 68,902 B | |

Compared with a stock Go WASM Core at ~762 KB gz, any of these is small. For a UI made of a few generic screens (feed, list, dialog, chart) Preact/Solid/Svelte are all adequate; sizes are same-order as the whole rest of the app, so framework choice is about ergonomics, not bytes.

### Determinism details

- `Math.random()` in JS has no seed API; implementations are unspecified. A hand-rolled PRNG (mulberry32/sfc32/xoshiro128 using `Math.imul` and `>>> 0`) is deterministic across engines because 32-bit integer arithmetic is exact. ECMA-262 defines only `+ - * /` and conversions exactly; it marks `Math.sin`, `Math.exp`, `Math.pow` etc. as *implementation-approximated*, i.e. engines may differ ([ECMA-262 term definition](https://tc39.es/ecma262/#sec-implementation-approximated)).
- WebAssembly's goal is "minimal nondeterminism", with the only deviations being enumerated in the spec: NaN payloads, relaxed SIMD, memory growth failure, threads ([WebAssembly FAQ](https://webassembly.org/docs/faq/), [Numerics](https://webassembly.github.io/spec/core/exec/numerics.html)). So a WASM Core gives bit-for-bit cross-device reproducibility even with floats, but only if no `Math.*`-style host imports are used.
- For a life sim with integer stats (age, cash, health 0-100), probabilities as integers per-mille/per-ten-thousand, and a seeded integer PRNG, TS is already fully deterministic; reproducibility of "same seed -> same life" and of save/replay can be verified by a golden-hash test across Node and WebKit/Chromium/Firefox in CI.

### Size context: Go and TinyGo

I built Go 1.26.7 `GOOS=js GOARCH=wasm` on a 5-line program using `math/rand` and `fmt`: 2,655,906 B (762,128 B gz). Stripped with `-s -w`: 2,605,186 B (745,961 B gz). The Go runtime and GC are linked in. TinyGo ([TinyGo](https://tinygo.org/docs/guides/webassembly/)) is the usual answer for small browser WASM from Go; it restricts reflection and parts of the stdlib, which can interact with `encoding/json`. I did not measure it, so treat its size as unverified.

### Size context: Rust and Zig

Rust: the Rust and WebAssembly book's code-size chapter shows the same module reduced from 29,410 B to 17,317 B to 9,045 B with LTO, `opt-level = 's'/'z'`, and `wasm-opt`, and warns that panics, formatting, and allocator choice dominate size ([Rust Wasm book: Shrinking .wasm size](https://rustwasm.github.io/book/reference/code-size.html)). Tooling status: the `rustwasm` GitHub org was sunset and `wasm-bindgen` / `wasm-pack` continue under the `wasm-bindgen` org, both actively pushed (wasm-bindgen last push 2026-09-25, wasm-pack 2026-08-12, per the GitHub API; neither archived). Zig: a 3-line freestanding export built with `zig build-exe -target wasm32-freestanding -O ReleaseSmall` produced a 137 B module on Zig 0.16.0 **[measured]**; an actual Core would pull in allocator/std code and grow.

### Hybrid analysis

A TS UI + WASM Core means: (1) pass state across the boundary as JSON strings or shared memory; wasm-bindgen serialization of nested structures is the main cost/complexity; (2) Pack data must be loaded into the WASM side, so the schema/validator lives in the WASM language or is duplicated; (3) two sets of tests (Rust/Zig/Go native + JS integration); (4) Nix flake needs both toolchains. Benefits: single native + browser source of truth, bit-identical float math, headless sim at native speed, memory-safe language for the engine. Given the Core here is content-agnostic and decision-driven, with no heavy compute, these benefits are speculative **[inference]**.

## Implications for open decisions

- **Stack decision (#8)**: TS everywhere is the lowest-cost default; the only ways the answer changes are (a) the balance harness needs far more throughput than Node gives (measure first), (b) the user wants Rust for personal preference or learning, or (c) float-heavy sim needing cross-engine exactness.
- **Core API shape**: define Core as a pure, serialisable state machine (`State`, `Event`, `step`) with injected RNG. That keeps the language swappable and makes saves/replays/golden tests trivial.
- **Determinism policy**: ban `Math.random`, `Date.now`, and transcendental `Math.*` inside Core (lint rule), use integer math, store RNG state in the save.
- **Pack validation**: pick one schema source of truth (e.g. valibot/zod schemas -> JSON Schema export, or JSON Schema -> generated types) and run it in the Nix flake check; validation is build-time only so its runtime size is irrelevant.
- **UI framework**: Preact (smallest ecosystem-compatible path), Solid (finer-grained reactivity, similar size), or Svelte (best DX, bigger floor) are all fine; React is ~13x Preact for no clear benefit here. Defer to a UI ticket; the language choice does not constrain it if TS.
- **Nix**: TS path (pnpm or npm + `buildNpmPackage`/`pnpm.fetchDeps` producing a static `dist/`) is the least risky; WASM adds toolchain overlays to the flake.
- **New questions**: (1) Is a numeric-heavy simulation (e.g. economy, market chart) planned that would justify WASM? (2) Save format/versioning and migration when Packs change. (3) CI cross-browser determinism check (WebKit on iOS). (4) Whether to share the RNG/stat arithmetic spec as a documented Core contract for Pack authors.

## Sources

- ECMAScript spec, implementation-approximated: https://tc39.es/ecma262/#sec-implementation-approximated
- WebAssembly FAQ (determinism): https://webassembly.org/docs/faq/
- WebAssembly core spec, numerics/nondeterminism: https://webassembly.github.io/spec/core/exec/numerics.html
- Rust and WebAssembly book, shrinking .wasm: https://rustwasm.github.io/book/reference/code-size.html ; https://rustwasm.github.io/book/game-of-life/code-size.html
- wasm-bindgen: https://github.com/wasm-bindgen/wasm-bindgen ; wasm-pack: https://github.com/wasm-bindgen/wasm-pack (GitHub API repo metadata)
- TinyGo WebAssembly guide: https://tinygo.org/docs/guides/webassembly/
- Nixpkgs manual (language/framework helpers): https://nixos.org/manual/nixpkgs/stable/
- Local measurements, 2026-10-05: Go 1.26.7 wasm build; Zig 0.16.0 `wasm32-freestanding -O ReleaseSmall`; esbuild 0.28.2 bundles of preact 11.0.0, solid-js 1.9.15, svelte 5.57.1, react/react-dom 19.3.0, valibot 1.5.0, zod 4.6.5 (gzip -9). Rust and TinyGo were not installed locally and were not measured.
