# Crime pack outline (issues #235, #236, #237; grill #58 comment 6019451457)

## Pack header

- Pack id: `crime`; namespace `crime` (prefix `crime_` on qualities, readables, slots, state; `crime_record`, `crime_wanted`, `crime_pending_charge` already on main).
- `version: 1`; `depends`: `core-loop` (capabilities `core-loop/hiring`, `core-loop/careers`, `core-loop/housing`, `core-loop/education`, `core-loop/family`), `karma` (`karma/score`, for `quality.karma` used by violence; add to `depends`, the archive draft lacks it). Verify the exact karma capability id in the compile.
- Required capabilities: `provides: qualities` (existing `capabilities/record.yaml`, extended), `provides: occupations` (prison, juvenile_detention, prison_work), `provides: people` (role `inmate`, generators), `provides: milestones` (`released`), `provides: kinds` (`jurisdiction`), `provides: effects` (macros, e.g. sentence table), `provides: readables` (existing `hiring_blocked` contribution).
- Storylets: chains below. Harness: `harness/metrics.yaml`, `harness/profiles.yaml`, `harness/force/*.yaml`. Docs: `CONTEXT.md` (exists), `BALANCE.md` (placeholder on main; fill in #237). Test: `test/crime.test.ts` (exists; extend per chain).

## Chains (10)

Each chain is one content sheet for one drafting agent. Frequencies are proposals to tune in balance (`[INFERENCE]`), not measured. Storylet cap: no storylet above 3% of decisions.

### 1. `property-crime`
- Summary: six non-repeatable property crimes (shoplift, pickpocket at 12+; steal-a-car, burglary at 14+; fraud, armed-robbery at 16+). Each pays money on success and sets `crime_pending_charge` on a risk roll. Cooldown 1; non-repeatable per life.
- Trigger: action, menu `activities/crime` (new submenu), tag `crime`.
- Entry: age per crime; `not confined` (locked by custody anyway); not already in that crime this life (`once`).
- Frequency: proposal ~1 in 4 lives commits one or more; tune to the 3% cap.
- Covers: D1 (six property crimes, non-repeatable, cooldown 1).
- Needs: `quality.crime_pending_charge` (write), money, `quality.karma` (karma pack), `once`/`cooldown`. Vocab: qualities present; tag `crime` and submenu `activities/crime` new (allowed: packs add submenus under fixed tops).

### 2. `violence`
- Summary: assault (12+; Attack / Walk away) and murder (14+; Go through with it / Back out), both person-scoped from the relationships menu, behind a confirm step. Murder sets `crime_murders` and kills the target through `die("murdered")`. Hitmen and serial killers are later (out of scope).
- Trigger: action, menu `relationships/crime` (new submenu), person scope.
- Entry: age; a bound person (`person.closeness` > 0 optional for assault); murder needs `closeness`-free access but a confirm choice.
- Frequency: assault ~1 in 6 lives; murder under 1 in 200 lives.
- Covers: D1 (assault and murder person-scoped behind confirm; hitmen/serial later).
- Needs: `person.closeness`, `die`, `quality.crime_murders`, `crime_pending_charge`. Vocab: `die`, `person.closeness` present; `person.*` scope present.

### 3. `arrest`
- Summary: pending charges become arrests. Arrest-pending (100%, when `crime_pending_charge > 0`) offers Cooperate / Run / Bribe. Run leads to a manhunt (25%) and a cold case (6%) that is scheduled later. Sets `crime_wanted` and `crime_arrests`.
- Trigger: event (`when: crime_pending_charge > 0`), plus `schedule` for the cold case.
- Entry: `crime_pending_charge > 0`; not confined at the time.
- Frequency: about one in three crime lives gets arrested at least once [INFERENCE].
- Covers: D2 (cooperate / run / bribe; caught).
- Needs: `schedule` (vocab yes), `money` (bribe), `quality.crime_wanted`. Vocab: present.

### 4. `court`
- Summary: arraignment (free public defender, or paid lawyer whose price scales with severity: `money >= 150000*sev`, top tier `600000*sev`; `crime_lawyer` 0..2), plea or trial (`crime_plea`), verdict (acquittal weight; guilty 60), sentencing (severity × term table sets `crime_term`, `crime_release_age`, `crime_parole_age`, `crime_record`), and death sentence only for murder when the jurisdiction allows it (`crime_death_row`). Juvenile branch: sentencing-juvenile (under 18) with release by 18.
- Trigger: event chain (`next`) from `arrest`.
- Entry: `crime_wanted` or arrested; `crime_pending_charge` consumed.
- Frequency: follows arrest rate; death sentence rare (murder + jurisdiction on).
- Covers: D2 (arraignment, plea/trial, sentence from crime, record, lawyer, luck; `release_age`), D3 (murder-only death penalty; jurisdiction data via kind; v1 default jurisdiction on).
- Needs: `kind("jurisdiction", ...)` lookup (see data item), `quality.crime_record`, `crime_term`, `crime_death_row`. Note: `next:` chains are not re-checked after the first storylet, so each step's gating is in its first storylet. Vocab: `kind()` expression must be checked against `kinds` capability (see GAPS).

### 5. `custody-intake`
- Summary: starts confinement. Adults get the `prison` occupation (confines menus and events, provides housing, pay 0). Under-18s get `juvenile_detention` (ends by 18). Spawns one `inmate` cellmate per sentence (`inmate-gen`, `inmate-gen-juvenile`). Ends each job, school or retirement occupation the player holds (the pay that would otherwise continue). Recapture from `escape` returns here.
- Trigger: event (`next` from `court`), recapture event from `escape`.
- Entry: sentence set; not already confined.
- Frequency: as sentences; prison in roughly one in 15 lives [INFERENCE].
- Covers: D4 (jobs, university and retirement pay end; high school continues in juvie; housing provided by confinement, no living cost; #109 hook).
- Needs: `start_occupation`, `end_occupation` per kind (no group end, see GAPS), `spawn_person(role, generator) as <name>`, `custody-ok` on intake storylets (they start confinement). Vocab: effects present; `custody-ok` tag present (core-owned); occupations `prison`, `juvenile_detention` new.

### 6. `prison-life`
- Summary: about 9 `custody-ok` actions while confined: work out, visit library, take a prison job (`prison_work` occupation, confining, small pay), pick a fight, join a gang, leave a gang, talk to cellmate, write to family, study for GED. Events: cellmate events by `person.role == inmate`; riots (event, drawn when `crime_respect` low, or random rate per year; fires once per year at most).
- Trigger: action (menu `occupation/prison` or `activities`), event (riot).
- Entry: `confined` (`in_group("custody")` for custody-only menus).
- Frequency: each prison year sees 1-3 life events [INFERENCE]; riot 1 in 10 prison years.
- Covers: D5 (~9 actions, one cellmate per sentence, riots); gang state (`crime_gang`).
- Needs: `confined`, `in_group`, `years_in_group`, `person.role`, `custody-ok` tags, `quality.crime_behaviour` / `crime_respect` / `crime_gang`. Vocab: `in_group`, `years_in_group`, `person.role` present; occupations/roles new.

### 7. `escape`
- Summary: once per year while confined, a risky choice: escape or stay. Success ends `prison` (custody-ok), sets `crime_escaped`, `crime_wanted`, and hands off to `arrest` for a manhunt. Failure is recapture (`crime-recaptured`), back to `custody-intake` with extra time.
- Trigger: action (menu `occupation/prison`), `custody-ok`, once per year.
- Entry: `confined` in prison (not juvie); not escaped already this sentence.
- Frequency: rare: well under 1 in 20 prison lives [INFERENCE].
- Covers: D5 (escape as a risky choice chain, once a year).
- Needs: `end_occupation(prison)` with custody-ok tag, `chance`, `quality.crime_escaped`, `schedule` for manhunt. Vocab: present.

### 8. `parole-and-release`
- Summary: after half the sentence (`crime_parole_age`), a yearly hearing (event, `custody-ok`). Chance rises with `crime_behaviour` and `crime_respect`; grant ends the prison occupation and sets `crime_on_parole`. A violation (any escape-like or riot-linked event, or failed parole check) sends the player back to `custody-intake`. Serving full term fires one release event (`released` milestone). Juvie release is by 18.
- Trigger: event (yearly, `when: confined` and age past parole), action for parole-officer visits.
- Entry: `crime_term > 0`; age past `crime_parole_age`; prison (not juvenile).
- Frequency: most sentenced adults get a parole hearing; the release event fires once per sentence.
- Covers: D6 (half sentence, yearly hearing, behaviour and respect raise chance, violation sends back); D2 (`release_age` plus one release event).
- Needs: `end_occupation(prison)` custody-ok, `reach_milestone(released)`, `quality.crime_on_parole`, `crime_parole_age`, `chance`. Vocab: `reach_milestone` present; `released` milestone new (crime `provides: milestones`).

### 9. `juvie`
- Summary: juvenile_detention life for under-18s. High school continues (school study actions tagged `custody-ok`, core-loop has them). Juvenile events (counsellor, fights, mentor); release at the earlier of sentence end or 18 (hook `on_age_up_post`). Ends by 18 (acceptance).
- Trigger: events and actions while `juvenile_detention` held.
- Entry: `juvenile_detention` occupation; age 12-17.
- Frequency: most juvie sentences are short; juvie in roughly 1 in 10 lives under 18 who commit crimes [INFERENCE].
- Covers: D4 (high school continues in juvie); #236 juvie ends by 18; juvenile branch of D2/D3.
- Needs: `age`, `person.age` guard `(age < 18) == (person.age < 18)` where ties; hook `on_age_up_post`; `end_occupation` at release. Vocab: `age` present; the juvie occupation new.

### 10. `record-clearing`
- Summary: appeal (paid lawyer, once per conviction) and expungement (after `crime_years_clean` reaches the threshold and age 18+) clear `crime_record`. Clearing lifts the `hiring_blocked` contribution so professional `apply-*` ladders open again (entry jobs always hire).
- Trigger: action, menu `assets/legal` (new submenu).
- Entry: `crime_record > 0`; for appeal, `crime_convictions > 0` and money for lawyer; for expungement, `crime_years_clean >= N` and age >= 18.
- Frequency: few lives [INFERENCE].
- Covers: D7 (record blocks professional ladders; appeal or expungement clears).
- Needs: `quality.crime_record` (write 0), `crime_years_clean` counter, `hiring_blocked` readable (existing `readables/hiring.yaml`). Vocab: `hiring_blocked` slot present; `apply-*` gated by `not hiring_blocked` in core-loop `storylets/jobs.yaml`.

## Data item (not a chain)

Separate from the chains; lives in pack-level files.

- Kinds: `jurisdiction` (`kinds/jurisdiction.yaml`; fields `death_penalty` bool, `juvenile_age` int, `default` bool; entries `packs/crime/jurisdiction/*.yaml`; one entry `default: true` with death penalty on for v1). Replaces the archive's `crime_death_penalty` quality (decision 3: per-country data). `provides: kinds`.
- Occupations: `prison` (group `custody`, full-time, age>=18, pay 0, `confines: { menus: true, events: true }`, icon 🔒, provides housing via confinement); `juvenile_detention` (group `custody`, age<18, same confinement); `prison_work` (group `prison_work`, confines, small pay). Two custody occupations held together are combined (lock if any).
- People: role `inmate` (Cellmate); generators `inmate-gen` (age 19-55), `inmate-gen-juvenile` (13-17). Archive draft has these; re-check against `people.schema.json`.
- Qualities (crime_ prefix): `crime_record` (existing), `crime_wanted`, `crime_pending_charge` (existing), `crime_severity`, `crime_resisting`, `crime_lawyer` (0..2), `crime_plea`, `crime_term`, `crime_release_age`, `crime_parole_age`, `crime_on_parole`, `crime_death_row`, `crime_behaviour` (0..100, default 50), `crime_respect` (0..100), `crime_gang`, `crime_escaped`, `crime_murders`, counters `crime_arrests`, `crime_convictions`, `crime_sentences`, `crime_escapes`, `crime_years_clean`. Lint: keep L006 allow on `crime_record` (conviction storylets set it; once `court` lands, the allow reason is stale and can be removed).
- Readables: `hiring_blocked` contribution (existing). No new slots proposed.
- Milestones: `released` (provides milestones; core milestones are `graduated`, `first_job`, `married`, `first_child`, `retired`).
- Hooks: `on_age_up_post` forces release of `juvenile_detention` at 18 if still held (enforces "juvie ends by 18").
- Effect macros (`packs/crime/effects/`): sentence table (severity × term) called as `crime.sentence(severity)`.
- Harness metrics (`harness/metrics.yaml`): arrest rate, conviction rate, mean sentence years, recidivism, escape rate, execution rate (per life), prison share of lives, ex-convict employment, net worth at 65, empty-slot share while confined, juvie-ended-by-18 check, custody-with-job check (both must be 0 faults).
- Harness profiles (`harness/profiles.yaml`): `criminal` (default false; prefers crime, violence, escape; parole). Random down-weighting is a GAP (below).
- Forced scripts (`harness/force/`): `escape.yaml` (roll escape, choose escape), `death-penalty.yaml` (murder, jurisdiction on), `juvie.yaml` (sentence under 18). Entries that never fire fail the run, so each forced script must reach its storylet.
- BALANCE.md (fill in #237: sentence and years-served p50/p90, ex-convict employment and net worth at 65, empty slots while confined under 5%).
- Docs: CONTEXT.md (glossary exists; add custody, parole, juvenile_detention, jurisdiction).

## Grill decision coverage

| # | Decision | Covered by |
|---|---|---|
| D1 | Crimes from 12; six non-repeatable property crimes, cooldown 1; assault and murder person-scoped behind confirm; hitmen and serial later | `property-crime`, `violence`. Hitmen, serial killers, Youth-expansion mischief: out of scope (GAP G5) |
| D2 | Arrest and court: cooperate/run/bribe; free public defender or paid lawyer (scales with quality); plea or trial; sentence from crime, record, lawyer, luck; `release_age` plus one release event | `arrest`, `court`, `custody-intake`, `parole-and-release` (release event) |
| D3 | Death penalty: murder only; per-country data; v1 one default jurisdiction; life sentences exist | `court` (death sentence), data item `jurisdiction` kind. Life sentence: `court` sentence table |
| D4 | Imprisonment: jobs, university and retirement pay end; high school continues in juvie; loans keep billing, repossession after 3 missed; housing provided | `custody-intake` (end occupations; housing via confinement), `juvie` (school continues). Loans: engine (secured only) |
| D5 | Prison life: ~9 actions; one cellmate per sentence; riots; escape once a year | `prison-life`, `escape` |
| D6 | Parole after half the sentence; yearly hearing; behaviour and respect; violation sends back | `parole-and-release` |
| D7 | Record blocks professional ladders; entry jobs still hire; appeal or expungement clears | existing `hiring_blocked` readable, `record-clearing` |
| D8 | Prerequisites #117, #112 (confinement, custody-ok, provided housing; group checks); core-loop v-next (mailbox, custody-ok tags, `apply-*` gating) | data item (`depends`); #117 and #112 are closed; custody-ok tags and apply gating already on main (see GAPS for what remains) |
| D9 | `crime_` qualities; `criminal` profile; crime down-weighted in `random`; custody not counted as employment; metrics | data item (qualities, profile, metrics); random and employment are GAPS G1-G2 |

## GAPS

- **G1. Harness counts custody as employment.** `packages/harness/src/run.ts:483` treats any occupation with `group !== "school"` and not retired as employment. A `prison` or `prison_work` occupation counts as a job, so `everEmployed` and the employment rate are wrong. Fix needs a harness or engine change (exclude `confines` occupations) outside `packs/crime/`. Decision D9 cannot be met inside the pack alone.
- **G2. `random` profile is core-loop-owned.** `packs/core-loop/harness/profiles.yaml` `random` uses `rules: [{}]` with no weights. Crime cannot down-weight itself there; needs a core-loop profile change or a harness knob. Until then crime will dominate random lives' choices more than desired.
- **G3. No group-level end of occupations.** `end_occupation` takes one kind; there is no `end_group` (documented in expressions.md). `custody-intake`, `parole-and-release`, and `escape` must enumerate every job, school and retirement kind the player can hold, including other packs'. A new pack's job kind is not ended automatically. Needs a core rule or an agreed list; flag for main.
- **G4. `karma` dependency.** Archive draft `pack.yaml` has `depends: [core-loop]` only, but `violence`/`property-crime` use `quality.karma`. Add `karma` to `depends` and confirm the capability id.
- **G5. Out of scope.** Hitmen, serial killers, Youth-expansion mischief (decision 1, later packs).
- **G6. Not checked.** #109 (living standard hook) status; `die("murdered")` cause naming; exact `kind()` lookup syntax for jurisdictions. Verify in compile.
- **G7. Archive names stale.** Archive uses `criminal_record`, `wanted`, `pending_charge`. Use current names throughout; do not reuse archive ids.

Resolved (no action): #117 and #112 are closed; `custody-ok` is already on core-loop's mortality, illness, loan, education, and NPC storylets; `apply-*` is gated by `hiring_blocked` in core-loop `storylets/jobs.yaml`; `milestones.ts` excludes `confines` from `first_job`; `careers.ts` excludes `confines` occupations from NPC careers; `living.ts` treats confinement as housing.

## Vocab notes (`pnpm tool vocab --packs crime,core-loop,karma,dating,gambling,relocation,vacations`)

- Present: qualities `crime_pending_charge`, `crime_record`, `crime_wanted`; readable `hiring_blocked`; tags `custody-ok`, `loan`, `mortality`, `illness`, `npc`, `education`, `school`, `job`, `apply`, `promotion`, `retirement`; groups `full-time`, `part-time`, `school`; roles `core-loop/{child,classmate,coworker,friend,parent,partner,sibling,spouse}`; effects `reach_milestone`, `schedule`, `unschedule`, `die`, `move_to`, `set_standard`; functions `in_group`, `years_in_group`, `milestone_reached`, `kin`, `is_kin`, `count_kin`.
- New from crime: tag `crime`; submenus `activities/crime`, `relationships/crime`, `assets/legal`, `occupation/prison`; occupations `prison`, `juvenile_detention`, `prison_work`; groups `custody`, `prison_work`; role `inmate`; milestone `released`; kind `jurisdiction`; qualities listed in the data item.
- Engine-reserved (not in vocab output): `confined`, `person.role`, `person.closeness`.

## Suggested checks for main

- `compilePacks({ only: ['crime'] })` with the closure; vocab rerun; `nix develop -c pnpm tool vocab --packs crime,...`.
- Harness: `crime` profile run with forced scripts; confirm G1 and G2 before trusting employment and random numbers.
- Test file: one assertion per chain (prison has no job, juvie ends by 18, conviction blocks professional apply, record clears).
