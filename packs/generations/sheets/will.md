# Content sheet: Will

- pack: generations
- packs: generations,core-loop,dating
- profile: all
- lives: 1000

> Chain 1 of the generations outline: the player writes, revises or tears up a will in the estate submenu.
> Two action storylets, because `scope: person` applies to a whole storylet: `will-make` takes the four plain will kinds as choices, and `will-heir` asks which child inherits the cash.
> No will is the default and needs no storylet. `set_will(none)` removes a will; the core no-will rule applies at death.
> Both actions share the 3-year repeat limit as separate cooldowns (the outline's "repeatable" means revisable, not `repeatable: true`, which cannot carry a cooldown).
> `gen_will_kind` is written by every option: 0 none, 1 heir, 2 even, 3 spouse, 4 charity. It is for metrics only.
> `set_will(heir)` is not a mode; the heir option is `will_heir(person)`.

## will-make
- trigger: action
- menu: assets/estate
- label: Make or change your will
- icon: 📜
- when: age >= 18
- cooldown: 3
- tags: family
- text: A notary slides a blank page across the desk. Who gets your money when you are gone?
- opens: 1..6 per life
- needs: quality gen_will_kind: integer 0..4, default 0: the will kind the player last wrote (0 none, 1 heir, 2 even, 3 spouse, 4 charity), for metrics

### choice: Split the cash evenly among your children
- when: count_kin(child, 0, 120) >= 1
- outcome: 1
  - text: Every child gets an equal share. Fair is fair, even when nobody is thrilled about the amount.
  - effect: set_will(even)
  - effect: quality.gen_will_kind = 2
  - rate: 100..100%

### choice: Leave everything to your spouse
- when: count_kin(spouse, 0, 120) >= 1
- outcome: 1
  - text: Your spouse gets the lot. They will know what to do with it, probably.
  - effect: set_will(spouse)
  - effect: quality.gen_will_kind = 3
  - rate: 100..100%

### choice: Leave the cash to charity
- outcome: 1
  - text: Every dollar goes to a good cause. Your family wants to know why, and you do not have a good answer.
  - effect: set_will(charity)
  - effect: quality.gen_will_kind = 4
  - rate: 100..100%

### choice: Tear up the old will
- when: has_will()
- outcome: 1
  - text: You shred the old will and let the law sort it out. The law is not very interested in your feelings.
  - effect: set_will(none)
  - effect: quality.gen_will_kind = 0
  - rate: 100..100%

## will-heir
> scaffold bug: kinship targets (fix in progress)
- trigger: action
- menu: assets/estate
- scope: person
- target: child, step-child
- label: Name one child as your heir
- icon: 👶
- when: age >= 18
- cooldown: 3
- tags: family
- text: Pick the one child who gets all your cash. The rest of the family will hear about it.
- opens: 0.2..2 per life

### outcomes
- outcome: 1
  - text: You name {person.first_name} as the one heir. Everything you have in cash is theirs when you go.
  - effect: will_heir(person)
  - effect: quality.gen_will_kind = 1
  - rate: 100..100%
