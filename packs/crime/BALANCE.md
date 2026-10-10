# crime balance

Tuned with the [harness](../../docs/spec/harness.md). Profiles: `criminal` (opt-in, `--profile criminal`) commits crimes on purpose; `random` has the `crime` tag down-weighted to 0.004 (murder and assault a further 0.1) through `adjust` in `harness/profiles.yaml`.

Status (#235, 500 `criminal` lives, seed 1, local): nearly every life offends, so the shares below are conditional on offending, not population rates.

- Offenders arrested: 99.8%; convicted 98.8%; sentenced to custody 98.2% (the player's `criminal` profile picks a crime most years, so repeat offences dominate).
- Arrests per arrested life: p50 1, p90 3, max 6.
- Executed: 0.8% of criminal lives.

Final population numbers (sentence and years served p50/p90, ex-convict employment, net worth at 65) come from the artemis run in #237.

Open flags for #237: murder opens often under `criminal` (the profile always takes it); the `random` share must be confirmed at 10k lives.

`random`, 1000 lives, seed 1: about 3% of lives open a property crime, murder opens in 0.5% of lives (5 of 1000), 8 lives arrested, 6 imprisoned, 0 faults.

## #236: prison life, parole, escape, juvie

Focused sim (criminal profile, 1000 lives) reports `off-band` opens of 10x to 90x on every prison, juvie and parole storylet, and `over-decisions` for `prison-cellmate-trouble` (23% of choice events, chance cut 40% to 25%) and `prison-riot` (3.6%). The sheet bands are per life of the whole population; the `criminal` profile re-offends on purpose (about 13 custody intakes and 30 parole reviews per life, murder once per target person because `max_per_life` counts per bound person), so these numbers measure the profile, not play. The `criminal` profile now down-weights `escape-attempt` (0.1) because failed attempts repeat yearly. Real rates come from the artemis run (#237); the cellmate event chances are the first knob if a mixed run still shows them over 3%.

`prison-study-ged` never fires in simulation: adults in the criminal profile have a high-school diploma. Forced scripts `crime/escape`, `crime/death-penalty` and `crime/juvie` reach the rare branches.
