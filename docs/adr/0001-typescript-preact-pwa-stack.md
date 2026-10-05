# TypeScript Core and Preact PWA stack

The game is one TypeScript codebase in a pnpm workspace on Node: a pure Core package (`step(state, choice, rng) -> state`, no DOM types, seeded integer RNG, integer math), pack tooling, packs, and a Preact + `@preact/signals` web app styled with Tailwind, built by Vite with vite-plugin-pwa (Workbox precache, user-prompted updates). Vitest covers Core, packs, and the headless balance harness; Playwright on Chromium and WebKit runs UI smoke tests and a same-seed golden check. Biome lints and formats, with GritQL plugins that ban `Math.random`, `Date.now`, and transcendental `Math.*` in Core. We chose a TypeScript Core over a Rust/Zig/Go WASM Core because a text sim has no heavy compute, and a single language shares Pack types across Core, UI, and tooling with the fastest agent feedback loop ([research](https://github.com/jeiang/life-sim/blob/research/engine-language/docs/research/engine-language.md)).

## Consequences

- Core purity is enforced by package boundaries and tsconfig, not just convention. That keeps a later WASM Core swap possible without touching the UI.
- Determinism depends on the lint bans and integer math. Cross-engine drift shows up in the Playwright WebKit golden check, not in Node tests.
- The Nix flake must pin Playwright browsers to the Playwright version in the lockfile.
