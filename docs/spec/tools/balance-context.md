# `pnpm tool balance-context`

Decided in the restructure (decision 14, issue #205). Condenses a harness `report.json` into the numbers a balance reviewer needs, so a reviewer (human or agent) reads under 40 lines instead of the full report.

```
pnpm tool balance-context <report.json> [--pack id]
```

Exit 0 on success, 1 when the file cannot be read or `--pack` names a Pack with no data in the report, 2 on a usage error. The output is deterministic plain text.

## Global lines

| Line | Source in `report.json` |
|---|---|
| lives, engine faults | `lives`, `faults.total` |
| death age median, p10, p90 | `death.age` |
| net worth median at 40 and 65, major units | `netWorth.40/65.p50` |
| employment share (person-years aged 25-64) | `rates.employment` |
| decision slots: years with at least 1 / 2 / 3 decisions, against the 90 / 50 / 30 targets | `decisions.atLeast1/2/3` |
| yearly cap hits: chance hits dropped by the yearly cap, summed over Packs, and as a percent of age-ups | `capDrops`, `eventsPerYear.years` |
| top storylet and its share of all fires | `storylets.top10[0]`, sum of `storylets.fired` |
| storylets never fired, of the total | `storylets.neverFired`, `storylets.total` |

Where these overlap `.github/scripts/harness-summary.mjs` (median and p10/p90 death age, net worth at 40 and 65, employment rate, never-fired count) the numbers are the same; a test compares them. That script stays until #212.

## Packs

Without `--pack`, one line per Pack that declares metrics or has cap drops: the metric count and cap drops, and the `--pack` to ask for more.

With `--pack <id>`: the Pack's chance hits dropped by the yearly cap, then one line per metric the Pack declares (`packMetrics.<id>.stats`). Only the all-lives rows print (profile splits stay in `report.md`); a metric split by age or action id prints its first 4 rows then `(+N more)`. Percent metrics print with `%`, money in major units, distributions as their median.
