# Balance harness

Decided in [Balance harness scope](https://github.com/jeiang/life-sim/issues/20). It relies on the seeded streams and choice log (ADR 0003), the runtime assertions in the [Pack format](pack-format/expressions.md#expressions), and the [CI](ci.md) checks.

## Runner

- `packages/harness`: a Node CLI that runs the same Core package and compiled Pack bundles as the app, with no UI.
- `pnpm harness --lives N --profile <name> --seed <S>`: unlimited runs for local tuning (for example 100,000 lives).
- `--jobs N` (default: the available cores; `0` also means the available cores): split the lives across `N` `node:worker_threads` workers. Each worker compiles the Packs once and plays batches of lives; results are merged in life order, so `report.md` and `report.json` are byte-identical for any `N` and identical to a single-thread run of the same seeds. Neither file records the run time (it varies); the CLI prints it. Faults found in a worker are reported with their life seed as before. `--jobs 1` runs in-process without workers.
- `--shard i/n` (1-based `i`, for example `2/4`): play only the lives whose index modulo `n` is `i-1`. Life seeds and profile assignment derive from the life index as usual, so a life is the same under any sharding. A shard needs `--out` and writes `shard-i-of-n.json.gz` there (its raw lives) besides its own partial `report.*`. `pnpm harness merge <dir> [--out dir]` finds the `shard-*.json.gz` files under `<dir>` (recursively, so one downloaded artifact directory per shard works), checks they come from the same run (seed, lives, profiles, forcing) with none missing or duplicated, replays the lives in life order, and writes `report.md` and `report.json` (to `--out`, default `<dir>`) byte-identical to an unsharded run of the same lives. `merge` takes the same `--packs`/`--packs-dir` as a run. A forced script (`--script`) shards and merges the same way, in a directory of its own: the tag workflow runs it as an extra shard kind.
- `--generations N` (default 1) and `--heir eldest|richest|random` (default eldest): when a life ends with a living child (`heirsOf`), the run continues as the heir chosen by the policy (`eldest`: oldest, `richest`: most money, `random`: a harness stream), through `succeed`, for up to `N` generations or until a line ends, a fault stops it or the life is cut off. The life's own fields and metrics in `report.*` are the founder's (so a run with `--generations` reports the same founder lives as one without); faults of later generations join the founder's life, and each generation's numbers are kept as the life's `lineage` record, which the `generation:` measures read. Every generation plays the same profile with its own harness stream. `--generations` cannot be combined with `--force` or `--script`; shards and `merge` carry it (shards of one run must agree). With more than one generation the report also has the invariant fault `once-repeated` (below: a `once` storylet never opens twice in one generation) and the lineage tables Packs declare (core-loop's generation blocks).
- `--fail-on faults,never-fired`: exit status 1 also when `never-fired` is named and any storylet no life opened, listed per Pack on stderr. Engine faults and never-matched forced entries always fail; `faults` is accepted for explicitness. Applies to runs and to `merge`.
- The report's `population` block (and "Population per save" table) gives, per finished save, the persons in the world (animals excluded: a pet is not a person for this count), the animals (`pets`), the persons other than the player who hold or held a job (NPC careers, #131), and the serialized world size in bytes, each with p50, p99 and max.

## Full run in CI

Pull requests and pushes to `main` also run 10,000 lives (seed 20260101, all profiles, `--jobs $(nproc)`) on GitHub Actions ([CI](ci.md#github-actions-10000-life-harness)). It fails on engine faults only, uploads `report.md` and `report.json` as the `harness-report` artifact, and posts the headline numbers as a sticky pull-request comment. Local runs for tuning use `--lives 2000 --jobs 4`.

## Pack metrics

A Pack declares what the harness should measure in `packs/<id>/harness/metrics.yaml`; the harness package owns the schema and runs it for every loaded Pack, so no Pack has code in `packages/harness/src`. The file is validated against the compiled Packs when the harness starts (a problem exits with status 2 and a `file:line (path): message` diagnostic) and by `pnpm harness --check-packs [--packs a,b] [--packs-dir dir]`. The report gets one section per Pack that declares metrics, in `report.md` (heading `## <title>`) and in `report.json` as `packMetrics.<pack>`: `{ title, intro?, blocks, stats: { <id>: { label, kind, format, byProfile, ages, keyed, rows: [{ group?, age?, key?, value }] } } }`. A Pack with `visible_if_table` has no section until some life did an action of that table.

Top-level keys: `title` (required), `intro`, `visible_if_table`, `measures`, `tables`, `stats`, `blocks`. A block may carry `visible_if_measure: <measure>`: it (and a statistic only such blocks lay out) appears only when some life has that measure above 0, as in core-loop's generation tables, shown only for runs with `--generations`. Quality, stat, storylet and tag ids are checked against the loaded Packs.

**Measures** are numbers computed once per life (a flag is 1 or 0). Exactly one source per measure:

| Key | Value |
|---|---|
| `quality: <id>, at: end\|ever\|years` | the player's final value; 1 if positive after any voluntary move or age-up; the number of age-ups that ended positive |
| `life: years\|earnings` | years lived (age-ups that did not end the life); gross occupation pay, minor units |
| `death: <cause>` | 1 when the life ended with exactly this cause of death |
| `fires: { storylet: <id> }` or `{ tag: <tag> }` | times such storylets opened |
| `table: <id>, column: <col>` | a table column summed over the life's actions |
| `snapshot: net_worth\|holdings\|{stat: <id>}\|{quality: <id>}\|{holding: <market kind>}, ages: [..]` | the value at each listed age (absent for lives that did not reach it); `holdings` is the player's market holdings at current prices, `holding` those of one kind (0 when none) |
| `market: <kind>, take: <take>` | a statistic of the kind's price series over the life (below) |
| `outcome: { storylet: <id>, key: <key> }` | times the storylet resolved that outcome: `key` is the `storylets.outcomes` key of `report.json`, `c<j>.o<i>` for outcome i of choice j (0-based, YAML order) or `o<i>` for a storylet without choices; the storylet and key are checked against the compiled Packs |
| `generation: <name>`, optional `n: <i>` | a number from generation `i` of the life's lineage (`n` default 0, the founder; 0 for a generation the lineage never reached, so filter with `reached`). Names: `reached` (1), `died` (the generation's life ended), `heir_available` (1 when a living child survived it), `heirs` (their number), `death_age`, `net_worth` (at death, minor units), `inheritance` (cash the heir of `n-1` received), `heir_age`, `minor_heir` (1 if under 18), `insolvent_estate` (1 when the dead player's net worth was negative; the last four describe the succession into generation `n`), `repeated_once` (`once` storylets opened twice in the generation, an engine fault) |
| `when: "<expression>"` | 1 or 0; comparisons (`> >= < <= == !=`), `and`, `or`, `not` and parentheses over earlier measures and numbers |

**Market measures** read the series of a market kind (full item id, an item with a `market` block) as the player's world sees it: the price at birth and after every age-up (the one that ends the life included), one point per world year. The series is a function of the seed and year, not of the player. Prices are minor units per whole unit. `take`:

| `take` | Value |
|---|---|
| `annualized_return` | basis points a year, compounded from the first price to the last: `((last / first) ^ (1 / steps) - 1) x 10000`, unrounded; 0 when the first price is 0 or there are no steps. A delisted kind that ends at 0 reads -10000; a relist restarts at `start`, so read it with `delistings` and `relistings` |
| `start_price`, `end_price`, `min_price`, `max_price` | the first, last, lowest and highest price of the life |
| `delistings` | years the price went from above 0 to 0 |
| `relistings` | years the price went from 0 to above 0 |
| `defaults` | bond issuer defaults (years the remaining principal share fell) |
| `drop_years`, with `drop_bp: <1..10000>` | years the price fell by at least `drop_bp` basis points; a delisting counts as a 10000 bp drop |

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

Every choice comes from the seeded RNG, so a run is reproducible from its seed. A profile draws only from its own stream (`harness/<profile id>`), so adding a profile never changes the lives of another. Profiles are declared by Packs in `packs/<id>/harness/profiles.yaml`; the harness package owns the schema and interprets it, so no Pack has code in `packages/harness/src`. The registry is every Pack's profiles in Pack load order, then file order; ids are global and a repeat is an error. `pnpm harness --list-profiles` prints the registry, `--profile` takes any of its ids (or `all`, the profiles without `default: false`), and `--check-packs` validates the files.

```yaml
profiles:
  gambler:
    description: ...
    default: true            # false: only `--profile gambler` runs it, `all` omits it
    moves: 4                 # voluntary moves a year; `{ below: 3 }` draws 0..2
    amount: uniform          # uniform | min | max, for actions with an amount grid
    once_per_year: false     # skip an action already used this year
    quit: { quality: gambling_addicted, relapse_one_in: 5 }
    choice:                  # event choices, by label (case-insensitive globs)
      prefer: [accept*, yes*]
      avoid: ["*refuse*"]
    rules:                   # tried in order; the first with a candidate decides the move
      - when: { quitting: true }       # quitting | age_at_least
        ids: [gambling/gambling-support-meeting]
        pick: first                    # first | random (default) | max | min
      - pick: max                      # the candidate with the highest value of `by`
        by: quality.tip_a - quality.tip_b        # one expression for every candidate, or
      - pick: min
        by:                            # an expression per action glob (first match wins)
          investing/buy-a: quality.tip_a
          investing/buy-b: quality.tip_b
      - when: { quitting: false }
        ids: [gambling/play-*, gambling/bet-*]
        except: ["*/skip-*"]
        menu: some/menu                # only this menu
        repeatable: true               # only `repeatable` actions
      - shop: true                     # buy something (a loan when offered)
```

`ids` and `except` are globs on the full action id (`*` within one `/` segment, `**` across them); a glob that matches no action is an error. `quit` makes the profile `quitting` while the quality holds, except for a one-in-`relapse_one_in` relapse drawn on each move. A rule without `ids` takes every unlocked action; a profile whose rules find nothing makes no move. Profiles that exist for one Pack are described in that Pack's `BALANCE.md`.

`pick: max` and `pick: min` rank the rule's candidates by an integer expression `by` (a bool counts 1 or 0), draw no randomness, and take the first candidate in menu order on a tie. The expression is the [pack expression language](pack-format/expressions.md#expressions) over the player (`age`, `money`, `stat.*`, `quality.*`, `world.*`, `table.*`, readables); in a `scope: person` action `person.*` reads the target, and a candidate that lacks a target is not ranked by an expression that reads `person.*`. `by` is either one expression string, which every candidate shares (only useful with `person.*`), or a mapping from action glob to expression: the first matching glob supplies the candidate's value and an action no glob matches is not a candidate. Content ids in the expression are written in full (`pack/id`). The expressions are checked when the file is read (an unknown name, a type error or a glob that matches no action is a diagnostic).

### Adjusting another Pack's profile

A Pack may re-weight the random pick of any registered profile, including one another Pack owns, with a top-level `adjust` list in its own `harness/profiles.yaml`; this lets a Pack such as crime keep its actions rare in the core-loop `random` profile without core-loop knowing about it.

```yaml
adjust:
  - { profile: random, tags: [crime], weight: 0.05 }      # actions carrying any of these tags
  - { profile: random, ids: ["crime/mug-*"], weight: 0.5 } # or whose id matches any of these globs
```

`profile` is a registry id (unknown: a diagnostic at the entry); `tags` and/or `ids` select the actions (a tag no action carries, or a glob that matches nothing, is an error; an entry with neither is an error; with both, an action matches either); `weight` is a multiplier above 0 and up to 100. A rule whose `pick` is `random` (the default) draws among its candidates with each one weighted by the product of the multipliers of every entry that selects it, so a candidate selected by two entries gets both. Entries are merged in Pack load order, then file order, which makes the result deterministic. Multipliers apply to the random pick of actions only: `first`, `max`, `min`, `shop` rules, event choices, the amount drawn and the number of moves are unchanged. Weights are scaled to parts per 10,000 (at least 1). When no candidate in a pick is selected, the profile draws exactly as without `adjust`, so a profile nobody adjusts plays the same lives as before, and adjusting a profile changes only that profile's lives. The test fixture `packages/harness/test/fixtures/adjust` is the worked example.

| Profile | Pack | Behaviour |
|---|---|---|
| `random` | core-loop | Uniform random choices; 0-2 random eligible actions per year, repeatable ones included (and repeated) |
| `studious` | core-loop | Prefers study actions and university; accepts job offers |
| `spender` | core-loop | Buys whenever affordable, takes loans when offered |
| `idle` | core-loop | Takes no voluntary actions; answers events at random |
| `grinder` | core-loop | 12 random repeatable actions a year, to stress diminishing returns; opt-in (`--profile grinder`), not part of `all` |
| `gambler` | gambling | Bets all year at the casinos and the lottery; tries to quit once addicted |

## Forced outcomes

Rare branches are exercised by forcing them (decision 7), through Core's `setStreamOverride(age, purposeKey, counter)` seam. `apps/web` has no harness code, and the e2e production-bundle guard fails on `setStreamOverride`, `ScriptedRng`, `forceRolls` and `FORCED RUN`.

A forced roll is keyed by purpose key: a chance storylet's id (`gambling/play-slots`; `id@scope:id` for a scoped one), `outcome/<storylet id>` for the weighted outcome pick of any storylet, or `pack/<id>/<hook>/<n>` for a hook spawn. The age is the player's age when the roll is made (a year's events roll at the age reached). Values: `hit` / `miss` (chance), a pick index, an outcome `text` (exact), `int:N`; a pick must name an outcome whose weight is positive at that moment (else the life faults with the engine's message). Counters advance as without forcing, so every unforced roll of the life is unchanged. Forced rolls are not logged: a forced life is not replayable from its choice log (its `--life-seed` still is, with the same `--force`/`--script`).

- `--force [age:]key=value[,...]`: for the whole run, on any profile. `30:outcome/x=2` limits an entry to age 30. A text value cannot contain a comma here.
- `--script <pack>/<name>` (or a file path): runs `packs/<pack>/harness/force/<name>.yaml` as the profile the script names, or as the built-in `scripted` profile, which makes no voluntary move of its own. `--script` and `--profile` exclude each other; `--force` entries are added to the script's. `--list-scripts` prints the scripts, and `--check-packs` validates them.

```yaml
description: ...
profile: gambler          # optional registry profile making the voluntary moves
steps:
  - age: 1                # optional for roll and choose; required for do
    roll: base/meteor     # a purpose key
    value: hit            # hit | miss | index | int:N | outcome text | { chance, int, pick }
  - age: 31
    choose: "accept*"     # a case-insensitive glob over the labels of an open event's choices
  - age: 25
    do: gambling/play-slots   # take this action at the start of the year, when it is unlocked
    amount: min               # min (default) | max | an amount on the action's grid
```

Keys are checked against the loaded Packs when a script or `--force` is read: an unknown storylet, action or profile exits with status 2 and a `file:line` diagnostic. A step applies to every roll or open event it matches, not once. The report and `report.json` (`forced`) list every entry with the rolls forced and the lives it fired in, under a `FORCED RUN` banner; **an entry that never fired in any life is a failure** (exit status 1). Workers apply the same entries as the single thread, so the report is identical for any `--jobs`.

In vitest, `forceRolls({ "outcome/x": "hit", "30:y": 1 })` (from `@life/harness`) installs the same override while a test plays Core directly; `clear()` removes it. Packs ship examples: `packs/gambling/harness/force/bust.yaml` (every slots spin loses) and `packs/vacations/harness/force/accident.yaml` (a beach holiday ends in the travel accident).

## CI check `harness`

A hermetic flake check runs 1,000 fixed seeds split across the profiles, with `--jobs` set to the cores the sandbox grants (`NIX_BUILD_CORES`).

It **fails** on engine faults:

- an exception thrown by the Core;
- an expression runtime assertion (division by zero, overflow);
- a stuck state: an open event with no selectable choice, or a life that can no longer age up;
- a save round-trip mismatch: at random ages the world is serialized, loaded, and compared, and it must be identical.

It **reports** without failing, in `report.md` and `report.json` in the check output:

- per-storylet fire counts, with storylets that never fired and the 10 most frequent;
- per-storylet share of player decisions (`report.json` `decisions.total` and `decisions.byStorylet`: storylet id -> `{ count, share }`, share a percent to two decimals, largest first, shown as a table in `report.md`): decisions are opens of `event` storylets with choices (drawn into decision slots, person decisions included), chained steps reached only through `next` excluded. The balance rule is that no storylet exceeds 3% (`DECISION_SHARE_CAP`); over-3% rows are flagged. Counts add across shards, so a merged report has it too;
- per-storylet outcome counts (`report.json` `storylets.outcomes`): for each storylet, the times each outcome was picked, keyed `o<i>` (a storylet without choices) or `c<j>.o<i>` (outcome `i` of choice `j`), 0-based in YAML order. Counts add across shards, so a merged report has them too; ids and keys are sorted;
- events per year (mean and distribution);
- age at death (distribution) and causes of death;
- net worth at ages 18, 40, and 65;
- degree rate, employment rate, and retirement rate;
- loan defaults and repossessions;
- living standards: share of lives with parents or at each standard by decade of age, and the homeless share of years lived on their own, overall and per profile, and the living cost as a percent of income by household shape (alone, with children, with a partner sharing);
- invariant (fault `minor-living-cost`): no living cost is charged under 16, and none is charged under 18 unless the player left home with no guardian (a no-guardian minor under 16 is a fault too);
- invariant (fault `once-repeated`): a `once` storylet opens at most once per generation (`storyletLog` is cleared at each succession);
- invariant (fault `unresolved-family`): every person the player holds a family role toward (`parent`, `sibling`, `child`, `grandparent`) has a kinship id, checked each age-up;
- housing: age at moving out, share moved out and kicked out (of lives reaching 18), and share still living with their parents at 30 and 40, overall and per profile; lives put out at 16-17 and the share of those with no guardian;
- invariant (fault `animal-bound`): no `scope: person` storylet has opened for an animal (a person holding an `animal` role) unless its `target` names that role, checked each age-up;
- repeated activities: per repeatable action, uses per year lived, mean and maximum uses in a year it was used, and the share of those years past the full-effect and reduced ranges;
- stats at 100: share of living lives at the cap, per stat, by decade of age;
- wagers: for storylets tagged `wager`, plays (outcomes that changed money), net money, the stake (worst single loss) and the realised return (below 100% loses money on average);
- stat distributions by age;
- one section per Pack that declares [Pack metrics](#pack-metrics).

Balance bands that fail CI (for example a median age at death outside a range) can be added once content settles. Until then, balance findings guide authoring but never block merges.

## Determinism check (in `e2e`)

The `e2e` check runs 20 seeded lives in Node, Chromium, and WebKit with the same profile, and compares the final world hashes within the same run. Nothing is stored between runs, so content changes need no golden-file updates.
