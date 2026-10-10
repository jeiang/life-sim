# Content sheet: Violence (assault and murder)

- pack: crime
- packs: crime,core-loop,karma
- profile: all
- lives: 5000

> Chain 2 of the crime outline: person-scoped violence from the relationships menu. Assault is an attack that may go unseen, be reported, or land in hospital. Murder sits behind a confirm choice, then either goes unsolved (a cold case for later) or the police come within hours.
> Lives: murder opens about 1 in 200 lives, too rare to measure at the default 1000 lives, so this sheet asks for 5000.
> Confinement: the relationships menu locks while the player is confined, and these storylets carry no `custody-ok` tag, so `when` needs no custody guard.
> Names used from pack-format.md rather than the vocabulary listing: `person.alive` and `{person.first_name}`. The implementer checks both at compile.
> Caught outcomes set `quality.crime_pending_charge` (2 serious, 3 aggravated, 4 murder) and have no `next`: the arrest chain reads the mailbox on its next event pass.
> Karma writes use `quality.karma_score` (karma pack, clamped 0..100). The `packs` header includes `karma` so the name resolves; the outline's `quality.karma` is this name (GAP G4).
> `quality.crime_murders` counts unsolved murders only. Its reader is the arrest chain's cold case, not this sheet. A caught murder does not increment it.
> `die("murdered")` is in `scope: person`, so it kills the bound person, not the player. The cause string is checked at compile (GAP G6).
> Murder is `max_per_life: 1`, so its opens band is the share of lives with a murder, matching the outline's per-life frequency.
> Assault is not `repeatable`. It has a one-year cooldown and at most two uses per life. Its effects lower karma, happiness, and closeness, so repeats cost the player.
> Random and all profiles: until #292 tag weights down-weight the `crime` tag in random play (GAP G2), the harness will open murder and assault more often than the design bands. The bands are design intent; lint and the focused sim report the difference.
> Assault has no closeness gate (the outline's option is left unused): any bound person can be attacked.
> relationship(person).closeness is not in the VOCAB listing; the sheet declares it in a needs line (effect relationship) and keeps the exact core-loop form.

## assault
- trigger: action
- menu: relationships/crime
- label: Assault
- icon: 👊
- scope: person
- tags: crime
- when: age >= 12 and person.alive
- cooldown: 1
- max_per_life: 2
- text: You are furious with {person.first_name}. Hitting them would be a crime, and a stupid one.
- opens: 0.12..0.25 per life
- needs: effect relationship: int change -100..100, clamped 0..100: closeness change with the bound person, written as relationship(person).closeness += N

### choice: Attack
- outcome: 60
  - text: You hit {person.first_name} hard enough to end the argument, then walk off. Nobody calls the police.
  - effect: relationship(person).closeness += -35
  - effect: quality.karma_score += -6
  - effect: stat.happiness -= 2
  - effect: journal("Attacked {person.first_name}.")
  - rate: 55..65%
- outcome: 30
  - text: A neighbor saw the whole thing and calls the police. They are on their way.
  - effect: relationship(person).closeness += -35
  - effect: quality.karma_score += -6
  - effect: quality.crime_pending_charge = 2
  - effect: journal("Attacked {person.first_name}.")
  - rate: 25..35%
- outcome: 10
  - text: {person.first_name} ends up in hospital with serious injuries. The police are on their way, and the charge is aggravated assault.
  - effect: relationship(person).closeness += -50
  - effect: quality.karma_score += -8
  - effect: quality.crime_pending_charge = 3
  - effect: journal("Put {person.first_name} in hospital.")
  - rate: 5..15%

### choice: Walk away
- outcome: 1
  - text: You take a breath and leave. The moment passes.
  - rate: 100..100%

## murder
- trigger: action
- menu: relationships/crime
- label: Murder
- icon: 🔪
- scope: person
- tags: crime
- when: age >= 14 and person.alive
- max_per_life: 1
- text: Killing {person.first_name} cannot be undone. Are you sure?
- opens: 0.001..0.005 per life
- needs: quality crime_murders: integer 0..1000, default 0: unsolved murders the police may still connect to the player

### choice: Go through with it
- outcome: 60
  - text: {person.first_name} is dead, and the scene shows no sign of you. For now.
  - effect: die("murdered")
  - effect: quality.crime_murders += 1
  - effect: quality.karma_score += -20
  - effect: stat.happiness -= 12
  - effect: journal("Killed {person.first_name}.")
  - rate: 55..65%
- outcome: 40
  - text: {person.first_name} is dead, and the police are at your door within hours.
  - effect: die("murdered")
  - effect: quality.karma_score += -20
  - effect: stat.happiness -= 12
  - effect: quality.crime_pending_charge = 4
  - effect: journal("Killed {person.first_name}.")
  - rate: 35..45%

### choice: Back out
- outcome: 1
  - text: You put it down. It was never going to happen.
  - rate: 100..100%
