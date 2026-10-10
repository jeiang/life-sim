# Content sheet: Custody intake

- pack: crime
- packs: crime,core-loop,karma

> One chain step, `custody-intake`, reached only by `next` from the sentencing storylets (court) and from `crime-recaptured`. The callers set the sentence fields first; this step only starts confinement.
> Branches: adult (age 18+) or juvenile (under 18) by outcome `when`. The cellmate spawns once per sentence, guarded by `quality.crime_cellmate`, so a recapture or a parole violation re-enters without a second cellmate.
> Ends held jobs and school with `end_group` (part-time, full-time, school), which covers every occupation in those groups, other Packs' included. Adult entry also ends `prison_work` and `core-loop/retired`, which is not in a group the player loses by `end_group`. High school continues in juvenile detention (D4), so the juvenile branch never ends `school`.
> Release is scheduled by `parole-review` (adult) and `juvie-release` (juvenile) of the release sheets (#236), started by `schedule(...)` lines that land with those storylets.
> `crime-recaptured` moved here from the escape sheet: arrest's manhunt hands a recaptured fugitive to it, and every other custody entry lives in this file. Its `next` reaches `custody-intake`.
> No `rate` on `custody-intake`: its four outcomes are exclusive by `when`, so each entry takes exactly one.
> `prison` and `juvenile_detention` sit in core-loop's `full-time` group and `prison_work` in `part-time`: exclusivity groups are a singleton block owned by core-loop, so crime declares no group of its own. Starting `prison` therefore also ends a held full-time job; the explicit `end_group` lines stay for clarity and for the school group.

## custody-intake
- trigger: event
- icon: 🔒
- chance: 0%
- tags: custody-ok
- text: The sentence is read out, the cuffs come off, and the cell door closes behind you.
- opens: 0.05..0.12 per life
- needs: occupation prison: group full-time, age 18 or over, pay 0, confines menus and events: adult confinement, provides housing while held
- needs: occupation juvenile_detention: group full-time, age under 18, pay 0, confines menus and events: juvenile confinement, provides housing while held, released by 18
- needs: occupation prison_work: group part-time, small pay, confines menus and events: the paid work an inmate can take inside; ended with the prison term
- needs: quality crime_cellmate: flag = false: whether this sentence's cellmate is already spawned, so a recapture adds no second one
- needs: role crime/inmate: person role, label Cellmate: a fellow inmate spawned once per sentence
- needs: generator crime/inmate-gen: spawn generator, age 19 to 55: adult cellmate
- needs: generator crime/inmate-gen-juvenile: spawn generator, age 13 to 17: juvenile cellmate

### outcomes
- outcome: 1
  - text: Booking takes all afternoon, fingerprints and a jumpsuit. Your cellmate looks up from the bunk and says the place is "not that bad."
  - when: age >= 18 and not quality.crime_cellmate
  - effect: end_group("part-time")
  - effect: end_group("full-time")
  - effect: end_group("school")
  - effect: end_occupation(core-loop/retired)
  - effect: start_occupation(prison)
  - effect: quality.crime_cellmate = true
  - effect: spawn_person(crime/inmate, crime/inmate-gen) as cellmate
  - effect: schedule(crime/parole-review, after: 1-1 years)
  - effect: journal("Sent to prison at age {age}.")
- outcome: 1
  - text: Back through the gate. Nobody asks how you got out, and the bunk is still yours.
  - when: age >= 18 and quality.crime_cellmate
  - effect: end_group("part-time")
  - effect: end_group("full-time")
  - effect: end_group("school")
  - effect: end_occupation(core-loop/retired)
  - effect: start_occupation(prison)
  - effect: schedule(crime/parole-review, after: 1-1 years)
  - effect: journal("Returned to prison at age {age}.")
- outcome: 1
  - text: Juvenile detention is cinder block, a curfew, and the kid in the bunk above yours.
  - when: age < 18 and not quality.crime_cellmate
  - effect: end_group("part-time")
  - effect: end_group("full-time")
  - effect: start_occupation(juvenile_detention)
  - effect: quality.crime_cellmate = true
  - effect: spawn_person(crime/inmate, crime/inmate-gen-juvenile) as cellmate
  - effect: schedule(crime/juvie-release, after: 1-1 years)
  - effect: journal("Sent to juvenile detention at age {age}.")
- outcome: 1
  - text: Back to juvenile detention. The counsellor sighs and checks the bed you already know.
  - when: age < 18 and quality.crime_cellmate
  - effect: end_group("part-time")
  - effect: end_group("full-time")
  - effect: start_occupation(juvenile_detention)
  - effect: schedule(crime/juvie-release, after: 1-1 years)
  - effect: journal("Returned to juvenile detention at age {age}.")

## crime-recaptured
- trigger: event
- icon: 🔒
- chance: 0%
- tags: custody-ok
- text: You are brought back in. The gate locks behind you and the sentence gets longer.
- opens: 0.02..0.07 per life
- needs: quality crime_release_age: integer 0..999, default 0: age at which the sentence ends and the release event fires; a recapture adds two years here, and term is left as handed down
- needs: quality crime_escaped: flag, default false: set on a break-out and cleared on recapture; the manhunt reads it to choose recapture over arrest

### outcomes
- outcome: 1
  - text: The guards log the attempt, the warrant is updated and your release date moves back two years.
  - effect: end_occupation(prison)
  - effect: quality.crime_wanted = false
  - effect: quality.crime_escaped = false
  - effect: quality.crime_release_age += 2
  - effect: stat.happiness -= 4
  - effect: journal("Recaptured at age {age}. Two years added to the sentence.")
  - next: custody-intake
  - rate: 100..100%
