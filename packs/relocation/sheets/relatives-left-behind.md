# Content sheet: Relatives left behind

- pack: relocation
- packs: core-loop,relocation

> Chain 6 of the relocation outline (issue #227). Four storylets: a yearly drift event per relative while abroad, two actions to keep in touch (call, visit), and a one-time reunion after the player moves back home.
> Drift, call and visit are scope: person, so they roll and offer per bound relative (parent, sibling, friend). Limits (cooldown, once) count per bound person.
> Reunion needs quality.reloc_return_age, which move-back-home (chain 4) must set to the current age on return. Visits do not set it: a visit is not a return.
> Reunion uses age > quality.reloc_return_age, so it fires at the first age-up after the return whatever the order of the NPC pass and the age increment.
> The opens bands are estimates (INFERENCE): about 0.25 of lives go abroad, for about 10 years on average, with 3-5 bound people alive in a typical abroad year (2 parents until they die, 0-2 siblings, a few friends). Widen after the first focused sim.

## relatives-drift
- trigger: event
- icon: 📭
- chance: 75%
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/friend
- when: quality.reloc_abroad
- needs: quality reloc_abroad: flag = false: the player currently lives abroad (set when the player emigrates, cleared by move-back-home)
- text: Back home, {person.first_name} is getting on with life, and the news from you has dried up.
- opens: 5..14 per life

### outcomes
- outcome: 50
  - text: Another month goes by and the messages stop coming.
  - effect: relationship(person).closeness += -6
  - rate: 45..55%
- outcome: 30
  - text: {person.first_name} hears about your news from a cousin, and it stings.
  - effect: relationship(person).closeness += -6
  - rate: 25..35%
- outcome: 20
  - text: A birthday card arrives a week late, with a short note that says only "Hope you're well."
  - effect: relationship(person).closeness += -6
  - rate: 15..25%

## call-home
- trigger: action
- menu: relationships
- label: Call from abroad
- icon: 📞
- repeatable: true
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/friend
- when: quality.reloc_abroad and age >= 18
- text: You dial {person.first_name}'s number and wait through the long international ring.
- opens: 2..10 per life

### outcomes
- outcome: 80
  - text: You talk for an hour and catch up on everything you have missed.
  - effect: relationship(person).closeness += 4
  - effect: stat.happiness += 2
  - rate: 78..82%
- outcome: 20
  - text: The time difference is against you, and you hang up after ten minutes.
  - effect: relationship(person).closeness += 1
  - effect: stat.happiness += 1
  - rate: 18..22%

## visit-home
- trigger: action
- menu: relationships
- label: Fly back to visit
- icon: 🧳
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/friend
- when: quality.reloc_abroad and money >= 120000
- cooldown: 2
- text: The flight and the hotel cost a fair bit, but you book it anyway.
- opens: 0.3..2 per life

### outcomes
- outcome: 80
  - text: You spend a long weekend together and it feels like old times with {person.first_name}.
  - effect: money -= 120000
  - effect: relationship(person).closeness += 8
  - effect: stat.happiness += 2
  - rate: 78..82%
- outcome: 20
  - text: The visit is polite but stilted, and you both leave a little relieved.
  - effect: money -= 120000
  - effect: relationship(person).closeness += 3
  - rate: 18..22%

## relatives-reunion
- trigger: event
- icon: 🎉
- chance: 100%
- once: true
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/friend
- when: quality.reloc_returns > 0 and quality.reloc_return_age > 0 and not quality.reloc_abroad and age > quality.reloc_return_age
- needs: quality reloc_returns: int 0.. = 0: how many times the player has moved back home from abroad
- needs: quality reloc_return_age: int 0.. = 0: age at the most recent return home from abroad, 0 if never; set by move-back-home
- text: You are home again, and {person.first_name} is the first person you want to see.
- opens: 0.5..3 per life

### outcomes
- outcome: 1
  - text: The reunion is loud, emotional and a little overdue.
  - effect: relationship(person).closeness += 10
  - effect: stat.happiness += 3
  - rate: 100..100%
