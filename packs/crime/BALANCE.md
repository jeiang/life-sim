# crime balance

Tuned with the [harness](../../docs/spec/harness.md). Profiles: `criminal` (opt-in, `--profile criminal`) commits crimes on purpose; `random` has the `crime` tag down-weighted to 0.004 (murder and assault a further 0.1) through `adjust` in `harness/profiles.yaml`.

Status (#235, 500 `criminal` lives, seed 1, local): nearly every life offends, so the shares below are conditional on offending, not population rates.

- Offenders arrested: 99.8%; convicted 98.8%; sentenced to custody 98.2% (the player's `criminal` profile picks a crime most years, so repeat offences dominate).
- Arrests per arrested life: p50 1, p90 3, max 6.
- Executed: 0.8% of criminal lives.

Final population numbers (sentence and years served p50/p90, ex-convict employment, net worth at 65) come from the artemis run in #237.

Open flags for #237: murder opens often under `criminal` (the profile always takes it); the `random` share must be confirmed at 10k lives.

`random`, 1000 lives, seed 1: about 3% of lives open a property crime, murder opens in 0.5% of lives (5 of 1000), 8 lives arrested, 6 imprisoned, 0 faults.
