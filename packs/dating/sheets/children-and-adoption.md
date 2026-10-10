# Content sheet: Children and adoption

- pack: dating
- packs: dating,core-loop,karma
- profile: romantic
- lives: 1000

> Chain 10 (children milestones and move-out) from dating/OUTLINE.md. Adoption (chain 11) is its own sheet, `adoption.md`: an adopted child is a person like any other child.
> Milestones: `first_child` is a Core milestone. It fires by itself when a person takes the `core-loop/child` role, so birth (chain 9) and adoption both fire it. Adoption also calls `reach_milestone(adopted)`, a dating milestone.
> Per-child yearly logic cannot sit in a hook, because `on_age_up_post` runs with no person in scope. Each child storylet is `trigger: event`, `scope: person`, `target: core-loop/child`, and its `when` reads the child's age.
> Child stats are v1: a child keeps the core-loop child stats, with no inheritance (GAPS item 10).

> Tweak (focused sim): the bands are for the `romantic` profile, in which half the lives have children; a childless life has none of these.

## child-first-day-school
- trigger: event
- icon: 🎒
- scope: person
- target: core-loop/child
- chance: 90%
- when: person.age == 5
- text: It is {person.first_name}'s first day of school, and they are clinging to your leg at the gate.
- opens: 0.5..1.3 per life

### outcomes
- outcome: 6
  - text: You wave until the door closes. {person.first_name} waves back, a little teary.
  - effect: stat.happiness += 1
  - effect: relationship(person).closeness += 2
  - rate: 55..65%
- outcome: 3
  - text: A teacher peels {person.first_name} off your leg, and the walk home feels strangely empty.
  - effect: stat.happiness -= 1
  - rate: 25..35%
- outcome: 1
  - text: {person.first_name} takes one look at the classroom, decides it is great, and never looks back.
  - effect: stat.happiness += 2
  - rate: 5..15%

## child-school-trouble
- trigger: event
- icon: 🏫
- scope: person
- target: core-loop/child
- chance: 6%
- when: person.age >= 8 and person.age <= 17
- text: The school rings. {person.first_name} has been in trouble again.
- opens: 0.3..1.1 per life

### outcomes
- outcome: 5
  - text: A long talk in the head teacher's office, and a promise to behave. {person.first_name} mostly keeps it.
  - effect: stat.happiness -= 1
  - rate: 45..55%
- outcome: 3
  - text: You spend the weekend grounding {person.first_name}, and you are both miserable about it.
  - effect: stat.happiness -= 3
  - effect: relationship(person).closeness += -2
  - rate: 25..35%
- outcome: 2
  - text: The teacher says {person.first_name} stood up for a classmate. You are not sure whether to be proud or worried.
  - effect: stat.happiness += 2
  - rate: 15..25%

## child-sick-night
- trigger: event
- icon: 🤒
- scope: person
- target: core-loop/child
- chance: 4%
- when: person.age <= 17
- text: At 3 a.m. {person.first_name} wakes up with a fever and a very loud cough.
- opens: 0.4..1.2 per life

### outcomes
- outcome: 7
  - text: You sit up with them until the fever breaks. Neither of you sleeps much.
  - effect: stat.health -= 1
  - effect: stat.happiness -= 1
  - rate: 65..75%
- outcome: 3
  - text: It is a rough night, but a doctor's visit in the morning sorts it out.
  - effect: stat.happiness -= 3
  - rate: 25..35%

## child-moves-out
- trigger: event
- icon: 🧳
- scope: person
- target: core-loop/child
- chance: 25%
- when: person.age >= 18 and person.age <= 25 and not person.quality.dating_moved_out
- text: {person.first_name} is packing a car with everything they own and asks if you can help carry the boxes.
- opens: 0.5..1.6 per life
- needs: quality dating_moved_out: flag, default false, person-scoped: the child has left home; set once so the storylet fires at most once per child
> The `dating_moved_out` flag gates `when`, so the storylet fires at most once per child. Move-out is a 25% yearly chance (ages 18-25), flavor plus the flag. Household cost after move-out is core-loop's (see yield notes).

### outcomes
- outcome: 5
  - text: You help carry the boxes. The new place is small, and {person.first_name} is over the moon.
  - effect: relationship(person).closeness += 1
  - effect: person.quality.dating_moved_out = true
  - rate: 45..55%
- outcome: 3
  - text: You cry in the car park. {person.first_name} promises to call every Sunday.
  - effect: stat.happiness -= 3
  - effect: person.quality.dating_moved_out = true
  - rate: 25..35%
- outcome: 2
  - text: {person.first_name} gets a job across town and rents a flat with friends. The house feels very quiet.
  - effect: stat.happiness -= 1
  - effect: person.quality.dating_moved_out = true
  - rate: 15..25%
