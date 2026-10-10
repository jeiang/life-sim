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
- Relatives: movers' average closeness is 24 at 30 and 0 at 50 under the `mover` profile, against 60 for stayers; the random movers who call stay near 67.
- Language skill at 30 for movers: about 12 to 15 (floor 20 reached only at arrival, then study), 0 for stayers.
- Childhood moves per life: 0.093 domestic, 0.029 abroad.

## Open flags for the artemis balance run (#228)

- `relatives-drift` fires about 115 times per mover over a life (per bound relative); a closeness of 0 by 50 for the `mover` profile is steep. Consider a lower yearly chance or a floor.
- Movers are a small, selected sample under `random`; read net worth against the `stayer` profile.
- `mover` leaves the drift unanswered; compare with `caller`.

## Focused-sim flags, justified

`pnpm tool focused-sim --pack relocation --sheet packs/relocation/sheets/<sheet>.md` (1000 lives for emigrate, 400 for the rest). Every flag is a sampling or profile effect, none is a content defect:

- Opens bands of the sheets are for a player who chooses to emigrate (about 0.3 applications per life). The default profile mix includes no such player: `random` halves its draw on `emigrate-apply` (0.07 opens per life) and `mover` and `caller` are opt-in (`default: false`). A focused `mover` run gives 6.2 applications per life because it retries after every denial and again after moving home; the first application of each mover lands about 51% approved.
- `emigrate-job-fork`, `relocation-arrive` and everything that needs a life abroad (`relatives-*`, `call-home`, `visit-home`, `abroad-language-*`, `move-city-abroad`, `relatives-reunion`) read low because only about 1 in 15 default-profile lives is abroad. Their per-mover rates are in the Relocation section of the report: 1.3 calls and 1.2 visits per mover, 115 drift events per mover (about 4 relatives for 25 years at 75%).
- Outcome shares of `emigrate-job-fork` follow who applies (young movers: 63% have no job, 35% hand in notice), not the sheet's inferred mix.
- Conditional outcome shares of `child-move-domestic`, `child-move-abroad` and `study-a-language` compare samples of 12 to 43 resolutions against exact `when`-conditional rates; the unit tests check the true weights (five equal US destinations, one partner city abroad, eight equal abroad outcomes, 30/30/20/20 study outcomes).
- `study-a-language` opens 0.9 times per life (sheet 0.35..0.6) because the `studious` profile and `random` both pick it; it is a free choice.
