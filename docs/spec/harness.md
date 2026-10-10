# Balance harness

Decided in [Balance harness scope](https://github.com/jeiang/life-sim/issues/20). It relies on the seeded streams and choice log (ADR 0003), the runtime assertions in the [Pack format](pack-format/expressions.md#expressions), and the [CI](ci.md) checks.

## Runner

- `packages/harness`: a Node CLI that runs the same Core package and compiled Pack bundles as the app, with no UI.
- `pnpm harness --lives N --profile <name> --seed <S>`: unlimited runs for local tuning (for example 100,000 lives).
- `--jobs N` (default: the available cores; `0` also means the available cores): split the lives across `N` `node:worker_threads` workers. Each worker compiles the Packs once and plays batches of lives; results are merged in life order, so `report.md` and `report.json` are byte-identical for any `N` and identical to a single-thread run of the same seeds. Neither file records the run time (it varies); the CLI prints it. Faults found in a worker are reported with their life seed as before. `--jobs 1` runs in-process without workers.
- The report's `population` block (and "Population per save" table) gives, per finished save, the persons in the world, the persons other than the player who hold or held a job (NPC careers, #131), and the serialized world size in bytes, each with p50, p99 and max.

## Full run in CI

Pull requests and pushes to `main` also run 10,000 lives (seed 20260101, all profiles, `--jobs $(nproc)`) on GitHub Actions ([CI](ci.md#github-actions-10000-life-harness)). It fails on engine faults only, uploads `report.md` and `report.json` as the `harness-report` artifact, and posts the headline numbers as a sticky pull-request comment. Local runs for tuning use `--lives 2000 --jobs 4`.

## Pack metrics

A Pack declares what the harness should measure in `packs/<id>/harness/metrics.yaml`; the harness package owns the schema and runs it for every loaded Pack, so no Pack has code in `packages/harness/src`. The file is validated against the compiled Packs when the harness starts (a problem exits with status 2 and a `file:line (path): message` diagnostic) and by `pnpm harness --check-packs [--packs a,b] [--packs-dir dir]`. The report gets one section per Pack that declares metrics, in `report.md` (heading `## <title>`) and in `report.json` as `packMetrics.<pack>`: `{ title, intro?, blocks, stats: { <id>: { label, kind, format, byProfile, ages, keyed, rows: [{ group?, age?, key?, value }] } } }`. A Pack with `visible_if_table` has no section until some life did an action of that table.

Top-level keys: `title` (required), `intro`, `visible_if_table`, `measures`, `tables`, `stats`, `blocks`. Quality, stat, storylet and tag ids are checked against the loaded Packs.

**Measures** are numbers computed once per life (a flag is 1 or 0). Exactly one source per measure:

| Key | Value |
|---|---|
| `quality: <id>, at: end\|ever\|years` | the player's final value; 1 if positive after any voluntary move or age-up; the number of age-ups that ended positive |
| `life: years\|earnings` | years lived (age-ups that did not end the life); gross occupation pay, minor units |
| `death: <cause>` | 1 when the life ended with exactly this cause of death |
| `fires: { storylet: <id> }` or `{ tag: <tag> }` | times such storylets opened |
| `table: <id>, column: <col>` | a table column summed over the life's actions |
| `snapshot: net_worth\|{stat: <id>}\|{quality: <id>}, ages: [..]` | the value at each listed age (absent for lives that did not reach it) |
| `when: "<expression>"` | 1 or 0; comparisons (`> >= < <= == !=`), `and`, `or`, `not` and parentheses over earlier measures and numbers |

**Tables** count voluntary actions of the Pack (ids starting `<pack>/`), per action id: `raises: <quality>` counts only actions that raised it, `with_amount: true` only actions done with an amount (their amount-grid slot, counted from 1, is recorded too), `money_floor: <n>` makes an action that leaves money below it an assertion fault. `columns` are totals per life: `count`, `amount` (sum of the amounts chosen), `{ delta: money }` or `{ delta: <quality> }` (change over the action and the events it opened).

**Stats** aggregate over lives. Common keys: `label`, `by: profile` (one result per profile plus `all`; otherwise `all` only), `of: "<expression>"` (only lives where it holds), `decimals`, `format: percent\|number\|money` (money prints major units). References are a measure id, `table.column` (per action id) or `table.@N` (the count at grid slot N).

| `kind` | Keys | Result |
|---|---|---|
| `count` | | lives counted |
| `share` | `when` | percent of lives where `when` holds |
| `mean`, `sum` | `value` | mean per life (default 3 decimals), or total |
| `ratio` | `num` (one or a list, summed), `den`, `scale` (default 100) | `scale` x sum(num) / sum(den), 0 when the denominator is 0 |
| `dist` | `value` | n, mean, min, p10, p50, p90, p99, max |
| `median` | `value`, `ages` for snapshot measures | median and the lives it covers |

Stats that read a table column or slot have one result per action id any life did. A stat over a snapshot measure takes `ages` (a subset of the measure's).

**Blocks** lay out the section: `{ text: ... }` is a paragraph; `{ stats: [ids], key: <heading> }` is a table with a row per profile, age and action as the statistics split (a statistic with fewer splits repeats on every row; distributions share a block only with each other). The metrics of the Gambling and Vacations Packs are the worked examples.

## Simulated player profiles

Every choice comes from the seeded RNG, so a run is reproducible from its seed. Profiles and report sections that exist for one Pack are described in that Pack's `BALANCE.md`.

| Profile | Behaviour |
|---|---|
| `random` | Uniform random choices; 0-2 random eligible actions per year, repeatable ones included (and repeated) |
| `studious` | Prefers study actions and university; accepts job offers |
| `spender` | Buys whenever affordable, takes loans when offered |
| `idle` | Takes no voluntary actions; answers events at random |
| `grinder` | 12 random repeatable actions a year, to stress diminishing returns; opt-in (`--profile grinder`), not part of `all` |

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
- stats at 100: share of living lives at the cap, per stat, by decade of age;
- wagers: for storylets tagged `wager`, plays (outcomes that changed money), net money, the stake (worst single loss) and the realised return (below 100% loses money on average);
- stat distributions by age;
- one section per Pack that declares [Pack metrics](#pack-metrics).

Balance bands that fail CI (for example a median age at death outside a range) can be added once content settles. Until then, balance findings guide authoring but never block merges.

## Determinism check (in `e2e`)

The `e2e` check runs 20 seeded lives in Node, Chromium, and WebKit with the same profile, and compares the final world hashes within the same run. Nothing is stored between runs, so content changes need no golden-file updates.
