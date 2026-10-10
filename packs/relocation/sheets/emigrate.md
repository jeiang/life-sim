# Content sheet: Emigration

- pack: relocation
- packs: relocation,core-loop
- profile: all
- lives: 1000

> Chains 1 to 3 of the relocation pack: apply to emigrate, the approval roll, the job fork, and the arrival abroad.
> Abroad indexes are 0..7 (0 Toronto, 1 Montreal, 2 London, 3 Manchester, 4 Tokyo, 5 Osaka, 6 Mexico City, 7 Guadalajara). `quality.reloc_pending` marks an approved application awaiting arrival; `quality.reloc_pending_dest` is only read while it is set.
> `quality.reloc_job_fork` is an entry flag set by move-back-home and move-city-abroad (moves.md). `emigrate-job-fork` accepts both entries, and every outcome clears the flag.
> Home city is recorded at approval (index in `packs/core-loop/cities/cities.yaml` order: 1 dustwater, 2 harborview, 3 maple-falls, 4 riverton, 5 lakeshore, 6 goldcrest). Move-back-home reads `quality.reloc_home_city`.
> `age`, `money`, `confined`, `city.id`, `in_group`, `has_occupation` and `has_remote_job()` are engine names from pack-format.md (not listed in the VOCAB printout).
> Job ends use `end_group("full-time")` and `end_group("part-time")` (merged, PR 297). Remote jobs survive only when the boss agrees.
> Chain steps (`decision`, `job-fork`, `arrive`) are reached by `next` and use `chance: 0%`. They do not depend on the yearly chance cap.

## emigrate-apply
- trigger: action
- menu: assets/housing
- label: Apply to emigrate
- icon: 📝
- tags: apply, travel
- when: age >= 18 and not in_group(school) and not confined and not quality.reloc_abroad and not quality.reloc_pending and not quality.reloc_job_fork and money >= 300000
- cooldown: 1
- text: Abroad is on the table. The application fee is $3,000 and it does not come back. Pick a country and see what the immigration office thinks.
- needs: quality reloc_applications: integer 0.., default 0: emigration applications filed
- needs: quality reloc_denials: integer 0.., default 0: emigration applications denied
- needs: quality reloc_emigrations: integer 0.., default 0: completed emigrations
- needs: quality reloc_abroad: flag, default false: the player lives abroad
- needs: quality reloc_pending: flag, default false: an approved application is awaiting arrival
- needs: quality reloc_pending_dest: integer 0..7, default 0: approved abroad index (read while reloc_pending)
- needs: quality reloc_dest: integer 0..7, default 0: abroad index the player lives in (0 Toronto to 7 Guadalajara; read while reloc_abroad)
- needs: quality reloc_home_country: integer 0..5, default 0: code of the country the player left from (1 US, 2 Canada, 3 UK, 4 Japan, 5 Mexico, 0 none)
- needs: quality reloc_home_city: integer 0..6, default 0: index of the domestic city emigrated from (0 unknown)
- needs: quality reloc_job_fork: flag, default false: a move is underway; emigrate-job-fork reads it and clears it (owned by moves.md)
- needs: effect end_group: effect, one group-id argument ("full-time" or "part-time"): ends every occupation of the player in that group (merged, PR 297)
- needs: city relocation/toronto: content id, abroad index 0: Toronto, Canada (relocation/cities, pending)
- needs: city relocation/montreal: content id, abroad index 1: Montreal, Canada (relocation/cities, pending)
- needs: city relocation/london: content id, abroad index 2: London, UK (relocation/cities, pending)
- needs: city relocation/manchester: content id, abroad index 3: Manchester, UK (relocation/cities, pending)
- needs: city relocation/tokyo: content id, abroad index 4: Tokyo, Japan (relocation/cities, pending)
- needs: city relocation/osaka: content id, abroad index 5: Osaka, Japan (relocation/cities, pending)
- needs: city relocation/mexico-city: content id, abroad index 6: Mexico City, Mexico (relocation/cities, pending)
- needs: city relocation/guadalajara: content id, abroad index 7: Guadalajara, Mexico (relocation/cities, pending)
- needs: effect relocation.remember_home: macro, no arguments: records the current domestic city (reloc_home_city) and the US as the home country (reloc_home_country = 1)
- opens: 0.2..0.5 per life

### choice: Toronto, Canada
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 0
  - next: emigrate-decision
  - rate: 100..100%

### choice: Montreal, Canada
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 1
  - next: emigrate-decision
  - rate: 100..100%

### choice: London, UK
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 2
  - next: emigrate-decision
  - rate: 100..100%

### choice: Manchester, UK
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 3
  - next: emigrate-decision
  - rate: 100..100%

### choice: Tokyo, Japan
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 4
  - next: emigrate-decision
  - rate: 100..100%

### choice: Osaka, Japan
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 5
  - next: emigrate-decision
  - rate: 100..100%

### choice: Mexico City, Mexico
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 6
  - next: emigrate-decision
  - rate: 100..100%

### choice: Guadalajara, Mexico
- outcome: 1
  - text: The forms go out. Your $3,000 is gone, and the waiting starts.
  - effect: money -= 300000
  - effect: quality.reloc_applications += 1
  - effect: quality.reloc_pending = true
  - effect: quality.reloc_pending_dest = 7
  - next: emigrate-decision
  - rate: 100..100%

### choice: Never mind
- outcome: 1
  - text: You close the folder and keep your money.
  - rate: 100..100%

## emigrate-decision
- trigger: event
- icon: 📋
- chance: 0%
- tags: apply
- text: Your file lands on a desk in a grey office. A stranger reads it and decides where your next decade happens.
- opens: 0.2..0.5 per life

### outcomes
- outcome: clamp(40 + stat.smarts / 5 + ((quality.has_degree_business or quality.has_degree_engineering or quality.has_degree_nursing or quality.has_degree_arts) ? 10 : 0) + min(15, quality.years_worked) + min(10, money / 1000000) - 5 * min(quality.reloc_denials, 3), 5, 95)
  - text: The letter says approved. Start packing, and find out where the plane goes.
  - effect: relocation.remember_home()
  - effect: journal("Your emigration application is approved.")
  - next: emigrate-job-fork
  - rate: 50..70%
- outcome: 100 - clamp(40 + stat.smarts / 5 + ((quality.has_degree_business or quality.has_degree_engineering or quality.has_degree_nursing or quality.has_degree_arts) ? 10 : 0) + min(15, quality.years_worked) + min(10, money / 1000000) - 5 * min(quality.reloc_denials, 3), 5, 95)
  - text: The letter says denied. The fee is gone, and you can try again next year.
  - effect: quality.reloc_denials += 1
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: stat.happiness -= 4
  - effect: journal("Your emigration application is denied. You can try again next year.")
  - rate: 30..50%

## emigrate-job-fork
- trigger: event
- icon: 💼
- chance: 0%
- tags: job
- text: You are approved. Before you pack, there is the matter of your job.
- opens: 0.12..0.3 per life

### outcomes
- outcome: 1
  - when: not in_group("full-time") and not in_group("part-time")
  - effect: quality.reloc_job_fork = false
  - text: You have no job to leave behind. Pack the sweaters.
  - next: relocation-arrive
  - rate: 28..40%
- outcome: 1
  - when: has_occupation(core-loop/retired)
  - effect: quality.reloc_job_fork = false
  - text: Retirement follows you overseas. The pension keeps coming.
  - next: relocation-arrive
  - rate: 4..8%
- outcome: clamp(40 + stat.smarts / 5 + quality.work_effort * 6 + min(15, quality.years_worked), 5, 95)
  - when: has_remote_job() and not has_occupation(core-loop/retired)
  - effect: quality.reloc_job_fork = false
  - text: Your boss agrees you can keep working remotely from wherever you land.
  - next: relocation-arrive
  - rate: 4..7%
- outcome: 100 - clamp(40 + stat.smarts / 5 + quality.work_effort * 6 + min(15, quality.years_worked), 5, 95)
  - when: has_remote_job() and not has_occupation(core-loop/retired)
  - effect: quality.reloc_job_fork = false
  - text: Your boss wants you in the office, so the job goes with the move.
  - effect: end_group("full-time")
  - effect: end_group("part-time")
  - next: relocation-arrive
  - rate: 1..3%
- outcome: 1
  - when: (in_group("full-time") or in_group("part-time")) and not has_remote_job() and not has_occupation(core-loop/retired)
  - effect: quality.reloc_job_fork = false
  - text: You hand in your notice. The team throws a small party and forgets to get you a card.
  - effect: end_group("full-time")
  - effect: end_group("part-time")
  - next: relocation-arrive
  - rate: 45..60%

## relocation-arrive
- trigger: event
- icon: ✈️
- chance: 0%
- tags: travel
- when: quality.reloc_pending
- text: The plane lands, and the rest of your life starts in a new country.
- opens: 0.12..0.3 per life

### outcomes
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 0
  - text: Toronto. Cold mornings, polite lineups, and a surprising number of opinions about hockey. Your new life starts on Monday.
  - effect: move_to(relocation/toronto)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 0
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_english = max(quality.reloc_lang_english, 20)
  - effect: journal("You land in Toronto with two suitcases and a plan.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 1
  - text: Montreal. The bagels are excellent, the French moves faster than your textbook, and the winters are a personality test.
  - effect: move_to(relocation/montreal)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 1
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_french = max(quality.reloc_lang_french, 20)
  - effect: journal("You land in Montreal and start learning French.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 2
  - text: London. The rent is outrageous, the rain never quite stops, and the tea is worth every penny.
  - effect: move_to(relocation/london)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 2
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_english = max(quality.reloc_lang_english, 20)
  - effect: journal("You land in London and find out what rent really costs.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 3
  - text: Manchester. Cheaper than London, louder than most places, and the music never stops.
  - effect: move_to(relocation/manchester)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 3
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_english = max(quality.reloc_lang_english, 20)
  - effect: journal("You land in Manchester and the city feels like it has been waiting for you.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 4
  - text: Tokyo. The trains run on time, the lights never sleep, and you have to learn the subway map fast.
  - effect: move_to(relocation/tokyo)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 4
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_japanese = max(quality.reloc_lang_japanese, 20)
  - effect: journal("You land in Tokyo and the trains are somehow more punctual than you hoped.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 5
  - text: Osaka. Street food on every corner, and a city that will happily tell you how to eat it.
  - effect: move_to(relocation/osaka)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 5
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_japanese = max(quality.reloc_lang_japanese, 20)
  - effect: journal("You land in Osaka and go straight for the street food.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 6
  - text: Mexico City. Traffic, tacos, and a wall of noise that somehow becomes home fast.
  - effect: move_to(relocation/mexico-city)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 6
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_spanish = max(quality.reloc_lang_spanish, 20)
  - effect: journal("You land in Mexico City and the noise starts to feel like home.")
  - rate: 10..15%
- outcome: 1
  - when: quality.reloc_pending and quality.reloc_pending_dest == 7
  - text: Guadalajara. Mariachi on the corner, a warm sun, and a dry sense of humor you will never quite match.
  - effect: move_to(relocation/guadalajara)
  - effect: quality.reloc_abroad = true
  - effect: quality.reloc_dest = 7
  - effect: quality.reloc_pending = false
  - effect: quality.reloc_pending_dest = 0
  - effect: quality.reloc_emigrations += 1
  - effect: quality.reloc_lang_spanish = max(quality.reloc_lang_spanish, 20)
  - effect: journal("You land in Guadalajara and the sun is out for the first time in weeks.")
  - rate: 10..15%
