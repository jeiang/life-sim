# Content sheet: Relocation moves (chains 4 and 5)

- pack: relocation
- packs: relocation,core-loop

> Chains 4 and 5 of the relocation outline (issue #226): move back home, and move between cities abroad.
> Both are actions in `assets/housing`, the same submenu core-loop's `move-city` uses.
> `move-city-abroad` takes `cooldown: 1` instead of `repeatable` (a repeatable move would let the player ping-pong between cities at $2,500 a hop).
> Both moves end the job unless it can be done remotely and the boss agrees. Each sets `quality.reloc_job_fork` and then `next: emigrate-job-fork` (chain 2). Chain 2 owns the boss roll and the `end_occupation` calls. Its outcomes clear `reloc_job_fork`.
> Indexes follow chains 1-3 (binding, Main): `quality.reloc_home_city` 1 dustwater, 2 harborview, 3 maple-falls, 4 riverton, 5 lakeshore, 6 goldcrest (0 unknown). `quality.reloc_dest` 0 toronto, 1 montreal, 2 london, 3 manchester, 4 tokyo, 5 osaka, 6 mexico-city, 7 guadalajara.
> Move home returns to the domestic city the player left from (`reloc_home_city`), so each choice is gated on its index and only one shows.
> Abroad-to-abroad moves are all-to-all among the eight abroad cities. The outline's "ring" is read as every non-origin pair. Returns to a domestic city are chain 4 only.
> `opens` bands are INFERENCE (outline: 0-1 per life each). Widen after the focused sim.

## move-back-home
> review: job-fork flag contract is handled in emigrate.md (emigrate-job-fork requires and clears reloc_job_fork in every outcome). No change needed here.
- trigger: action
- menu: assets/housing
- label: Move back home
- tags: relocation
- when: age >= 18 and not confined and not in_group(school) and quality.reloc_abroad and quality.reloc_home_city > 0 and money >= 150000
- text: Going home costs $1,500 and needs no approval. Your job comes with you only if it can be done remotely and your boss agrees.
- opens: 0.02..0.2 per life
- needs: quality reloc_abroad: flag, default false: the player lives in a city abroad; set by emigration and childhood moves, cleared by moving home
- needs: quality reloc_home_city: integer 0..6, default 0: domestic city the player left from (1 dustwater, 2 harborview, 3 maple-falls, 4 riverton, 5 lakeshore, 6 goldcrest; 0 unknown); set at approval
- needs: quality reloc_returns: integer 0..100, default 0: how many times the player has moved back home
- needs: quality reloc_return_age: integer 0..120, default 0: age at the last move back home
- needs: quality reloc_job_fork: flag, default false: a move is underway; chain 2 (emigrate-job-fork) reads it and clears it
- needs: quality reloc_dest: integer 0..7, default 0: abroad destination index (0 toronto, 1 montreal, 2 london, 3 manchester, 4 tokyo, 5 osaka, 6 mexico-city, 7 guadalajara); set on arrival abroad

### choice: Dustwater
- when: quality.reloc_home_city == 1
- outcome: 1
  - text: You book a one-way ticket to Dustwater and pack the car.
  - effect: money -= 150000
  - effect: move_to(core-loop/dustwater)
  - effect: quality.reloc_abroad = false
  - effect: quality.reloc_returns += 1
  - effect: quality.reloc_return_age = age
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved back to Dustwater at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Harborview
- when: quality.reloc_home_city == 2
- outcome: 1
  - text: You move home to Harborview, where the ferry still runs late.
  - effect: money -= 150000
  - effect: move_to(core-loop/harborview)
  - effect: quality.reloc_abroad = false
  - effect: quality.reloc_returns += 1
  - effect: quality.reloc_return_age = age
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved back to Harborview at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Maple Falls
- when: quality.reloc_home_city == 3
- outcome: 1
  - text: You move back to Maple Falls. The maples are still showing off.
  - effect: money -= 150000
  - effect: move_to(core-loop/maple-falls)
  - effect: quality.reloc_abroad = false
  - effect: quality.reloc_returns += 1
  - effect: quality.reloc_return_age = age
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved back to Maple Falls at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Riverton
- when: quality.reloc_home_city == 4
- outcome: 1
  - text: You move back to Riverton. Your old room has become storage.
  - effect: money -= 150000
  - effect: move_to(core-loop/riverton)
  - effect: quality.reloc_abroad = false
  - effect: quality.reloc_returns += 1
  - effect: quality.reloc_return_age = age
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved back to Riverton at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Lakeshore
- when: quality.reloc_home_city == 5
- outcome: 1
  - text: You move back to Lakeshore. The water is cold and the neighbors are nosy.
  - effect: money -= 150000
  - effect: move_to(core-loop/lakeshore)
  - effect: quality.reloc_abroad = false
  - effect: quality.reloc_returns += 1
  - effect: quality.reloc_return_age = age
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved back to Lakeshore at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Goldcrest
- when: quality.reloc_home_city == 6
- outcome: 1
  - text: You move back to Goldcrest. The rent hurts, but the lights are wonderful.
  - effect: money -= 150000
  - effect: move_to(core-loop/goldcrest)
  - effect: quality.reloc_abroad = false
  - effect: quality.reloc_returns += 1
  - effect: quality.reloc_return_age = age
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved back to Goldcrest at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

## move-city-abroad
- trigger: action
- menu: assets/housing
- label: Move to another city abroad
- tags: relocation
- cooldown: 1
- when: age >= 18 and not confined and not living.with_parents and quality.reloc_abroad and money >= 250000
- text: Moving between cities abroad costs $2,500. Your job ends unless it can be done remotely and your boss agrees.
- opens: 0.05..0.4 per life
- needs: city relocation/toronto: city in relocation data (country ca): abroad destination 0 (Toronto)
- needs: city relocation/montreal: city in relocation data (country ca): abroad destination 1 (Montreal)
- needs: city relocation/london: city in relocation data (country uk): abroad destination 2 (London)
- needs: city relocation/manchester: city in relocation data (country uk): abroad destination 3 (Manchester)
- needs: city relocation/tokyo: city in relocation data (country jp): abroad destination 4 (Tokyo)
- needs: city relocation/osaka: city in relocation data (country jp): abroad destination 5 (Osaka)
- needs: city relocation/mexico-city: city in relocation data (country mx): abroad destination 6 (Mexico City)
- needs: city relocation/guadalajara: city in relocation data (country mx): abroad destination 7 (Guadalajara)

### choice: Toronto
- when: city.id != relocation/toronto
- outcome: 1
  - text: You settle into Toronto. Strangers apologize to you for things you did not do.
  - effect: money -= 250000
  - effect: move_to(relocation/toronto)
  - effect: quality.reloc_dest = 0
  - effect: quality.reloc_lang_english = max(quality.reloc_lang_english, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Toronto at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Montreal
- when: city.id != relocation/montreal
- outcome: 1
  - text: You settle into Montreal. Your French is embarrassing but improving.
  - effect: money -= 250000
  - effect: move_to(relocation/montreal)
  - effect: quality.reloc_dest = 1
  - effect: quality.reloc_lang_french = max(quality.reloc_lang_french, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Montreal at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: London
- when: city.id != relocation/london
- outcome: 1
  - text: You settle into London. The rent is a crime, but the tea is good.
  - effect: money -= 250000
  - effect: move_to(relocation/london)
  - effect: quality.reloc_dest = 2
  - effect: quality.reloc_lang_english = max(quality.reloc_lang_english, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to London at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Manchester
- when: city.id != relocation/manchester
- outcome: 1
  - text: You settle into Manchester. It rains, and nobody seems to mind.
  - effect: money -= 250000
  - effect: move_to(relocation/manchester)
  - effect: quality.reloc_dest = 3
  - effect: quality.reloc_lang_english = max(quality.reloc_lang_english, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Manchester at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Tokyo
- when: city.id != relocation/tokyo
- outcome: 1
  - text: You settle into Tokyo. The trains are perfect, and so is everyone's timing.
  - effect: money -= 250000
  - effect: move_to(relocation/tokyo)
  - effect: quality.reloc_dest = 4
  - effect: quality.reloc_lang_japanese = max(quality.reloc_lang_japanese, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Tokyo at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Osaka
- when: city.id != relocation/osaka
- outcome: 1
  - text: You settle into Osaka. People here tell you exactly what they think.
  - effect: money -= 250000
  - effect: move_to(relocation/osaka)
  - effect: quality.reloc_dest = 5
  - effect: quality.reloc_lang_japanese = max(quality.reloc_lang_japanese, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Osaka at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Mexico City
- when: city.id != relocation/mexico-city
- outcome: 1
  - text: You settle into Mexico City. The street food is excellent and the traffic is a sport.
  - effect: money -= 250000
  - effect: move_to(relocation/mexico-city)
  - effect: quality.reloc_dest = 6
  - effect: quality.reloc_lang_spanish = max(quality.reloc_lang_spanish, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Mexico City at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%

### choice: Guadalajara
- when: city.id != relocation/guadalajara
- outcome: 1
  - text: You settle into Guadalajara. The sun is warm and the pace is slow.
  - effect: money -= 250000
  - effect: move_to(relocation/guadalajara)
  - effect: quality.reloc_dest = 7
  - effect: quality.reloc_lang_spanish = max(quality.reloc_lang_spanish, 20)
  - effect: quality.reloc_job_fork = true
  - effect: journal("Moved to Guadalajara at age {age}.")
  - next: emigrate-job-fork
  - rate: 100..100%
