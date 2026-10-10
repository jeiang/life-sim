# crime glossary

Terms owned by the crime Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Criminal record**:
The `crime_record` flag, set by a conviction. It feeds core-loop's `hiring_blocked` slot (`readables/hiring.yaml`), so professional `apply-*` jobs refuse the player while it is set; entry jobs still hire.
_Avoid_: Rap sheet

**Wanted**:
The `crime_wanted` flag: the player is a fugitive.

**Pending charge** (mailbox quality):
The `crime_pending_charge` int, 0 = none. A mailbox: any Pack that produces a crime writes a charge code, crime reads it and clears it back to 0. Producers never read it and crime is the only one that resets it.

**Severity** (`crime_severity`): 0 none, 1 petty, 2 serious, 3 violent, 4 murder. Arrest copies the mailbox code into it; court reads it and clears it at sentencing.

**Custody**:
Confinement by a sentence: the `prison` (18+) or `juvenile_detention` (under 18) occupation, both confining and in core-loop's `full-time` group (exclusivity groups are core-loop's singleton). `custody-intake` starts it, ends jobs, school (adults only) and retirement, and spawns one `inmate` cellmate per sentence.

**Jurisdiction**:
The `crime_jurisdiction` kind (`death_penalty` 0 or 1). One `default` entry with the death penalty on; the `crime_death_penalty` readable reads it. Only murder can draw a death sentence.

**Sentence macros**: `crime.serve_adult(term)`, `crime.serve_juvenile(term)` (release and parole ages capped at 18), `crime.serve(term, release_age, parole_age)` (life 999, death row), `crime.probation()`.

**Clean years** (`crime_years_clean`): years with a record outside custody and parole, counted by the `on_age_up_post` hook and reset at sentencing; expungement needs 7.
