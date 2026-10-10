# Content sheet: Abroad language growth

- pack: relocation
- packs: relocation,core-loop
- profile: all
- lives: 1000

> Chain 9 (issue #227). Yearly while the player lives abroad, the destination-language skill grows, and a low skill costs happiness and, through the job readable, professional applications.
> Destination is read from `city.id` (relocation city ids are `relocation/<city>`), not from `reloc_dest`. Language ids are `quality.reloc_lang_<language>` (relocation/languages, existing).
> English cities (toronto, london, manchester) never open either storylet: `quality.reloc_lang_english` is 100 and never falls, so every gate below is false there.
> Growth outcomes are exclusive by city, so their `rate` is left out; within each language the two text variants share the outcome weight 1 each.
> Barrier rates are 50..50% (two variants, weight 1 each, same effect).
> Job friction replaces the `quality.interview_score -= 1` effect, per relocation GAPS-RESOLVED #4. It is a readable contribution to core-loop slot `hiring_blocked` (listed in needs), so it blocks professional `apply-*` jobs only, not entry jobs.
> Contribution expression for the implementer (`packs/relocation/readables/hiring.yaml`): `quality.reloc_abroad and (((city.id == relocation/tokyo or city.id == relocation/osaka) and quality.reloc_lang_japanese < 20) or ((city.id == relocation/mexico-city or city.id == relocation/guadalajara) and quality.reloc_lang_spanish < 20) or (city.id == relocation/montreal and quality.reloc_lang_french < 20))`.
> Opens bands are INFERENCE: growth assumes about 0.2..0.3 abroad stints per life, about 60% to non-English cities, lasting about 20 years (skill climbs 3 a year, so long stints keep growth open until 100). Barrier assumes about 7 years per non-English stint from the arrival floor of 20, fewer if the player studied first. Confirm with the focused sim.

## abroad-language-growth
- trigger: event
- icon: 📖
- chance: 100%
- when: quality.reloc_abroad and (((city.id == relocation/tokyo or city.id == relocation/osaka) and quality.reloc_lang_japanese < 100) or ((city.id == relocation/mexico-city or city.id == relocation/guadalajara) and quality.reloc_lang_spanish < 100) or (city.id == relocation/montreal and quality.reloc_lang_french < 100))
- tags: language
- text: You spend another year abroad, and the local language slowly gets easier to follow.
- opens: 2..7 per life
- needs: city relocation/tokyo: id from relocation/cities: abroad city in Japan, destination language Japanese
- needs: city relocation/osaka: id from relocation/cities: abroad city in Japan, destination language Japanese
- needs: city relocation/mexico-city: id from relocation/cities: abroad city in Mexico, destination language Spanish
- needs: city relocation/guadalajara: id from relocation/cities: abroad city in Mexico, destination language Spanish
- needs: city relocation/montreal: id from relocation/cities: abroad city in Canada, destination language French
- needs: contribution hiring_blocked: bool slot, relocation term added to it: true while abroad and destination-language skill is below 20; blocks professional apply-* jobs only
- needs: quality reloc_abroad: flag, default false: the player lives abroad

### outcomes
- outcome: 1
  - text: You order dinner in Japanese without the menu, and the waiter only looks mildly surprised.
  - when: city.id == relocation/tokyo or city.id == relocation/osaka
  - effect: quality.reloc_lang_japanese += 3
- outcome: 1
  - text: A neighbour corrects your pronunciation again, and this time you laugh along.
  - when: city.id == relocation/tokyo or city.id == relocation/osaka
  - effect: quality.reloc_lang_japanese += 3
- outcome: 1
  - text: Telenovelas and a patient friend make your Spanish a little less awkward.
  - when: city.id == relocation/mexico-city or city.id == relocation/guadalajara
  - effect: quality.reloc_lang_spanish += 3
- outcome: 1
  - text: You order lunch in Spanish without a single hand gesture. The cook is impressed.
  - when: city.id == relocation/mexico-city or city.id == relocation/guadalajara
  - effect: quality.reloc_lang_spanish += 3
- outcome: 1
  - text: Your French gets a little less squeaky, and the baker stops switching to English.
  - when: city.id == relocation/montreal
  - effect: quality.reloc_lang_french += 3
- outcome: 1
  - text: You follow a whole dinner-table conversation in French. Mostly. The wine helps.
  - when: city.id == relocation/montreal
  - effect: quality.reloc_lang_french += 3

## abroad-language-barrier
- trigger: event
- icon: 😕
- chance: 100%
- when: quality.reloc_abroad and (((city.id == relocation/tokyo or city.id == relocation/osaka) and quality.reloc_lang_japanese < 40) or ((city.id == relocation/mexico-city or city.id == relocation/guadalajara) and quality.reloc_lang_spanish < 40) or (city.id == relocation/montreal and quality.reloc_lang_french < 40))
- tags: language
- text: You find every conversation here takes more effort than it should, and it is starting to wear on you.
- opens: 0.4..2.0 per life
- needs: quality reloc_abroad: flag, default false: the player lives abroad

### outcomes
- outcome: 1
  - text: Ordering coffee feels like an exam you keep failing.
  - effect: stat.happiness -= 1
  - rate: 50..50%
- outcome: 1
  - text: You nod along in a meeting and pray nobody asks you a question.
  - effect: stat.happiness -= 1
  - rate: 50..50%
