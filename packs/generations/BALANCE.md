# generations balance

Content: 21 storylets (will 2, openers 4, aftermath 6, minor heir 4, heirlooms 5 including the sell action; NPC-parent inheritance is cut, #341) plus the `on_succession` hook. Final numbers come from the artemis run of the balance issue (#243); the figures below are local runs (seed 1/3/5, `--jobs 4`).

## Profile and harness

`dynasty` (opt-in, `default: false`): the dating `romantic` moves plus writing a will from 30 (`will-heir`, `will-make`). It exists so `--generations N` runs reach succession: scripts cannot combine with `--generations`. Heirloom and opener fire rates of later generations are not part of the founder's `report.json`; the Pack's own section reports the founder's will kinds and heirloom finds, and the heir availability, inheritance, heir age, minor-heir and insolvent-estate rates by generation are core-loop's generation tables.

300 lives, `--profile dynasty --generations 4`, seed 5: 0 faults for `--heir random` and `--heir richest` (and 3 generations, `eldest`, seed 1); `once-repeated` 0. Decision slots 89.5 / 49.7 / 28.9%. Persons per save p50 24, p99 25; save bytes p50 165 KB (founder numbers).

Lineage (`--heir random`): 142 of 300 founders (47%) leave an heir, 45 reach generation 2 and 11 generation 3. Cash inherited into generation 1: p10 0, p50 $1.32M, p90 $4.23M (minor units 131869200 / 422607850; includes the family wealth carry-over). Heir age at succession p10 9, p50 31, p90 58; 14% of heirs at 9 or younger. Net worth at death by generation (p50): 2.42M, 3.49M, 3.79M, 3.69M dollars.

## Numbers (focused-sim)

| storylet | opens per life | band |
|---|---|---|
| will-make | 0.07 (default bots), 14 wills written per dynasty life (3-year cooldown) | 0.03..0.15 |
| will-heir | 0 default bots (no children) | 0..0.05 |
| heirloom-attic-find | 0.33 | 0.2..0.5 |
| heirloom-appraisal | 0.2 | 0.1..0.3 |
| heirloom-family-quarrel | 0.19 | 0.1..0.3 |
| heirloom-history | 0 in a founder's life (needs a passed heirloom) | 0..0.3 |

Tweaks from the sheets: `heirloom-attic-find` weight 8 to 1 and `heirloom-appraisal` 6 to 2 (the sheet weights gave 3.3 and 2.5 opens a life); `will-make` and `will-heir` bands moved to the default bots (a deliberate player action; the dynasty profile plays it). `heirloom-history` is a succession-only beat, so `focused-sim` flags it `never-fired` in every founder run; it fires only for a later generation (tested directly in `test/generations.test.ts`).

Sheet conversions: the four openers, `aftermath-grief`, `aftermath-cash-left`, `aftermath-family-home` and `minor-guardian-takes-in` are `trigger: succession` storylets (engine feature, PR 304), not `chance: 0%` steps scheduled by the hook; the openers no longer schedule grief. `quality.gen_minor_heir` is an int 0..1 (`age < 18 ? 1 : 0`) because lint cannot see a boolean expression written to a flag. Outcome text in grief no longer says "at school" (the heir may be 60).

## Heirloom values (minor units)

Base: watch 60,000, quilt 20,000, clock 180,000, violin 900,000, letters 35,000. Gain per generation passed: 8, 5, 14, 15, 10 percent, applied to a held heirloom at each succession (`value * (100 + gain) / 100`). Heirlooms add nothing to net worth; selling pays `value` in cash once. The violin tops out at about $9,000 x 1.15^n: small against median net worth of $2.4M at death.

## Known limits and flags for the balance issue (#243)

- `aftermath-sibling-contests` (10% a year, once per generation, age 16+) can fire decades after the death for an heir with a sibling; judge its rate and band in the artemis run.
- `minor-handover-at-18` is a weight-40 event: when it is not drawn in the year the heir turns 18, the flag stays 1 (harmless: every other minor storylet gates on age).
- The opener bands and the minor-heir storylets only occur in generation 1+, which the founder-only storylet rates cannot show; the artemis run should read `generation` lineage numbers and fire rates with `--generations`.
- No harness measure reads a table cell, so heirloom value by generation is not reported.
