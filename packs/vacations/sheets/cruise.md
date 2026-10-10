# Content sheet: Cruises (vacations v2, C3 and C4)

- pack: vacations
- packs: vacations,core-loop
- profile: random
- lives: 3000

> Chains C3 `cruise-tier` and C4 `cruise-voyage` of the vacations pack v2 (issue #238, outline `vacations/OUTLINE.md`). The player picks one of five named cruise berths from the travel menu. The pick charges its price, sets `quality.vac_tier` (1 cheapest to 5 dearest) and chains into the voyage event.
> Cost is charged once, at the berth choice (C3), as the outline says. The archive draft charged it inside each C4 outcome. Both give the same total spend, because every C4 outcome paid the price exactly once. Do not charge it again in C4.
> Unaffordable berths show greyed out (`when: money >= price`, GAP 1). The menu action itself is locked below $1,200 (`money >= 120000`).
> Repeat curve is the core-loop one, `{ full: 3, reduced: 8, factor: 25% }` (GAP 2). It is written out on C3 because the manifest default is 10 and 20. C4 has no repeat fields. Its gains shrink through the chain, because `next` keeps the repeat factor.
> Odds: C4 weights are `1500 + 500 * tier` for great, `4000` good, `1499` fine, and `base * (6 - tier)` for the four bad outcomes (base 150, 100, 150, 100, from v1), plus death `1`. Every tier sums to 10,000. The rate bands are the spread across tiers 1 to 5, so they are bands and not single values.
> `opens` is measured under `profile: random`, the only profile that opens the travel menu. The archive BALANCE measured cruises at 0.14 to 0.21 per tier per life, five tiers, so about 0.7 to 1.05 per life. C4 opens once per C3 pick, so it carries the same band. Under the default `all` profile these numbers would be about a quarter of that.
> `quality.vac_tier` is declared once, in `qualities/vacations.yaml` (shared with C1 and C2). It is listed here because this sheet writes and reads it.

## go-on-cruise
- trigger: action
- menu: activities/travel
- label: Go on a cruise
- icon: 🚢
- tags: activity, travel, spend-time, money
- when: age >= 18 and money >= 120000
- repeatable: true
- repeat.full: 3
- repeat.reduced: 8
- repeat.factor: 25%
- text: You pack for the open sea. Which berth?
- opens: 0.65..1.1 per life
- needs: quality vac_tier: integer 0..5, default 0: tier of the trip picked, 1 cheapest to 5 dearest; written by the berth choice here and read by the chained voyage step (C4) and by the vacation destination weights (C2)

### choice: Shared cabin ($1,200)
- when: money >= 120000
- outcome: 1
  - text: You take the cheapest berth on board, next to the laundry chute.
  - effect: money -= 120000
  - effect: quality.vac_tier = 1
  - next: cruise-voyage
  - rate: 100..100%

### choice: Inside cabin ($2,400)
- when: money >= 240000
- outcome: 1
  - text: A windowless box with a bunk, a fan and a very good view of the corridor.
  - effect: money -= 240000
  - effect: quality.vac_tier = 2
  - next: cruise-voyage
  - rate: 100..100%

### choice: Ocean view ($3,600)
- when: money >= 360000
- outcome: 1
  - text: A porthole with a view. You spend most of the trip staring out of it.
  - effect: money -= 360000
  - effect: quality.vac_tier = 3
  - next: cruise-voyage
  - rate: 100..100%

### choice: Balcony suite ($4,800)
- when: money >= 480000
- outcome: 1
  - text: A suite with a balcony, and a waiter who knows your name by lunch.
  - effect: money -= 480000
  - effect: quality.vac_tier = 4
  - next: cruise-voyage
  - rate: 100..100%

### choice: Royal suite ($6,000)
- when: money >= 600000
- outcome: 1
  - text: The best suite on the ship, with a butler who asks what you need before you do.
  - effect: money -= 600000
  - effect: quality.vac_tier = 5
  - next: cruise-voyage
  - rate: 100..100%

## cruise-voyage
- trigger: event
- icon: 🌊
- chance: 0%
- text: The horn sounds and the ship slides out past the breakwater.
- opens: 0.65..1.1 per life

### outcomes
- outcome: 1500 + 500 * quality.vac_tier
  - text: Warm decks, new ports and nothing to do but enjoy it. The best week of the year.
  - effect: stat.happiness += 8 + 3 * quality.vac_tier
  - effect: stat.health += 2
  - effect: journal("Enjoyed a cruise at age {age}.")
  - rate: 20..40%
- outcome: 4000
  - text: A smooth crossing with good food and better company.
  - effect: stat.happiness += 4 + quality.vac_tier
  - rate: 40..40%
- outcome: 1499
  - text: The cabin is small and the entertainment is dull, but the sea air helps.
  - effect: stat.happiness += 1
  - rate: 14.99..14.99%
- outcome: 150 * (6 - quality.vac_tier)
  - text: Rough seas leave you queasy for days, and the buffet never quite recovers.
  - effect: stat.health -= 4
  - effect: stat.happiness -= 2
  - rate: 1.5..7.5%
- outcome: 100 * (6 - quality.vac_tier)
  - text: A stomach bug sweeps the ship, and you are first in line to catch it.
  - effect: stat.health -= 6
  - effect: journal("Caught a stomach bug on a cruise at age {age}.")
  - rate: 1..5%
- outcome: 150 * (6 - quality.vac_tier)
  - text: Shore excursions and onboard extras cost far more than the brochure said.
  - effect: money -= min(money, quality.vac_tier * 120000 / 3)
  - effect: stat.happiness -= 2
  - rate: 1.5..7.5%
- outcome: 100 * (6 - quality.vac_tier)
  - text: Bad weather cancels every port, and the ship just circles for a week.
  - effect: stat.happiness -= 5
  - rate: 1..5%
- outcome: 1
  - text: You go overboard in the night and are not found in time.
  - effect: journal("Was lost at sea on a cruise at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%
