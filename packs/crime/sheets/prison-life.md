# Content sheet: Prison life

- pack: crime
- packs: crime,core-loop,karma,dating,gambling,relocation,vacations
- profile: criminal
- lives: 3000

> Chain 6 of the crime outline (issue #236). Nine `custody-ok` actions while confined, three cellmate events, and two riot events.
> Every action and event here carries `custody-ok`, or the confinement lock hides it.
> `confined` gates content for any custody sentence (prison or juvenile_detention). `has_occupation(prison)` gates adult-only content: the prison job, gangs, riots, and the GED.
> Menus: prison actions go under `occupation/prison` (new submenu, shared with `escape`). Cellmate and family actions use the existing `relationships` menu with `scope: person`.
> Cellmate events are `scope: person` with `target: crime/inmate`. The NPC pass rolls them once for the cellmate, so one cellmate per sentence gives at most one roll per event per year.
> Riots: `prison-riot` (respect below 40) and `prison-riot-calm` (respect 40 or more) are mutually exclusive, so at most one riot fires per year. Riot odds are about 1 in 10 prison years at low respect and about 1 in 20 at high respect [INFERENCE].
> `prison_work` is a confining occupation and is held through the sentence. `custody-intake`, `parole-and-release` and `escape` must end `prison_work` as well as `prison` (G3, #293). The harness must not count it as employment (G1, #295).
> Events per prison year total about 1.1 (cellmate events 0.60 + 0.40 + 0.01, plus riots 0.05 to 0.10). The outline proposes 1 to 3 [INFERENCE]; raise the cellmate chances if the measured run comes in low.
> `opens` bands are design estimates for the criminal profile, not measured; widen them after the focused sim.
> `die("killed in a prison fight")` is unverified until compile (G6).
> review: relationship(person).closeness effects are valid (core-loop uses them). The scaffold reports them unknown because of tool bug #300; kept per FIX-BRIEF.

## prison-work-out
- trigger: action
- icon: 💪
- menu: occupation/prison
- label: Work out in the yard
- tags: custody-ok, fitness, health
- when: confined
- repeatable: true
- text: The yard has one bench, two dumbbells, and a line of men waiting their turn. You take your turn.
- opens: 0.3..1.2 per life

### outcomes
- outcome: 75
  - text: A full set leaves you sore and sharper than you were.
  - effect: stat.health += 3
  - effect: stat.happiness += 2
  - rate: 70..80%
- outcome: 25
  - text: A guard tells you to share the bench, and you do, with less grace than you would like.
  - effect: stat.happiness -= 1
  - rate: 20..30%

## prison-library
- trigger: action
- icon: 📚
- menu: occupation/prison
- label: Visit the prison library
- tags: custody-ok, learning, mind
- when: confined
- repeatable: true
- text: The library is one room with a broken radiator and a shelf of paperbacks with the endings torn out.
- opens: 0.2..0.9 per life

### outcomes
- outcome: 60
  - text: You get through a whole book and pick up a few things along the way.
  - effect: stat.smarts += 2
  - effect: stat.happiness += 1
  - rate: 55..65%
- outcome: 40
  - text: You spend the hour reading the same page while two men argue about the sports section.
  - effect: stat.happiness -= 1
  - rate: 35..45%

## prison-take-job
- trigger: action
- icon: 🧹
- menu: occupation/prison
- label: Take a prison job
- tags: custody-ok, money
- when: has_occupation(prison) and not has_occupation(prison_work)
- needs: occupation prison: confining kind, group custody, age 18 or over: the adult sentence that locks menus and events and provides housing
- needs: occupation prison_work: confining kind, group prison_work, small pay: the paid work an inmate can take inside
- cooldown: 1
- text: The work sheet goes up on the wall every Monday. Laundry, kitchen, or the paint crew, all paid in pennies.
- opens: 0.05..0.3 per life

### outcomes
- outcome: 75
  - text: The sergeant has a clipboard and a short memory, and your name goes on the laundry list.
  - effect: start_occupation(prison_work)
  - effect: stat.happiness += 2
  - rate: 70..80%
- outcome: 25
  - text: The list is full until next year, and the sergeant seems pleased about it.
  - rate: 20..30%

## prison-fight
- trigger: action
- icon: 👊
- menu: occupation/prison
- label: Pick a fight
- tags: custody-ok, health
- when: confined
- needs: quality crime_respect: integer 0..100, default 0: standing with the other inmates, read by riots and gang joins
- needs: quality crime_behaviour: integer 0..100, default 50: how well the player behaves inside, read by parole
- cooldown: 1
- text: Someone in the mess hall has been staring at your tray for a week. You decide that ends today.
- opens: 0.05..0.3 per life

### outcomes
- outcome: 40
  - text: You land the first punch, and the yard decides you are not someone to test.
  - effect: stat.health -= 4
  - effect: quality.crime_respect += 10
  - effect: quality.crime_behaviour += -8
  - rate: 35..45%
- outcome: 35
  - text: You come out of it with a split lip and a reputation for picking fights you cannot win.
  - effect: stat.health -= 8
  - effect: stat.happiness -= 3
  - effect: quality.crime_behaviour += -3
  - rate: 30..40%
- outcome: 25
  - text: A guard breaks it up before anybody lands a real blow. You spend a week in the hole.
  - effect: stat.happiness -= 6
  - effect: quality.crime_behaviour += -10
  - rate: 20..30%

## prison-join-gang
- trigger: action
- icon: 🏴
- menu: occupation/prison
- label: Join a gang
- tags: custody-ok, relationship
- when: has_occupation(prison) and not quality.crime_gang and years_in(prison) >= 1
- needs: quality crime_gang: flag, default false: whether the player is in a prison gang
- cooldown: 1
- text: After a year inside you know who runs the yard, and they know who you are.
- opens: 0.02..0.15 per life

### outcomes
- outcome: 70
  - text: They take you in after a look that lasts too long. You are one of them now.
  - effect: quality.crime_gang = true
  - effect: quality.crime_respect += 12
  - effect: quality.crime_behaviour += -10
  - effect: journal("Joined a prison gang at age {age}.")
  - rate: 65..75%
- outcome: 30
  - text: They want nothing to do with you, and the yard remembers who got turned away.
  - effect: quality.crime_respect += -4
  - rate: 25..35%

## prison-leave-gang
- trigger: action
- icon: 🚪
- menu: occupation/prison
- label: Leave the gang
- tags: custody-ok, relationship
- when: has_occupation(prison) and quality.crime_gang
- cooldown: 1
- text: You tell the older guys you are done. Leaving is easier to say than to do.
- opens: 0.01..0.1 per life

### outcomes
- outcome: 60
  - text: They shrug, and the look you get back says they heard you and will not forget.
  - effect: quality.crime_gang = false
  - effect: quality.crime_respect += -10
  - effect: quality.crime_behaviour += 10
  - rate: 55..65%
- outcome: 40
  - text: They let you walk, but a loyal member makes sure you feel the message for a week.
  - effect: quality.crime_gang = false
  - effect: quality.crime_respect += -6
  - effect: quality.crime_behaviour += 6
  - effect: stat.health -= 10
  - effect: stat.happiness -= 4
  - rate: 35..45%

## prison-study-ged
- trigger: action
- icon: 📝
- menu: occupation/prison
- label: Study for your GED
- tags: custody-ok, education, learning
- when: has_occupation(prison) and not quality.graduated_high_school
- cooldown: 1
- text: The prep class meets in the chapel on Tuesdays, between the bingo and the sermon.
- opens: 0.05..0.3 per life

### outcomes
- outcome: 40
  - text: You pass with a few points to spare, and a diploma comes in the mail.
  - effect: quality.graduated_high_school = true
  - effect: stat.smarts += 3
  - effect: stat.happiness += 4
  - effect: journal("Earned a GED in prison at age {age}.")
  - rate: 35..45%
- outcome: 60
  - text: You almost pass. The teacher circles one number and tells you to come back next year.
  - effect: stat.smarts += 2
  - rate: 55..65%

## prison-talk-cellmate
- trigger: action
- icon: 💬
- menu: relationships
- label: Talk to your cellmate
- scope: person
- target: crime/inmate
- tags: custody-ok, relationship, conversation
- when: confined
- needs: role crime/inmate: person role, label Cellmate: a fellow inmate spawned once per sentence
- repeatable: true
- text: {person.first_name} is on the bunk above yours and has opinions about the food. You ask about them.
- opens: 0.1..0.8 per life

### outcomes
- outcome: 55
  - text: {person.first_name} has been inside longer than you and knows how the place works.
  - effect: stat.happiness += 2
  - effect: relationship(person).closeness += 4
  - rate: 50..60%
- outcome: 30
  - text: Small talk, mostly about the food, which you both agree is bad.
  - effect: stat.happiness += 1
  - effect: relationship(person).closeness += 2
  - rate: 25..35%
- outcome: 15
  - text: {person.first_name} does not want to talk, and the silence lasts the whole shift.
  - effect: stat.happiness -= 2
  - effect: relationship(person).closeness += -2
  - rate: 10..20%

## prison-write-family
- trigger: action
- icon: 📮
- menu: relationships
- label: Write to family
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/child, core-loop/spouse
- tags: custody-ok, relationship, family
- when: confined
- cooldown: 1
- text: You write {person.first_name} a letter, carefully, and then rewrite the parts the censor would not like.
- opens: 0.1..0.5 per life

### outcomes
- outcome: 60
  - text: The reply comes back with a photo and a line that makes you go quiet for an hour.
  - effect: stat.happiness += 3
  - effect: relationship(person).closeness += 5
  - effect: journal("Heard back from {person.first_name} while inside, at age {age}.")
  - rate: 55..65%
- outcome: 30
  - text: The reply is short and polite, which somehow stings more than angry.
  - effect: stat.happiness -= 1
  - effect: relationship(person).closeness += 1
  - rate: 25..35%
- outcome: 10
  - text: The letter is never answered.
  - effect: stat.happiness -= 3
  - effect: relationship(person).closeness += -2
  - rate: 5..15%

## prison-cellmate-small-talk
- trigger: event
- scope: person
- target: crime/inmate
- tags: custody-ok, npc
- needs: role crime/inmate: person role, label Cellmate: a fellow inmate spawned once per sentence
- chance: 70%
- when: confined and person.role == crime/inmate
- text: Your cellmate, {person.first_name} {person.last_name}, asks what you did to end up in here.
- opens: 0.1..0.3 per life

### outcomes
- outcome: 60
  - text: You trade a few stories, and {person.first_name} turns out to be decent company.
  - effect: stat.happiness += 2
  - effect: relationship(person).closeness += 4
  - rate: 55..65%
- outcome: 40
  - text: The talk runs dry fast, and the quiet afterward is loud.
  - effect: stat.happiness -= 1
  - effect: relationship(person).closeness += 1
  - rate: 35..45%

## prison-cellmate-trouble
- trigger: event
- icon: 🧾
- scope: person
- target: crime/inmate
- tags: custody-ok, npc
- needs: role crime/inmate: person role, label Cellmate: a fellow inmate spawned once per sentence
- chance: 40%
- when: confined and person.role == crime/inmate
- text: {person.first_name} says you owe for a commissary favor you do not remember asking for.
- opens: 0.06..0.22 per life

### choice: Pay up
- when: money >= 1500
- outcome: 1
  - text: You hand over the money, and the matter is closed, for now.
  - effect: money -= 1500
  - effect: relationship(person).closeness += 2
  - effect: stat.happiness -= 1
  - rate: 100..100%

### choice: Refuse
- outcome: 60
  - text: Words get exchanged. Nothing is settled, but nothing breaks either.
  - effect: stat.happiness -= 2
  - effect: relationship(person).closeness += -3
  - rate: 55..65%
- outcome: 40
  - text: Your bunk gets tipped in the night, and the morning fight costs you a few days of pain.
  - effect: stat.health -= 5
  - effect: stat.happiness -= 4
  - effect: relationship(person).closeness += -5
  - rate: 35..45%

## prison-cellmate-killed
- trigger: event
- scope: person
- target: crime/inmate
- tags: custody-ok, npc, mortality
- needs: role crime/inmate: person role, label Cellmate: a fellow inmate spawned once per sentence
- chance: 1%
- when: confined and person.role == crime/inmate
- text: The yard goes quiet, then loud. {person.first_name} does not make it back to the cell.
- opens: 0.001..0.01 per life

### outcomes
- outcome: 1
  - text: {person.first_name} {person.last_name} dies in a fight that nobody in the yard saw start.
  - effect: stat.happiness -= 4
  - effect: journal("{person.first_name} {person.last_name} was killed in a prison fight at age {age}.")
  - effect: die("killed in a prison fight")
  - rate: 100..100%

## prison-riot
- trigger: event
- icon: 🔥
- chance: 10%
- tags: custody-ok
- when: has_occupation(prison) and quality.crime_respect < 40
- text: A food fight in the mess hall turns into a yard fight, and the guards lose the south block.
- opens: 0.01..0.05 per life

### choice: Hide in your cell
- outcome: 70
  - text: You lie low behind the bunk until the sirens stop.
  - effect: stat.happiness -= 2
  - rate: 65..75%
- outcome: 30
  - text: A stray chair catches you on the way back to the cell.
  - effect: stat.health -= 6
  - effect: stat.happiness -= 3
  - rate: 25..35%

### choice: Join the fight
- outcome: 55
  - text: You throw a few punches and come out with a name in the yard.
  - effect: quality.crime_respect += 10
  - effect: quality.crime_behaviour += -8
  - effect: stat.health -= 4
  - rate: 50..60%
- outcome: 45
  - text: You take a hit you never saw coming, and a guard writes your name down.
  - effect: stat.health -= 10
  - effect: quality.crime_behaviour += -10
  - effect: stat.happiness -= 4
  - rate: 40..50%

### choice: Help the guards
- outcome: 60
  - text: A guard hands you a cigarette and a nod, which is more than you expected.
  - effect: quality.crime_behaviour += 10
  - effect: stat.happiness += 1
  - rate: 55..65%
- outcome: 40
  - text: The yard sees who stood where, and it does not forget.
  - effect: quality.crime_respect += -12
  - effect: quality.crime_behaviour += 4
  - rate: 35..45%

## prison-riot-calm
- trigger: event
- icon: ⚠
- chance: 5%
- tags: custody-ok
- when: has_occupation(prison) and quality.crime_respect >= 40
- text: Nobody knows who started it, but the whole block is on its feet and banging the bars.
- opens: 0.005..0.03 per life

### outcomes
- outcome: 50
  - text: You are in the middle of it, and you walk out bruised with a bit more standing in the yard.
  - effect: quality.crime_respect += 4
  - effect: stat.health -= 4
  - rate: 45..55%
- outcome: 30
  - text: You keep your head down, and the block quietly notices that you did.
  - effect: quality.crime_respect += 2
  - effect: stat.happiness += 1
  - rate: 25..35%
- outcome: 20
  - text: A guard's baton finds your ribs before you find the exit.
  - effect: stat.health -= 8
  - effect: quality.crime_behaviour += -5
  - rate: 15..25%
