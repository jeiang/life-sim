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

Cities abroad (`cost_index` / `wage_index`): Toronto 120/110, Montreal 100/100, London 170/135, Manchester 115/105, Tokyo 145/125, Osaka 110/105, Mexico City 70/60, Guadalajara 55/50. Core-loop's six US cities run 70/80 (Dustwater) to 180/150 (Goldcrest).

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

Drift is now `chance: 40%`, `-4` closeness, and only while the relative's closeness is above 20, so a mover who never calls bottoms out near 20 instead of 0 (calls +4 and visits +8 still outpace it).

Net worth, movers against stayers at 65: only the `random` profile emigrates in `all` (the other profiles never take the action), so the right stayer comparison is `random` stayers, now printed by profile: 41.8M against 22.5M (155 movers; a 3k-life random run gave 26.4M against 21.7M). Against the all-profile stayers (101.2M) movers are 0.41x, but that gap is the profile mix (gamblers, spenders and students dominate stayers), not relocation. Movers are ahead of like-for-like stayers (selection: they must afford the $3,000 fee), by 22-28% in the 3k runs and more in the 10k one. Raising the abroad cost index by 10 points or cutting the wage index by 10 points moved the median at 65 by under 4% and 0%, so the city indexes are not the lever and were left alone. Not within the 15% the issue asks for: it is a selection effect, not content.

## Focused-sim flags, justified

`pnpm tool focused-sim --pack relocation --sheet packs/relocation/sheets/<sheet>.md` (1000 lives for emigrate, 400 for the rest). Every flag is a sampling or profile effect, none is a content defect:

- Opens bands of the sheets are for a player who chooses to emigrate (about 0.3 applications per life). The default profile mix includes no such player: `random` halves its draw on `emigrate-apply` (0.07 opens per life) and `mover` and `caller` are opt-in (`default: false`). A focused `mover` run gives 6.2 applications per life because it retries after every denial and again after moving home; the first application of each mover lands about 51% approved.
- `emigrate-job-fork`, `relocation-arrive` and everything that needs a life abroad (`relatives-*`, `call-home`, `visit-home`, `abroad-language-*`, `move-city-abroad`, `relatives-reunion`) read low because only about 1 in 15 default-profile lives is abroad. Their per-mover rates are in the Relocation section of the report: 1.3 calls and 1.2 visits per mover, about 21 drift events per mover (40%, closeness above 20 only).
- Outcome shares of `emigrate-job-fork` follow who applies (young movers: 63% have no job, 35% hand in notice), not the sheet's inferred mix.
- Conditional outcome shares of `child-move-domestic`, `child-move-abroad` and `study-a-language` compare samples of 12 to 43 resolutions against exact `when`-conditional rates; the unit tests check the true weights (five equal US destinations, one partner city abroad, eight equal abroad outcomes, 30/30/20/20 study outcomes).
- `study-a-language` opens 0.9 times per life (sheet 0.35..0.6) because the `studious` profile and `random` both pick it; it is a free choice.
