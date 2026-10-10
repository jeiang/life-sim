# `pnpm tool pack-delta`

Decided in the restructure (decision 14, issue #204). Shows what a change did to the harness numbers, so a Pack author sees the effect on other Packs without reading two reports.

```
pnpm tool pack-delta <base-report.json> <new-report.json> [--pack id] [--format md|json]
  [--rate-threshold pct] [--min-rate n] [--share-threshold pp] [--metric-threshold pct] [--fail-on-breach]
```

Inputs are `report.json` files from `pnpm harness` (or `harness merge`). Compare runs with the same seed, lives and profiles; the tool divides by each report's own `lives`, so different sizes still compare as rates.

## What is compared

- **Fire rate**: `storylets.fired[id] / lives`, grouped by the Pack in the id (`pack/name`). A storylet that appears or disappears is listed (base or new `-`).
- **Outcome shares**: the share of finished lives per cause of death (`death.causes / death.ended`, percent). The report keeps no per-outcome counts for storylets, so causes of death are the outcome shares.
- **Pack metrics**: every number in `packMetrics.<pack>.stats.<id>.rows`, keyed `<stat id>[group/age/key]`; a distribution contributes `.mean` and `.p50`, a median its value.

Only things that changed are listed; a Pack with no change has no section.

## Thresholds

A change is **flagged** (`**FLAG**` in markdown, `flagged: true` in json) when:

| Number | Flagged when | Option (default) |
|---|---|---|
| fire rate | relative change >= pct and absolute change >= `min-rate` fires per life | `--rate-threshold` (10), `--min-rate` (0.001) |
| outcome share | absolute change >= points | `--share-threshold` (2) |
| Pack metric | relative change >= pct | `--metric-threshold` (10) |

A zero or absent base has no relative change (`new/zero base`) and is flagged whenever the absolute minimum is met (metrics: whenever it changed).

## Output and exit status

`md` (default): `# Pack delta`, a summary line with lives and the flagged count, one `##` per Pack with `### Fire rate per life` and `### Pack metrics` tables, then `## Outcome shares`. `json`: the `Delta` object exported by `tools/pack-delta.ts` (`baseLives`, `newLives`, `thresholds`, `packs[{pack, fireRates[], metrics[]}]`, `outcomes[]`, `flagged`; each change is `{key, base, next, delta, pct, flagged}`), 2-space indented. Output is deterministic (sorted by Pack, then key).

Exit 0 normally; 1 when `--fail-on-breach` is given and anything is flagged; 2 on a usage error or an unreadable report.
