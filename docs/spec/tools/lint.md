# `pnpm tool lint`

Decided in the restructure (decision 8, issue #200). Static checks over the compiled Packs that catch what inspection can, so the 15 s focused sim only has to judge what is left. Part of the [tool runner](vocab.md#the-tool-runner).

```
pnpm tool lint [--packs a,b] [--packs-dir dir] [--format md|json]
```

- `--packs`: report only findings that belong to these Packs. Every Pack under the directory is still compiled and analysed, because a quality one Pack declares may be written by another. An unknown id exits 2.
- `--packs-dir`: Packs directory (default: the repository's `packs/`).
- `--format`: `md` (default, short) or `json` (the `LintReport` exported by `tools/lint.ts`, 2-space indented).
- Exit 0 when there are no errors (warnings are listed), 1 on any error or when the Packs do not compile (diagnostics on stderr, nothing on stdout), 2 on a usage error.

The output is deterministic: findings sorted by Pack, subject, code and path; no timestamps or counters.

## How it proves things

`tools/lint/interval.ts` evaluates every expression to an inclusive integer interval (a boolean is 0..1). Names take the range their declaration gives them (stats 0-100, quality `min`/`max`, flags 0..1, state containers, bool readables); anything else is unknown. `and`, `or`, `not` and comparisons of a name with an expression narrow the names for the right-hand side and for everything nested under a true `when`, so `quality.x > 5 and quality.x < 3` is proved false. A finding is a proof, never a heuristic: unknown stays unknown and is not reported.

The second pass uses **reachable** ranges: a quality starts at its default and can only leave it through the writes that exist in the loaded Packs (effects in storylets, hooks and expanded macros; NPC career education). A `+=` that can be positive may reach the declared maximum, one that can be negative the minimum; `=` reaches the value's interval. A gate that holds for the declared range but not the reachable one is dead content nothing can unlock.

## Rules

Every finding has a code, a severity, the owning Pack, a subject (a full storylet id, or `quality.<id>`), a path inside it (`choices[0].outcomes[1].when`), a message and a one-line fix hint.

| Code | Name | Severity | Finds |
|---|---|---|---|
| `L001` | `unsatisfiable-when` | error | A storylet, choice or outcome `when` that no value of the declared names makes true. |
| `L002` | `gate-never-written` | error | A `when` that the declared ranges allow but the reachable ranges do not: it needs a quality value nothing ever writes (the message names the quality and what it can hold). |
| `L003` | `unreachable-chain` | error | A chain-only storylet (see below) that no live `next` from a reachable storylet opens. |
| `L004` | `chain-target-dead` | error | A live `next` whose target has no outcome that can resolve (all its outcomes' `when` are unsatisfiable or weights 0). Reported on the `next`; the target's own findings are folded into it. |
| `L005` | `zero-weight` | error | An outcome weight, or an event `chance` or `weight`, that is 0 for every value its names can take. A literal `chance: 0%` is the chain-only convention, not an error. |
| `L006` | `quality-never-written` | warning | A declared quality that some expression reads and no effect, hook or Core rule writes. |
| `L007` | `wager-return` | error / warning | A storylet tagged `wager` whose closed-form return is outside the band: above it is an error (a money printer), below it a warning. |
| `L008` | `nominal-chance` | warning | An event `chance` whose bounded range reaches past 100% (10000 basis points): the nominal number is clipped, so the real chance is not what it reads. |
| `L009` | `next-loop` | error | Storylets whose every live outcome has a `next` and only into storylets that do the same, so a chain never ends (the Core stops it at depth 32). |
| `L000` | `stale-allow` | warning | An allowlist entry in a `lint.yaml` that matches no finding. |

A **chain-only** storylet is an event written with a literal `chance: 0%` (or `weight: 0`): only a `next` opens it, so the chain skips its own `when` and chance, and it is analysed without them. A **root** is any other event with a positive chance or weight, or an action; reachability follows live `next`s from the roots.

### Closed-form wager return (`L007`)

For each choice of a `wager` storylet (or its single outcome list) the return is `1 + E[net money] / stake`, where `E` weighs the outcomes by their constant weights and the net money is the sum of its `money += / -=` effects. A choice has a closed form when every weight is constant, no outcome has a `next` or a `when` that is not always true, and each money effect is linear in `amount`: the stake is then `amount` (so `money += amount * 2` against `money -= amount` at 31/69 is 93%, matching the harness). Without `amount`, the stake is the worst single loss. Anything else (life-dependent weights, multi-step chains, non-linear payouts) has no closed form and is skipped, left to the sim's realised return. The default band is 40%..100%; a Pack changes it with `wager_band` in its `lint.yaml`.

## `packs/<id>/lint.yaml`

Optional, per Pack. The allowlist is for findings that are real but intended:

```yaml
wager_band: [0.4, 1.0]        # return band for the Pack's wager storylets (min <= max)
allow:
  - code: L006                # a rule code (not L000)
    subject: quality.crime_record   # storylet full id, or quality.<id>
    path: choices[0]          # optional: this path and anything under it
    reason: Why this is fine.     # required
```

An entry applies to findings owned by its Pack. An entry that matches nothing is reported as `L000`, so the list cannot rot. Allowed findings are not errors; the report lists them under `allowed` (json) and counts them in the title line (md). A malformed `lint.yaml` fails the run with its file name.

## Output

Markdown:

```
# Lint: 1 error(s), 0 warning(s), 2 allowed

Packs: core-loop, crime, ...

- error L002 `relocation/study-a-language choices[0].when` (relocation): the choice's `when` can never be true: quality.reloc_lang_english only ever holds 100..100. Fix: add the effect that sets the gate quality, or drop the gate
```

JSON: `{ packs, summary: { errors, warnings, allowed }, findings: [...], allowed: [...] }`, each finding `{ code, rule, severity, pack, subject, path, message, hint }`.

## Tests

`tools/lint.test.ts` lints the fixture Pack `tools/fixtures/lint/lintfix/` (clean controls plus one planted bug per rule, and a `lint.yaml` with one allowed and one stale entry) and asserts the exact finding list, the severity of each wager band side, the allowlist, both output formats, exit codes, and that the real `packs/` lint with no findings. It also unit-tests the interval analysis.
