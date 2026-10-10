# Content sheet: Minor heir

- pack: generations
- packs: generations,core-loop,dating
- profile: all
- lives: 1000

> Chain 4 of the generations pack. The heir is under 18 when the player dies. Four storylets.
> The sheet grammar allows only `trigger: event` or `action`, so `trigger: succession` cannot be written. `minor-guardian-takes-in` is a chain step (`chance: 0%`) that the on_succession hook opens with `schedule(generations/minor-guardian-takes-in, after: 1-1 years)`. That opens it at the first age-up, the same window the succession queue gives. Its `when` is checked there, so the hook may schedule it unconditionally.
> The outline's `minor/...` names are written as `minor-...` because the id grammar is `^[a-z][a-z0-9_-]*$`. Schedule references use the pack id as prefix, `generations/<id>`.
> `quality.gen_minor_heir` is set in on_succession as `age < 18` (after the guardian is chosen) and cleared by `minor-handover-at-18`. It is declared once, on `minor-guardian-takes-in`, and all four storylets use it.
> Core names not printed by `vocab --packs core-loop,dating`: `age`, `living.with_guardian`, `living.no_guardian`, `person.alive`, `person.age`. They are defined in core (`packages/core/src/sim/env.ts`, `living.ts`). Opens bands are design estimates, not measured. Succession-only storylets show 0 in a default focused run without generations.

## minor-guardian-takes-in
- trigger: event
- icon: 🏠
- chance: 0%
- once: true
- when: quality.gen_minor_heir == 1 and living.with_guardian and age < 18
- text: A guardian steps up to take you in, and the family table gets one more chair.
- needs: quality gen_minor_heir: int 0..1: the heir is under 18 at succession; set in on_succession and cleared at the 18 handover
- opens: 0.01..0.04 per life

### choice: Move in and keep the peace
- outcome: 1
  - text: {player.first_name} unpacks, learns the house rules, and keeps the noise down.
  - effect: stat.happiness += 2
  - rate: 100..100%

### choice: Push back on the new rules
- outcome: 70
  - text: The guardian gives a little on curfew, and so do you.
  - effect: stat.happiness += 1
  - rate: 70..70%
- outcome: 30
  - text: Every dinner turns into a lecture about your future.
  - effect: stat.happiness -= 4
  - rate: 30..30%

## minor-guardian-review
- trigger: event
- icon: 📋
- weight: 6
- scope: person
- once: true
- when: quality.gen_minor_heir == 1 and living.with_guardian and age >= 14 and age <= 17 and person.alive and person.age >= 18 and (is_kin(person, grandparent) or (count_kin(grandparent, 18, 200) == 0 and (is_kin(person, "aunt-uncle") or (count_kin("aunt-uncle", 18, 200) == 0 and (is_kin(person, sibling) or (count_kin(sibling, 18, 200) == 0 and is_kin(person, cousin)))))))
- text: {person.first_name} {person.last_name} sits you down for a talk about school, money, and who you are hanging out with.
- opens: 0.01..0.05 per life

> The `when` follows the guardian rule in `guardian_kin` order: the closest adult kin in grandparent, aunt-uncle, sibling, cousin order. Among several adults of the same kind the rule picks the highest closeness, which this gate does not check, so any adult of that kind may be the one who reviews.

### choice: Hear them out
- outcome: 1
  - text: You listen, nod, and mean it a little.
  - effect: relationship(person).closeness += 2
  - effect: stat.happiness += 1
  - rate: 100..100%

### choice: Tell them to back off
- outcome: 60
  - text: They back off, grumbling about the state of young people.
  - effect: relationship(person).closeness += -2
  - rate: 60..60%
- outcome: 40
  - text: They don't back off, and the house gets colder.
  - effect: relationship(person).closeness += -4
  - effect: stat.happiness -= 3
  - rate: 40..40%

## minor-on-own
- trigger: event
- icon: 🔑
- weight: 3
- once: true
- when: quality.gen_minor_heir == 1 and living.no_guardian and age < 18
- text: No guardian, no curfew, and no one to call when the rent is due.
- opens: 0.005..0.02 per life

### choice: Look for a first job
- outcome: 60
  - text: A diner takes you on for weekend shifts, paid in cash.
  - effect: money += 12000
  - effect: stat.happiness -= 1
  - rate: 60..60%
- outcome: 40
  - text: Nobody hires a kid with no reference. You try three more places.
  - effect: stat.happiness -= 3
  - rate: 40..40%

### choice: Sign a cheap lease
- outcome: 1
  - text: A landlord rents you a room above a laundromat, with a deposit you can barely cover.
  - effect: money -= 150000
  - effect: stat.happiness += 2
  - rate: 100..100%

## minor-handover-at-18
- trigger: event
- icon: 🎓
- weight: 40
- once: true
- when: age == 18 and quality.gen_minor_heir == 1
- text: Eighteen. The money your family held for you is all yours to manage now.
- opens: 0.01..0.03 per life

> If this weighted event is not drawn in the year the heir turns 18, the flag stays set. Every other minor storylet gates on `age` below 18, so the stale flag does nothing harmful. The cost is the missed beat, not wrong state.

### outcomes
- outcome: 60
  - text: You sit down with the statements and make a plan for the money.
  - effect: stat.smarts += 1
  - effect: quality.gen_minor_heir = 0
  - rate: 60..60%
- outcome: 40
  - text: You treat yourself to a car and a trip, and most of it is gone by summer.
  - effect: stat.happiness += 4
  - effect: quality.gen_minor_heir = 0
  - rate: 40..40%
