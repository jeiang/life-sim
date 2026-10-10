# Content sheet: Succession openers

- pack: generations
- packs: core-loop,dating,generations
- profile: all
- lives: 1000

> Four openers, one per heir age band (Chain 2). Bands are exhaustive, so exactly one opens per generation.
> Each opener is a `chance: 0%` event, opened only by `schedule(generations/<id>, after: 0-1 years)` from the on_succession hook (storylets.md documents this for chain-only events). The grammar has no `trigger: succession`; the implementer may convert these to `trigger: succession` storylets (engine supports it, PR 304).
> `when` reads the heir's age when the opener is due. Each opener sets `quality.gen_inherit_band` to its band (0 under 12, 1 for 12 to 17, 2 for 18 to 39, 3 for 40 and up).
> `deceased.*` is read-only (expressions.md). The debt write-off beat is dropped (GAPS-RESOLVED: money never goes negative, and core writes off the shortfall silently), so no debt gate is written.
> Opens figures are design estimates, not measured (no successions occur in the harness bot profiles).

## inherit-under-12
- trigger: event
- chance: 0%
- once: true
- tags: family
- when: age < 12
- text: Your {deceased.kin} died of {deceased.cause} at {deceased.age}. A lawyer explains it slowly, and you nod like you understand.
- opens: 0.02..0.07 per life
- needs: quality gen_inherit_band: integer 0..3, default 0: which heir age band opened this generation (0 under 12, 1 for 12 to 17, 2 for 18 to 39, 3 for 40 and up)

### choice: Ask whether it hurt
- outcome: 1
  - text: You ask whether it hurt. The lawyer pauses, then answers you honestly and kindly.
  - effect: stat.happiness -= 3
  - effect: quality.gen_inherit_band = 0
  - effect: journal("Your parent died when you were small. You asked the question nobody wanted to answer.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

### choice: Pretend you are fine
- outcome: 1
  - text: You go to school the next day and tell everyone you are fine. Nobody believes you, but they let you pretend.
  - effect: stat.happiness -= 2
  - effect: quality.gen_inherit_band = 0
  - effect: journal("You went back to school the next day and said you were fine.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

## inherit-12-17
- trigger: event
- chance: 0%
- once: true
- tags: family
- when: age >= 12 and age < 18
- text: Your {deceased.kin} died of {deceased.cause}. Suddenly the household is your problem, and school is still your problem too.
- opens: 0.01..0.05 per life

### choice: Keep the house running
- outcome: 1
  - text: You take over the chores, the bills folder, and the grocery list. It is more than anyone asked of you, and you do it anyway.
  - effect: stat.happiness -= 2
  - effect: stat.smarts += 1
  - effect: quality.gen_inherit_band = 1
  - effect: journal("At seventeen, or younger, you became the one who kept the house going.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

### choice: Tell the school you need time
- outcome: 1
  - text: The counselor offers a few weeks off and a box of tissues. You take the weeks and leave the tissues.
  - effect: stat.happiness += 1
  - effect: stat.smarts -= 1
  - effect: quality.gen_inherit_band = 1
  - effect: journal("School gave you a few weeks off after your parent died.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

## inherit-18-39
- trigger: event
- chance: 0%
- once: true
- tags: family
- when: age >= 18 and age < 40
- text: Your {deceased.kin} died of {deceased.cause} at {deceased.age}. You are an adult now, and the paperwork is yours to sign.
- opens: 0.08..0.18 per life

### choice: Sign what the lawyer puts in front of you
- outcome: 1
  - text: The estate settles in a stack of forms and a pen that never seems to work. You sign where the little flags say to.
  - effect: stat.happiness -= 2
  - effect: quality.gen_inherit_band = 2
  - effect: journal("You signed the estate papers and took over what was left.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

### choice: Ask what was left
- outcome: 1
  - text: The estate holds {deceased.money} before the bills. It is not much, but it is something, after the bills are paid.
  - effect: stat.happiness += 1
  - effect: quality.gen_inherit_band = 2
  - effect: journal("The estate paid out what was left after the bills.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

## inherit-40-plus
- trigger: event
- chance: 0%
- once: true
- tags: family
- when: age >= 40
- text: Your {deceased.kin} died at {deceased.age} of {deceased.cause}. You half expected the call, and it still lands hard.
- opens: 0.30..0.50 per life

### choice: Take the family books in hand
- outcome: 1
  - text: You take the folder of statements and the old recipe box home. Somewhere in there is your whole childhood, filed by date.
  - effect: stat.happiness -= 2
  - effect: stat.smarts += 1
  - effect: quality.gen_inherit_band = 3
  - effect: journal("You took the family papers home and started going through them.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%

### choice: Let your own kids lead the arrangements
- outcome: 1
  - text: Your children pick the flowers and the hymn. You are proud of them and a little sad that they had to.
  - effect: stat.happiness += 1
  - effect: quality.gen_inherit_band = 3
  - effect: journal("Your children arranged the funeral, and you let them.")
  - effect: schedule(generations/aftermath-grief, after: 0-2 years, lineage: true)
  - rate: 100..100%
