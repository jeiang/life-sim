# Content sheet: Affairs (both ways)

- pack: dating
- packs: dating
- profile: unfaithful
- lives: 3000

> Chain 5 (issue #239). Affairs run both ways, with a risk of being caught.
> Player side: an action from the relationships menu, at most 3 a life. Got-away affairs schedule a later discovery, which is itself a roll (75% nothing comes of it).
> Partner side: a hidden NPC-pass cheat. The player finds out through a chance decision and chooses to forgive or walk away.
> `dating_cheated` is written on the partner (person quality), not on the relationship: vocab has no relationship quality. `dating_affair` is a player quality, a tally of affairs this life.
> A non-spouse partner who ends things becomes `dating/ex` (chain 8 declares it), via `relationship(person).role = dating/ex`, the only closed role write (no unset). A spouse who is caught or walks away chains into `divorce-forced` (chain 8, chance 0%, reached only by next) so the cash split and prenup apply. Spouse and partner outcomes are gated on `count_role(core-loop/spouse, 0, 100) > 0`.
> `opens` bands are design estimates for a typical life, to be measured on the focused sim.

## affair-cheat
- trigger: action
- menu: relationships
- label: Start a secret affair
- icon: 😏
- scope: person
- target: core-loop/partner, core-loop/spouse
- tags: relationship
- when: (age < 18) == (person.age < 18)
- cooldown: 3
- max_per_life: 3
- text: Someone new has caught your eye, and {person.first_name} is none the wiser.
- opens: 0.2..0.8 per life
- needs: quality dating_affair: int 0..9, default 0: how many affairs the player has had this life

### outcomes
- outcome: 80
  - text: Your secret stays hidden for now. Every late text is a small risk.
  - effect: stat.happiness += 4
  - effect: quality.dating_affair += 1
  - effect: schedule(dating/affair-found-out, after: 1-4 years, person)
  - rate: 78..82%
- outcome: 20
  - text: A text lights up the wrong screen, and the whole thing blows up right there.
  - effect: quality.dating_affair += 1
  - next: affair-caught
  - rate: 18..22%

## affair-found-out
- trigger: event
- icon: 📱
- chance: 0%
- scope: person
- target: core-loop/partner, core-loop/spouse
- tags: relationship
- text: {person.first_name} has started asking where you were on certain nights.
- opens: 0.1..0.4 per life

### outcomes
- outcome: 25
  - text: You are found out. {person.first_name} is hurt and not ready to hear your side.
  - next: affair-caught
  - rate: 24..26%
- outcome: 75
  - text: Whatever {person.first_name} suspected fades, and nothing more comes of it.
  - rate: 74..76%

## affair-caught
- trigger: event
- icon: 💔
- chance: 0%
- scope: person
- tags: relationship
- text: The fight goes on well past midnight, and {person.first_name} wants you gone.
- opens: 0.05..0.25 per life

### outcomes
- outcome: 1
  - when: count_role(core-loop/spouse, 0, 100) == 0
  - text: It is over. You are no longer a couple, and {person.first_name} makes sure you know it.
  - effect: relationship(person).role = dating/ex
  - effect: relationship(person).closeness += -30
  - effect: stat.happiness -= 10
  - effect: journal("You were caught cheating, and the relationship ended.")
  - rate: 100..100%
- outcome: 1
  - when: count_role(core-loop/spouse, 0, 100) > 0
  - text: {person.first_name} is done with the marriage and calls the lawyers the next morning.
  - effect: relationship(person).closeness += -30
  - effect: stat.happiness -= 10
  - effect: journal("You were caught cheating on your spouse, and the divorce began.")
  - next: divorce-forced
  - rate: 100..100%

## partner-cheats
- trigger: event
- icon: 🌙
- chance: 2%
- scope: person
- target: core-loop/partner, core-loop/spouse
- tags: relationship
- when: (age < 18) == (person.age < 18) and not person.quality.dating_cheated
- text: {person.first_name} has been out late a lot and keeps the phone face down.
- opens: 0.1..0.4 per life
- needs: quality dating_cheated: flag, default false, person-scoped: the partner has cheated and the player has not found out yet
- needs: role dating/ex: role, relationship role id: a former partner the player still knows after a breakup

### outcomes
- outcome: 1
  - text: Nothing else changes, for now.
  - effect: person.quality.dating_cheated = true
  - rate: 100..100%

## partner-cheat-found
- trigger: event
- icon: 🔍
- chance: 6%
- scope: person
- target: core-loop/partner, core-loop/spouse
- tags: relationship
- when: person.quality.dating_cheated
- text: You find a message from someone else on {person.first_name}'s phone.
- opens: 0.03..0.2 per life

### choice: Forgive them
- outcome: 1
  - text: You decide to try again. It will take a long time to feel normal.
  - effect: person.quality.dating_cheated = false
  - effect: stat.happiness -= 5
  - effect: relationship(person).closeness += -10
  - rate: 100..100%

### choice: Walk away
- outcome: 1
  - when: count_role(core-loop/spouse, 0, 100) == 0
  - text: You end it that night. {person.first_name} does not argue, which somehow hurts more.
  - effect: person.quality.dating_cheated = false
  - effect: relationship(person).role = dating/ex
  - effect: relationship(person).closeness += -30
  - effect: stat.happiness -= 8
  - effect: journal("Your partner cheated on you, and you broke up.")
  - rate: 100..100%
- outcome: 1
  - when: count_role(core-loop/spouse, 0, 100) > 0
  - text: You serve the papers that night. {person.first_name} does not argue, which somehow hurts more.
  - effect: person.quality.dating_cheated = false
  - effect: relationship(person).closeness += -30
  - effect: stat.happiness -= 8
  - effect: journal("Your spouse cheated on you, and you filed for divorce.")
  - next: divorce-forced
  - rate: 100..100%
