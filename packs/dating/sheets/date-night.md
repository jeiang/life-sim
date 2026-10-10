# Content sheet: Date night and time with a child

- pack: dating
- packs: dating
- profile: random
- lives: 1000

> Two repeatable, person-scoped actions in the relationships menu. `target` is the gate: the UI offers the action only for a person who holds one of the listed roles, so neither storylet needs a `count_role` in `when`.
> Repeat curve: both inherit the core-loop manifest `repeat` (full 3, reduced 8, factor 25%). Only positive `stat` and `closeness` gains shrink with use; the negative outcomes never do.
> Spouse: marriage replaces the partner role with `core-loop/spouse`, so date night lists both roles or a married couple could never go out again.
> Overlap: core-loop `spend-time-with-loved-ones` is already repeatable and reaches any person, children included. `spend-time-with-child` sits beside it. Main decides whether to merge the two.
> `opens` bands are estimates from the harness `random` profile (0 to 2 uniform picks a year among the eligible actions) and are [INFERENCE] until a measured run exists.

## date-night
- trigger: action
- menu: relationships
- label: Date night
- icon: 🍷
- scope: person
- target: core-loop/partner, core-loop/spouse
- tags: relationship, spend-time
- repeatable: true
- text: You book a table for two with {person.first_name}.
- opens: 0.1..0.5 per life

### outcomes
- outcome: 60
  - text: Candles, a good bottle of wine, and a conversation that runs long past dessert.
  - effect: stat.happiness += 4
  - effect: relationship(person).closeness += 6
  - effect: journal("Date night with {person.first_name} at age {age}.")
  - rate: 55..65%
- outcome: 30
  - text: Dinner is fine and the film is worse. You still hold hands on the walk home.
  - effect: stat.happiness += 2
  - effect: relationship(person).closeness += 3
  - rate: 25..35%
- outcome: 10
  - text: You both spend most of the night glancing at your phones.
  - effect: stat.happiness -= 2
  - effect: relationship(person).closeness += -3
  - rate: 5..15%

## spend-time-with-child
- trigger: action
- menu: relationships
- label: Spend time with your kid
- icon: 🧸
- scope: person
- target: core-loop/child
- tags: family, relationship, spend-time
- repeatable: true
- text: You clear the evening for {person.first_name}.
- opens: 0.1..0.5 per life

### outcomes
- outcome: 50
  - text: You spend the afternoon at the park, and {person.first_name} talks nonstop the whole way home.
  - effect: stat.happiness += 4
  - effect: relationship(person).closeness += 6
  - effect: journal("Spent the afternoon with {person.first_name} at age {age}.")
  - rate: 45..55%
- outcome: 30
  - text: A quiet night of board games, takeout, and one more chapter before bed.
  - effect: stat.happiness += 3
  - effect: relationship(person).closeness += 4
  - rate: 25..35%
- outcome: 20
  - text: It turns into an argument about bedtime, and you both go to sleep annoyed.
  - effect: stat.happiness -= 2
  - effect: relationship(person).closeness += -2
  - rate: 15..25%
