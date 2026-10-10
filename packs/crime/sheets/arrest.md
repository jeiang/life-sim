# Content sheet: Arrest

- pack: crime
- packs: crime,core-loop,karma
- profile: all
- lives: 5000

> Chain 3 of the crime pack (arrest, outline section 3). Reads the `quality.crime_pending_charge` mailbox written by property-crime and violence, and writes `quality.crime_severity` for court.
> Lives: 5000 because the murder reopening (`arrest-murder-cold`) is rare, about 1 in 500 lives.
> Choice gates read `quality.crime_pending_charge`, not severity: severity is written by outcome effects, which run after the gate and the weight are read.
> Handoffs to other sheets: `court-arraignment` (court) and `crime-recaptured` (escape). Both ids must match those sheets.
> Cold case: a Run escape schedules `arrest-cold-case` 6 to 15 years out. The manhunt catches 25% a year, so the case survives to its fire year with probability about 0.75 to the power of that year. Averaged over a uniform 6 to 15 year window that is about 5.7% of escapes, the outline's 6%. [INFERENCE: the 25% and the window are design numbers.]
> Formula weights (Run, Bribe) carry no `rate`, as court does for sentencing. Their shares move with smarts, health, severity and the record.
> Every `needs` line is listed on `arrest-pending`, so the implementer sees one list.

## arrest-pending
- trigger: event
- icon: 🚔
- chance: 100%
- when: quality.crime_pending_charge > 0 and not confined
- text: Police arrive at your door with a charge.
- opens: 0.05..0.12 per life
- needs: quality crime_severity: integer 0..4, default 0: how serious the open case is (1 petty, 2 serious, 3 violent, 4 murder); arrest writes it and court reads and clears it
- needs: quality crime_arrests: integer 0.., default 0: lifetime count of bookings; balance counter
- needs: quality crime_escaped: flag, default false: set on a break-out and cleared on recapture; the manhunt reads it to choose recapture over arrest
- needs: quality crime_murders: integer 0..1000, default 0: unsolved murders the police may still connect to the player; the murder cold case reads it and takes one off

### choice: Cooperate
- outcome: 1
  - text: You keep your hands where they can be seen and go quietly.
  - effect: quality.crime_severity = min(4, quality.crime_pending_charge)
  - effect: quality.crime_pending_charge = 0
  - effect: quality.crime_arrests += 1
  - next: court-arraignment
  - rate: 100..100%

### choice: Run
- outcome: max(5, 20 + stat.health / 4 - (quality.crime_pending_charge > 2 ? 10 : 0))
  - text: You break free and vanish into the crowd. The police will be looking for you.
  - effect: quality.crime_severity = min(4, quality.crime_pending_charge)
  - effect: quality.crime_pending_charge = 0
  - effect: quality.crime_wanted = true
  - effect: stat.happiness -= 4
  - effect: schedule(crime/arrest-cold-case, after: 6-15 years)
  - effect: journal("Broke away from the police at age {age}. They are looking for you.")
- outcome: 60
  - text: You do not get ten meters. Resisting arrest goes in the file.
  - effect: quality.crime_severity = min(4, quality.crime_pending_charge)
  - effect: quality.crime_pending_charge = 0
  - effect: quality.crime_arrests += 1
  - effect: stat.health -= 4
  - next: court-arraignment

### choice: Bribe the officer
- when: money >= 50000 * min(4, quality.crime_pending_charge) * min(4, quality.crime_pending_charge)
- outcome: max(2, 40 - 8 * min(4, quality.crime_pending_charge))
  - text: The officer pockets the cash and looks the other way. The case goes away.
  - effect: money -= 50000 * min(4, quality.crime_pending_charge) * min(4, quality.crime_pending_charge)
  - effect: quality.crime_pending_charge = 0
  - effect: quality.crime_severity = 0
  - effect: quality.karma_score += -4
  - effect: journal("Bribed an officer to make a charge go away at age {age}.")
- outcome: 60
  - text: The officer takes the cash anyway and adds bribery to the file.
  - effect: money -= 50000 * min(4, quality.crime_pending_charge) * min(4, quality.crime_pending_charge)
  - effect: quality.crime_severity = min(4, quality.crime_pending_charge + 1)
  - effect: quality.crime_pending_charge = 0
  - effect: quality.crime_arrests += 1
  - effect: quality.karma_score += -4
  - next: court-arraignment

## arrest-manhunt
- trigger: event
- icon: 🚨
- chance: 25%
- when: quality.crime_wanted and not confined
- text: The police are still looking for you.
- opens: 0.008..0.03 per life

### outcomes
- outcome: 1
  - when: quality.crime_escaped
  - text: A patrol recognizes you and the escape is over.
  - effect: quality.crime_arrests += 1
  - next: crime-recaptured
- outcome: 1
  - when: not quality.crime_escaped
  - text: A routine check turns up the warrant. You are arrested.
  - effect: quality.crime_wanted = false
  - effect: quality.crime_arrests += 1
  - next: court-arraignment

## arrest-cold-case
- trigger: event
- icon: 📁
- chance: 0%
- when: quality.crime_wanted and not quality.crime_escaped and not confined
- text: The case against you goes cold on a desk somewhere.
- opens: 0.0004..0.002 per life

### outcomes
- outcome: 1
  - text: The file goes into a box in a basement. Nobody is looking for you any more.
  - effect: quality.crime_wanted = false
  - effect: quality.crime_severity = 0
  - effect: journal("The police stopped looking for you at age {age}.")
  - rate: 100..100%

## arrest-murder-cold
- trigger: event
- icon: 🔎
- chance: 1%
- when: quality.crime_murders > 0 and not confined
- text: A detective pulls an old file and finds a name that was never checked.
- opens: 0.0002..0.0012 per life

### outcomes
- outcome: 1
  - text: The name turns out to be yours. The handcuffs come out before the questions do.
  - effect: quality.crime_murders += -1
  - effect: quality.crime_severity = 4
  - effect: quality.crime_arrests += 1
  - effect: journal("Police linked you to an old murder and arrested you at age {age}.")
  - next: court-arraignment
  - rate: 100..100%
