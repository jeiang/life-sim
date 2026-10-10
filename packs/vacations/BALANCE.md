# vacations balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives N --profile all --seed 20260101 --out <dir>`. The report has a **Vacations** section when this Pack is loaded.

## Design numbers

- `activities/travel` holds two repeatable actions with five named, priced tier choices each (issue #238). **Vacation** (age 16+): Backpacking $500, Budget $1,000, Standard $1,500, Luxury $2,000, Private jet $2,500, then a destination (beach, city, mountains, theme park, abroad 18+). **Cruise** (age 18+): Shared cabin $1,200, Inside cabin $2,400, Ocean view $3,600, Balcony suite $4,800, Royal suite $6,000. The price is charged once at the tier choice; a tier the player cannot afford is greyed out (`when: money >= price`); the action locks below the cheapest price. Missed loan payments do not block a trip.
- The tier choice sets `quality.vac_tier` (1-5) and chains with `next` to `vacation-destination` / `cruise-voyage`, which read it.
- Every chained step's outcome weights sum to 10,000 at every tier: great `1500 + 500 x tier`, good 4000, fine 1499, bad events `base x (6 - tier)` (500 in total at the base, so 25% at tier 1 down to 5% at tier 5) and one death outcome at weight 1 (1 in 10,000 trips, cause "travel accident").
- Gains: vacation great `+6 + 2 x tier` happiness (good `+3 + tier`, fine +1); cruise great `+8 + 3 x tier` (good `+4 + tier`). Destinations add a small stat bonus on great trips and tilt the bad-event pool.
- Repeating uses the core-loop curve (3 full uses a year, a quarter to 8, then none), written on `go-on-cruise` and inherited by `vacation-tier`; the chained step keeps the action's repeat factor through `next`, so gains shrink while the price and every bad event stay full.
- Family trip (ages 6-17, living with a living parent, weight 6, cooldown 2 years): `+8 / +4` happiness on a good trip, bad outcomes cost health, happiness or up to $30 pocket money, 1 in 10,000 death; every parent then gains 8 closeness through `family-trip-bond`.

## Targets

| Metric | Target | Notes |
|---|---|---|
| Faults | 0 | blocking |
| Travel deaths | about 1 per 10,000 trips | too rare to see below ~10,000 trips; checked by the weight-sum unit test |
| Spend share of earnings | `random` under 2% of gross earnings | `random` makes 0-2 moves a year over every menu, so its trips are rare |
| Trips by tier | every tier used; no tier more than twice another | `random` picks uniformly among the enabled tier choices |
| Net worth of travellers | no collapse: travellers' median at 65 within the same order as non-travellers of the same profile | the non-traveller group is confounded (they are mostly lives that never acted or died young) |
| Never-fired storylets | none | |
| Decisions | at least 1 / 2 / 3 per year stay within 3 points of 90 / 50 / 30% | `family-trip` joins the decision pool at weight 6 |

## Results

Artemis, 10,000 lives, seed 20260101, branch `build/vacations` against `main` (same seed), 0 faults, never fired: none, decisions at least 1 / 2 / 3 in 89.9 / 49.4 / 28.4% of years:

- `random` (2,000 lives): 68.7% take a trip, 1.546 trips per life (main: 0.1471 + 0.1567 = 0.304 per life over all profiles, 0.309 now). Per tier (random, per life): vacation 0.162 / 0.143 / 0.147 / 0.152 / 0.146, cruise 0.181 / 0.151 / 0.151 / 0.160 / 0.155; no tier more than 1.3 times another. Money change per life from trips -$3,981, **0.31% of gross earnings** (main 0.30%; the new `spent` is a money delta and includes bad money events). Other profiles never open the travel menu.
- Travel deaths: none in about 3,000 trips (expected 0.3).
- Net worth, `random` travellers against non-travellers: median $76.9k against $0.4k at 40, $344k against $130k at 65 (selection, as before).
- Per-tier counts come from `report.json` outcome counts of the tier choices (metrics `outcome:` measures).
- Focused sim (`pnpm tool focused-sim`) flags only the 0.01% death outcomes (too rare to observe in a 15 s run; checked by the weight-sum test) and low-count outcome bands from short runs.

## Harness

- Report section **Vacations**, declared in `harness/metrics.yaml` (shown when a trip was taken): per profile, travellers, trips per life, trips by named tier (vacation and cruise), money change per life from trips and as a share of gross earnings (negative is spend), travel deaths and deaths per 10,000 trips, and median net worth at 40 and 65 of travellers against non-travellers.
