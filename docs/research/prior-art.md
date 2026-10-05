# Prior art: data-driven life sims and content formats

Ticket: [#4](https://github.com/jeiang/life-sim/issues/4) (part of #1). Researched 2026-10-05.

## Question

What content formats and expression languages do existing data-driven narrative/sim games use, and which patterns fit a life sim with probabilistic yearly events?

Survey: storylet/quality-based narrative (Fallen London, Emily Short), Ink, Twine/Harlowe, Dendry, Paradox event scripting, Ren'Py, open-source BitLife clones; and expression/condition languages usable in data files (JSONLogic, CEL, expr-lang, Jexl, filtrex, custom). For each: example, hand-authoring readability, schema-ability, safety, JS/WASM availability. End with patterns that fit probabilistic yearly events.

Legend: **[V]** = verified against a primary source or by running it here; **[I]** = inference or from general knowledge, not re-verified.

## Summary

- The best-fitting prior art is **storylet / quality-based narrative (QBN)** plus **salience-based selection**: content is a pool of self-contained units, each with a *precondition over world state*; the engine picks among the currently-eligible ones. That is precisely "yearly random events" with a different selector. [V: Emily Short]
- **Paradox events** are the closest *mechanical* analogue: declarative event records with `trigger` (eligibility), `mean_time_to_happen` (probability per tick), `fire_only_once`, weighted `option`s with `ai_chance`. A pure data-record format, no narrative DSL. [V: HOI4 mod sample; semantics of `mean_time_to_happen` = I]
- **Ink, Twine/Harlowe, Ren'Py are authoring-for-linear/branching-story tools**: they embed logic in prose. They excel at dialogue-heavy narrative but have **no native weighted random, no pool-of-eligible-units selector, and are poor for schema validation**. Ink is still the best off-the-shelf JS runtime if branching dialogue is wanted later (inkjs, MIT, compiled JSON). [V]
- **Dendry** is the one narrative tool that is genuinely storylet-shaped (`view if`, `choose if`, `max visits`, `priority`, `frequency`, tags-as-pools, per-quality `min`/`max`), but is effectively abandoned (last push 2015) and not on npm; useful only as a design reference. [V]
- **Open-source BitLife clones are small and hard-code content in code** (JS/TS objects with closures `buff(player)` / `apply: (s) => ...`); none use a reusable data format, and none are licensed (no LICENSE seen on the top results). They offer no format to adopt but confirm what a yearly-event record needs (age range, once-only, weighted outcomes, conditions, next-event chaining). [V]
- For **expressions in data files**, the viable JS options are small, interpretable or compile-to-function evaluators: **JSONLogic** (JSON AST, trivially schema-able, unreadable beyond ~3 clauses), **Jexl** and **filtrex** (readable infix), **CEL** (typed, spec'd, non-Turing, but JS implementation has int/double sharp edges). **expr-lang is Go-only** with no JS port or WASM story in its docs. [V]
- Safety: none need `eval` except **filtrex, which uses `new Function`** at compile time (CSP `unsafe-eval` needed at runtime; fine if compiled at build time). Jexl/JSONLogic/CEL-JS interpret an AST. All of them can be bounded: no loops/recursion (filtrex, CEL, expr, JSONLogic bar `map/reduce` over finite data). [V for filtrex/Jexl/CEL-JS code reading; behavior of Jexl rejecting `constructor`/`__proto__` tokens tested]
- **None of the expression languages has a seeded RNG**; `random()` in filtrex is `Math.random`. A deterministic/seedable life sim must inject its own RNG function or keep randomness out of expressions entirely (put it in structured `weight`/`chance` fields the Core resolves). [V: JSONLogic ops page has zero `random`; CEL spec has none; filtrex README `random()`]
- **Leading recommendation shape (for the later decision):** structured, schema-validated event records (Paradox/QBN-style: `conditions`, `weight`, `once`, `cooldown`, `outcomes[]`, `effects[]`), with conditions/effects as a small expression string compiled at **build time** (Pack compile step) — either Jexl-/CEL-style infix or a custom tiny language — rather than raw JSON AST or a prose DSL.

## Findings

### 1. Storylets / quality-based narrative (Fallen London, StoryNexus)

**Model.** A *storylet* is a chunk of text + choices ("branches") + outcome text; *qualities* are numeric variables that represent everything (inventory, skills, story progress); storylets are unlocked by qualities. In QBN the **player** picks among all currently-legal storylets; in *salience-based* narrative the **engine** picks the best-fitting one among a pool (Left 4 Dead dialogue, Firewatch), with ties broken randomly. ([Short 2016](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/)) [V]

Notes from the primary source:
- QBN lets "a lot of short stories slot together"; arcs can be one storylet long. Modular content is cheap to add without touching the rest. [V]
- Weakness: story progression must be tracked "very much by hand" with progress qualities (A available → A complete → B available…). [V]
- Weakness at scale: "the list of available storylets gets overwhelming"; Fallen London added ranking, colors (`ordering`) to cope. [V] Not an issue for a life sim where the Core picks.
- Salience variant: rules are `(location=kitchen, pantry=empty)`; most-specific wins, ties random. Content can have broad defaults and gradually add more-specific ones. Easier to author incrementally. [V]
- Tuning advice: pick 3 constants ("a little / medium / a lot") for thresholds/weights, then verify by **running thousands of randomized playthroughs** and visualizing never-hit/overused events. [V]
- StoryNexus is a closed web tool (no schema we can reuse); `fallenlondon.wiki` challenge/deck pages I tried were empty. Fallen London's *Opportunity Deck* (draw N cards from eligible pool; cards are storylets with a frequency) and "challenges" (`skill vs difficulty` giving a success probability) are well known but **not verified here [I]**.
- OSS QBN implementations exist but are tiny (e.g. [videlais/simple-qbn](https://github.com/videlais/simple-qbn), 10 stars; [Randozart/chronicle-hub](https://github.com/Randozart/chronicle-hub), "StoryNexus inspired web platform"). No standard interchange format. [V: repo metadata]

**Illustrative storylet as data** [I, my sketch, not any shipped format]:
```yaml
id: first-job-offer
requires: "age >= 16 && !has(job) && stats.smarts >= 30"
frequency: 4        # relative weight in the yearly draw
once: true
choices:
  - label: Take it
    effects: ["job = 'cashier'", "money += 5000"]
```

- Hand authoring: good (one record per beat, no cross-file wiring). Schema-ability: excellent (records of conditions + effects). Safety: depends on condition language. JS: format-agnostic, trivial.

### 2. Ink (inkle)

- Language for branching narrative with weave syntax; compiled by `inklecate` to a JSON runtime format; [inkle/ink](https://github.com/inkle/ink) (≈4.9k stars, MIT per upstream) and [y-lohse/inkjs](https://github.com/y-lohse/inkjs) (JS port, ≈650 stars, last push 2026-09; npm `inkjs` 2.4.0, MIT, ~6.9 MB unpacked, includes an in-JS compiler, see `docs/compiler-differences.md`). [V: repo metadata, npm]
- Logic in prose: `VAR age = 23`; `{ mood > 0: I was feeling positive | It was more than I could bear }`; `~ temp dice_roll = RANDOM(1, 6)`; shuffles `{~red|blue|green|yellow}`, `SEED_RANDOM(n)`. ([WritingWithInk.md](https://raw.githubusercontent.com/inkle/ink/master/Documentation/WritingWithInk.md)) [V]
- No weighted-random or "pool of eligible things with preconditions" construct in the docs (zero hits for "weight") [V]. Selection among N storylets would be an `~ RANDOM` + conditional-gate hack in Ink source.
```ink
=== first_job_offer
{ age >= 16 && smarts >= 30:
    A shop owner offers you a counter job.
    + [Take it] ~ job = "cashier" ~ money += 5000 -> DONE
    + [Decline] -> DONE
}
```
- Readability: very good for prose; conditions are inline expressions. Schema-ability: poor (custom grammar; validation = compile). Safety: sandboxed VM, no host access except bound external functions. JS: yes (inkjs). WASM: not needed.
- Fit: great if the project later wants rich branching dialogue scenes; it would be a Pack-embedded sub-format, not the backbone. Overkill for "generic screens: feed, menu, purchase dialog".

### 3. Twine / Harlowe

- Harlowe is a Twine story format: macros in passages, e.g. `(if: $age > 18)[...]`, `(either: ...)`, `(random: 1, 6)`, `(cond: ...)`, `(set: $x to 3)`; full macro list in the [Harlowe manual](https://twine2.neocities.org/) (I grepped the manual for these macros). [V]
- Content is HTML/Twee passages; state in variables; logic embedded in prose with Harlowe's own expression syntax. Output is a single HTML file using a JS runtime.
- Readability: good for beginners; Schema-ability: poor (free-form passages, no structure for "pool" or "weight"; Short notes Twine "is not really designed for" QBN-style structures [V]). Safety: Harlowe allows arbitrary custom JS/HTML in stories [I]. JS: Harlowe is the runtime itself, not embeddable as a library in a separate Core [I].
- Fit: reject as a format; the Twee text syntax is a reminder that authors like passage-per-record text files.

### 4. Dendry

- [dendry/dendry](https://github.com/dendry/dendry): "Tools to create and build interactive fiction", MIT, 23 stars, **last push 2015-07-12**, not on npm (`npm view dendry` = 404). [V]
- Closest of the narrative tools to storylets. `.scene.dry` files are plain text with `key: value` header + prose; properties documented in [doc/dry/scene.md](https://github.com/dendry/dendry/blob/master/doc/dry/scene.md): `tags` (offer a pool of scenes as `- #mall-shop`), `view if`, `choose if`, `order`, `priority`, `frequency`, `max visits`, `on arrival`, `on departure`, `go to`, `min choices`, `max choices`, `game over`; and `quality` files with `initial`, `min`, `max`, `is valid`, `default display`. [V] The property bodies for `priority`/`frequency`/`view if` are empty stubs in the docs, so exact semantics were **not verified** (my reading: `priority` orders, `frequency` weights selection among a random subset when offering a tag [I]).
```
title: Investigate the Fairground
tags: mall-shop
view if: age >= 16
max visits: 1

At night the ferris wheel is a spiders web silhouetted against the city...
- @barn: Visit the barn.
```
- Expressions are JavaScript snippets (conditions/effects); `is valid`, `on arrival`, etc. [I: not read in the stubbed docs]; thus no sandbox [I].
- Readability: good. Schema-ability: moderate (flat key/value + prose). Safety: weak. JS: yes but unmaintained.
- Fit: useful design reference for "tags as pools", `max visits`, per-quality `min`/`max` clamps, but don't depend on it.

### 5. Paradox event scripting (HOI4/EU4/CK3/Stellaris)

Paradox's wiki (`*.paradoxwikis.com`) returned a client-challenge page to non-browser fetches, so the semantic claims below that aren't visible in the sample are from general knowledge **[I]**. The sample is a real event from a HOI4 mod ([deliciousmods/1956_beta `events/Nepal.txt`](https://github.com/deliciousmods/1956_beta/blob/main/events/Nepal.txt)):

```
country_event = {
	id = nepal.1
	title = nepal.1.t          # loc key
	desc = nepal.1.d
	trigger = {                # eligibility; nested scopes + OR/NOT
		original_tag = NEP
		OR = { has_government = neutrality  has_government = democratic }
		ENG = { is_faction_leader = yes  NOT = { has_war_with = NEP } }
	}
	mean_time_to_happen = { days = 20 }
	fire_only_once = yes
	option = {
		name = nepal.1.a
		ENG = { add_opinion_modifier = { target = NEP  modifier = large_increase } }
		ai_chance = { base = 75 }
	}
	option = { name = nepal.1.b  ... }
}
```
[V: sample]

- Pure declarative data (nested `key = value` / `key = { ... }` "Clausewitz script"), not an expression language: conditions are *blocks* where siblings are implicitly AND, with explicit `OR`/`NOT`/`AND` blocks and scope-switching (`ENG = { ... }`). [V: sample]
- `mean_time_to_happen` = once the trigger is true, the event fires with a per-day probability such that the mean wait is that long (and `modifier = { factor = … <condition> }` blocks can scale it) **[I]**. This is the most direct prior art for "probabilistic yearly events": **probability is a property of the event, evaluated each tick after eligibility is checked**.
- Option `ai_chance` and `random_list = { 50 = { … } 30 = { … } }` give weighted outcomes **[I]**; `fire_only_once`, `is_triggered_only`, hidden flags, on-actions (event pools) likewise **[I]**.
- Localization keys (`nepal.1.t`) separate text from logic. [V: sample]
- Readability: moderate (verbose, but regular). Schema-ability: good (it is a tree; schemas exist as community tooling **[I]**). Safety: excellent (no code). JS/WASM: no parser needed; a Pack compile step would parse YAML/JSON instead, and the idea is portable.
- Fit: borrow the *model*: event = { trigger, mean-time/weight, once, options[] with weights/effects }, text by key. Don't borrow Clausewitz syntax.

### 6. Ren'Py

- Python-embedded VN engine. `if` takes arbitrary **Python expressions** ([conditional docs](https://www.renpy.org/doc/html/conditional.html)): `if points >= 10: jump best_ending` [V]. Randomness via Python `renpy.random` [I].
- Web export: Ren'Py compiled to WebAssembly, works on iOS/Android mobile browsers but with documented limitations and many modern-web requirements ([web docs](https://www.renpy.org/doc/html/web.html)) [V]. It's a whole engine bundle (large) [I], not an embeddable rules library.
- Readability: very good for dialogue scripts. Schema-ability: very poor (Turing-complete Python). Safety: none; arbitrary Python. 
- Fit: reject as format and engine (violates generic-Core/Pack split and "safe data" goals). Use only as inspiration for `label`/`menu` ergonomics.

### 7. Open-source BitLife clones

Searched GitHub (`gh search repos`) for "bitlife", "bitlife clone", "life simulator…". All hits are small; none had a license file reported by the API (`-`). [V]

| Repo | Stars | Lang | Notes |
|---|---|---|---|
| [fungamer2-2/Life-Simulator1](https://github.com/fungamer2-2/Life-Simulator1) | 37 | Python | CLI, gettext `.po` locale files for i18n; content in code. |
| [robert1811/life-simulator](https://github.com/robert1811/life-simulator) | 30 | JS | Vanilla JS "undone and buggy"; `js/careers.js` etc. with objects containing closures like `buff(player) { player.stats.smartness += Math.floor(Math.random()*5) }`. |
| [WinFan3672/OpenLife](https://github.com/WinFan3672/OpenLife) | 8 | Python | Single `openlife.py`. |
| [H3ns0n1023/LifeSimulator](https://github.com/H3ns0n1023/LifeSimulator) | 0 | TS/Vue | Event chains + state machine; events are typed TS objects (below). 2026, AI-assisted (has `CLAUDE.md`, `docs/specs`). |
| [Krobix/life.html](https://github.com/Krobix/life.html) | 4 | HTML | Single-file clone. |

Most informative sample: `H3ns0n1023/LifeSimulator` `src/content/chains/overwork-death.ts` [V]:
```ts
export const overworkCritical: GameEvent = {
  id: 'career_overwork_critical', stage: 'career', ageRange: [25, 45], once: true,
  trigger: { baseWeight: 10, requires: [{ employment: 'employed' }] },
  text: '...',
  choices: [{ label: '...', outcomes: [
    { weight: 50, condition: { healthIn: ['healthy','subhealthy'] },
      apply: (s) => { adjustSalary(s, 5000); s.flags.add('...'); },
      nextEvent: 'ending_reborn_as_gaokao', result: '...' },
    { weight: 30, condition: { all: [ {healthIn:[...]}, {flag:'foreshadow_dream_gaokao'} ] }, ... } ]}],
};
```
Observations: independently converged on `ageRange`, `once`, `baseWeight`, `requires`, per-outcome `weight` + `condition`, flags, and chaining via `nextEvent`. Conditions are ad-hoc JSON objects (`{all:[…]}`, `{flag:…}`); effects are **TypeScript closures**, which a content-agnostic Pack cannot ship as data. Takeaway: effects need a declarative representation (op list or expression), which is the main gap to design.

No clone has a data-only Pack format, schema, or modding story. Nothing to reuse; use as a checklist.

### 8. Expression / condition languages for data files

All tests below run on Node v24 with the npm packages listed (`/tmp` scratch, not committed). Same condition tested in each: *age ≥ 16, licensed flag present, health < 90, cash > 100*.

| | Syntax style | Example | Schema-able | Safety | JS | WASM |
|---|---|---|---|---|---|---|
| **JSONLogic** | JSON AST | `{"and":[{">=":[{"var":"age"},16]},{"in":["licensed",{"var":"flags"}]}]}` | Excellent: it *is* JSON; JSON Schema can validate structure (operators open-ended) | Interpreter, fixed op set, no loops except `map/filter/reduce/all/some` over data | `json-logic-js` 2.0.5, MIT, single 16 KB file, last published 2024-07; PHP port exists | n/a |
| **Jexl** | infix | `age >= 16 && "licensed" in flags && stats.health < 90` | Strings only; validate by parsing | Interpreter; custom `addFunction/addTransform` only; I tried `constructor.constructor(...)` and `__proto__`: both rejected by the lexer/parser | `jexl` 2.3.0, MIT, **last published 2022-06**, 2.x sync + async API | n/a |
| **filtrex** | infix, spreadsheet-like | `age >= 16 and cash > 100 and stats.health < 90` | Strings only; two types (numbers & strings; booleans are truthy numbers) | **Uses `new Function`** (found in `src/filtrex.mjs`): needs CSP `unsafe-eval` at runtime; no loops; whitelisted data/functions; throws on unknown props | `filtrex` 3.1.0, MIT, 2024-10, 76 KB min; `random()` built in (`Math.random`) | n/a |
| **CEL** | C-like, typed | `age >= 16 && "licensed" in flags && stats.health < 90.0` | Strings; has a **type checker** (`expr.check()`) against declared env | Spec: "linear time, mutation free, not Turing-complete" ([cel-spec](https://github.com/google/cel-spec)); JS impl is an interpreter | `@marcbachmann/cel-js` 8.0.0, MIT, 2026-07, zero deps, 232 KB; older `cel-js` 0.8.2 | Reference impls in Go/C++; WASM builds not verified [I] |
| **expr-lang** | C-like | `user.Group in ["admin"] \|\| all(tweets, len(.Content) <= 240)` | Strings; static typing against Go env | Memory-safe, side-effect-free, always terminating ([README](https://github.com/expr-lang/expr)) | **Go only**; no JS port in docs; a WASM build via Go would be your own work (8k stars, active) | not offered |
| **Custom** | whatever | e.g. `age>=16 flag:licensed health<90` or Paradox-style blocks | Best: you control grammar & can emit JSON Schema | Total control | Write parser (~300 lines for infix) or use peggy/ohm at build time | n/a |

Tested behaviors **[V]** (scratch run):
- JSONLogic, Jexl, CEL-JS evaluated the combined condition `true`; filtrex evaluated flat vars `true`.
- **filtrex does not resolve `stats.health` on a nested plain object** ("Property “stats.health” does not exist."); it expects a flat key (`'stats.health'`) or a custom prop getter. Despite README listing `a.b.c`.
- **CEL-JS int/double traps:** JS `number` inputs are treated as double; `age + 1` throws `no such overload: dyn<double> + int`; `cash * 0.5` works (=125); integers must be passed as `BigInt` (`17n`) and results are `bigint` (`18n`). A Core using CEL would need a typed env / coercion layer.
- **Jexl** with host `rand` function added: works; `constructor`/`__proto__` rejected.
- **Randomness is never built into the languages**: JSONLogic ops page has no `random`; CEL spec has none; filtrex has `random()` using `Math.random` (unseedable); Jexl/CEL need injected functions. For a reproducible life (seeded save/replay), inject a seeded PRNG or keep randomness out of expressions.

Readability for hand authoring (mine, with the examples above): infix (Jexl, filtrex, CEL, expr) > Paradox blocks > JSONLogic. JSONLogic's own docs recommend it for sharing rules between front end and back end, stored in DB ([README](https://github.com/jwadhams/json-logic-js)), i.e. it targets machine-generated rules, not hand-writing.

Dependency-health note: Jexl has had no publish since 2022; JSONLogic since mid-2024 (both small and stable, but you'd effectively own them). CEL-JS 8.0.0 is the freshest. Because Pack compilation happens at build time (see CONTEXT.md), the heavy part (parsing/type-checking) could run only in Node, shipping to the phone just a pre-compiled form: JSON AST for a tiny runtime evaluator (JSONLogic-style *as a compile target*, not an authoring format).

## Patterns that fit probabilistic yearly events

1. **Eligibility pool → weighted draw (QBN/salience + Paradox).** Each age-up: filter all events by `conditions` (state-based predicate), then draw N (often 1–3) with probability ∝ `weight`. Gives "any order, modular content, easy to add". [QBN V; Dendry `frequency`/tags I]
2. **Per-event probability separate from eligibility (Paradox `mean_time_to_happen`).** `chance` (e.g. 0.02/yr) modified by conditional multipliers (`× 3 if smoker`). Lets rare events (illness, windfall) coexist with a draw model. [V-sample/I-semantics] Choose between *independent Bernoulli per event per year* (can produce several at once; trivial to author) vs *one weighted draw per slot* (bounded events per year).
3. **Age windows, `once`, `cooldown`, `maxPerLife`, `requires`/`forbids` flags.** All three clone-style repos and Dendry (`max visits`) converge here. [V]
4. **Weighted outcomes per choice with conditioned branches** (`outcomes: [{weight, condition, effects, result text}]`), as in the TS clone and Paradox `random_list`. Skill checks can be expressed as a weight *expression* (`weight: "20 + smarts / 2"`) rather than a Fallen London-style challenge construct. [V clone; I Paradox]
5. **Chaining via `nextEvent`/flags** for multi-year arcs, with explicit progress qualities (QBN's known bookkeeping burden: provide a sugar like `stage` or `sequence` to avoid hand-written progress variables). [V Short; V clone]
6. **Qualities as the only state.** Treat age, money, health, flags as one typed bag of numeric/boolean qualities with `min`/`max` clamps (Dendry `quality` type). Conditions and effects then need only arithmetic, comparison, boolean ops and `in`. [V Dendry docs]
7. **Text keyed, not inlined** (Paradox loc keys, gettext in the Python clone) so i18n/localization is a separate Pack concern. [V]
8. **Authoring-time simulation.** Run thousands of seeded lives in CI to surface never-firing/overused events and impossible conditions (Short's advice). Requires seedable RNG and pure state transitions in the Core. [V Short]
9. **Selection rule inside Core, not the format.** Keep the draw algorithm (weights, caps per year, tie-breaks, hidden vs surfaced events) in the Core; Packs only provide data + conditions. QBN's "player picks" and salience's "engine picks" are both just Core strategies. [V Short]

## Implications for open decisions

- **Pack format:** structured records (YAML/JSON/TOML) validated by a JSON Schema at build time beat any prose DSL (Ink/Twine/Ren'Py/Dendry) for schema-ability and the Core/Pack split. Ink is the one worth keeping in mind as an optional embedded sub-format for rich scenes (inkjs runs in browsers). Ren'Py and Twine/Harlowe are poor fits.
- **Condition/effect language:** the choice is between (a) infix strings parsed at build time (Jexl/CEL/custom) and (b) structured JSON AST (JSONLogic-style). Readability argues for (a) as authoring surface with (b) as compiled/runtime form; this also means the phone ships no parser and no `eval`/`new Function`, and filtrex's `unsafe-eval` issue disappears. A **custom minimal language** (only: comparison, arithmetic, `and/or/not`, `in`, ternary, function whitelist `rand/clamp/min/max/has`) is cheap, because the needed surface is tiny, and avoids CEL-JS's int/double and Jexl's maintenance risks. Decide in the grilling ticket.
- **Randomness:** must be seedable and owned by the Core (save/replay, CI simulation, deterministic tests). None of the surveyed expression languages helps; inject an RNG, or keep probabilities in structured `weight`/`chance` fields whose *values* may be expressions.
- **Effects need a data form** (op list like `{op: add, quality: money, value: 5000}` or assignment expressions); the clone prior art uses closures, which can't live in a Pack.
- **Schema design:** event record fields supported by prior art: `id`, `text key`, `age range`, `conditions`, `weight`/`chance` (+ modifiers), `once`/`cooldown`/`maxPerLife`, `choices[]`, `outcomes[]` (weight, condition, effects, result text, `next`), `tags`.
- **Screens:** none of the surveyed formats define menu/purchase/chart screens; those are Core UI driven by Pack data and are not addressed by prior art.

## Newly surfaced questions

- Per-year event scheduling: independent Bernoulli per event vs weighted single-slot draw vs hybrid; how many events can surface in one year?
- Should the Core RNG be seeded and the save format record seed + RNG state (for replay and CI simulation)?
- Expression language: custom vs Jexl vs CEL, and is the compiled form JSON AST? (Needs a small spike: parse + eval cost on a phone, bundle size.)
- Do Packs ever need multi-beat branching scenes (Ink-like) beyond choice → outcomes? If yes, is Ink an allowed sub-format?
- How do effects express "add a purchasable item / job / relationship" (entities beyond scalar qualities)?
- Localization: keyed text from day one?

## Sources

- Emily Short, "Beyond Branching: Quality-Based, Salience-Based, and Waypoint Narrative Structures" (2016): https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/
- Fallen London Wiki (pages queried were empty): https://fallenlondon.wiki/
- Ink docs: https://raw.githubusercontent.com/inkle/ink/master/Documentation/WritingWithInk.md ; repos https://github.com/inkle/ink , https://github.com/y-lohse/inkjs ; npm https://www.npmjs.com/package/inkjs
- Twine / Harlowe manual: https://twine2.neocities.org/ ; https://harlowe.twinery.org/
- Dendry: https://github.com/dendry/dendry (docs: `doc/dry/scene.md`, `doc/dry/quality.md`)
- Paradox event sample: https://github.com/deliciousmods/1956_beta/blob/main/events/Nepal.txt ; (Paradox wikis unreachable: https://hoi4.paradoxwikis.com/Event_modding)
- Ren'Py: https://www.renpy.org/doc/html/conditional.html ; https://www.renpy.org/doc/html/web.html
- BitLife-style clones: repos linked in section 7
- JSONLogic: https://jsonlogic.com/operations.html ; https://github.com/jwadhams/json-logic-js
- CEL: https://github.com/google/cel-spec ; https://github.com/marcbachmann/cel-js
- expr-lang: https://github.com/expr-lang/expr ; https://expr-lang.org/docs/language-definition
- Jexl: https://www.npmjs.com/package/jexl
- filtrex: https://github.com/joewalnes/filtrex ; https://www.npmjs.com/package/filtrex
- QBN OSS: https://github.com/videlais/simple-qbn ; https://github.com/Randozart/chronicle-hub
