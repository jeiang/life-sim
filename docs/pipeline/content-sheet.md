# Content sheet

The handoff document of the content pipeline (restructure decision 13, issue #201). A `fast` agent drafts a sheet for one content item (a storylet or a chain of them), a `smol` agent reviews it, a `task` agent scaffolds and implements it, and a `smol` agent runs the static lint (#200) and the focused sim (#203) against it.

```
fast: drafts sheet  ->  smol: reviews sheet  ->  task: `scaffold` (#202) + implement  ->  smol: lint + focused-sim vs the sheet's expected rates, flags only
```

A sheet is **markdown with a fixed line grammar**. A human reads it as a list; `scaffold` (#202) parses it into storylet YAML skeletons and `focused-sim` (#203) parses the expected rates. The drafter writes only the sheet, in terms of the Pack vocabulary, and never edits a Pack.

This document fixes the layout. What `scaffold` writes and how `lint` and `focused-sim` judge the rates belong to #202, #200 and #203; they read the layout below and must not extend it without changing this file.

## Using the vocabulary

A sheet may use only names that exist. `pnpm tool vocab` prints them ([vocab](../spec/tools/vocab.md)). The prompt for the drafting agent is, in order:

1. the task (what to draft, which Pack owns it);
2. this file (the grammar and the worked example);
3. the output of `pnpm tool vocab --packs <owner>` (one Pack and, transitively, every Pack its capabilities require), pasted whole, under a `# Vocabulary` heading.

The drafter writes every `when`, `weight`, `chance`, `amount.*` and effect with names and macros from that listing, spelled as in it (`stat.smarts`, `quality.karma_score`, `core_loop.<macro>(...)`). Expressions follow [Expressions and effects](../spec/pack-format/expressions.md); effects are the closed effects and effect macros ([Effect macros](../spec/pack-format/effects.md)), nothing else. A name the vocabulary lacks is not invented in an expression: the drafter lists it in a `needs` field and the implementer declares it in the owning Pack (see below). The sheet's `packs` header is the same list given to `vocab --packs`, so the reviewer and `scaffold` check names against the same closure.

## Grammar

A sheet is UTF-8 text, read line by line. Trailing spaces are ignored.

- A blank line is ignored anywhere.
- A line whose first character is `>` is a **note** (for the reviewer and the implementer) and is ignored by every tool.
- The required fields, the `event`/`action` rules and the once-per-key rules in the tables are validation rules applied after parsing; a violation is rejected with the line number.
- Any other line must match one of the forms below; a line that matches none is a parse error reported with its line number.

```
sheet     = title , { header } , storylet , { storylet }
title     = "# Content sheet: " TEXT
header    = "- " hkey ": " VALUE
storylet  = "## " ID , { field } , ( outcomes | choice , { choice } )
field     = "- " key ": " VALUE
outcomes  = "### outcomes" , outcome , { outcome }
choice    = "### choice: " LABEL , { field } , outcome , { outcome }
outcome   = "- outcome: " WEIGHT , { "  - " okey ": " VALUE }
```

`VALUE`, `LABEL` and `TEXT` run to the end of the line, are trimmed, and are taken verbatim: no quoting, no escaping, no continuation lines. Everything after the first `: ` of a line is the value. A field has a non-empty value; a field with nothing to say is left out. `ID` matches `^[a-z][a-z0-9_-]*$` (a content id of the owner Pack; a `## ` heading is a storylet, so `###` headings are never ids). Storylet ids are unique in a sheet. Order inside a storylet: fields, then either one `### outcomes` section or one or more `### choice:` sections, never both. Outcomes keep their written order (the order is the YAML order and the forced-pick index).

### Header keys (between the title and the first `## `)

| `hkey` | Required | Value |
|---|---|---|
| `pack` | yes | Id of the owner Pack the storylets are added to. |
| `packs` | yes | Comma-separated Pack ids the vocabulary was printed for (`vocab --packs`); includes `pack`. |
| `profile` | no | Harness profile the focused sim plays (`pnpm harness --profile`); default `all`. |
| `lives` | no | Lives for the focused sim; default 1000. |

### Storylet fields

Each field is one line `- <key>: <value>`. A key appears at most once, except `needs`, which repeats (one line per name). `tags` is one comma-separated list.

| `key` | Required | Value | Becomes (storylet YAML, see [storylets](../spec/pack-format/storylets.md)) |
|---|---|---|---|
| `trigger` | yes | `event` or `action` | `trigger` |
| `menu` | action | `<top>` or `<top>/<submenu>` | `menu` |
| `label` | action | Menu label | `label` |
| `icon` | no | One emoji or `gameicons/<author>/<name>` | `icon` |
| `tags` | no | Comma-separated tags (`wager` for money at risk) | `tags: [...]` |
| `scope`, `target` | no | `loan` or `person`; role ids for `target`, comma-separated | `scope`, `target: [...]` |
| `when` | no | Gate: a boolean expression in vocab names | `when` |
| `chance` | event | Percent literal (at most 2 decimals), `0%` for a chain step reached only by `next` | `chance` |
| `weight` | event | Integer or expression; an event has exactly one of `chance` and `weight` | `weight` |
| `once`, `repeatable` | no | `true` | `once`, `repeatable` |
| `cooldown`, `max_per_life` | no | Integer | `cooldown`, `max_per_life` |
| `repeat.full`, `repeat.reduced`, `repeat.factor` | no | Integers; percent literal for `factor` | `repeat: { full, reduced, factor }` |
| `amount.min`, `amount.max`, `amount.step` | no | Integer expressions over the player (actions only; `min` and `max` together, `step` optional) | `amount: { min, max, step }` |
| `text` | yes | The storylet's prose, with `{placeholders}` | `text` |
| `opens` | no | Expected rate, see below | not written to YAML; read by `focused-sim` |
| `needs` | no, repeatable | A name the vocabulary lacks, as three parts separated by `: `: `<kind> <name>`, `<type and range>`, `<meaning>` (for example `quality heat: integer 0..100, default 0: how much attention the police pay you`) | not written to YAML; shown to the implementer |

An `event` has `chance` or `weight`; an `action` has `menu` and `label` and neither `chance` nor `weight`. The tools reject a sheet that breaks this.

A **choice** section is `### choice: <label>` and may carry the single field `when` on the lines directly under it (the choice's gate; no other field is allowed there); `label` is the line text, so it has no field. A **storylet without choices** has a single `### outcomes` section.

### Outcome

An outcome starts with `- outcome: <weight>` (an integer or an expression, required, the relative weight within its choice or storylet), followed by sub-lines indented by exactly two spaces, `  - <okey>: <value>`:

| `okey` | Required | Value |
|---|---|---|
| `text` | yes | The outcome's prose. |
| `when` | no | Eligibility of this outcome (boolean expression). |
| `effect` | no, repeatable | One effect statement per line, in order, verbatim as written in YAML: `stat.happiness += 5`, `money -= amount`, `journal("...")`, `core_loop.<macro>(args)`. |
| `next` | no | Id of the storylet opened immediately after this outcome (a storylet of this sheet or an existing one). |
| `rate` | no | Expected share of this outcome, see below. |

Within an outcome, `effect` may repeat; `text`, `when`, `next` and `rate` appear at most once. An effect line is the exact effect string; `scaffold` does not rewrite it. Effects that need quoting in YAML (a `journal("...")` or a `:`) are still written bare in the sheet; `scaffold` quotes them.

### Expected rates

A rate is `<lo>..<hi>` followed by a unit, both numbers decimal and `lo <= hi`. A single value is not allowed: a rate is always a band.

| Field | Unit | Meaning |
|---|---|---|
| storylet `opens` | `per life` | Mean number of times the storylet opens per life (opens divided by lives in the focused sim's report, `storylets.fired`), over the `profile` and `lives` of the header. Chain steps (`chance: 0%`) get one too. |
| outcome `rate` | `%` | Share of the resolutions of its choice (or of its storylet without choices) that pick this outcome, when every gate is satisfied: for constant weights, `weight / sum of weights`. |

Write the band the design intends, then widen it for what the harness cannot hold fixed (slot competition, age gates, cooldowns). `opens` is compared with a measured run; `rate` is first checked from the weights (lint), and measured only where the harness counts outcomes. A sheet with no rates is valid; a sheet without them cannot be flagged for balance, so the drafter gives `opens` for every storylet it adds.

## Example

The school bully chain from `packs/core-loop/storylets/choice.yaml`, as a drafter would have written it. `opens` bands are those measured on 3000 lives of `--packs core-loop` (opens per life: `bully-at-school` 0.79, `bully-showdown` 0.27, `bully-aftermath` 0.53), widened by about 20%.

```markdown
# Content sheet: School bully

- pack: core-loop
- packs: core-loop
- profile: all
- lives: 1000

> A three-step chain: the event offers three choices; two lead to follow-up scenes through `next`.
> The follow-up scenes are `chance: 0%` so the year draw never rolls them.

## bully-at-school
- trigger: event
- icon: 😠
- weight: 12
- when: age >= 8 and age <= 16
- cooldown: 4
- text: A bigger kid at school starts picking on {player.first_name} in the corridors.
- opens: 0.6..0.95 per life

### choice: Stand up to them
- outcome: 1
  - text: {player.first_name} squares up and the whole corridor goes quiet.
  - next: bully-showdown
  - rate: 100..100%

### choice: Tell a teacher
- outcome: 70
  - text: The teacher steps in and the bullying fades.
  - effect: stat.happiness += 2
  - rate: 65..75%
- outcome: 30
  - text: Nothing much changes, and the bully knows who told.
  - effect: stat.happiness -= 3
  - rate: 25..35%

### choice: Keep your head down
- outcome: 1
  - text: The weeks drag on.
  - effect: stat.happiness -= 5
  - next: bully-aftermath
  - rate: 100..100%

## bully-showdown
- trigger: event
- icon: 🥊
- chance: 0%
- text: The bully shoves back. A crowd forms.
- opens: 0.2..0.35 per life

### choice: Walk away with your head high
- outcome: 1
  - text: The crowd drifts off, and the bully loses interest.
  - effect: stat.happiness += 2
  - next: bully-aftermath

### choice: Fight back
- outcome: 40
  - text: A scuffle ends before it starts, thanks to a teacher.
  - effect: stat.health -= 3
  - effect: stat.happiness -= 2
  - next: bully-aftermath
  - rate: 35..45%
- outcome: 60
  - text: A bruised lip and a suspended week.
  - effect: stat.health -= 6
  - effect: stat.happiness -= 4
  - next: bully-aftermath
  - rate: 55..65%

## bully-aftermath
- trigger: event
- icon: 🏫
- chance: 0%
- text: Things at school start to settle.
- opens: 0.4..0.65 per life

### outcomes
- outcome: 50
  - text: A teacher checks in and {player.first_name} finally gets some support.
  - effect: stat.happiness += 4
  - rate: 45..55%
- outcome: 30
  - text: A new group of friends makes the corridors feel safer.
  - effect: stat.happiness += 3
  - effect: stat.smarts += 1
  - rate: 25..35%
- outcome: 20
  - text: The tension never quite goes away.
  - effect: stat.happiness -= 2
  - rate: 15..25%
```

The mapping to YAML is mechanical: `bully-showdown` becomes the Pack's entry of the same name, `### choice:` becomes a `choices:` item, `- outcome: 40` a `- weight: 40` item with `when`, `text`, `effects:` (the `effect` lines in order) and `next`. `opens` and `rate` are dropped from the YAML.

## Reviewing a sheet

The `smol` reviewer checks, and returns a list of defects (it does not rewrite):

1. Every line parses (the grammar above); required fields are present; ids are unique and match the Pack's naming.
2. Every name in `when`, `weight`, `chance`, `amount.*` and `effect` exists in the vocabulary for `packs`, and every effect is a closed effect or a listed macro.
3. Every `next` names a storylet of the sheet or an existing one; every chain step is `chance: 0%` and reached by some `next`; no outcome weights all zero.
4. Every storylet has `opens` (outcome `rate` is optional, but where given, plausible against the weights); `opens` is plausible against `weight`/`chance`, the gate and the repeat limits.
5. Each `needs` line names a kind, a name, a type and range and a meaning.

## Notes for the implementer

- `needs` lines become declarations in the owner Pack (`qualities/*.yaml`, `state/*.yaml`, `effects/*.yaml`) with a YAML comment carrying the meaning, so `vocab` shows it.
- A storylet in the Pack file gets the sheet's `id` verbatim.
- After the Pack builds, run the lint and the focused sim (#200, #203) on the sheet; they report differences from the sheet's `opens` and `rate` bands.
