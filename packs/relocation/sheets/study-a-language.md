# Content sheet: Study a language

- pack: relocation
- packs: relocation, core-loop, karma
- profile: all
- lives: 1000

> One action storylet with seven choices, one per language. English is dropped: `reloc_lang_english` starts at 100 and never falls, so its choice could never be offered (lint L002, issue #226).
> Skill gains are hand-coded because qualities are not scaled by the repeat curve. Thresholds match the storylet's `repeat` (full 1-3 uses a year, a quarter from 4-8, none from 9). Gains taper with current skill: `max(1, (100 - skill) / 12)` full, `/ 48` reduced for productive study; half of each for slow study. The `max(1, ...)` floor means a reduced use always adds at least 1 while the skill is below 100.
> Smarts and happiness go through the Core curve: smarts shrinks on reduced uses; the happiness cost is a negative change, so it never shrinks.
> Outcome weights are constant (60 productive, 40 slow, split into two text variants each), so rates are exact.
> Implementer: set `repeat` on the storylet as written here. Relocation's manifest sets no curve, and the engine default (10/20) would otherwise apply. Core-loop's manifest uses 3/8.

## study-a-language
- trigger: action
- icon: 📚
- menu: activities/languages
- label: Study a language
- tags: education, language
- when: age >= 6
- repeatable: true
- repeat.full: 3
- repeat.reduced: 8
- repeat.factor: 25%
- text: You pick up a course and wonder which language is worth the headache.
- opens: 0.35..0.6 per life

### choice: Spanish
- when: quality.reloc_lang_spanish < 100
- outcome: 30
  - text: Two weeks of verb conjugations, and ¡hola! finally sticks.
  - effect: quality.reloc_lang_spanish += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_spanish) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_spanish) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: Flashcards and a telenovela do the work. Your Spanish gets a little braver.
  - effect: quality.reloc_lang_spanish += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_spanish) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_spanish) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: The subjunctive defeats you again. A few words still stick.
  - effect: quality.reloc_lang_spanish += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_spanish) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_spanish) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: You study in the car and forget half of it by the time you park.
  - effect: quality.reloc_lang_spanish += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_spanish) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_spanish) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%

### choice: French
- when: quality.reloc_lang_french < 100
- outcome: 30
  - text: The accent marks mostly make sense now. Your French gets sharper.
  - effect: quality.reloc_lang_french += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_french) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_french) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: A patient tutor corrects your vowels until you can order a coffee without flinching.
  - effect: quality.reloc_lang_french += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_french) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_french) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: You lose an hour to the gender of nouns. Some of it goes in.
  - effect: quality.reloc_lang_french += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_french) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_french) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: Your audio course keeps getting stuck on the same sentence.
  - effect: quality.reloc_lang_french += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_french) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_french) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%

### choice: German
- when: quality.reloc_lang_german < 100
- outcome: 30
  - text: Three noun cases in one sitting. Somehow you come out understanding more.
  - effect: quality.reloc_lang_german += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_german) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_german) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: You learn Schadenfreude and feel weirdly at home.
  - effect: quality.reloc_lang_german += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_german) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_german) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: Der, die, das. You give up halfway and eat a pretzel.
  - effect: quality.reloc_lang_german += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_german) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_german) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: The compound words keep getting longer. Your head hurts, but a few stick.
  - effect: quality.reloc_lang_german += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_german) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_german) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%

### choice: Italian
- when: quality.reloc_lang_italian < 100
- outcome: 30
  - text: Your hands help more than the grammar does, but the grammar helps too.
  - effect: quality.reloc_lang_italian += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_italian) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_italian) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: An opera recording and a notebook of drills. The vowels finally start to sound right.
  - effect: quality.reloc_lang_italian += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_italian) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_italian) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: You mix up two verbs for 'to be', and the cafe waiter laughs kindly.
  - effect: quality.reloc_lang_italian += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_italian) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_italian) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: A slow afternoon with a grammar book. The pages stick less than you hoped.
  - effect: quality.reloc_lang_italian += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_italian) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_italian) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%

### choice: Japanese
- when: quality.reloc_lang_japanese < 100
- outcome: 30
  - text: Hiragana stops looking like scribbles. A small victory.
  - effect: quality.reloc_lang_japanese += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_japanese) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_japanese) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: Kanji flashcards at the kitchen table. Three more characters stick.
  - effect: quality.reloc_lang_japanese += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_japanese) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_japanese) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: The particles blur together. You sleep on it and forget half by morning.
  - effect: quality.reloc_lang_japanese += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_japanese) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_japanese) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: You give the stroke order your best try. The character still looks wrong.
  - effect: quality.reloc_lang_japanese += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_japanese) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_japanese) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%

### choice: Mandarin
- when: quality.reloc_lang_mandarin < 100
- outcome: 30
  - text: The tones are a nightmare, but your ear starts to catch them.
  - effect: quality.reloc_lang_mandarin += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_mandarin) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_mandarin) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: A tutor makes you say ma, ma, ma, ma until the neighbors complain.
  - effect: quality.reloc_lang_mandarin += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_mandarin) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_mandarin) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: You spend the hour on tones and still can't tell mother from horse.
  - effect: quality.reloc_lang_mandarin += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_mandarin) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_mandarin) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: Character drills on the bus. You learn three and lose two.
  - effect: quality.reloc_lang_mandarin += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_mandarin) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_mandarin) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%

### choice: Korean
- when: quality.reloc_lang_korean < 100
- outcome: 30
  - text: Hangul clicks into place in one long evening. Everything else is still hard.
  - effect: quality.reloc_lang_korean += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_korean) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_korean) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 30
  - text: A drama with the subtitles off for the last ten minutes. You catch a few words.
  - effect: quality.reloc_lang_korean += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_korean) / 12) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_korean) / 48) : 0))
  - effect: stat.smarts += 1
  - rate: 30..30%
- outcome: 20
  - text: The honorifics leave you tangled up. You give up for the day.
  - effect: quality.reloc_lang_korean += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_korean) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_korean) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
- outcome: 20
  - text: You copy the alphabet from a poster until your hand hurts. Some of it stays.
  - effect: quality.reloc_lang_korean += (uses_this_year <= 3 ? max(1, (100 - quality.reloc_lang_korean) / 24) : (uses_this_year <= 8 ? max(1, (100 - quality.reloc_lang_korean) / 96) : 0))
  - effect: stat.happiness -= 1
  - rate: 20..20%
