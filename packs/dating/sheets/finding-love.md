# Content sheet: Finding love

- pack: dating
- packs: dating
- profile: all
- lives: 1000

> Chain 2 (find a date, dating app) and chain 4 (ask out, propose) of issue #239.
> Find a date spawns the new person with `spawn_person(...) as date` from a generator of the chosen gender (one generator per gender, so the spawn-time attraction roll follows the date's own gender; `set_gender` would leave a wrong-gender roll and body).
> Each spark outcome is weighted by the player's own attraction to that gender, so the date's gender follows the player's preferences.
> Teen dating (14 to 17) and adult dating (18+) are separate storylets with separate generators, so the age guard holds by construction.
> `person.gender` and `player.gender` are documented expression names (text-and-icons.md), so no `needs` line is given for them.
> Ask-out and propose are person-scoped decisions. Their weights read the other person's attraction and closeness.
> The dating app storylet moves out of core-loop (`packs/core-loop/storylets/decisions-adult.yaml`). Its age floor becomes 18 and its upper bound is dropped (see open questions in the hand-off).
> Propose allows at most one proposal per partner: both outcomes set `person.quality.dating_proposed`, so a partner is asked once. The accepted path also sets `dating_engaged` for plan-wedding.

## find-a-date-teen
- trigger: event
- icon: 💘
- weight: 16
- when: age >= 14 and age <= 17 and count_role(core-loop/partner, 0, 100) == 0
- cooldown: 1
- needs: generator dating/date-teen-gen-male: age 14..17, fixed gender: a classmate-aged date; one generator per gender (also -female, -nonbinary) so the name, body and attraction roll match the gender
- text: You notice someone in your year looking your way at school.
- opens: 1.0..2.5 per life

### outcomes
- outcome: quality.dating_attracted_women + 1
  - text: A girl from your year smiles back when you look up, and the conversation keeps going at lunch.
  - effect: spawn_person(core-loop/classmate, dating/date-teen-gen-female) as date
  - effect: relationship(date).closeness += 10
  - effect: stat.happiness += 4
- outcome: quality.dating_attracted_men + 1
  - text: A boy from your year asks to borrow your notes, and somehow it turns into a walk home together.
  - effect: spawn_person(core-loop/classmate, dating/date-teen-gen-male) as date
  - effect: relationship(date).closeness += 10
  - effect: stat.happiness += 4
- outcome: quality.dating_attracted_nonbinary + 1
  - text: Someone new in your class sits next to you in every lesson, and you start to look forward to it.
  - effect: spawn_person(core-loop/classmate, dating/date-teen-gen-nonbinary) as date
  - effect: relationship(date).closeness += 10
  - effect: stat.happiness += 4
- outcome: 60
  - text: A chat in the library goes nowhere in particular, but it was nice while it lasted.
  - effect: stat.happiness += 1

## find-a-date
- trigger: event
- icon: 💘
- weight: 18
- when: age >= 18 and age <= 30 and count_role(core-loop/partner, 0, 100) == 0 and count_role(core-loop/spouse, 0, 100) == 0
- cooldown: 1
- needs: generator dating/date-gen-male: age 18..30, fixed gender: an adult date; one generator per gender (also -female, -nonbinary) so the name, body and attraction roll match the gender
- text: A chance to meet someone new comes up, and you are free this weekend.
- opens: 2.0..5.0 per life

### outcomes
- outcome: quality.dating_attracted_women + 1
  - text: A friend of a friend introduces you to a woman who laughs at all your jokes, and you swap numbers before the night ends.
  - effect: spawn_person(core-loop/friend, dating/date-gen-female) as date
  - effect: relationship(date).closeness += 10
  - effect: stat.happiness += 4
- outcome: quality.dating_attracted_men + 1
  - text: A man you met at the gym asks if you want to grab a coffee, and it turns into a three hour chat.
  - effect: spawn_person(core-loop/friend, dating/date-gen-male) as date
  - effect: relationship(date).closeness += 10
  - effect: stat.happiness += 4
- outcome: quality.dating_attracted_nonbinary + 1
  - text: A coworker from the other team keeps finding reasons to talk to you, and you are glad they do.
  - effect: spawn_person(core-loop/friend, dating/date-gen-nonbinary) as date
  - effect: relationship(date).closeness += 10
  - effect: stat.happiness += 4
- outcome: 60
  - text: The night out is fine, but there is no spark, and you both head home early.
  - effect: stat.happiness -= 1

## ask-out
- trigger: event
- icon: 🌹
- weight: 8
- scope: person
- target: core-loop/friend, core-loop/classmate, core-loop/coworker
- when: age >= 14 and person.age >= 14 and (age < 18) == (person.age < 18) and person.age - age <= 15 and age - person.age <= 15 and person.closeness >= 30 and count_role(core-loop/partner, 0, 100) == 0 and count_role(core-loop/spouse, 0, 100) == 0
- text: You think {person.first_name} might say yes if you ask.
- opens: 1.5..3.5 per life

### choice: Ask them out
- outcome: (player.gender == "male" ? person.quality.dating_attracted_men : (player.gender == "female" ? person.quality.dating_attracted_women : person.quality.dating_attracted_nonbinary)) + 1
  - text: {person.first_name} lights up and says yes before you finish the sentence.
  - effect: relationship(person).role = core-loop/partner
  - effect: stat.happiness += 6
- outcome: 100 - (player.gender == "male" ? person.quality.dating_attracted_men : (player.gender == "female" ? person.quality.dating_attracted_women : person.quality.dating_attracted_nonbinary))
  - text: {person.first_name} lets you down gently, and the next few days are a little awkward.
  - effect: relationship(person).closeness += -15
  - effect: stat.happiness -= 3

### choice: Keep it friendly
- outcome: 1
  - text: You stick to small talk for now, and that is fine.
  - effect: stat.happiness += 1
  - rate: 100..100%

## propose
- trigger: event
- icon: 💍
- weight: 6
- scope: person
- target: core-loop/partner
- needs: quality dating_proposed: flag, default false: whether the player has already proposed to this partner
- needs: quality dating_engaged: flag, default false: whether the partner has said yes to a proposal
- when: age >= 18 and person.age >= 18 and person.closeness >= 60 and not person.quality.dating_proposed
- text: Things with {person.first_name} feel serious. Maybe it is time to ask.
- opens: 0.2..0.6 per life

### choice: Propose
- outcome: person.closeness
  - text: {person.first_name} says yes and hugs you before you have even finished asking.
  - effect: stat.happiness += 6
  - effect: person.quality.dating_engaged = true
  - effect: person.quality.dating_proposed = true
- outcome: 100 - person.closeness
  - text: {person.first_name} needs a little time, and the moment passes awkwardly.
  - effect: relationship(person).role = core-loop/friend
  - effect: person.quality.dating_proposed = true
  - effect: stat.happiness -= 4

### choice: Wait a little longer
- outcome: 1
  - text: You decide to wait. The ring can keep for another year.
  - effect: stat.happiness += 1
  - rate: 100..100%

## dating-app
- trigger: event
- icon: 📱
- weight: 3
- when: age >= 18 and count_role(core-loop/partner, 0, 100) == 0 and count_role(core-loop/spouse, 0, 100) == 0
- cooldown: 6
- text: A friend nudges you to try a dating app.
- opens: 0.3..0.8 per life

### choice: Give it a go
- outcome: 40
  - text: A lovely first date and a promising spark.
  - effect: stat.happiness += 5
  - effect: stat.looks += 1
  - rate: 40..40%
- outcome: 60
  - text: A string of awkward chats and a ghost.
  - effect: stat.happiness -= 2
  - rate: 60..60%

### choice: Meet people the old-fashioned way
- outcome: 1
  - text: A nice evening with friends instead.
  - effect: stat.happiness += 2
  - rate: 100..100%
