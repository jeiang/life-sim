# Content sheet: Prison escape

- pack: crime
- packs: crime,core-loop,karma
- lives: 3000

> Section 7 of the crime pack (issue #236). While the player holds the adult `prison` occupation, once a year they may plan a break-out. It is a weighted gamble: a break-out ends the prison occupation and sets `crime_wanted` and `crime_escaped`. From there the arrest chain's yearly manhunt roll takes over. A failed attempt goes to `crime-recaptured`, which adds time and returns the player to `custody-intake`.
> Success runs from about 2% to 15% per attempt, scaled by smarts and health, so a break-out is rare. Both paths sum to exactly 100 before gates, so the rate bands follow from the weights.
> `opens` is an estimate under the default `all` profile: about 1 in 15 lives reach prison [INFERENCE], and the player picks the attempt in roughly one prison year in ten [INFERENCE]. `crime-recaptured` also opens from the arrest chain's manhunt recaptures, which the bands include.
> The entry rule "not escaped already this sentence" is kept literally: `crime_escape_used` is set on a break-out and reset by sentencing, so a player gets one break-out per sentence, even after recapture. `crime_escaped` stays the at-large flag, cleared on recapture, which the manhunt reads.

## escape-attempt
- trigger: action
- menu: occupation/prison
- label: Plan an escape
- icon: 🏃
- tags: custody-ok, crime
- when: has_occupation(prison) and not quality.crime_escape_used and not quality.crime_death_row
- cooldown: 1
- text: The fence has a dark stretch where the tower lights do not reach. Everyone in here thinks about it. This year you are going to try.
- opens: 0.02..0.08 per life
- needs: occupation prison: kind, group custody, age 18+, pay 0, confines menus and events: the adult prison term; the player is confined and housed while it is held
- needs: menu occupation/prison: submenu under the fixed top occupation: the prison menu, where the custody-ok actions are offered
- needs: tag crime: free tag, no range: groups the crime storylets
- needs: quality crime_escaped: flag, default false: set on a break-out and cleared on recapture; the manhunt reads it to choose recapture over arrest
- needs: quality crime_escape_used: flag, default false: set on a break-out and reset to false by sentencing; one break-out per sentence
- needs: quality crime_escapes: integer 0.., default 0: lifetime count of break-outs (balance counter)
- needs: quality crime_behaviour: integer 0..100, default 50: behaviour with the guards; staying quiet raises it, a failed attempt lowers it, parole reads it

### choice: Make a break for it
> review: manhunt handoff rejected. arrest-manhunt (crime/arrest.md) is a 25% yearly event gated on `quality.crime_wanted and not confined`, so setting crime_wanted hands off without a schedule.
- outcome: 2 + stat.smarts / 12 + stat.health / 25
  - text: You are over the fence and into the scrub before the tower light finds the gap. You are free, and you are wanted.
  - effect: end_occupation(prison)
  - effect: end_occupation(prison_work)
  - effect: unschedule(crime/parole-review)
  - effect: quality.crime_escaped = true
  - effect: quality.crime_wanted = true
  - effect: quality.crime_escapes += 1
  - effect: quality.crime_escape_used = true
  - effect: stat.happiness += 6
  - effect: journal("Broke out of prison at age {age}.")
  - rate: 2..15%
- outcome: 98 - stat.smarts / 12 - stat.health / 25
  - text: A guard spots you halfway up the fence. The alarm goes off and the dog starts barking.
  - effect: stat.health -= 5
  - effect: stat.happiness -= 3
  - effect: quality.crime_behaviour += -10
  - next: crime-recaptured
  - rate: 85..98%

### choice: Keep your head down
- outcome: 1
  - text: You make your bed, mind your manners and wait for a better year.
  - effect: quality.crime_behaviour += 4
  - effect: stat.happiness -= 1
  - rate: 100..100%
