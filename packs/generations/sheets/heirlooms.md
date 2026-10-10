# Content sheet: Family heirlooms

- pack: generations
- packs: core-loop,dating,generations
- profile: all
- lives: 1000

> Chain 5. Five family heirlooms (watch, quilt, clock, violin, letters). Per GAPS-RESOLVED these are NOT market kinds. Each heirloom is a content entry of kind gen_heirloom (label, base, gain, story), and per-person state lives in table gen_heirloom: <id>_held (1 when in the family), <id>_value (current value, minor units), <id>_passed (generations it has passed down).
> Table cells share one range (integer 0..100000000, default 0). Keys are closed, so every key in the needs list below must be declared once in state/*.yaml.
> The needs lines are listed in heirloom-attic-find and apply to the whole sheet. They are not repeated per storylet.
> Succession is NOT in this sheet. The on_succession hook (owned by the succession chain) must, for each id in watch, quilt, clock, violin, letters: copy <id>_held, <id>_value, <id>_passed, <id>_told and <id>_sold from deceased.table.gen_heirloom.<id>_<key> into table.gen_heirloom.<id>_<key> (the heir), then, where held is 1, apply the gain (value += value * gain / 100, using the gen_heirloom gain field) and passed += 1. Estate (cash, home, loans) is settled by core first; heirlooms are not market holdings, so they add nothing to net worth.
> Opens bands below are estimates, not measured. Focused-sim should check them against a run.
> "Life" in max_per_life is the whole run. Attic-find caps at 5 fires per run. History caps at 5 because each heirloom's story is gated by its own told flag, so it fires at most once per heirloom. Family-quarrel uses a cooldown of about one generation.
> Base values for the gen_heirloom entries (minor units, so cents; BASELINE median net worth at 40 is $273,764 in major units): watch 60000 ($600), quilt 20000 ($200), clock 180000 ($1,800), violin 900000 ($9,000), letters 35000 ($350). Each is the entry's base field and the starting value of <id>_value when found.
> Gain and story per gen_heirloom entry (gain is percent per generation): watch gain 8, story: Your grandfather's pocket watch, still ticking if someone winds it on Sunday. quilt gain 5, story: Forty dresses cut into squares, one for each year your family kept sewing together. clock gain 14, story: A mantel clock that set the rhythm of three generations of dinners. violin gain 15, story: A violin with a burned name in the neck, played at every wedding in the county. letters gain 10, story: A bundle of letters tied with string, from a long winter nobody talks about.

## heirloom-attic-find
- trigger: event
- icon: 📦
- weight: 1
- when: age >= 20 and age <= 60 and ((table.gen_heirloom.watch_held == 0 and table.gen_heirloom.watch_sold == 0) or (table.gen_heirloom.quilt_held == 0 and table.gen_heirloom.quilt_sold == 0) or (table.gen_heirloom.clock_held == 0 and table.gen_heirloom.clock_sold == 0) or (table.gen_heirloom.violin_held == 0 and table.gen_heirloom.violin_sold == 0) or (table.gen_heirloom.letters_held == 0 and table.gen_heirloom.letters_sold == 0))
- max_per_life: 5
- text: Clearing out the attic, you find a dusty box with something older than you.
- opens: 0.2..0.5 per life
- needs: kind gen_heirloom: content kind with 5 entries (watch, quilt, clock, violin, letters), fields label (string), base (int, minor units), gain (int, percent per generation), story (string): the five family heirlooms and their appraised value when found
- needs: function kind: (string, string) to int or string: reads the named field of a gen_heirloom entry, e.g. kind("gen_heirloom", watch) followed by .base
- needs: table gen_heirloom.watch_held: integer 0..100000000, default 0: 1 while the watch is held in the family
- needs: table gen_heirloom.quilt_held: integer 0..100000000, default 0: 1 while the quilt is held in the family
- needs: table gen_heirloom.clock_held: integer 0..100000000, default 0: 1 while the clock is held in the family
- needs: table gen_heirloom.violin_held: integer 0..100000000, default 0: 1 while the violin is held in the family
- needs: table gen_heirloom.letters_held: integer 0..100000000, default 0: 1 while the letters are held in the family
- needs: table gen_heirloom.watch_value: integer 0..100000000, default 0: current value of the watch in minor units
- needs: table gen_heirloom.quilt_value: integer 0..100000000, default 0: current value of the quilt in minor units
- needs: table gen_heirloom.clock_value: integer 0..100000000, default 0: current value of the clock in minor units
- needs: table gen_heirloom.violin_value: integer 0..100000000, default 0: current value of the violin in minor units
- needs: table gen_heirloom.letters_value: integer 0..100000000, default 0: current value of the letters in minor units
- needs: table gen_heirloom.watch_passed: integer 0..100000000, default 0: generations the watch has passed down
- needs: table gen_heirloom.quilt_passed: integer 0..100000000, default 0: generations the quilt has passed down
- needs: table gen_heirloom.clock_passed: integer 0..100000000, default 0: generations the clock has passed down
- needs: table gen_heirloom.violin_passed: integer 0..100000000, default 0: generations the violin has passed down
- needs: table gen_heirloom.letters_passed: integer 0..100000000, default 0: generations the letters have passed down
- needs: table gen_heirloom.watch_told: integer 0..100000000, default 0: 1 once the family story for the watch has been told
- needs: table gen_heirloom.quilt_told: integer 0..100000000, default 0: 1 once the family story for the quilt has been told
- needs: table gen_heirloom.clock_told: integer 0..100000000, default 0: 1 once the family story for the clock has been told
- needs: table gen_heirloom.violin_told: integer 0..100000000, default 0: 1 once the family story for the violin has been told
- needs: table gen_heirloom.letters_told: integer 0..100000000, default 0: 1 once the family story for the letters has been told
- needs: table gen_heirloom.watch_sold: integer 0..100000000, default 0: 1 once the watch has been sold, so attic-find never returns it
- needs: table gen_heirloom.quilt_sold: integer 0..100000000, default 0: 1 once the quilt has been sold, so attic-find never returns it
- needs: table gen_heirloom.clock_sold: integer 0..100000000, default 0: 1 once the clock has been sold, so attic-find never returns it
- needs: table gen_heirloom.violin_sold: integer 0..100000000, default 0: 1 once the violin has been sold, so attic-find never returns it
- needs: table gen_heirloom.letters_sold: integer 0..100000000, default 0: 1 once the letters have been sold, so attic-find never returns it

### outcomes
- outcome: 25
  - text: A pocket watch, stopped at 4:17, sits under a yellowed sheet. Someone wound it every Sunday once.
  - when: table.gen_heirloom.watch_held == 0 and table.gen_heirloom.watch_sold == 0
  - effect: table.gen_heirloom.watch_held = 1
  - effect: table.gen_heirloom.watch_value = kind("gen_heirloom", watch).base
  - rate: 20..30%
- outcome: 30
  - text: A patchwork quilt, every square cut from a different dress. It smells like cedar.
  - when: table.gen_heirloom.quilt_held == 0 and table.gen_heirloom.quilt_sold == 0
  - effect: table.gen_heirloom.quilt_held = 1
  - effect: table.gen_heirloom.quilt_value = kind("gen_heirloom", quilt).base
  - rate: 25..35%
- outcome: 20
  - text: A mantel clock with a cracked face. It still keeps good time, which is more than you can say for you.
  - when: table.gen_heirloom.clock_held == 0 and table.gen_heirloom.clock_sold == 0
  - effect: table.gen_heirloom.clock_held = 1
  - effect: table.gen_heirloom.clock_value = kind("gen_heirloom", clock).base
  - rate: 15..25%
- outcome: 10
  - text: A violin in a dented case, with a name burned into the neck. The strings are still tight.
  - when: table.gen_heirloom.violin_held == 0 and table.gen_heirloom.violin_sold == 0
  - effect: table.gen_heirloom.violin_held = 1
  - effect: table.gen_heirloom.violin_value = kind("gen_heirloom", violin).base
  - rate: 5..15%
- outcome: 15
  - text: A bundle of letters tied with string. Nobody has read them in years, and the handwriting is lovely.
  - when: table.gen_heirloom.letters_held == 0 and table.gen_heirloom.letters_sold == 0
  - effect: table.gen_heirloom.letters_held = 1
  - effect: table.gen_heirloom.letters_value = kind("gen_heirloom", letters).base
  - rate: 10..20%

## heirloom-history
- trigger: event
- icon: 📜
- weight: 6
- when: (table.gen_heirloom.watch_passed >= 1 and table.gen_heirloom.watch_told == 0) or (table.gen_heirloom.quilt_passed >= 1 and table.gen_heirloom.quilt_told == 0) or (table.gen_heirloom.clock_passed >= 1 and table.gen_heirloom.clock_told == 0) or (table.gen_heirloom.violin_passed >= 1 and table.gen_heirloom.violin_told == 0) or (table.gen_heirloom.letters_passed >= 1 and table.gen_heirloom.letters_told == 0)
- max_per_life: 5
- text: At dinner, someone finally tells the story behind one of the family pieces.
- opens: 0..0.3 per life

### outcomes
- outcome: 12
  - text: Your grandfather kept the pocket watch wound every Sunday and was never late to anything. You are starting to see where you get it.
  - when: table.gen_heirloom.watch_passed >= 1 and table.gen_heirloom.watch_told == 0
  - effect: stat.happiness += 2
  - effect: table.gen_heirloom.watch_told = 1
  - rate: 10..15%
- outcome: 8
  - text: The watch was pawned during a family feud forty years ago, and nobody agrees on who did it. The argument is back on the table.
  - when: table.gen_heirloom.watch_passed >= 1 and table.gen_heirloom.watch_told == 0
  - effect: stat.happiness -= 1
  - effect: table.gen_heirloom.watch_told = 1
  - rate: 6..10%
- outcome: 12
  - text: Each square in the quilt came from a dress one of your aunts wore to a dance. Someone starts naming them one by one.
  - when: table.gen_heirloom.quilt_passed >= 1 and table.gen_heirloom.quilt_told == 0
  - effect: stat.happiness += 2
  - effect: table.gen_heirloom.quilt_told = 1
  - rate: 10..15%
- outcome: 8
  - text: Two cousins still say the quilt should have gone to them, not to whoever got it. Dinner gets quiet for a while.
  - when: table.gen_heirloom.quilt_passed >= 1 and table.gen_heirloom.quilt_told == 0
  - effect: stat.happiness -= 1
  - effect: table.gen_heirloom.quilt_told = 1
  - rate: 6..10%
- outcome: 12
  - text: Your great-grandfather set the clock every night by the radio news. Hearing that makes it feel less like a relic and more like a habit.
  - when: table.gen_heirloom.clock_passed >= 1 and table.gen_heirloom.clock_told == 0
  - effect: stat.happiness += 2
  - effect: table.gen_heirloom.clock_told = 1
  - rate: 10..15%
- outcome: 8
  - text: The clock stopped the night your uncle left town. The family still disagrees about whether he meant to leave it behind.
  - when: table.gen_heirloom.clock_passed >= 1 and table.gen_heirloom.clock_told == 0
  - effect: stat.happiness -= 1
  - effect: table.gen_heirloom.clock_told = 1
  - rate: 6..10%
- outcome: 12
  - text: The violin belonged to a cousin who played weddings all over the county and never once missed a cue. Her friends still tell that story.
  - when: table.gen_heirloom.violin_passed >= 1 and table.gen_heirloom.violin_told == 0
  - effect: stat.happiness += 2
  - effect: table.gen_heirloom.violin_told = 1
  - rate: 10..15%
- outcome: 8
  - text: The violin was promised to your mother, then given to a neighbor. That story has been finishing its argument for forty years.
  - when: table.gen_heirloom.violin_passed >= 1 and table.gen_heirloom.violin_told == 0
  - effect: stat.happiness -= 1
  - effect: table.gen_heirloom.violin_told = 1
  - rate: 6..10%
- outcome: 12
  - text: The letters are from a grandmother writing to her sister through a long winter. Reading the first few makes everyone smile.
  - when: table.gen_heirloom.letters_passed >= 1 and table.gen_heirloom.letters_told == 0
  - effect: stat.happiness += 2
  - effect: table.gen_heirloom.letters_told = 1
  - rate: 10..15%
- outcome: 8
  - text: The letters are from a grandfather to someone outside the marriage. Nobody wants to say whose side they were on.
  - when: table.gen_heirloom.letters_passed >= 1 and table.gen_heirloom.letters_told == 0
  - effect: stat.happiness -= 1
  - effect: table.gen_heirloom.letters_told = 1
  - rate: 6..10%

## heirloom-appraisal
- trigger: event
- icon: 💎
- weight: 2
- when: table.gen_heirloom.watch_held == 1 or table.gen_heirloom.quilt_held == 1 or table.gen_heirloom.clock_held == 1 or table.gen_heirloom.violin_held == 1 or table.gen_heirloom.letters_held == 1
- max_per_life: 5
- text: A local appraiser offers to look over one of the family pieces for free.
- opens: 0.1..0.3 per life

### outcomes
- outcome: 70
  - text: The appraiser says it is worth what you hoped, and you learn a few things about old craftsmanship along the way.
  - effect: stat.smarts += 1
  - rate: 65..75%
- outcome: 30
  - text: The appraiser calls it a fine piece, just not a valuable one. You feel a little silly for hoping.
  - effect: stat.happiness -= 2
  - rate: 25..35%

## heirloom-family-quarrel
- trigger: event
- icon: 😤
- weight: 6
- scope: person
- target: core-loop/sibling
- when: table.gen_heirloom.watch_held == 1 or table.gen_heirloom.quilt_held == 1 or table.gen_heirloom.clock_held == 1 or table.gen_heirloom.violin_held == 1 or table.gen_heirloom.letters_held == 1
- cooldown: 30
- text: Your sibling has noticed the family piece in your house, and they want a say in what happens to it.
- opens: 0.1..0.3 per life

### choice: Keep it
- outcome: 1
  - text: You say no, and the room goes cold for the rest of the night.
  - effect: relationship(person).closeness += -2
  - effect: stat.happiness -= 1
  - rate: 100..100%

### choice: Offer a small keepsake
- outcome: 1
  - text: You pass over a smaller keepsake from the box. It is not the same, but it helps.
  - effect: relationship(person).closeness += 2
  - rate: 100..100%

## heirloom-sell
- trigger: action
- menu: assets/heirlooms
- label: Sell a family heirloom
- icon: 💰
- text: Dust off a family piece and see what someone will pay for it.
- opens: 0.1..0.4 per life

### choice: Sell the watch
- when: table.gen_heirloom.watch_held == 1
- outcome: 1
  - text: The dealer turns the watch over twice, then counts out the cash without looking up.
  - effect: money += table.gen_heirloom.watch_value
  - effect: table.gen_heirloom.watch_held = 0
  - effect: table.gen_heirloom.watch_value = 0
  - effect: table.gen_heirloom.watch_sold = 1
  - rate: 100..100%

### choice: Sell the quilt
- when: table.gen_heirloom.quilt_held == 1
- outcome: 1
  - text: The dealer runs a thumb over the stitching and makes you an offer you take.
  - effect: money += table.gen_heirloom.quilt_value
  - effect: table.gen_heirloom.quilt_held = 0
  - effect: table.gen_heirloom.quilt_value = 0
  - effect: table.gen_heirloom.quilt_sold = 1
  - rate: 100..100%

### choice: Sell the clock
- when: table.gen_heirloom.clock_held == 1
- outcome: 1
  - text: The clock goes to a collector who promises to wind it on the hour. You doubt they will.
  - effect: money += table.gen_heirloom.clock_value
  - effect: table.gen_heirloom.clock_held = 0
  - effect: table.gen_heirloom.clock_value = 0
  - effect: table.gen_heirloom.clock_sold = 1
  - rate: 100..100%

### choice: Sell the violin
- when: table.gen_heirloom.violin_held == 1
- outcome: 1
  - text: A music shop owner plays one scale, nods, and writes a check that is more than you expected.
  - effect: money += table.gen_heirloom.violin_value
  - effect: table.gen_heirloom.violin_held = 0
  - effect: table.gen_heirloom.violin_value = 0
  - effect: table.gen_heirloom.violin_sold = 1
  - rate: 100..100%

### choice: Sell the letters
- when: table.gen_heirloom.letters_held == 1
- outcome: 1
  - text: A dealer in old paper gives you a modest sum and does not ask what the letters say.
  - effect: money += table.gen_heirloom.letters_value
  - effect: table.gen_heirloom.letters_held = 0
  - effect: table.gen_heirloom.letters_value = 0
  - effect: table.gen_heirloom.letters_sold = 1
  - rate: 100..100%
