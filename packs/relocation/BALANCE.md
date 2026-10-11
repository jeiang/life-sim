# relocation balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives N --seed 1 --out <dir>` and `--profile mover|caller|stayer`. Final numbers come from the artemis run of #228.

## Design numbers

| Item | Value |
|---|---|
| Application fee | $3,000, kept on denial |
| Approval | `clamp(40 + smarts/5 + 10 (degree) + min(15, years worked) + min(10, money / $10,000) - 5 x min(denials, 3), 5, 95)` percent |
| Move back home / between abroad cities | $1,500 / $2,500 (once a year) |
| Boss agrees to a remote job | `clamp(40 + smarts/5 + 6 x work_effort + min(15, years worked), 5, 95)` |
| Visit home | $1,200, every other year, +8 closeness (+3 when stilted) |
| Language | floor 20 on arrival (40 for a child), +3 a year abroad in the destination language, study +/- by `(100 - skill) / 12` |

Cities abroad (`cost_index` / `wage_index`): Toronto 120/135, Montreal 100/125, London 170/160, Manchester 115/130, Tokyo 145/150, Osaka 110/130, Mexico City 70/85, Guadalajara 55/75. Core-loop's six US cities run 70/80 (Dustwater) to 180/150 (Goldcrest).

## Targets and measured numbers (800 lives, seed 1, the `mover` profile in the mix; reproduce with `--profile mover` and `--profile stayer`)

- Approval rate 50-70%: measured 51% (denied 48.8%).
- Movers against stayers at 65: movers 103.7M against 111.0M minor units (within 7%); at 40 movers are ahead (63M against 23M) because only lives that could afford the fee move.
- Relatives: see the #228 table below (closeness floor 20 under drift).
- Language skill at 30 for movers: about 12 to 15 (floor 20 reached only at arrival, then study), 0 for stayers.
- Childhood moves per life: 0.093 domestic, 0.029 abroad.

## Artemis run of #228 (10,000 lives, seed 1, `--profile all`, `reloc-tune` at a9f9f7e)

Cause of the slot miss: the `stayer` profile was in the default mix. It is a random-like profile that never emigrates, and with it in `all` the other seven profiles shrank to 7/8 of the lives and the mix moved: employment fell 78.5% to 71.7% and decision slots to 88.5 / 48.3 / 27.5 (1k lives; a 1k run without it gave 89.8 / 49.3 / 28.3). No relocation storylet is a decision or competes for the yearly cap (3 cap drops in 10k lives). `stayer` is now `default: false`; movers and stayers in the report are by `emigrations`, not by profile, so the metrics are unchanged.

| Metric | Before (a7ceb520) | After |
|---|---|---|
| decision slots, at least 1 / 2 / 3 | 82.5 / 45.2 / 25.8 | 89.8 / 49.2 / 28.1 (target 90 / 50 / 30, within 3) |
| employment (25-64) | 71.7% (1k) | 78.3% |
| drift events per mover | 41.3 | 21.2 |
| movers' relatives closeness at 30 / 50 (`all`) | 66 at 50 | 66 / 66 (stayers 59 / 59) |
| mover profile closeness at 50 | 0 | held above 20 by the floor (see below) |

Drift (#228) was `chance: 40%`, `-4` closeness (retuned in #367, see the section below), and only while the relative's closeness is above 20, so a mover who never calls bottoms out near 20 instead of 0 (calls +4 and visits +8 still outpace it).

Net worth, movers against stayers at 65: only the `random` profile emigrates in `all` (the other profiles never take the action), so the right stayer comparison is `random` stayers, now printed by profile: 41.8M against 22.5M (155 movers; a 3k-life random run gave 26.4M against 21.7M). Against the all-profile stayers (101.2M) movers are 0.41x, but that gap is the profile mix (gamblers, spenders and students dominate stayers), not relocation. Movers are ahead of like-for-like stayers (selection: they must afford the $3,000 fee), by 22-28% in the 3k runs and more in the 10k one. Raising the abroad cost index by 10 points or cutting the wage index by 10 points moved the median at 65 by under 4% and 0%, so the city indexes are not the lever and were left alone. Not within the 15% the issue asks for: it is a selection effect, not content.

## Focused-sim flags, justified

`pnpm tool focused-sim --pack relocation --sheet packs/relocation/sheets/<sheet>.md` (1000 lives for emigrate, 400 for the rest). Every flag is a sampling or profile effect, none is a content defect:

- Opens bands of the sheets are for a player who chooses to emigrate (about 0.3 applications per life). The default profile mix includes no such player: `random` halves its draw on `emigrate-apply` (0.07 opens per life) and `mover` and `caller` are opt-in (`default: false`). A focused `mover` run gives 6.2 applications per life because it retries after every denial and again after moving home; the first application of each mover lands about 51% approved.
- `emigrate-job-fork`, `relocation-arrive` and everything that needs a life abroad (`relatives-*`, `call-home`, `visit-home`, `abroad-language-*`, `move-city-abroad`, `relatives-reunion`) read low because only about 1 in 15 default-profile lives is abroad. Their per-mover rates are in the Relocation section of the report: 1.3 calls and 1.2 visits per mover, about 21 drift events per mover (40%, closeness above 20 only).
- Outcome shares of `emigrate-job-fork` follow who applies (young movers: 63% have no job, 35% hand in notice), not the sheet's inferred mix.
- Conditional outcome shares of `child-move-domestic`, `child-move-abroad` and `study-a-language` compare samples of 12 to 43 resolutions against exact `when`-conditional rates; the unit tests check the true weights (five equal US destinations, one partner city abroad, eight equal abroad outcomes, 30/30/20/20 study outcomes).
- `study-a-language` opens 0.9 times per life (sheet 0.35..0.6) because the `studious` profile and `random` both pick it; it is a free choice.

## Retune of #367 (relocation, epic #246)

Reports: v1 baseline `rebalance-v1-{all,mover,stayer}-ab46a88-*` (#245). After: artemis `reloc-t3-all-df8b1f2-20261011T084255Z` (10,000 lives, `--profile all`, seed 20260101), `reloc-t3-mover-df8b1f2-20261011T090527Z` (3,000 `mover`), `reloc-t2-stayer-b1f44be-20261011T084352Z` (3,000 `stayer`; the stayer profile and the mover do not depend on the drift chance changed after it).

Changes (data only):

- `stayer` profile now mirrors `mover` minus emigration: job applications first, the language study action, then everything but `emigrate-apply` and `move-*`. In v1 it was random-like with about 60% homeless years, so the 2.1x "mover advantage" compared a working profile with a broke one.
- `mover` moves back home from 64 instead of 55 (at 55 the move ends the job and the career restart cost a decade of savings).
- `relatives-drift`: `chance` 40% to 10%, closeness step -4 to -6 (still only while closeness is above 20). The mover now stays abroad longer (60% of years against 52%), so a lower chance was needed to keep the count down.

| Metric | v1 | After |
|---|---|---|
| `mover` against parity `stayer`, net worth at 65 | 107.6M vs 50.4M (2.1x) | 157.4M vs 206.8M (0.76x) |
| `mover` against `stayer`, at 40 | 68.1M vs 7.1M | 68.5M vs 82.6M |
| random movers against random stayers at 65 (`all`) | 58.5M vs 40.7M (+44%) | 61.4M vs 40.8M (+50%) |
| drift events per mover (`mover`) | 67.1 | 21.4 (`all`: 8.7) |
| relatives' closeness at 50, `mover` | 26 | 51 (stayers 44) |
| decision slots, at least 1 / 2 / 3 | 89.8 / 49.3 / 28.3 | 89.8 / 49.3 / 28.3 |
| top decision storylet | dating/ask-out 2.61% | dating/ask-out 2.62% |
| death age median, faults | 72, 0 | 72, 0 |

The parity gap is addressed by #382 below. Random movers' advantage over random stayers is a selection effect (movers must afford the $3,000 fee), not a target.

## Parity tune of #382 (relocation, epic #246)

Reports use seed `20260101`. The `mover` and parity `stayer` runs each use 3,000 lives; the `all` runs use 10,000. The stayer profile never emigrates, so the abroad wage-index changes do not affect its result; the before stayer run is reused.

Changes (data only): each abroad city's `wage_index` rose by 25 points. `cost_index` is unchanged.

| Metric | Before | After |
|---|---|---|
| `mover` vs parity `stayer`, net worth at 40 | 67.6M vs 86.5M | 86.9M vs 86.5M |
| `mover` vs parity `stayer`, net worth at 65 | 156.0M vs 209.2M (0.75x) | 206.5M vs 209.2M (0.99x; 1.3% below) |
| random movers vs random stayers at 65 (`all`) | 61.4M (n=134) vs 40.8M (n=712; +50.4%) | 62.5M (n=147) vs 80.4M (n=703; -22.3%) |
| decision slots, at least 1 / 2 / 3 (`all`) | 89.8 / 49.3 / 28.3 | 89.9 / 49.6 / 28.7 |
| top decision storylet (`all`) | dating/ask-out 2.62% | core-loop/lottery-ticket 2.41% |
| death age median, faults (`all`) | 72, 0 | 72, 0 |

The random-profile comparison is a selection effect, not a target: moving requires paying the $3,000 fee, and the people who move are not a parity cohort.

Reports: before mover `reloc-parity-3b77a02-20261011T152337Z`, before stayer `reloc-stayer-3b77a02-20261011T153210Z`, and before all `reloc-t3-all-df8b1f2-20261011T084255Z`. After mover `reloc-parity-1ac4abb-20261011T163028Z` and after all `reloc-parity-1ac4abb-20261011T172110Z`.
