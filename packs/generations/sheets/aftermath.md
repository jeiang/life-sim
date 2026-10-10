# Content sheet: Generations, chain 3 (aftermath)

- pack: generations
- packs: core-loop,dating,generations
- profile: all
- lives: 1000

> Chain 3 of the generations pack, the aftermath of a death. Six storylets. Namespace `gen` (qualities and state only); schedule ids use the pack id `generations/<id>` (GAPS-RESOLVED, binding).
> Estate settlement is Core's (`succeed`). Nothing here changes the estate; these storylets only react to it.
> The three succession openers (`aftermath-grief`, `aftermath-cash-left`, `aftermath-family-home`) are `chance: 0%` steps scheduled from the `on_succession` hook (GAPS-RESOLVED). The sheet grammar has no `trigger: succession`; the implementer may convert them (PR 304). Their `when` gates are read at the heir's first age-up, so they must hold then.
> `aftermath-anniversary` is an event with `chance: 0%`, opened only by `schedule(generations/aftermath-anniversary, after: 1-1 years)` from `aftermath-grief`. The window must start at 1, so the outline's `after: 1` is written `1-1 years`. It is scheduled without `lineage`, so an heir who dies first drops it.
> `aftermath-sibling-contests` and `aftermath-spouse-share` are `scope: person` events in the yearly NPC pass, each `once` (once per generation; the log clears at succession).
> Gate changes from the outline: the outline's `has_will() == false` is replaced by `deceased.quality.gen_will_kind == 0` (no will; binding per Main). `has_will()` reads the heir's will, since `_will` is cleared at succession after the estate settles.
> `aftermath-family-home` gates on `owns(core-loop/house)` or `owns(core-loop/big-house)` (ids confirmed in `packs/core-loop/items/homes.yaml`). `asset.years` is only valid in item `value` expressions, so it is not used (GAP 6). No sale choice (binding per Main).

## aftermath-grief
- trigger: event
- icon: 🕯️
- chance: 0%
- when: deceased.kin == "mother" or deceased.kin == "father"
- once: true
- text: {deceased.first_name} {deceased.last_name} died at {deceased.age}. The house still smells like them, and you keep waiting for the door.
- opens: 0.5..1 per life

### outcomes
- outcome: 60
  - text: The first weeks are the worst. You go through the motions at school and cry where nobody can see.
  - effect: stat.happiness -= 8
  - effect: schedule(generations/aftermath-anniversary, after: 1-1 years)
  - rate: 55..65%
- outcome: 25
  - text: You talk about {deceased.first_name} with anyone who will listen. It helps more than you expected.
  - effect: stat.happiness -= 3
  - effect: schedule(generations/aftermath-anniversary, after: 1-1 years)
  - rate: 20..30%
- outcome: 15
  - text: You put on a brave face for everyone, and it costs you more than you admit.
  - effect: stat.happiness -= 12
  - effect: schedule(generations/aftermath-anniversary, after: 1-1 years)
  - rate: 10..20%

## aftermath-cash-left
- trigger: event
- icon: 🏦
- chance: 0%
- when: deceased.money > 0
- once: true
- text: {deceased.first_name} died with {deceased.money} in the bank before the bills were paid. Your share is yours to decide.
- opens: 0.6..1 per life

### choice: Treat yourself
- when: money >= 200000
- outcome: 1
  - text: You spend a chunk of it on something {deceased.first_name} always said was a waste. You feel a little better for a day.
  - effect: money -= 200000
  - effect: stat.happiness += 4
  - rate: 100..100%

### choice: Put it away
- outcome: 1
  - text: You open a savings account in your own name and leave it alone. It feels like the responsible thing to do.
  - effect: stat.happiness += 1
  - rate: 100..100%

## aftermath-sibling-contests
- trigger: event
- icon: ⚖️
- scope: person
- target: core-loop/sibling
- chance: 10%
- once: true
- when: deceased.money > 0 and age >= 16
- text: {person.first_name} wants to talk about the money. They have opinions about how it was split, and they are not shy about them.
- opens: 0.2..0.7 per life

### choice: Settle it at the kitchen table
- outcome: 70
  - text: You sit down and work it out between you. {person.first_name} is not thrilled, but the matter is closed.
  - effect: relationship(person).closeness += 2
  - rate: 65..75%
- outcome: 30
  - text: They want more than the will gave them. The talk ends with a door closing hard.
  - effect: relationship(person).closeness += -4
  - effect: stat.happiness -= 3
  - rate: 25..35%

### choice: Take it to a lawyer
- when: money >= 150000
- outcome: 1
  - text: It is slow and expensive. You win on the paperwork, and {person.first_name} never fully forgives you.
  - effect: money -= 150000
  - effect: relationship(person).closeness += -8
  - effect: stat.happiness -= 4
  - rate: 100..100%

## aftermath-spouse-share
- trigger: event
- icon: 💍
- scope: person
- target: core-loop/spouse
- chance: 20%
- once: true
- when: deceased.quality.gen_will_kind == 0 and deceased.money > 0
- text: {person.first_name} sits you down. The estate is settled, and they want you to know how it was split.
- opens: 0.3..0.9 per life
- needs: quality gen_will_kind: integer 0..4, default 0: the will kind the player last wrote (0 none, 1 heir, 2 even, 3 spouse, 4 charity), declared in will.md; read here off deceased.quality.gen_will_kind

### outcomes
- outcome: 60
  - text: {person.first_name} says their share is theirs now and they are grateful it is over. They ask how you are holding up.
  - effect: relationship(person).closeness += 2
  - rate: 55..65%
- outcome: 40
  - text: {person.first_name} says the split was harder than it should have been. You can hear the grief under the paperwork.
  - effect: relationship(person).closeness += 1
  - effect: stat.happiness -= 2
  - rate: 35..45%

## aftermath-family-home
- trigger: event
- icon: 🏠
- chance: 0%
- when: owns(core-loop/house) or owns(core-loop/big-house)
- once: true
- text: The family house is yours now. Every room has a memory in it, and some of them are not comfortable.
- opens: 0.05..0.3 per life

### outcomes
- outcome: 60
  - text: You move your things into the room you grew up in. It feels like home again, even with the empty chair.
  - effect: stat.happiness += 3
  - rate: 55..65%
- outcome: 40
  - text: The house is yours, and so are the bills, the leaking roof and the stairs that creak at night.
  - effect: stat.happiness -= 2
  - rate: 35..45%

## aftermath-anniversary
- trigger: event
- icon: 🌅
- chance: 0%
- text: One year since {deceased.first_name} died. The day comes around without warning.
- opens: 0.7..1.2 per life

### outcomes
- outcome: 50
  - text: You walk to the place {deceased.first_name} used to sit. It helps more than you thought it would.
  - effect: stat.happiness += 4
  - rate: 45..55%
- outcome: 30
  - text: You meant to visit and didn't. The guilt sits with you all day.
  - effect: stat.happiness -= 3
  - rate: 25..35%
- outcome: 20
  - text: You make a small ritual of it, and the day gets a little lighter each year.
  - effect: stat.happiness += 2
  - rate: 15..25%
