# Content sheet: Court

- pack: crime
- packs: crime,core-loop,karma
- lives: 3000

> Chain 4 of the crime pack (court). Entered from `arrest` through `next: court-arraignment`. Arrest must set `quality.crime_severity` (1 petty, 2 serious, 3 violent, 4 murder) and consume `quality.crime_pending_charge`.
> Chain steps are `chance: 0%` and reached by `next`, except `court-execution`, which `schedule` opens (see its note).
> Every custodial outcome sets the fields `custody-intake` expects (agreed with DrCrimeIntake) and then hands off with `next: custody-intake`. Probation outcomes do not, so no custody starts.
> `next` cannot branch, so the adult and juvenile paths split through outcome `when` (`age >= 18` / `age < 18`). Adult and juvenile weights match, so the plea and verdict rates hold for either age.
> Sentence weights shift with `quality.crime_lawyer` but keep a constant sum per severity, so the table never breaks. Sentencing outcomes are gated by severity, so they carry no `rate` band.
> Life is `crime_term 999` with `crime_release_age 999` (never released) and parole at age + 25. Death row sets parole to 999 (no hearing).
> `age + term / 2` uses integer division (a one-year term gives a parole age equal to the sentence year).
> All `needs` are listed on `court-arraignment` so the implementer sees one list.
> Sentence effects are the `crime` macros (`effects/sentence.yaml`), so the 15-line block of the first draft is one line per outcome: `crime.serve_adult(term)` (release age + term, parole age + term / 2), `crime.serve_juvenile(term)` (both capped at 18), `crime.serve(term, release_age, parole_age)` for life and death row, and `crime.probation()` (term 0, conviction and record, no custody). All four set the conviction counters, the record, `crime_years_clean = 0`, `crime_wanted = false`, `crime_severity = 0`, and the custody fields `custody-intake` expects (behaviour 50, respect 0, no gang, no cellmate, no escape used).
> Jurisdiction: `crime_death_penalty` is a readable over `kind("crime_jurisdiction", default).death_penalty`.

## court-arraignment
- trigger: event
- icon: ⚖️
- chance: 0%
- when: quality.crime_severity > 0
- text: The judge reads the charges and asks who is going to speak for you.
- needs: quality crime_severity: integer 0..4, default 0: how serious the open case is (1 petty, 2 serious, 3 violent, 4 murder); arrest writes it and court reads and clears it
- needs: quality crime_lawyer: integer 0..2, default 0: lawyer tier chosen at arraignment (0 public defender, 1 private, 2 top)
- needs: quality crime_term: integer 0..999, default 0: years of the current custodial sentence (999 is life or death row); 0 when there is no custody
- needs: quality crime_release_age: integer 0..999, default 0: age the custodial sentence ends (999 means never)
- needs: quality crime_parole_age: integer 0..999, default 0: age the first parole hearing opens (999 means no hearing)
- needs: quality crime_sentences: integer 0.., default 0: custodial sentences the player has received, a counter
- needs: quality crime_convictions: integer 0.., default 0: convictions the player has, a counter
- needs: quality crime_years_clean: integer 0.., default 0: years since the last sentence ended, reset to 0 at sentencing; record clearing reads it
- needs: quality crime_death_row: flag, default false: set by a death sentence; the scheduled execution reads it
- needs: quality crime_on_parole: flag, default false: set false by sentencing; parole sets it true
- needs: quality crime_behaviour: integer 0..100, default 50: prison behaviour, set to 50 by sentencing (chain 5 owns the changes)
- needs: quality crime_respect: integer 0..100, default 0: standing among inmates, set to 0 by sentencing (chain 5 owns the changes)
- needs: quality crime_gang: flag, default false: gang membership, set false by sentencing (chain 5 owns the changes)
- needs: quality crime_cellmate: flag, default false: set false by sentencing; intake sets it true when it spawns the cellmate
- needs: quality crime_escape_used: flag, default false: set true on a successful break-out; sentencing resets it to false (one break-out per sentence)
- needs: readable crime_death_penalty: bool, default true: whether the player's jurisdiction allows the death penalty, derived from the jurisdiction kind (lookup syntax to verify, GAPS G6)
- opens: 0.04..0.12 per life

> About one in three crime lives is arrested at least once (outline, [INFERENCE]), and each arrest arraigns once. The band is wide to cover repeat arrests.

### choice: Take the public defender
- outcome: 1
  - text: The public defender is overworked, but shows up on time.
  - effect: quality.crime_lawyer = 0
  - next: court-plea
  - rate: 100..100%

### choice: Hire a private lawyer
- when: money >= 150000 * quality.crime_severity
- outcome: 1
  - text: A sharp suit and an invoice that stings. Worth it, probably.
  - effect: money -= 150000 * quality.crime_severity
  - effect: quality.crime_lawyer = 1
  - next: court-plea
  - rate: 100..100%

### choice: Hire the top lawyer
- when: money >= 600000 * quality.crime_severity
- outcome: 1
  - text: The firm's name opens doors. So does the bill.
  - effect: money -= 600000 * quality.crime_severity
  - effect: quality.crime_lawyer = 2
  - next: court-plea
  - rate: 100..100%

## court-plea
- trigger: event
- chance: 0%
- text: The prosecutor slides a deal across the table. The judge waits.
- opens: 0.04..0.12 per life

> Reached only from `court-arraignment`. Each choice's age split gives 40 for a deal and 60 for a straight plea, so the rates are the same for either age.

### choice: Plead guilty
- outcome: 40
  - when: age >= 18
  - text: The prosecutor drops a charge level, and you take the deal before anyone changes their mind.
  - effect: quality.crime_severity = max(1, quality.crime_severity - 1)
  - next: court-sentencing
  - rate: 40..40%
- outcome: 60
  - when: age >= 18
  - text: You plead guilty, own it, and ask the judge for mercy.
  - next: court-sentencing
  - rate: 60..60%
- outcome: 40
  - when: age < 18
  - text: The prosecutor offers a lighter charge for a kid. You take it.
  - effect: quality.crime_severity = max(1, quality.crime_severity - 1)
  - next: court-sentencing-juvenile
  - rate: 40..40%
- outcome: 60
  - when: age < 18
  - text: You say you did it. Your voice barely carries.
  - next: court-sentencing-juvenile
  - rate: 60..60%

### choice: Plead not guilty
- outcome: 1
  - text: You tell the judge you did not do it, and a trial date gets set.
  - next: court-verdict
  - rate: 100..100%

## court-verdict
- trigger: event
- chance: 0%
- text: The trial takes three days. The jury comes back.
- opens: 0.015..0.05 per life

> Acquittal weight rises with lawyer tier (20, 35, 50), so the acquittal rate runs from 25% (public defender) to 45% (top lawyer). The band covers that range. Guilty is 60 for both ages.

### outcomes
- outcome: 20 + 15 * quality.crime_lawyer
  - text: Not guilty. The jury took less time than you spent getting nervous.
  - effect: quality.crime_severity = 0
  - effect: quality.crime_wanted = false
  - rate: 24..47%
- outcome: 60
  - when: age >= 18
  - text: Guilty. The judge sets a date for sentencing.
  - next: court-sentencing
  - rate: 53..76%
- outcome: 60
  - when: age < 18
  - text: Guilty. The juvenile court sets a date for the disposition.
  - next: court-sentencing-juvenile
  - rate: 53..76%

## court-sentencing
- trigger: event
- chance: 0%
- text: The judge reads the sentence. Everything you did gets read out loud.
- opens: 0.03..0.09 per life

> Adult table. Each severity's eligible weights sum to 100 (murder sums to 110 when the death penalty is allowed, with death at 10). Lawyer tier moves weight between terms and keeps the sum fixed.
> Custodial outcomes share one effect block, written out per term: term, release age, parole age, counters, record, clean years, wanted, severity, the custody-intake fields, and `next: custody-intake`.
> Probation sets term 0 and has no `next`, so no custody starts.
> Opens: adult guilty outcomes are about 0.08 arrests x 0.85 adult share x 0.84 guilty, so about 0.057 per life before the wide band.

### outcomes
- outcome: 70 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 1
  - text: A year in county time. Bad, not the end of the world.
  - effect: crime.serve_adult(1)
  - next: custody-intake
- outcome: 30 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 1
  - text: A stern lecture and a probation order. You keep your job and your dignity, mostly.
  - effect: crime.probation()
- outcome: 50
  - when: quality.crime_severity == 2
  - text: Two years inside. The lawyer's paperwork could not change that.
  - effect: crime.serve_adult(2)
  - next: custody-intake
- outcome: 30 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 2
  - text: Five years. The judge does not like the word "accident."
  - effect: crime.serve_adult(5)
  - next: custody-intake
- outcome: 20 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 2
  - text: Probation and a fine that hurts more than the judge's tone.
  - effect: crime.probation()
- outcome: 40 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 3
  - text: Four years for a violent crime. It could have been worse.
  - effect: crime.serve_adult(4)
  - next: custody-intake
- outcome: 35
  - when: quality.crime_severity == 3
  - text: Eight years. The gate closes with a sound you will remember.
  - effect: crime.serve_adult(8)
  - next: custody-intake
- outcome: 25 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 3
  - text: Fifteen years. The judge reads the victim statement twice.
  - effect: crime.serve_adult(15)
  - next: custody-intake
- outcome: 35 + 5 * quality.crime_lawyer
  - when: quality.crime_severity == 4
  - text: Fifteen years for murder. The lawyer's best argument was that you were sorry.
  - effect: crime.serve_adult(15)
  - next: custody-intake
- outcome: 30
  - when: quality.crime_severity == 4
  - text: Twenty-five years. You will be a different person when the gate opens, if it opens at all.
  - effect: crime.serve_adult(25)
  - next: custody-intake
- outcome: 35 - 5 * quality.crime_lawyer
  - when: quality.crime_severity == 4
  - text: Life. The word hangs in the room longer than the judge does.
  - effect: crime.serve(999, 999, age + 25)
  - next: custody-intake
- outcome: 10
  - when: quality.crime_severity == 4 and crime_death_penalty
  - text: The death sentence. Your appeals will take years, and then the date gets set.
  - effect: crime.serve(999, 999, 999)
  - effect: quality.crime_death_row = true
  - effect: schedule(crime/court-execution, after: 3-6 years)
  - next: custody-intake

## court-sentencing-juvenile
- trigger: event
- chance: 0%
- text: The juvenile judge speaks slowly, as if you might still be listening.
- opens: 0.005..0.02 per life

> Juvenile table, for players under 18 (routed by `court-plea` and `court-verdict`). Detention ends by 18: release and parole ages are capped with `min(..., 18)`. No life or death sentence for juveniles.
> Custodial outcomes set the same custody-intake fields as the adult table and hand off to `custody-intake`, which branches on age itself.
> Opens: juvenile share of arrests is about 15% (outline puts juvie at about 1 in 10 lives under 18 that commit crimes, [INFERENCE]), so about 0.08 x 0.15 x 0.84 per life.

### outcomes
- outcome: 50 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 1
  - text: A probation order and a lot of talking. Your parents attend every session.
  - effect: crime.probation()
- outcome: 50 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 1
  - text: One year in juvenile detention. It is quieter than you expected.
  - effect: crime.serve_juvenile(1)
  - next: custody-intake
- outcome: 30 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 2
  - text: Probation with a curfew and a counsellor who wants to talk about feelings.
  - effect: crime.probation()
- outcome: 40
  - when: quality.crime_severity == 2
  - text: Two years in juvenile detention. School comes with you.
  - effect: crime.serve_juvenile(2)
  - next: custody-intake
- outcome: 30 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 2
  - text: Four years in juvenile detention, or until you turn 18, whichever comes first.
  - effect: crime.serve_juvenile(4)
  - next: custody-intake
- outcome: 40 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 3
  - text: Three years in detention for a violent act. Your record follows you out.
  - effect: crime.serve_juvenile(3)
  - next: custody-intake
- outcome: 40
  - when: quality.crime_severity == 3
  - text: Six years in detention. You will be eighteen before you finish.
  - effect: crime.serve_juvenile(6)
  - next: custody-intake
- outcome: 20 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 3
  - text: Ten years on paper. You will be out at eighteen, and the paper says so.
  - effect: crime.serve_juvenile(10)
  - next: custody-intake
- outcome: 40 + 10 * quality.crime_lawyer
  - when: quality.crime_severity == 4
  - text: Six years in detention for a killing. The court says the word "tragic" four times.
  - effect: crime.serve_juvenile(6)
  - next: custody-intake
- outcome: 40
  - when: quality.crime_severity == 4
  - text: Ten years in detention, and the youth counsellor says you can still change.
  - effect: crime.serve_juvenile(10)
  - next: custody-intake
- outcome: 20 - 10 * quality.crime_lawyer
  - when: quality.crime_severity == 4
  - text: Fifteen years on paper. Eighteen is the real ceiling, and everyone knows it.
  - effect: crime.serve_juvenile(15)
  - next: custody-intake

## court-execution
- trigger: event
- icon: ☠️
- chance: 0%
- when: quality.crime_death_row
- tags: custody-ok
- text: The date comes. There is no appeal left to file.
- opens: 0.0001..0.0005 per life

> Opened only by `schedule(crime/court-execution, after: 3-6 years)` from the death outcome above, never by `next`. This is deliberate: the death sentence starts custody, and `custody-ok` lets the storylet run while confined.
> Assumes `die(...)` on the player ends the life, as the Core `die` effect does (GAPS G6 verifies the cause string and person scope).

### outcomes
- outcome: 1
  - text: The sentence is carried out. Your life ends in a small room.
  - effect: die("executed")
