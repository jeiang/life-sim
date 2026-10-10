# vacations glossary

Terms owned by the vacations Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Trip**:
A solo vacation or cruise, a repeatable action in the `activities/travel` submenu. The player picks one named **tier** (the price is in the label); a vacation then asks for a destination type (beach, city, mountains, theme park, abroad, abroad is 18+). Better tiers shift weight from bad events to great ones. A trip's death outcome (about 1 in 10,000) has the cause "travel accident". Under 16 only a **family trip** decision exists.
_Avoid_: Holiday (use Trip), tier (alone; say vacation tier or cruise tier)

**Vacation tier**:
One of five priced choices of `vacation-tier` (action "Take a vacation", age 16+): Backpacking $500, Budget $1,000, Standard $1,500, Luxury $2,000, Private jet $2,500. Tier 1 is the cheapest. A tier the player cannot afford is listed greyed out (`when: money >= price`), not hidden.

**Cruise tier**:
One of five priced berths of `go-on-cruise` (age 18+): Shared cabin $1,200, Inside cabin $2,400, Ocean view $3,600, Balcony suite $4,800, Royal suite $6,000. It chains to `cruise-voyage`.

**vac_tier**:
Quality 0..5 (default 0), set by the tier choice and read by the chained `vacation-destination` or `cruise-voyage` for its odds and gains. It carries the tier through `next`; the chained step also keeps the action's repeat factor, so gains follow the core-loop repeat curve (full to 3 uses a year, a quarter to 8, then none) while the price and bad events stay full.

**Family trip**:
A decision event for children aged 6-17 who live with a living parent (`family-trip`); going along sets `vac_family_trip_age`, and `family-trip-bond` then raises closeness with each living parent in the same year.
