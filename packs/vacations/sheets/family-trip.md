# Content sheet: Family trip and bond

- pack: vacations
- packs: core-loop, vacations
- profile: all
- lives: 3000

> Chains C5 (`family-trip`) and C6 (`family-trip-bond`), kept at v1 behaviour from `packs/vacations/storylets/trips.yaml`. Prose and weights are v1's.
> The death outcome does not set `quality.vac_family_trip_age`, as in v1 (`vacations.test.ts` asserts the marker stays 0 after a fatal trip). The outline's "every outcome sets the marker" is not followed; stay home and the death outcome leave it unset.
> `opens` bands: measured with `pnpm harness --lives 3000 --profile all --seed 20260101` on the v1 pack (`storylets.fired`): `vacations/family-trip` 1993 fires (0.66 per life), `vacations/family-trip-bond` 2002 (0.67 per life). Widened about 20% to 0.55..0.8. The fire count is the whole game's `storylets.fired`, not a focused sim. `[INFERENCE]` for the band width.
> `family-trip-bond` fires once per bound parent per family-trip year, so its opens track `family-trip`'s opens times the parent count.
> Outcome rates are the exact weight shares (sum 10000 for the Go along choice).

## family-trip
- trigger: event
- icon: 🚗
- weight: 6
- when: age >= 6 and age <= 17 and living.with_parents and count_role(core-loop/parent, 0, 100) >= 1
- cooldown: 2
- text: The family is planning a trip away this year.
- opens: 0.55..0.8 per life

### choice: Go along
- outcome: 3500
  - text: A great trip: games in the car, ice cream and plenty of laughs.
  - effect: quality.vac_family_trip_age = age
  - effect: stat.happiness += 8
  - effect: journal("Went on a family trip at age {age}.")
  - rate: 35..35%
- outcome: 4500
  - text: A nice few days away together.
  - effect: quality.vac_family_trip_age = age
  - effect: stat.happiness += 4
  - rate: 45..45%
- outcome: 800
  - text: Car sickness and a stomach bug ruin half the trip.
  - effect: quality.vac_family_trip_age = age
  - effect: stat.health -= 3
  - effect: stat.happiness -= 1
  - rate: 8..8%
- outcome: 700
  - text: Everyone is tired and cranky, and the trip ends in arguments.
  - effect: quality.vac_family_trip_age = age
  - effect: stat.happiness -= 4
  - rate: 7..7%
- outcome: 499
  - text: A bag with your pocket money goes missing on the way.
  - effect: quality.vac_family_trip_age = age
  - effect: money -= min(money, 3000)
  - effect: stat.happiness -= 1
  - rate: 4.99..4.99%
- outcome: 1
  - text: An accident on the road ends the trip.
  - effect: journal("Died in a road accident on a family trip at age {age}.")
  - effect: die("travel accident")
  - rate: 0.01..0.01%

### choice: Stay home
- outcome: 1
  - text: You stay home while everyone else goes. The house is quiet.
  - effect: stat.happiness -= 1
  - rate: 100..100%

## family-trip-bond
- trigger: event
- icon: 👨‍👩‍👧
- scope: person
- target: core-loop/parent
- chance: 100%
- when: quality.vac_family_trip_age == age and age >= 6 and age <= 17
- text: The trip with {person.first_name} {person.last_name} brings you closer.
- opens: 0.55..0.8 per life

### outcomes
- outcome: 1
  - text: You come home from the trip feeling closer.
  - effect: relationship(person).closeness += 8
  - effect: journal("Grew closer to {person.first_name} {person.last_name} on a family trip at age {age}.")
  - rate: 100..100%
