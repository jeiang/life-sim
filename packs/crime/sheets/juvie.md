# Content sheet: Juvenile detention

- pack: crime
- packs: crime,core-loop,karma
- lives: 5000

> Chain `juvie` (crime outline section 9). The custody intake (chain `intake`, not this sheet) starts `juvenile_detention` and sets `quality.crime_release_age = min(age + term, 18)`. This sheet covers life inside, and release.
> Confinement: `juvenile_detention` confines menus and events, so every storylet here carries `custody-ok` or it can never be drawn while held. The release event carries it too.
> School continues. High school is `core-loop/high-school` in the `school` group, not the custody group, so the core-loop school actions (tagged `custody-ok`) keep running. No end_group is needed. Only the custody occupation ends at release.
> Under-18 gate: the juvie-only storylets (counsellor, fight, mentor, both cellmate storylets, and the two actions) check `age < 18`, so none fires after 18. `juvie-release` is the exception: it runs at or after release age. Release is due at the earlier of sentence end or 18.
> Opens derivation [INFERENCE]: about 1 in 10 under-18 crime lives is sent to juvie, and about 1 in 5 lives commit a crime under 18, so about 0.02 juvie stays per life. Mean stay about 2 years, so about 0.04 juvie-years per life. Event opens = 0.04 x per-year chance, widened. Measured on 5000 lives so per-life rates near 0.005 have counts above 20.
> Release is a yearly scheduled chain, not a chance hit. `juvie-release` has `chance: 0%` and is opened by `schedule(crime/juvie-release, after: 1-1 years)` from custody intake's juvenile outcomes (cross-sheet). Each year it releases once `age >= quality.crime_release_age` (min of sentence end and 18) and otherwise reschedules itself. Scheduled entries open outside the yearly cap, so release cannot be dropped. A hook cannot do this: hook effects cannot branch, so `on_age_up_post` cannot release conditionally.

## juvie-counsellor
- trigger: event
- icon: 🗣️
- tags: crime, custody-ok
- chance: 20%
- when: has_occupation(juvenile_detention) and age < 18
- cooldown: 1
- needs: occupation juvenile_detention: custody group, requires age < 18, pay 0, confines menus and events: the juvenile custody occupation; started at intake and ended at release
- text: The detention counsellor has a folder with your name on it and a lot of questions.
- opens: 0.005..0.012 per life

### choice: Open up
- outcome: 3
  - text: You talk about home, the stuff you have never said out loud. The counsellor just listens, which is weirdly helpful.
  - effect: stat.happiness += 4
  - effect: quality.karma_score += 2
  - rate: 70..80%
- outcome: 1
  - text: You say a lot of words and mean none of them. The counsellor writes it all down anyway.
  - effect: stat.happiness -= 1
  - rate: 20..30%

### choice: Give them nothing
- outcome: 1
  - text: You stare at the wall for fifty minutes. The counsellor sighs and makes a note.
  - effect: stat.happiness -= 2
  - rate: 100..100%

## juvie-yard-fight
- trigger: event
- icon: 🥊
- tags: crime, custody-ok
- chance: 12%
- when: has_occupation(juvenile_detention) and age < 18
- cooldown: 1
- text: A kid from the next unit decides you look like an easy target at lunch.
- opens: 0.003..0.008 per life

### choice: Throw the first punch
- outcome: 2
  - text: Two swings and a guard in the middle. You both spend the week in the same quiet room.
  - effect: stat.health -= 5
  - effect: stat.happiness -= 2
  - rate: 60..70%
- outcome: 1
  - text: One clean hit and the other kid backs off. Word gets around the unit.
  - effect: stat.happiness += 2
  - effect: stat.health -= 2
  - rate: 30..40%

### choice: Stay out of it
- outcome: 1
  - text: You keep your head down. They take a swing at you anyway.
  - effect: stat.health -= 3
  - rate: 100..100%

## juvie-mentor
- trigger: event
- icon: 🏫
- tags: crime, custody-ok
- chance: 10%
- when: has_occupation(juvenile_detention) and age < 18
- max_per_life: 2
- text: A volunteer from a community programme sits down across from you and reads your file out loud.
- opens: 0.002..0.007 per life

### outcomes
- outcome: 2
  - text: They tell you that you are smarter than the file says. Then they help you fill out a course application for when you are out.
  - effect: stat.smarts += 2
  - effect: quality.karma_score += 3
  - rate: 60..70%
- outcome: 1
  - text: A mentor starts meeting you on Thursdays. You go, even on the days you do not want to.
  - effect: stat.happiness += 3
  - effect: quality.karma_score += 2
  - rate: 30..40%

## juvie-cellmate-bond
- trigger: event
- icon: 🛏️
- tags: crime, custody-ok
- scope: person
- target: crime/inmate
- chance: 15%
- when: has_occupation(juvenile_detention) and age < 18 and person.age < 18
- needs: role crime/inmate: person role, label Cellmate: the fellow inmate spawned at custody intake
- text: {person.first_name} shares the bunk above yours and talks until the lights go out.
- opens: 0.004..0.009 per life

### outcomes
- outcome: 3
  - text: You trade stories after lights out. It almost feels like a friendship.
  - effect: stat.happiness += 3
  - rate: 70..80%
- outcome: 1
  - text: {person.first_name} gets moved to another unit without saying goodbye.
  - effect: stat.happiness -= 2
  - rate: 20..30%

## juvie-cellmate-scheme
- trigger: event
- icon: 🧦
- tags: crime, custody-ok
- scope: person
- target: crime/inmate
- chance: 8%
- when: has_occupation(juvenile_detention) and age < 18 and person.age < 18
- needs: role crime/inmate: person role, label Cellmate: the fellow inmate spawned at custody intake
- text: {person.first_name} slides you a rolled-up sock with something heavy in it and says, quietly, hold this.
- opens: 0.002..0.005 per life

### choice: Hold it for them
- outcome: 2
  - text: The search comes at dawn. The sock is not yours, but your locker is.
  - effect: stat.happiness -= 5
  - effect: quality.karma_score += -4
  - rate: 60..70%
- outcome: 1
  - text: Nobody searches anything. {person.first_name} owes you one, apparently.
  - effect: stat.happiness += 2
  - rate: 30..40%

### choice: Tell a guard
- outcome: 1
  - text: The guard thanks you quietly and writes nothing down. {person.first_name} stops talking to you.
  - effect: stat.happiness -= 2
  - effect: quality.karma_score += 3
  - rate: 100..100%

## juvie-release
- trigger: event
- icon: 🔓
- tags: crime, custody-ok
- chance: 0%
- when: has_occupation(juvenile_detention)
- needs: quality crime_release_age: integer 0..18, default 0: the age the juvenile sentence ends, min of sentence end and 18; set at intake
- needs: milestone released: reached on release from custody; once per life, so a later adult release finds it already reached
- text: A caseworker opens your file for the yearly review.
- opens: 0.012..0.03 per life

### outcomes
- outcome: 1
  - when: age >= quality.crime_release_age
  - text: The paperwork is signed. The gate buzzes open, and you walk out with a paper bag and a plan.
  - effect: end_occupation(juvenile_detention)
  - effect: reach_milestone(released)
  - effect: stat.happiness += 6
  - effect: journal("Released from juvenile detention at age {age}.")
- outcome: 2
  - when: age < quality.crime_release_age
  - text: Your sentence is not up yet. The caseworker writes a note and sends you back to your bunk.
  - effect: schedule(crime/juvie-release, after: 1-1 years)

## juvie-ask-counsellor
- trigger: action
- menu: occupation/juvenile_detention
- label: Ask to see the counsellor
- icon: 🗣️
- tags: crime, custody-ok
- when: has_occupation(juvenile_detention) and age < 18
- cooldown: 1
- needs: menu occupation/juvenile_detention: submenu under the occupation top, pack-declared: holds the custody actions for juvenile detention; the outline names only occupation/prison
- text: You knock on the counsellor's door and ask for a session. They look surprised, then pull up a chair.
- opens: 0.004..0.015 per life

### outcomes
- outcome: 3
  - text: You talk through the week. It helps more than you expected.
  - effect: stat.happiness += 3
  - effect: quality.karma_score += 1
  - rate: 70..80%
- outcome: 1
  - text: The session is short and the counsellor is busy with someone else's paperwork.
  - effect: stat.happiness += 1
  - rate: 20..30%

## juvie-write-home
- trigger: action
- menu: occupation/juvenile_detention
- label: Write a letter home
- icon: ✉️
- tags: crime, custody-ok
- scope: person
- target: core-loop/parent
- when: has_occupation(juvenile_detention) and age < 18
- cooldown: 1
- text: You write a letter to {person.first_name}. Spelling is not the point. The point is that you wrote it.
- opens: 0.004..0.015 per life

### outcomes
- outcome: 3
  - text: A reply comes back on the next visit. It is short, and it is kind.
  - effect: stat.happiness += 3
  - rate: 70..80%
- outcome: 1
  - text: The reply never comes. You start checking the mail slot anyway.
  - effect: stat.happiness -= 2
  - rate: 20..30%
