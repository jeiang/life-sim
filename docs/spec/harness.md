# Balance harness

Decided in [Balance harness scope](https://github.com/jeiang/life-sim/issues/20). It relies on the seeded streams and choice log (ADR 0003), the runtime assertions in the [Pack format](pack-format.md#expressions), and the [CI](ci.md) checks.

## Runner

- `packages/harness`: a Node CLI that runs the same Core package and compiled Pack bundles as the app, with no UI.
- `pnpm harness --lives N --profile <name> --seed <S>`: unlimited runs for local tuning (for example 100,000 lives).
- `--jobs N` (default: the available cores; `0` also means the available cores): split the lives across `N` `node:worker_threads` workers. Each worker compiles the Packs once and plays batches of lives; results are merged in life order, so `report.md` and `report.json` are byte-identical for any `N` and identical to a single-thread run of the same seeds. Neither file records the run time (it varies); the CLI prints it. Faults found in a worker are reported with their life seed as before. `--jobs 1` runs in-process without workers.

## Simulated player profiles

Every choice comes from the seeded RNG, so a run is reproducible from its seed.

| Profile | Behaviour |
|---|---|
| `random` | Uniform random choices; 0-2 random eligible actions per year, repeatable ones included (and repeated) |
| `studious` | Prefers study actions and university; accepts job offers |
| `spender` | Buys whenever affordable, takes loans when offered |
| `idle` | Takes no voluntary actions; answers events at random |

## CI check `harness`

A hermetic flake check runs 1,000 fixed seeds split across the profiles, with `--jobs` set to the cores the sandbox grants (`NIX_BUILD_CORES`).

It **fails** on engine faults:

- an exception thrown by the Core;
- an expression runtime assertion (division by zero, overflow);
- a stuck state: an open event with no selectable choice, or a life that can no longer age up;
- a save round-trip mismatch: at random ages the world is serialized, loaded, and compared, and it must be identical.

It **reports** without failing, in `report.md` and `report.json` in the check output:

- per-storylet fire counts, with storylets that never fired and the 10 most frequent;
- events per year (mean and distribution);
- age at death (distribution) and causes of death;
- net worth at ages 18, 40, and 65;
- degree rate, employment rate, and retirement rate;
- loan defaults and repossessions;
- living standards: share of lives with parents or at each standard by decade of age, and the homeless share of years lived on their own, overall and per profile, and the living cost as a percent of income by household shape (alone, with children, with a partner sharing);
- invariant (fault `minor-living-cost`): no living cost is charged while the player is under 18;
- housing: age at moving out, share moved out and kicked out (of lives reaching 18), and share still living with their parents at 30 and 40, overall and per profile;
- repeated activities: per repeatable action, uses per year lived, mean and maximum uses in a year it was used, and the share of those years past the full-effect and reduced ranges;
- stat distributions by age.

Balance bands that fail CI (for example a median age at death outside a range) can be added once content settles. Until then, balance findings guide authoring but never block merges.

## Determinism check (in `e2e`)

The `e2e` check runs 20 seeded lives in Node, Chromium, and WebKit with the same profile, and compares the final world hashes within the same run. Nothing is stored between runs, so content changes need no golden-file updates.
