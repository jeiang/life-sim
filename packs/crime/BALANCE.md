# crime balance

Tuned with the [harness](../../docs/spec/harness.md). Profiles: `criminal` (opt-in, `--profile criminal`) commits crimes on purpose; `random` has the `crime` tag down-weighted to 0.004 (murder and assault a further 0.1) through `adjust` in `harness/profiles.yaml`.

Status (#235, 500 `criminal` lives, seed 1, local): nearly every life offends, so the shares below are conditional on offending, not population rates.

- Offenders arrested: 99.8%; convicted 98.8%; sentenced to custody 98.2% (the player's `criminal` profile picks a crime most years, so repeat offences dominate).
- Arrests per arrested life: p50 1, p90 3, max 6.
- Executed: 0.8% of criminal lives.

`random`, 1000 lives, seed 1: about 3% of lives open a property crime, murder opens in 0.5% of lives (5 of 1000), 8 lives arrested, 6 imprisoned, 0 faults.

## #236: prison life, parole, escape, juvie

Focused sim (criminal profile, 1000 lives) reports `off-band` opens of 10x to 90x on every prison, juvie and parole storylet, and `over-decisions` for `prison-cellmate-trouble` (23% of choice events, chance cut 40% to 25%) and `prison-riot` (3.6%). The sheet bands are per life of the whole population; the `criminal` profile re-offends on purpose (about 13 custody intakes and 30 parole reviews per life, murder once per target person because `max_per_life` counts per bound person), so these numbers measure the profile, not play. The `criminal` profile now down-weights `escape-attempt` (0.1) because failed attempts repeat yearly. Real rates are in the #237 section below; the cellmate event chances are the first knob if a mixed run still shows them over 3%.

## Targets (#237)

Declared per profile because `criminal` offends on purpose and its shares are conditional on offending. Measured by the `harness/metrics.yaml` of this Pack (property-crime lives use the `property-crime` tag; murder lives count completed murders through the two `go through with it` outcomes, so a back-out is not a murder).

| Measure | `random` target | `criminal` expectation |
|---|---|---|
| Lives with a property crime | about 3% (2% to 4%) | 90% or more (the profile commits most years) |
| Lives with a completed murder | about 0.25% (0.1% to 0.5%; murder opens about twice as often, half of the random picks back out) | 90% or more |
| Lives with 2 or more murders | 0 (murder is once per life, gated by `crime_killer`) | 0 |
| Offenders convicted | 75% or more of those arrested | 95% or more |
| Offenders sentenced to custody | a majority of the convicted | 95% or more |
| Recidivism (arrested again, of arrested lives) | no target at `random` volume (about 10 arrested lives per 1000) | 95% or more (the profile re-offends by design) |
| Sentenced lives that break out | 3% to 8% | 3% to 8% |
| Escapees recaptured | 80% or more | 80% or more |
| Sentenced lives granted parole | 80% or more | 80% or more |
| Executed (of offenders) | under 1% | under 2% |

Population gates: 0 faults, `crime/prison-cellmate-trouble` and `crime/prison-riot` at or under 3% of decisions.

## Final numbers (#237)

10000 lives, seed 1, on artemis at commit 29e234e (`scripts/artemis-run.sh crime-final build/crime-balance -- --lives 10000 --profile all` and `crime-final-criminal ... --profile criminal`), 0 faults in both.

| Measure | `random` (all-profile run) | `criminal` run |
|---|---:|---:|
| Property crime lives | 2.3% | 95.3% |
| Completed murder lives | 0.2% | 98.9% |
| Lives with 2 or more murders | 0% | 0% |
| Any crime action | 2.9% | 99.1% |
| Arrested / convicted / sentenced to custody | 0.6% / 0.5% / 0.3% | 98.9% / 98.6% / 97.6% |
| Offenders convicted | 83% of those arrested | 99.5% |
| Convicted lives convicted again | | 98.3% |
| Arrested lives arrested again | | 99.7% |
| Sentenced lives that broke out / were recaptured | | 3.0% / 84.1% |
| Sentenced lives granted parole | | 92.9% |
| Executed | | 1.3% of offenders |
| Arrests per arrested life | | p50 10, p90 16, max 28 |
| Net worth at 65, convicted / never convicted (median, minor units) | | 47,956,250 / 233,234,500 |

Notes:

- The all-profile aggregate (12% property, 12% murder, 11.5% sentenced) is not a population rate: the relocation Pack's `stayer` profile draws uniformly over every action and is not down-weighted for crime (96% of its lives murder, 92% are sentenced), and `crime` cannot adjust it from this Pack without breaking a crime-only Pack load. Read the `random` row. Flagged on #237 for the relocation Pack.
- Serial killing: murder is gated by `quality.crime_killer`, once per life. Before the gate `criminal` lives had 98.8% with 2 or more murders (`max_per_life` counted per bound person).
- GED: `juvie-study-ged` (juvenile detention, ages 16 and 17, no diploma) is reached by 29% of `criminal` offenders and earns the diploma for 12%. High school continues in juvenile detention (decision D4), so adults arrive in prison with a diploma and no adult GED storylet exists (`prison-study-ged` was removed in #351: core-loop has no high-school dropout path to serve).
