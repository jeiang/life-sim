# Content sheet: Parole and release

- pack: crime
- packs: crime,core-loop,karma,dating,gambling,relocation,vacations
- profile: all
- lives: 1000

> Adult custody only. Every storylet here gates on `has_occupation(prison)` or `quality.crime_on_parole`. Juvenile detention ends by 18 in the `juvie` chain and never reaches this sheet.
> `parole-review` is a yearly chain, not a chance event: it is opened by `schedule(crime/parole-review, after: 1-1 years)` and reschedules itself each year until the sentence ends. Scheduled entries open outside the slot cap, so the yearly review is never dropped.
> The chain starts at adult custody intake. `custody-intake` must add `schedule(crime/parole-review, after: 1-1 years)` to its adult outcomes (cross-sheet, see the report). Violations `unschedule(crime/parole-review)` before handing back to intake, so the chain never doubles.
> Granted parole ends `prison` and `prison_work`, which drops the custody lock. A violation sends the player to `custody-intake` with the original release date kept (`crime_term` is set to the years left).
> `released` is once per life. The first full-term release reaches it; a second sentence's release uses the `milestone_reached(released)` branch and reaches nothing.
> Frequencies are [INFERENCE]: prison in about 1 in 15 lives, mean adult term about 5 years, so about 0.3 yearly reviews per life, widened for age gates.

## parole-review
- trigger: event
- icon: ⚖️
- chance: 0%
- when: quality.crime_term > 0 and not quality.crime_death_row and (has_occupation(prison) or quality.crime_on_parole)
- tags: custody-ok
- needs: quality crime_term: integer 0.., default 0: years of the sentence still to serve, set by court and by violations
- needs: quality crime_release_age: integer 0.., default 0: age at which the full term ends
- needs: quality crime_parole_age: integer 0.., default 0: age from which yearly parole hearings are held
- needs: quality crime_death_row: flag, default false: a death sentence, so no parole
- needs: quality crime_on_parole: flag, default false: true while released on parole
- needs: quality crime_behaviour: integer 0..100, default 50: conduct in custody and on parole, raises parole odds
- needs: quality crime_respect: integer 0..100, default 0: standing with staff and the board, raises parole odds
- needs: quality crime_years_clean: integer 0.., default 0: years since the sentence ended, reset at final release
- needs: occupation prison: kind, group custody, confines menus and events: the adult custody occupation that locks the player in
- needs: milestone released: milestone, provided by crime: the release after a full term, reached once per life
- text: The year turns over behind bars, and somebody's paperwork is waiting for you.
- opens: 0.2..0.6 per life

### outcomes
- outcome: 1
  - when: has_occupation(prison) and age < quality.crime_parole_age
  - text: Another year inside. The board has not called your name yet.
  - effect: schedule(crime/parole-review, after: 1-1 years)
- outcome: 20 + quality.crime_behaviour + quality.crime_respect
  - when: has_occupation(prison) and age >= quality.crime_parole_age and age < quality.crime_release_age
  - text: The board grants parole. You walk out on conditions, with a curfew and a parole officer who wants to see you.
  - effect: end_occupation(prison)
  - effect: end_occupation(prison_work)
  - effect: quality.crime_on_parole = true
  - effect: stat.happiness += 8
  - effect: schedule(crime/parole-review, after: 1-1 years)
  - effect: journal("Parole granted. The custody lock is gone, and the officer has your address.")
  - rate: 16..96%
- outcome: max(10, 100 - quality.crime_behaviour)
  - when: has_occupation(prison) and age >= quality.crime_parole_age and age < quality.crime_release_age
  - text: Denied. The board says come back next year, and they will be watching.
  - effect: stat.happiness -= 2
  - effect: schedule(crime/parole-review, after: 1-1 years)
  - rate: 4..84%
- outcome: 1
  - when: has_occupation(prison) and age >= quality.crime_release_age and not milestone_reached(released)
  - text: Your sentence is finally over. The gate buzzes, and the air outside smells like a parking lot.
  - effect: end_occupation(prison)
  - effect: end_occupation(prison_work)
  - effect: quality.crime_term = 0
  - effect: quality.crime_on_parole = false
  - effect: quality.crime_years_clean = 0
  - effect: reach_milestone(released)
  - effect: journal("Full term served. You walk out of prison.")
- outcome: 1
  - when: has_occupation(prison) and age >= quality.crime_release_age and milestone_reached(released)
  - text: The gate buzzes again. Your second sentence is over, and the paperwork is shorter this time.
  - effect: end_occupation(prison)
  - effect: end_occupation(prison_work)
  - effect: quality.crime_term = 0
  - effect: quality.crime_on_parole = false
  - effect: quality.crime_years_clean = 0
  - effect: journal("Second full term served. You walk out of prison.")
- outcome: 1
  - when: quality.crime_on_parole and age < quality.crime_release_age
  - text: Another year on parole. The officer's file on you gets a little thicker.
  - effect: schedule(crime/parole-review, after: 1-1 years)
- outcome: 1
  - when: quality.crime_on_parole and age >= quality.crime_release_age and not milestone_reached(released)
  - text: Parole ends. The officer signs the last form and does not shake your hand.
  - effect: quality.crime_term = 0
  - effect: quality.crime_on_parole = false
  - effect: quality.crime_years_clean = 0
  - effect: reach_milestone(released)
  - effect: journal("Parole ends. Your sentence is over.")
- outcome: 1
  - when: quality.crime_on_parole and age >= quality.crime_release_age and milestone_reached(released)
  - text: Parole ends again. This time the officer just nods.
  - effect: quality.crime_term = 0
  - effect: quality.crime_on_parole = false
  - effect: quality.crime_years_clean = 0
  - effect: journal("Second parole ends. Your sentence is over.")

## parole-check
- trigger: event
- icon: 📋
- chance: 25%
- when: quality.crime_on_parole and quality.crime_term > 0 and age < quality.crime_release_age
- text: Your parole officer turns up at the door without calling first.
- opens: 0.01..0.05 per life

### outcomes
- outcome: 20 + quality.crime_behaviour
  - text: Clean check, no new trouble. The officer ticks a box and leaves.
  - effect: stat.happiness += 1
  - rate: 20..96%
- outcome: max(5, 80 - quality.crime_behaviour)
  - text: You missed a meeting, or the test came back dirty. The board is not amused.
  - effect: unschedule(crime/parole-review)
  - effect: quality.crime_on_parole = false
  - effect: quality.crime_term = max(1, quality.crime_release_age - age)
  - effect: quality.crime_behaviour = quality.crime_behaviour - 10
  - effect: stat.happiness -= 5
  - effect: journal("Parole revoked. You are back inside to finish the term.")
  - next: custody-intake
  - rate: 4..80%

## parole-visit
- trigger: action
- icon: 👮
- menu: activities
- label: Visit your parole officer
- tags: crime
- cooldown: 1
- when: quality.crime_on_parole
- text: Your parole officer wants to see you in person this month.
- opens: 0.01..0.06 per life

### choice: Report on time
- outcome: 1
  - text: You answer every question like a model citizen, and the officer writes it all down.
  - effect: quality.crime_behaviour += 3
  - effect: stat.happiness += 1
  - rate: 100..100%

### choice: Skip the check-in
- outcome: max(10, 60 - quality.crime_behaviour)
  - text: The officer shows up at your address anyway. Your parole is revoked.
  - effect: unschedule(crime/parole-review)
  - effect: quality.crime_on_parole = false
  - effect: quality.crime_term = max(1, quality.crime_release_age - age)
  - effect: quality.crime_behaviour = quality.crime_behaviour - 10
  - effect: stat.happiness -= 5
  - effect: journal("Missed check-in. Parole revoked.")
  - next: custody-intake
  - rate: 20..60%
- outcome: 40
  - text: Nobody checks. The caseload is huge, and you get lucky this time.
  - effect: quality.crime_behaviour = quality.crime_behaviour - 2
  - rate: 40..80%
