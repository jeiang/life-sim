# Content sheet: Vacation tiers and destinations

- pack: vacations
- packs: core-loop, vacations
- profile: all
- lives: 1000

> Chains C1 and C2 of the vacations v2 outline (issue #238). C1 `vacation-tier` is the repeatable menu action. It charges the tier price, sets `quality.vac_tier` and chains to C2 `vacation-destination`.
> The trip is paid once, in C1. C2 charges no trip price; its bad money losses scale with the tier price, as in v1.
> No repeat fields here: the repeat curve stays core-loop's 3/8 (GAPS-RESOLVED decision 2). Chained gains shrink with the action's repeat factor (storylets spec, gains rule).
> Choices with a failed `when` are shown greyed out, not hidden (GAPS-RESOLVED decision 1).
> Destination outcome weights sum to 10,000 at every tier: great is 1500 + 500 x tier, the fine and good outcomes are 4000 and 1499, death is 1, and the three bad events are 500 x (6 - tier) in total. Rate bands span tiers 1 to 5; tier 0 is never reached in play.
> Tier names and prices are from GAPS-RESOLVED decision 7.

## vacation-tier
- trigger: action
- icon: 🧳
- menu: activities/travel
- label: Take a vacation
- tags: activity, travel, spend-time, money
- when: age >= 16 and money >= 50000
- repeatable: true
- needs: quality vac_tier: integer 0..5, default 0: tier of the trip just booked (1 cheapest, 5 dearest), set by the tier choice and read by the destination weights
- text: Time to get away. How much do you want to spend?
- opens: 0.6..1.0 per life

### choice: Backpacking ($500)
- when: money >= 50000
- outcome: 1
  - text: You pack light and hunt for deals.
  - effect: money -= 50000
  - effect: quality.vac_tier = 1
  - next: vacation-destination
  - rate: 100..100%

### choice: Budget ($1,000)
- when: money >= 100000
- outcome: 1
  - text: You book somewhere sensible.
  - effect: money -= 100000
  - effect: quality.vac_tier = 2
  - next: vacation-destination
  - rate: 100..100%

### choice: Standard ($1,500)
- when: money >= 150000
- outcome: 1
  - text: You book a comfortable trip.
  - effect: money -= 150000
  - effect: quality.vac_tier = 3
  - next: vacation-destination
  - rate: 100..100%

### choice: Luxury ($2,000)
- when: money >= 200000
- outcome: 1
  - text: You book somewhere special.
  - effect: money -= 200000
  - effect: quality.vac_tier = 4
  - next: vacation-destination
  - rate: 100..100%

### choice: Private jet ($2,500)
- when: money >= 250000
- outcome: 1
  - text: You charter a plane and decide not to look at the bill.
  - effect: money -= 250000
  - effect: quality.vac_tier = 5
  - next: vacation-destination
  - rate: 100..100%

## vacation-destination
- trigger: event
- icon: 🌍
- chance: 0%
- tags: travel
- text: Where to?
- opens: 0.6..1.0 per life

### choice: Beach
- outcome: 1500 + 500 * quality.vac_tier
  - text: Sun, sand and a week you will talk about for years.
  - effect: stat.happiness += 6 + 2 * quality.vac_tier
  - effect: stat.health += 2
  - effect: journal("Took a great trip to the beach at age {age}.")
  - rate: 20..40%
- outcome: 4000
  - text: A relaxing week by the sea.
  - effect: stat.happiness += 3 + quality.vac_tier
  - rate: 40..40%
- outcome: 1499
  - text: The beach is crowded and the hotel is average, but it is still a break.
  - effect: stat.happiness += 1
  - rate: 14.99..14.99%
- outcome: 200 * (6 - quality.vac_tier)
  - text: You fall asleep in the sun and burn badly.
  - effect: stat.health -= 4
  - effect: stat.happiness -= 2
  - rate: 2..10%
- outcome: 150 * (6 - quality.vac_tier)
  - text: It rains all week and the beach stays empty.
  - effect: stat.happiness -= 5
  - rate: 1.5..7.5%
- outcome: 150 * (6 - quality.vac_tier)
  - text: A bag goes missing from the sand, along with some cash.
  - effect: money -= min(money, quality.vac_tier * 50000 / 4)
  - effect: stat.happiness -= 2
  - effect: journal("Had a bag stolen at the beach at age {age}.")
  - rate: 1.5..7.5%
- outcome: 1
  - text: A rip current drags you out too far, and the lifeguards reach you too late.
  - effect: journal("Drowned on a beach holiday at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%

### choice: City break
- outcome: 1500 + 500 * quality.vac_tier
  - text: Museums, markets and late dinners: a city break packed with memories.
  - effect: stat.happiness += 6 + 2 * quality.vac_tier
  - effect: stat.smarts += 2
  - effect: journal("Took a great trip to the city at age {age}.")
  - rate: 20..40%
- outcome: 4000
  - text: A pleasant few days of sightseeing and good food.
  - effect: stat.happiness += 3 + quality.vac_tier
  - rate: 40..40%
- outcome: 1499
  - text: Long queues and tired feet, but the city has its moments.
  - effect: stat.happiness += 1
  - rate: 14.99..14.99%
- outcome: 250 * (6 - quality.vac_tier)
  - text: A pickpocket lifts your wallet on a crowded street.
  - effect: money -= min(money, quality.vac_tier * 50000 / 2)
  - effect: stat.happiness -= 3
  - effect: journal("Was pickpocketed on a city break at age {age}.")
  - rate: 2.5..12.5%
- outcome: 150 * (6 - quality.vac_tier)
  - text: The hotel is noisy and the whole break is overpriced.
  - effect: stat.happiness -= 4
  - rate: 1.5..7.5%
- outcome: 100 * (6 - quality.vac_tier)
  - text: You walk yourself into the ground and catch a cold.
  - effect: stat.health -= 3
  - rate: 1..5%
- outcome: 1
  - text: Crossing a busy junction in an unfamiliar city, you are hit by a car.
  - effect: journal("Died in a road accident on a city break at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%

### choice: Mountains
- outcome: 1500 + 500 * quality.vac_tier
  - text: Clear air and wide views on a mountain trip.
  - effect: stat.happiness += 6 + 2 * quality.vac_tier
  - effect: stat.health += 2
  - effect: stat.looks += 1
  - effect: journal("Took a great trip to the mountains at age {age}.")
  - rate: 20..40%
- outcome: 4000
  - text: A good week of hiking and early nights.
  - effect: stat.happiness += 3 + quality.vac_tier
  - rate: 40..40%
- outcome: 1499
  - text: The trails are muddy and the cabin is cold, but the air does you good.
  - effect: stat.happiness += 1
  - rate: 14.99..14.99%
- outcome: 250 * (6 - quality.vac_tier)
  - text: You twist an ankle on a loose trail.
  - effect: stat.health -= 6
  - effect: stat.happiness -= 2
  - effect: journal("Hurt an ankle on a mountain trip at age {age}.")
  - rate: 2.5..12.5%
- outcome: 150 * (6 - quality.vac_tier)
  - text: Cloud closes in and the views never appear.
  - effect: stat.happiness -= 5
  - rate: 1.5..7.5%
- outcome: 100 * (6 - quality.vac_tier)
  - text: A hired gear set breaks and you pay for the repairs.
  - effect: money -= min(money, quality.vac_tier * 50000 / 3)
  - effect: stat.happiness -= 1
  - rate: 1..5%
- outcome: 1
  - text: A path gives way on a steep slope.
  - effect: journal("Died in a fall on a mountain trip at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%

### choice: Theme park
- outcome: 1500 + 500 * quality.vac_tier
  - text: Rides, fireworks and a trip you wish would never end.
  - effect: stat.happiness += 6 + 2 * quality.vac_tier
  - effect: journal("Took a great trip to the theme park at age {age}.")
  - rate: 20..40%
- outcome: 4000
  - text: A fun few days of rides and sugary snacks.
  - effect: stat.happiness += 3 + quality.vac_tier
  - rate: 40..40%
- outcome: 1499
  - text: The lines are long, but the roller coasters still make you scream.
  - effect: stat.happiness += 1
  - rate: 14.99..14.99%
- outcome: 100 * (6 - quality.vac_tier)
  - text: A spinning ride and a big lunch do not mix.
  - effect: stat.health -= 3
  - effect: stat.happiness -= 1
  - rate: 1..5%
- outcome: 200 * (6 - quality.vac_tier)
  - text: You spend most of the trip standing in queues.
  - effect: stat.happiness -= 4
  - rate: 2..10%
- outcome: 200 * (6 - quality.vac_tier)
  - text: Food, souvenirs and photo passes empty your wallet.
  - effect: money -= min(money, quality.vac_tier * 50000 / 3)
  - effect: stat.happiness -= 1
  - rate: 2..10%
- outcome: 1
  - text: A ride malfunctions.
  - effect: journal("Died in an accident at a theme park at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%

### choice: Abroad
- when: age >= 18
- outcome: 1500 + 500 * quality.vac_tier
  - text: New language, new food and a trip abroad that changes how you see things.
  - effect: stat.happiness += 6 + 2 * quality.vac_tier
  - effect: stat.smarts += 2
  - effect: journal("Took a great trip overseas at age {age}.")
  - rate: 20..40%
- outcome: 4000
  - text: A rewarding trip to somewhere you have never been.
  - effect: stat.happiness += 3 + quality.vac_tier
  - rate: 40..40%
- outcome: 1499
  - text: Jet lag and confusing signs, but you tick another country off the list.
  - effect: stat.happiness += 1
  - rate: 14.99..14.99%
- outcome: 150 * (6 - quality.vac_tier)
  - text: Something you ate does not agree with you.
  - effect: stat.health -= 5
  - effect: journal("Got ill while travelling abroad at age {age}.")
  - rate: 1.5..7.5%
- outcome: 150 * (6 - quality.vac_tier)
  - text: Flights are cancelled and the luggage is lost.
  - effect: stat.happiness -= 5
  - rate: 1.5..7.5%
- outcome: 200 * (6 - quality.vac_tier)
  - text: A scam at a tourist spot costs you far more than it should.
  - effect: money -= min(money, quality.vac_tier * 50000 / 2)
  - effect: stat.happiness -= 3
  - effect: journal("Was scammed while travelling abroad at age {age}.")
  - rate: 2..10%
- outcome: 1
  - text: A road accident far from home.
  - effect: journal("Died in an accident while travelling abroad at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%
