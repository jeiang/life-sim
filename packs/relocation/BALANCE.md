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

## Targets and measured numbers (800 lives, seed 1, all profiles)

- Approval rate 50-70%: measured 51% (denied 48.8%).
- Movers against stayers at 65: movers 103.7M against 111.0M minor units (within 7%); at 40 movers are ahead (63M against 23M) because only lives that could afford the fee move.
- Relatives: movers' average closeness is 24 at 30 and 0 at 50 under the `mover` profile, against 60 for stayers; the random movers who call stay near 67.
- Language skill at 30 for movers: about 12 to 15 (floor 20 reached only at arrival, then study), 0 for stayers.
- Childhood moves per life: 0.093 domestic, 0.029 abroad.

## Open flags for the artemis balance run (#228)

- `relatives-drift` fires about 115 times per mover over a life (per bound relative); a closeness of 0 by 50 for the `mover` profile is steep. Consider a lower yearly chance or a floor.
- Movers are a small, selected sample under `random`; read net worth against the `stayer` profile.
- `mover` leaves the drift unanswered; compare with `caller`.
