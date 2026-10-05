# Expression language candidates on a phone

Ticket: [#18](https://github.com/jeiang/life-sim/issues/18) (part of #1; blocked-by #8, blocks #10). Researched 2026-10-05.

## Question

For the chosen stack ([ADR 0001](../adr/0001-typescript-preact-pwa-stack.md): TypeScript pure Core, integer math, seeded RNG, Vite PWA), which condition/formula language should Packs use: a custom minimal infix language compiled to a JSON AST at build time, Jexl, CEL, or something else? Compare runtime bundle size, eval speed at about 1,000 conditions per age-up, integer-only/deterministic arithmetic, build-time parsing, build-time type checking against a TS schema, author error messages, safety, and maintenance. The prior-art survey ([`research/prior-art`](https://github.com/jeiang/life-sim/blob/research/prior-art/docs/research/prior-art.md), section 8) already established what each language *is*, a sample condition in each, and that none has a seeded RNG; this note does not repeat that. It adds measurements and the new candidates.

## Summary

- **Custom infix language, parsed and type-checked at build time, shipped as a JSON AST with a ~60-line interpreter, wins on every axis the project cares about** except "free": it is ~0.4 KB gzip at runtime (vs 25 KB for the best off-the-shelf typed option), 0.16 ms for 1,000 conditions warm, integer-only by construction, and its build-time checker is whatever the schema says. The cost is that we own ~150 lines of parser + checker (a prototype, written and run for this note, is 1.8 KB gzip including parser and checker) and the author error messages.
- **CEL via `@marcbachmann/cel-js` is the best off-the-shelf option**, and the only one with a real build-time type checker (`env.check()`), 64-bit integer semantics (truncating `/`, no division by zero), and no prototype access. Costs: 25 KB gzip (parser, checker and function library all ship, there is no parse-free runtime), ints are `BigInt` so state must be converted at the boundary, and you depend on a single-maintainer library (very active though).
- **Jexl** is small (6 KB gzip full; 3 KB evaluator-only) and readable, but is effectively unmaintained (last npm release 2022-06), has float `/`, silently returns `undefined`/false for unknown variables, has no type checking, and is ~11x slower warm than the AST interpreter.
- **filtrex** and **expr-eval** are out: filtrex needs `new Function` (CSP `unsafe-eval`), floor-mod and float `/`; expr-eval has a critical unpatched code-execution CVE and `constructor`/`__proto__` reachable.
- **JSONLogic** is viable only as a compile *target*, not an authoring format; json-logic-js 2.0.5 is small (1.9 KB gzip) but its `var` operator returns `Object.prototype` members (`constructor`, `toString`, `__proto__`), so a hand-written AST interpreter is safer and ~4x faster.
- Hot-path performance is a non-issue for every candidate on desktop-class V8/JSC (worst warm: Jexl 1.7 ms per 1,000 conditions). Bundle size, integer semantics, type checking and ownership are the differentiators, not speed.
- Extra option surfaced: use the TypeScript compiler itself as the build-time type checker for a custom language (spike below). Works on TS 6; TS 7's `typescript` npm package no longer exposes the programmatic API.

## Findings

### Method

- All numbers are from `/tmp/exprlang` on Apple Silicon macOS (arm64), Node v22.23.3 (V8) and Bun 1.4.2 (JavaScriptCore, the engine family iOS Safari uses). npm packages as listed below; bundled with esbuild (`--bundle --minify --format=esm --target=es2020 --platform=browser`), measured with `gzip -9` and `brotli`. The test scripts were throwaway and are not committed.
- **Workload:** 1,000 conditions generated from 8 templates with varying constants (comparisons on `age/cash/health/smarts/looks/happy`, `&&`, `||`, `!`, arithmetic incl. `/`, `min/max`, a ternary). All candidates returned the identical result set (795 of 1,000 true), so they compute the same thing. Variables were flat names (see the filtrex note below).
- **Not measured:** an actual phone. All timings are laptop-class CPU. [INFERENCE] A mid-range phone core is plausibly 4-10x slower (cold JIT, thermal limits); at 10x the worst *cold* first pass below (~12 ms) is ~120 ms, still tolerable for one age-up, but this was not verified on hardware. The ratios between candidates are what transfer, and they were consistent across V8 and JSC.

Packages tested:

| Package | Version | Published | Repo last push | License |
|---|---|---|---|---|
| custom Pratt parser + interpreter (this note) | n/a | n/a | n/a | ours |
| `jexl` | 2.3.0 | 2022-06-19 | 2023-09-18 | MIT |
| `@marcbachmann/cel-js` | 8.0.0 | 2026-07-07 | 2026-10-05 | MIT |
| `@bufbuild/cel` (cel-es, **Beta**) | 0.6.1 | 2026-09-16 | 2026-10-01 | Apache-2.0 |
| `filtrex` | 3.1.0 | 2024-10-14 | 2024-10-14 | MIT |
| `expr-eval` | 2.0.2 | 2022-06-17 | 2024-08-15 | MIT |
| `json-logic-js` | 2.0.5 | 2024-07-09 | 2024-07-09 | MIT |
| `json-logic-engine` | 5.0.7 | 2026-04-01 | 2026-04-01 | MIT |

(npm `time.modified`/`license` via `npm view`; repo pushes via `gh api repos/...`; [cel-es README](https://github.com/bufbuild/cel-es) states "Status: Beta".)

### Comparison table

| | Custom → JSON AST | Jexl | cel-js (marcbachmann) | @bufbuild/cel | filtrex | expr-eval | JSONLogic (target) |
|---|---|---|---|---|---|---|---|
| **Runtime bundle, gzip** (brotli) | **0.4 KB** evaluator only; 1.8 KB with parser+checker | 6.0 KB (5.4); **3.0 KB** evaluator-only with grammar (hacked deep import) | **25.2 KB** (22.6) | 68.7 KB (58.8) | 7.6 KB (6.0) | 7.8 KB (6.9) | 1.9 KB (1.7); json-logic-engine 9.9 KB |
| **Parse 1,000 on device** | 3.5 ms V8 / 1.7 ms JSC | 20 ms / 13 ms | 9.5 ms / 4.6 ms | 86 ms / 61 ms | 47 ms / 32 ms | 16 ms / 8.5 ms | n/a (JSON) |
| **First eval pass** (1,000, cold) | 0.48 ms / 0.17 ms (pre-parsed JSON) | 4.9 ms / 4.6 ms | 6.0 ms / 4.5 ms | 5.7 ms / 3.8 ms | 4.7 ms / 11.7 ms | 2.9 ms / 2.9 ms | 3.1 ms / 2.6 ms |
| **Warm eval pass** (1,000) | **0.16 ms / 0.09 ms** | 1.74 ms / 1.12 ms | 0.21 ms / 0.16 ms | 0.55 ms / 0.69 ms | 0.45 ms / 0.54 ms | 0.45 ms / 0.44 ms | 0.75 ms / 0.61 ms |
| **Integer-only semantics** | yes, by construction (we define `/`, `%`) | no: float `/` (`7/2 = 3.5`) | **yes**: `int` is 64-bit, `7/2 = 3`, `-7/2 = -3`, `/0` throws | yes (same CEL semantics) | no: `7/2 = 3.5`, `-7 % 3 = 2` (floor mod) | no: `7/2 = 3.5` | no (JS numbers) |
| **Parsing at build time, phone gets only evaluator** | **yes** (AST is the artifact) | partial: AST is JSON (`_getAst()` is underscore-private); evaluator-only needs deep imports | **no**: no exported API runs an AST; parser + checker + stdlib ship | no: protobuf `ParsedExpr` could be serialized, but runtime still 69 KB | no: compiles to JS source via `new Function` at load | partial: `Expression` can take tokens, parser still bundled by default | **yes** by design |
| **Build-time type check vs schema** | own checker (below), any rule we want | none; only AST walk for identifiers | **yes**: `env.registerVariable(name, type)`, `env.check()` | partial: `celEnv` takes variable types, but `plan()` accepted `agee > 3` and `age > "x"` without error (checker class exists, not exported) | none; unknown vars fail at eval | `expr.variables()` lists identifiers only | none beyond JSON Schema on structure |
| **Author error messages** | ours: caret + "did you mean" (prototype below) | OK syntax; unknown var is silently false | good: caret + type text | OK: `<input>:1:5: found + but expecting end of input` | good syntax caret+expected tokens; type errors are returned *objects* | terse: `unexpected TEOF: EOF` | none (structured data) |
| **Safety** | no code path from AST to host (ops are a closed `switch`); variable lookup must use `Object.hasOwn` | rejects `constructor`/`__proto__` tokens | rejects (`Reserved identifier: __proto__`, `No such key`) | rejects | `new Function`; rejects props | `constructor`, `toString`, `__proto__` **return values** (see safety) | `var:"constructor"` returns the function |
| **Maintenance** | ours | no release since 2022-06; 47 open issues | **very active** (push today; 200 stars; single maintainer) | active (Buf), Beta, 39 stars | 1 release/yr, 92 stars | no release since 2022-06; unpatched CVEs | stable, 2024 |

Raw bytes for the same bundles: custom-runtime 868 B, custom-all 4,226 B, jexl 20,467 B, cel-js 88,125 B, @bufbuild/cel 281,297 B, filtrex 26,409 B, expr-eval 25,750 B, json-logic-js 5,525 B, json-logic-engine 37,763 B.

### Eval speed: reading the numbers

- Everyone fits 1,000 conditions in under 2 ms warm and under 12 ms cold on the laptop. The AST interpreter is fastest warm (it is a direct tree walk, no wrapper promises/classes); cel-js is close because it compiles to closures. Jexl is the slowest warm (~11-12x the custom interpreter) because its evaluator wraps every node in a `PromiseSync` thenable (visible in `dist/evaluator/Evaluator.js`).
- **What actually matters for a phone is parse cost if you parse on device.** Parsing 1,000 expressions on device costs 5-86 ms (laptop). Shipping a pre-parsed AST costs `JSON.parse` of 75 KB (0.4-0.7 ms; 2.7 KB gzip for 1,000 conditions of this synthetic, repetitive workload, versus 2.3 KB gzip for the source strings). The AST bytes are comparable over the wire and precached offline anyway.
- cel-js with `BigInt` ints: warm 0.21 ms. The BigInt conversion is at the boundary only (state → typed ctx once per age-up), so it does not hurt per-condition cost. The boundary conversion itself was not benchmarked.
- filtrex warm (0.45 ms) benefits from `new Function`, but cold JSC first pass was the worst measured (11.7 ms), and it needs CSP `unsafe-eval` unless compiled elsewhere.

### Determinism and integer arithmetic

- ECMAScript `Number` is IEEE 754 binary64 and `+ - * /` are specified exactly, so float arithmetic with those four operators is portable across V8/JSC/SpiderMonkey; the cross-engine drift risk named in the ADR comes from `Math.*` transcendentals and from `Math.random`. [INFERENCE from the spec, not tested] So "no float" is a design choice (stable truncation, no 0.1+0.2 artifacts in displayed stats), not a determinism necessity.
- Divergent semantics are the real hazard if you take a library: `7/2` is `3.5` in Jexl/filtrex/expr-eval and `3` in CEL and our language; `-7 % 3` is `-1` in Jexl/expr-eval/CEL/custom and `2` in filtrex; `1/0` is `Infinity` in everything except CEL (throws). Switching library later would silently change balance. Owning the semantics (or CEL's spec'd ones) avoids this.
- Overflow: past 2^53, `9007199254740991*3` gives `27021597764222972` in Jexl/filtrex/expr-eval/custom (float rounding; the exact value is ...973) and the exact `27021597764222973` in cel-js (int64 via BigInt). A life-sim stat will not reach 2^53; for the custom evaluator, a `Number.isSafeInteger` assertion in the balance harness (not on the hot path) is enough, and `/0` should be rejected by the build-time checker for constant divisors and guarded at runtime for variable ones. The prototype interpreter does **not** yet guard `/0` (returns `Infinity`).
- CEL-JS number representation: ints are `BigInt`; passing plain JS numbers works only for doubles. With `unlistedVariablesAreDyn: true`, `smarts * 2` failed with `no such overload: dyn<double> * int`, so a Core that stores numbers must convert to `BigInt` per age-up and convert results back ([cel-js README, "Integer values are BigInt"](https://github.com/marcbachmann/cel-js#integer-values-are-bigint)). `@bufbuild/cel` has the same representation ([README](https://www.npmjs.com/package/@bufbuild/cel): bigint = int, number = double).
- Randomness: none of the languages has a seeded RNG (prior-art §8). In the custom language it is a one-line host function (`roll(n)` calling the Core's seeded RNG), and nothing else in the evaluator touches the environment.

### Build-time parsing: can the phone ship only an evaluator?

- **Custom:** yes, trivially. `parse.ts` (lexer, Pratt parser, checker) is Node-only; the phone gets `run.ts`. Prototype sizes: runtime 868 B raw / 401 B gzip; parser+checker add ~3.4 KB raw.
- **JSONLogic:** yes, the rules are already JSON (json-logic-js `apply` is 1.9 KB gzip). But it is a poor authoring format (prior-art §8); only useful as the compile target, and a hand-rolled AST interpreter does the same job faster and without `var`'s prototype leak.
- **Jexl:** the parser emits a plain JSON AST (`{"type":"BinaryExpression","operator":"&&","left":{"type":"BinaryExpression",...}}`), so build-time parsing is feasible, but `Expression._getAst()` is underscore-private and running an AST needs `jexl/dist/evaluator/Evaluator`, `jexl/dist/PromiseSync` and `jexl/dist/grammar` deep imports (3.0 KB gzip in my test bundle). The published code is Babel-transpiled CJS with a `@babel/runtime` dependency.
- **cel-js:** no. `lib/index.js` exports `parse, evaluate, check, Environment, serialize, ...`; `parse` returns a closure with `.ast` attached and no exported function accepts an AST. `serialize(ast)` goes AST → source string. Build-time validation is possible (check in Node, ship source), but the phone then ships and re-parses source with the whole 25 KB library. (Precached by the service worker, so the real cost is first install size and parse time, not repeated downloads. [INFERENCE])
- **@bufbuild/cel:** parses to a protobuf `ParsedExpr` (`parse()` returns `{$typeName, expr, sourceInfo}`) that could in principle be serialized, but `plan()` is what executes it and the runtime is 69 KB gzip.
- **filtrex:** no; it compiles source into a JS function at load time (`new Function`).

### Build-time type checking against the TS schema

There is no way to get "unknown variable" and "wrong type" checking against a *TypeScript* type directly from any of these; each needs a schema in some runtime form. The practical single-source-of-truth pattern is a `const` schema object (or Valibot/Zod/TypeBox schema) from which both the Core's `State` type (mapped type) and the expression environment are derived:

```ts
// packs/schema.ts: single source of truth
export const stateSchema = {
  age: 'int', cash: 'int', 'stats.health': 'int', 'stats.smarts': 'int',
  licensed: 'bool', flags: 'set',
} as const satisfies Record<string, 'int' | 'bool' | 'str' | 'set'>;
// State type derived from it with a mapped type; same object registers CEL variables or feeds the custom checker
```

Per candidate:

- **Custom:** the checker is ~35 lines over the AST and enforces exactly the rules we want (ints only in arithmetic, bools only in `&&`/`||`/`!`, `in` takes `str in set`, ternary branches same type, function arity/types). Output from the prototype:

  ```
  agee > 3          unknown variable 'agee' (did you mean 'age'?)
  age > "x"         '>' expects int, got str
  cash && licensed  '&&' expects bool, got int
  age +             unexpected 'end of input'
    age +
         ^
  ```
  Weakness of the prototype: type errors point to position 0 (nodes do not carry source offsets); adding `pos` to AST nodes in the parser (stripped from the shipped AST) fixes it. Unknown-variable errors already carry a position.
- **cel-js:** `new Environment().registerVariable('age','int').registerVariable('flags','list<string>')` then `env.check(src)`; verified outputs: `Unknown variable: agee`, `no such overload: int > string`, `Logical operator requires bool operands, got 'int'`, `Unexpected token: EOF`, each with a source caret. This is the most complete off-the-shelf checker. Nested state (`stats.health`) needs a `map` type or a registered object type with `fields`, per the [README](https://github.com/marcbachmann/cel-js).
- **@bufbuild/cel:** `celEnv({variables})` exists but `plan()` did not reject `agee > 3` or `age > "x"` in my test; a `Checker` class exists in `dist/esm/checker.js` but is not in the public exports of 0.6.1. Treat as no checker for now (Beta).
- **Jexl, filtrex, expr-eval:** no checker. Unknown-variable detection is possible with an identifier walk (Jexl AST `Identifier` nodes; expr-eval `Parser.parse(s).variables()` returned `['agee','cash','f']`), but types are not checked. Jexl silently evaluates an unknown variable to `undefined` (`agee > 3` returned `false`; `cash && age` returned `17`).
- **JSONLogic:** none beyond JSON Schema validation of the operator tree shape.
- **TypeScript compiler as checker (extra option, spike):** generate a virtual module with `declare const age: number; declare const flags: {has(f: 'licensed'|'smoker'): boolean}` and one `export const cN = (): unknown => <expr>;` per Pack expression, then read `getPreEmitDiagnostics`. On TS 6.0.3, 1,005 expressions checked in ~1.0 s total and gave: `Cannot find name 'agee'. Did you mean 'age'?`, `Operator '>' cannot be applied to types 'number' and 'string'`, `Argument of type '"typo"' is not assignable to parameter of type '"licensed" | "smoker"'`. Caveats: (a) TypeScript allows `cash && licensed` (truthiness), so a boolean-operand lint on the parsed AST is still needed; (b) TS has one `number` type, so int-vs-float must be enforced separately (branded types or the AST lint); (c) the TypeScript 7.0 `typescript` package ships a native `tsc` with no stable programmatic compiler API (confirmed: in 7.0.2 `ts.createCompilerHost` does not exist; see [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), which points API consumers to the TS 6 compatibility package), so this route pins `typescript@6` for tooling, or shells out to the native `tsc` on a generated file. Advantage: error messages and IDE hovers authors already know, and the type environment is the real TS `State` type. Cost: authors must write TS-valid syntax (`&&`, `===`-vs-`==` rules, `flags.has("x")`), and a restricted-node AST walk is still required for safety.

### Safety

Probes run in all candidates with a plain-object context `{age, stats:{health}}`: `constructor`, `stats.constructor`, `age.constructor`, `__proto__`, `stats.__proto__`, `toString`, `stats.hasOwnProperty`, and `age.constructor.constructor("return 1")()`.

| | Result |
|---|---|
| Jexl 2.3.0 | All throw (`Token constructor ... unexpected`): the lexer rejects the identifiers. No call syntax on arbitrary values. |
| cel-js 8.0.0 | All throw (`Reserved identifier: __proto__`, `No such key: constructor`, `Unknown variable: toString`). Call syntax on property results unsupported. Recent commit "fix: rename Evaluator.eval() to run() so cel-js can be bundled under SES" suggests sandbox use is a design target. |
| @bufbuild/cel | Throws or returns an empty map (`{_map:{}}` for `__proto__`), no function leak. |
| filtrex 3.1.0 | Unknown-property error object for all; `new Function` internally (needs CSP `unsafe-eval`). |
| expr-eval 2.0.2 | `constructor` and `toString` return **functions**; `__proto__` returns `{}`. Matches [GHSA-jc85-fpwf-qm7x / CVE-2025-12735](https://github.com/advisories/GHSA-jc85-fpwf-qm7x) (functions not restricted), [GHSA-8gw3-rxh4-v6jx / CVE-2025-13204](https://github.com/advisories/GHSA-8gw3-rxh4-v6jx) (prototype pollution) and critical [GHSA-q9v2-7m5w-4693 / CVE-2026-12866](https://github.com/advisories/GHSA-q9v2-7m5w-4693) (code execution), vulnerable range `<= 2.0.2` with **no patched version** (a fork `expr-eval-fork` has 3.0.1). Reject. |
| json-logic-js 2.0.5 | `{"var":"constructor"}` and `{"var":"toString"}` return **functions**; `__proto__` returns `{}`. Historical advisories: [GHSA-67j4-2mh6-8627](https://github.com/advisories/GHSA-67j4-2mh6-8627) (fixed 2.0.1), [GHSA-m9hw-7xfv-wqg7](https://github.com/advisories/GHSA-m9hw-7xfv-wqg7) (fixed 2.0.0). Safe for packs we author ourselves, but an AST of our own avoids it. |
| Custom | The AST evaluator is a closed `switch` on operator names; the only host surface is `env.get(path)`. The prototype `get` must use `Object.hasOwn`/a prebuilt slot table; when it did, all probes threw `unknown ...`. Because variables are checked against the schema at build time, a Pack cannot even reference `constructor`. |

`json-logic-engine` 5.0.7 additionally compiles rules to JS functions (a `compiler.js` is in the package; I did not audit it), which would reintroduce `new Function`.

### Maintenance status

- **cel-js (marcbachmann):** latest GitHub commits on 2026-10-05 (Renovate bumps, an SES fix); v8.0.0 on 2026-07-07; 200 stars, 9 open issues; zero deps; MIT; no GitHub security advisories listed. Single-maintainer package that migrated away from the older `cel-js` name. The original `cel-js` 0.8.2 is described in the README as ~10x slower (README's own claim).
- **@bufbuild/cel (cel-es):** Buf-backed, Beta, 0.x, pushes on 2026-10-01; 281 KB raw bundle and `@bufbuild/re2` dependency make it a poor phone fit regardless.
- **Jexl:** v2.3.0 (2022-06), last repo push 2023-09, 47 open issues; depends on `@babel/runtime`. Stable but effectively frozen; no advisories found.
- **filtrex:** 3.1.0 (2024-10), 15 open issues; `?:` ternary is deprecated in v3 in favor of `if..then..else` (warning printed during my run), a hint the syntax is still moving.
- **expr-eval:** no release since 2022; 3 advisories, the critical one unpatched upstream. Reject.
- **json-logic-js:** 2.0.5 (2024-07), stable.
- **Custom:** we own it. The grammar is small (the whole prototype is ~110 lines of parser/checker + ~30 of interpreter), but ownership means we also own docs and the test suite (golden AST snapshots plus a differential test against a reference oracle such as cel-js are cheap to add [INFERENCE]).

### Samples

**Custom language** (condition, then formula; AST is what ships):

```
age >= 16 && "licensed" in flags && stats.health < 90 && cash > 100
```
```json
["&&",["&&",["&&",[">=",["v","age"],16],["in",["s","licensed"],["v","flags"]]],["<",["v","stats.health"],90]],[">",["v","cash"],100]]
```
```
clamp(10 + stats.smarts / 4 - (age > 30 ? 5 : 0), 1, 100)
```
```json
["call","clamp",["-",["+",10,["/",["v","stats.smarts"],4]],["?",[">",["v","age"],30],5,0]],1,100]
```
With `stats.smarts=55, age=17` the formula evaluates to `23` in the prototype (`/` truncates). Runtime interpreter, in full:

```ts
export type Ast = number | boolean | readonly [string, ...any[]];
export type Env = { get(path: string): number | boolean | string | ReadonlySet<string>; roll(n: number): number };
export function evalAst(a: Ast, e: Env): any {
  if (typeof a !== 'object') return a;
  const op = a[0];
  switch (op) {
    case 'v': return e.get(a[1]);              // must resolve own properties only
    case 's': return a[1];
    case '&&': return evalAst(a[1], e) && evalAst(a[2], e);
    case '||': return evalAst(a[1], e) || evalAst(a[2], e);
    case '?': return evalAst(a[1], e) ? evalAst(a[2], e) : evalAst(a[3], e);
    case '!': return !evalAst(a[1], e);
    case 'neg': return -evalAst(a[1], e);
    case 'call': { const x = a.slice(2).map((y: Ast) => evalAst(y, e)); switch (a[1]) {
      case 'min': return Math.min(...x); case 'max': return Math.max(...x); case 'abs': return Math.abs(x[0]);
      case 'clamp': return Math.min(x[2], Math.max(x[1], x[0])); case 'roll': return e.roll(x[0]); } }
  }
  const l = evalAst(a[1], e), r = evalAst(a[2], e);
  switch (op) {
    case '+': return l + r; case '-': return l - r; case '*': return l * r;
    case '/': return Math.trunc(l / r); case '%': return l % r;
    case '<': return l < r; case '<=': return l <= r; case '>': return l > r; case '>=': return l >= r;
    case '==': return l === r; case '!=': return l !== r; case 'in': return r.has(l);
  }
  throw new Error('bad op');
}
```
(Prototype shortcuts to fix before adoption: guard `/ 0`, avoid `slice/map/spread` allocation in `call` for the hot path, and resolve variables to slot indexes at build time instead of path strings.)

**CEL via cel-js** (typed env from the schema, build-time check, BigInt ints):

```ts
import { Environment } from '@marcbachmann/cel-js';
const env = new Environment()
  .registerVariable('age', 'int').registerVariable('cash', 'int')
  .registerVariable('flags', 'list<string>').registerVariable('stats', 'map')
  .registerFunction('clamp(int, int, int): int', (x, lo, hi) => x < lo ? lo : x > hi ? hi : x);

env.check('age >= 16 && "licensed" in flags && stats.health < 90 && cash > 100'); // { valid: true, ... }
const f = env.parse('clamp(10 + stats.smarts / 4 - (age > 30 ? 5 : 0), 1, 100)');
f({ age: 17n, cash: 250n, flags: ['licensed'], stats: { smarts: 55n, health: 70n } }); // 23n
```
Verified in the spike: `age >= 16 && "licensed" in flags && cash/3 > 10` evaluates `true`, `cash/3` with `250n` returns `83n`, `-7/2` returns `-3n`.

**Jexl** (functions injected, float division, no checker):

```ts
import jexl from 'jexl';
jexl.addFunction('clamp', (x, lo, hi) => Math.min(hi, Math.max(lo, x)));
jexl.evalSync('age >= 16 && "licensed" in flags && stats.health < 90 && cash > 100', ctx);
jexl.evalSync('clamp(10 + stats.smarts / 4 - (age > 30 ? 5 : 0), 1, 100)', ctx); // 23.75 with smarts=55, age=17: needs a Math.trunc transform or rounding to stay integer
```

## Implications for open decisions

1. **Authoring format (#10):** The leading shape from prior art (structured Pack records with `conditions`/`weight` fields holding expression strings compiled at build time) is compatible with every candidate. The choice is therefore mostly a build-vs-buy decision on the compiler side, with the phone-side contract being "JSON AST + tiny interpreter" (custom, JSONLogic-shaped) or "source + 25 KB CEL library".
2. **Recommended default: custom minimal infix language** with a CEL-flavored surface (`&&`, `||`, `!`, `in`, `a ? b : c`, `min/max/clamp/abs/roll`), so authors can use CEL docs/playground as an informal reference and a differential test against cel-js is possible. It is the only candidate that gives all of: sub-1 KB runtime, parse-free phone, integer semantics we define, a type checker tied directly to the schema, and no third-party attack surface.
3. **Fallback if the team does not want to own a parser: cel-js**, accepting 25 KB gzip, BigInt ints at the Core boundary, a single-maintainer dependency, and source-shipping. Pin the version; the Core could still convert `check()` into a build-time gate and ship nothing but source strings. Do **not** adopt expr-eval (unpatched critical CVE), filtrex (`new Function`, float/floor-mod semantics, deprecated ternary), or Jexl (frozen, silent unknown variables, float division, no types) as the authoring language; JSONLogic only as an internal target if AST shape-compat is wanted.
4. **Type checking:** make the schema a runtime `const` object and derive both the TS `State` type and the expression environment from it (single source of truth). The TypeScript-compiler-as-checker route is attractive for diagnostics and IDE hover but pins `typescript@6` for tooling (TS 7 has no JS API) and cannot enforce int/bool strictness alone.
5. **Open stack interaction (ADR 0001):** Core purity rules (GritQL bans on `Math.random`, transcendental `Math.*`) already forbid what the interpreter needs to avoid; the interpreter above uses only `Math.min/max/abs/trunc`, none of which are banned.
6. **Hot path budget:** 1,000 conditions per age-up is ~0.2 ms warm on desktop JIT for the custom interpreter and cel-js; unmeasured on a phone but with 10x headroom still ~2 ms. Condition count is not the constraint; if budget pressure appears later, pre-indexing events by `age` range removes most conditions before they are evaluated.

## Sources

- Prior art survey: <https://github.com/jeiang/life-sim/blob/research/prior-art/docs/research/prior-art.md> (section 8)
- ADR 0001: <https://github.com/jeiang/life-sim/blob/main/docs/adr/0001-typescript-preact-pwa-stack.md>
- cel-js README (Environment API, types, BigInt behavior, limits, error handling): <https://github.com/marcbachmann/cel-js>; source in `node_modules/@marcbachmann/cel-js/lib/index.js` (exports), `lib/evaluator.js`; repo pushes: `gh api repos/marcbachmann/cel-js`
- cel-es (`@bufbuild/cel`): <https://github.com/bufbuild/cel-es>, <https://www.npmjs.com/package/@bufbuild/cel>; local `dist/esm/index.d.ts`, `dist/esm/checker.d.ts`
- CEL language spec: <https://github.com/google/cel-spec>
- Jexl: <https://github.com/TomFrost/jexl>; local `dist/evaluator/Evaluator.js`, `dist/PromiseSync.js`, `dist/Expression.js`
- filtrex: <https://github.com/cshaa/filtrex>
- expr-eval: <https://github.com/silentmatt/expr-eval>; advisories <https://github.com/advisories/GHSA-q9v2-7m5w-4693>, <https://github.com/advisories/GHSA-8gw3-rxh4-v6jx>, <https://github.com/advisories/GHSA-jc85-fpwf-qm7x>
- json-logic-js: <https://github.com/jwadhams/json-logic-js>; advisories <https://github.com/advisories/GHSA-67j4-2mh6-8627>, <https://github.com/advisories/GHSA-m9hw-7xfv-wqg7>
- json-logic-engine: <https://github.com/TotalTechGeek/json-logic-engine>
- TypeScript 7.0 compiler API status: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
- Package metadata: `npm view <pkg> version time.modified license`; repo status: `gh api repos/<owner>/<repo>` (retrieved 2026-10-05)
