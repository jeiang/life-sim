# Content sheet: Try for a baby and pregnancy

- pack: dating
- packs: dating
- profile: romantic
- lives: 1000

> Chain 9 (issue #240). A couple tries for a baby, or a pregnancy comes up by surprise. Whoever can carry carries: the player if `player.can_carry`, else the partner if `person.can_carry`. Neither means no pregnancy path (adoption only, chain 11).
> Two parallel chains. Player carrier: `pregnancy-end` and `pregnancy-outcome` are unscoped, so the schedule survives the partner's death and the flag always resolves. Partner carrier: `partner-pregnancy-end` and `partner-pregnancy-outcome` are scoped to the partner, so the partner is the second birth parent; if the partner dies, the schedule drops and only the dead partner's flag is left set.
> The schedule window is in whole years, so the outline's nine months becomes one year.
> Birth spawns `dating/baby-gen` as `core-loop/child`. The partner-carrier branch passes `parent: person`. Player-carrier births pass no `parent:`; core links the player and the living spouse, else the player and the living partner.
> `quality.dating_children` tallies the children the player has had (births and adoptions) for the harness metrics and `dating_first_child_age` is set by the `first_child` milestone hook.
> `first_child` is reached by the child-role spawn, so no `reach_milestone` is written here.

## try-for-a-baby
- trigger: action
- menu: relationships
- label: Try for a baby
- icon: 👶
- scope: person
- target: core-loop/partner, core-loop/spouse
- when: age >= 18 and person.age >= 18 and (player.can_carry or person.can_carry) and quality.dating_pregnant == 0 and person.quality.dating_pregnant == 0
- cooldown: 2
- max_per_life: 6
- text: You and {person.first_name} decide to start trying for a baby. Nothing is guaranteed.
- opens: 1..3 per life
- needs: quality dating_pregnant: flag 0 or 1, default 0, scope person: 1 while the carrier has a pregnancy running (player via quality, partner via person.quality)
- needs: generator baby-gen: child, age 0: the newborn; first and last names from the Pack pool, gender drawn from the generator weights

### outcomes
- outcome: 75
  - text: Months pass with no news. You keep trying.
  - rate: 72..78%
- outcome: 25
  - when: player.can_carry
  - text: A test shows two lines. You are pregnant.
  - effect: quality.dating_pregnant = 1
  - effect: schedule(dating/pregnancy-end, after: 1-1 years)
  - effect: journal("You are pregnant.")
  - rate: 22..28%
- outcome: 25
  - when: not player.can_carry
  - text: A test shows two lines. {person.first_name} is pregnant.
  - effect: person.quality.dating_pregnant = 1
  - effect: schedule(dating/partner-pregnancy-end, after: 1-1 years, person)
  - effect: journal("{person.first_name} is pregnant.")
  - rate: 22..28%

## unplanned-pregnancy
- trigger: event
- scope: person
- target: core-loop/partner, core-loop/spouse
- chance: 0.25%
- icon: 😳
- when: age >= 18 and person.age >= 18 and (player.can_carry or person.can_carry) and quality.dating_pregnant == 0 and person.quality.dating_pregnant == 0
- text: A late period and a mix-up with the pill leave you with a surprise. There is a pregnancy, and it was not the plan.
- opens: 0.04..0.15 per life

### outcomes
- outcome: 1
  - when: player.can_carry
  - text: The test is positive. You are pregnant, and the next decision is yours.
  - effect: quality.dating_pregnant = 1
  - effect: schedule(dating/pregnancy-end, after: 1-1 years)
  - effect: journal("An unplanned pregnancy.")
- outcome: 1
  - when: not player.can_carry
  - text: The test is positive. {person.first_name} is pregnant, and the next decision is yours.
  - effect: person.quality.dating_pregnant = 1
  - effect: schedule(dating/partner-pregnancy-end, after: 1-1 years, person)
  - effect: journal("An unplanned pregnancy.")

## pregnancy-end
- trigger: event
- icon: 🤰
- chance: 0%
- when: quality.dating_pregnant == 1
- text: The due date is here. The months have gone by fast, and the next step is yours.
- opens: 0.3..0.9 per life

### outcomes
- outcome: 5
  - text: Something goes wrong and the pregnancy ends early. It is a quiet, sad loss, and you grieve in your own way.
  - effect: quality.dating_pregnant = 0
  - effect: stat.happiness -= 8
  - effect: stat.health -= 2
  - effect: journal("You had a miscarriage.")
  - rate: 4..6%
- outcome: 95
  - text: The pregnancy holds. The baby is close, and you have to decide what comes next.
  - next: pregnancy-outcome
  - rate: 94..96%

## pregnancy-outcome
- trigger: event
- icon: 🍼
- chance: 0%
- text: The baby is due. You have three options, and the choice is yours.
- opens: 0.25..0.9 per life

### choice: Keep the baby
- outcome: 1
  - text: You bring your baby home. Life is about to get a lot busier.
  - effect: quality.dating_pregnant = 0
  - effect: spawn_person(core-loop/child, dating/baby-gen) as baby
  - effect: quality.dating_children += 1
  - effect: journal("Your baby is born.")
  - rate: 100..100%

### choice: Place the baby for adoption
- outcome: 1
  - text: You place your baby with an adoptive family. It is a hard choice, and you make it.
  - effect: quality.dating_pregnant = 0
  - effect: journal("You placed your baby for adoption.")
  - rate: 100..100%

### choice: End the pregnancy
- outcome: 1
  - text: You book a clinic appointment and end the pregnancy. You get on with your life.
  - effect: quality.dating_pregnant = 0
  - effect: journal("You ended the pregnancy.")
  - rate: 100..100%

## partner-pregnancy-end
- trigger: event
- scope: person
- icon: 🤰
- chance: 0%
- when: person.quality.dating_pregnant == 1
- text: The due date is here. {person.first_name} is ready, and the next step is yours.
- opens: 0.3..0.9 per life

### outcomes
- outcome: 5
  - text: Something goes wrong and the pregnancy ends early. It is a quiet, sad loss, and you grieve in your own way.
  - effect: person.quality.dating_pregnant = 0
  - effect: stat.happiness -= 8
  - effect: stat.health -= 2
  - effect: journal("{person.first_name} had a miscarriage.")
  - rate: 4..6%
- outcome: 95
  - text: The pregnancy holds. The baby is close, and you have to decide what comes next.
  - next: partner-pregnancy-outcome
  - rate: 94..96%

## partner-pregnancy-outcome
- trigger: event
- scope: person
- icon: 🍼
- chance: 0%
- text: The baby is due. You have three options, and the choice is yours.
- opens: 0.25..0.9 per life

### choice: Keep the baby
- outcome: 1
  - text: You bring your baby home. Life is about to get a lot busier.
  - effect: person.quality.dating_pregnant = 0
  - effect: spawn_person(core-loop/child, dating/baby-gen, parent: person) as baby
  - effect: quality.dating_children += 1
  - effect: journal("Your baby is born.")
  - rate: 100..100%

### choice: Place the baby for adoption
- outcome: 1
  - text: You place your baby with an adoptive family. It is a hard choice, and you make it.
  - effect: person.quality.dating_pregnant = 0
  - effect: journal("You placed your baby for adoption.")
  - rate: 100..100%

### choice: End the pregnancy
- outcome: 1
  - text: You book a clinic appointment and end the pregnancy. You get on with your life.
  - effect: person.quality.dating_pregnant = 0
  - effect: journal("You ended the pregnancy.")
  - rate: 100..100%
