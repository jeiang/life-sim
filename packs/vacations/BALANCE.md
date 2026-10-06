# vacations balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives N --profile all --seed 20260101 --out <dir>`. The report has a **Vacations** section when this Pack is loaded.

## Design numbers

- `activities/travel` holds two repeatable actions. The amount picker is the price tier: five steps, so a trip costs 1-5 times the tier price. **Vacation** (age 16+): $500 per step ($500-$2,500). **Cruise** (age 18+): $1,200 per step ($1,200-$6,000). Only affordable tiers are offered; missed loan payments do not block a trip.
- Every trip's outcome weights sum to 10,000 at every tier: great `1500 + 500 x tier`, good 4000, fine 1499, bad events `base x (6 - tier)` (500 in total at the base, so 25% at tier 1 down to 5% at tier 5) and one death outcome at weight 1 (1 in 10,000 trips, cause "travel accident").
- Gains: vacation great `+6 + 2 x tier` happiness (good `+3 + tier`, fine +1); cruise great `+8 + 3 x tier` (good `+4 + tier`). Destinations add a small stat bonus on great trips (beach and mountains health, city and abroad smarts) and tilt the bad-event pool (health, happiness, or money lost, never below zero cash).
- Repeating uses the default curve (full to 10 uses a year, a quarter to 20, then none); the cost and every bad event stay full.
- Family trip (ages 6-17, living with a living parent, weight 6, cooldown 2 years): `+8 / +4` happiness on a good trip, bad outcomes cost health, happiness or up to $30 pocket money, 1 in 10,000 death; every parent then gains 8 closeness through `family-trip-bond` (per-parent event, same year).

## Targets

| Metric | Target | Notes |
|---|---|---|
| Faults | 0 | blocking |
| Travel deaths | about 1 per 10,000 trips | too rare to see below ~10,000 trips; checked by the weight-sum unit test |
| Spend share of earnings | `random` under 2% of gross earnings | `random` makes 0-2 moves a year over every menu, so its trips are rare |
| Trips by tier | every tier used; no tier more than twice another | the picker draws tiers uniformly |
| Net worth of travellers | no collapse: travellers' median at 65 within the same order as non-travellers of the same profile | the non-traveller group is confounded (they are mostly lives that never acted or died young) |
| Never-fired storylets | none | |
| Decisions | at least 1 / 2 / 3 per year stay within 3 points of 90 / 50 / 30% | `family-trip` joins the decision pool at weight 6 |

## Results

10,000 lives, seed 20260101, `--jobs 4`, 0 faults, median age at death 73, 242 of 242 storylets fired, decisions at least 1 / 2 / 3 in 89.9 / 49.9 / 29.7% of years, 0.2% empty slots:

- `random` (2,500 lives): 72% take at least one trip, 1.64 trips per life (vacations 0.15-0.17 per life per tier, cruises 0.15-0.19), no tier more than 1.3 times another. Spending $4,043 per life, **0.28% of gross earnings** (all profiles: 0.06%). The other profiles never open the travel menu.
- Travel deaths: none in about 4,100 trips (expected 0.4). The 1-in-10,000 rate is fixed by the weights, which a unit test checks at every tier.
- Net worth, `random` travellers against non-travellers: median $96k against $5k at 40 and $435k against $171k at 65. Trips do not cost wealth at the scale `random` plays them; the gap is selection (non-travellers die young, or never had $500).
