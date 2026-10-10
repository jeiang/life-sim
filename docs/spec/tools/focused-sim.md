# `pnpm tool focused-sim`

Decided in the restructure (decisions 8 and 13, issue #203). One command for the `smol` agent that follows a Pack change: play the Pack's focused profile and the baseline for a bounded time, print per-storylet fire rate and outcome shares, and diff them against the content sheet's expected rates. It **flags** and never fixes: it edits no content and exits 0 whatever it flags.

```
pnpm tool focused-sim --pack <id> [--sheet <sheet.md>] [--lives 1000] [--jobs N]
  [--budget 15] [--seed 1] [--decision-share 3] [--packs-dir dir] [--format md|json]
```

- `--pack`: the Pack to exercise; it is loaded with the Packs it requires (as `pnpm harness --packs`).
- `--sheet`: a [content sheet](../../pipeline/content-sheet.md) for the Pack (parsed by `tools/lib/sheet.ts`). Without it only the Pack's whole storylet list is judged for never-fired and decision share.
- `--lives`: lives each run plays, at most (default: the sheet's `lives`, else 1000).
- `--jobs`: worker threads (default: the available cores, at most 8).
- `--budget`: wall-clock seconds for all runs together, compile included (default 15; `0`: none). A run stops handing out lives at its share of what is left and reports the lives played so far, always a prefix of the unlimited run (batches of 4 lives; lives are seeded by index, so a shorter run is the same run cut earlier). The summary names a cut run (`stopped at the time budget`). A gambling run on 8 jobs ends in about 16 s; on a slow machine it plays fewer lives, never takes longer.
- `--decision-share`: percent limit for the decision-share flag (default 3).

## Runs

Up to three runs, de-duplicated by profile list, each with the Pack set loaded:

| Role | Profiles |
|---|---|
| baseline | `random` (the core Pack's plain player; else the first default profile) |
| focused | every profile the Pack declares in its own `harness/profiles.yaml`, dealt in turn (none: the run is skipped) |
| sheet | the sheet's `profile` (default `all`, the default profile set); the sheet's `opens` and `rate` bands are measured on this run |

A role whose profiles equal another's shares its run (`focused + sheet`). The seed is `--seed` (default 1), so a run is repeatable.

## Output

Markdown (`--format md`, default), or the `Analysis` object exported by `tools/focused-sim.ts` as JSON:

1. the runs, with lives played and seconds;
2. `## Flags`, one line each: kind, storylet, what was seen, and the sheet line the expectation came from;
3. `## Fire rate (opens per life)`, one column per run plus the sheet's `opens` band;
4. `## Outcome shares`, percent of the resolutions of the choice (or of the storylet without choices) per outcome, `o<i>` / `c<j>.o<i>` as in `report.json` `storylets.outcomes`, plus the sheet's `rate` band.

Scope: the sheet's storylets (ids get the Pack prefix), else all the Pack's storylets.

## Flags

| Kind | Raised when |
|---|---|
| `off-band` | the measured `opens` per life, or the measured outcome share, is outside the sheet band by more than two standard errors of the sample (Poisson for opens, binomial for shares), so a short run does not flag noise; the message gives the miss as a factor (`6.4x too high`) |
| `never-fired` | a storylet in scope opened in no run |
| `never-reached` | the same for a chain step (`chance: 0%` reached only by `next`) |
| `over-decisions` | a choice event (an event storylet with choices that is not a chain step) is above `--decision-share` percent of all choice events opened in a run |
| `not-in-pack` | a sheet storylet is not in the Pack |
| `structure` | the sheet's choices or outcomes do not match the Pack's in number, so outcome rates are not compared |

Outcomes are matched to the sheet by position (written order), the order `scaffold` writes.

## Exit status

0 whenever it ran, with or without flags; 2 on a usage error, an unreadable or unparsable sheet, a sheet for another Pack, or Packs that do not compile. Faults found while playing are printed on stderr (`FAULT ...`) and do not change the status: `pnpm harness` and `lint` own them.

## Harness additions

`report.json` `storylets.outcomes` (per-storylet outcome counts, merge-safe: see [harness](../harness.md)) and `runHarnessParallel` options `deadlineSeconds` and `batchSize` were added for this tool.
