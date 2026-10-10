# Content sheet: Break up and divorce

- pack: dating
- packs: dating
- profile: all
- lives: 1000

> Chain 8 (issue #239): break up, divorce, and heartbreak moved from core-loop.
> `heartbreak` keeps its id, weight and cooldown from `decisions-teen.yaml:293`; the gate is widened to no partner and no spouse (core-loop.md:47). The implementer removes it from core-loop in the same PR (GAPS-RESOLVED item 4).
> There is no role unset in the engine. An ended partnership or marriage moves to the pack role `dating/ex` (declared in `needs`), not a friend.
> Closeness drops before the role changes: `setRole` keeps the highest closeness across the rows, so the drop must come first.
> Divorce takes half of cash without a prenup and a tenth with one. `dating_prenup` is set by the wedding chain (chain 7) and is declared in `needs` below.
> A divorce with a child under 18 (`count_kin(child, 0, 17) > 0`) offers custody. "Your ex keeps the kids" sets `quality.dating_pays_support` and schedules `dating/family-child-support-year` one year out (chain 12, DrDateMoney). "You keep the kids" schedules nothing. With no child under 18 the only choice is signing the papers, which schedules nothing.
> `divorce-forced` is the chain step DrDateAffairs reaches by `next` from affair-caught and partner-cheat-found when the partner is a spouse. It shares the custody choices, cash split and prenup branch with `divorce`.
> Engine bug, filed as core: `setRole` keeps the `household: merged` flag after a role change.

## heartbreak
- trigger: event
- icon: 💔
- weight: 9
- when: age >= 14 and age <= 24 and count_role(core-loop/partner, 0, 100) == 0 and count_role(core-loop/spouse, 0, 100) == 0
- cooldown: 6
- tags: relationship
- text: Your first romance ends badly, and you feel miserable.
- opens: 0.3..0.9 per life

### choice: Talk to a friend
- outcome: 75
  - text: A long talk over hot chocolate, and the clouds clear.
  - effect: stat.happiness += 2
  - rate: 70..80%
- outcome: 25
  - text: The friend is busy, and it takes longer to heal.
  - effect: stat.happiness -= 2
  - rate: 20..30%

### choice: Throw yourself into hobbies
- outcome: 1
  - text: Busy hands mend a heavy heart, little by little.
  - effect: stat.smarts += 1
  - effect: stat.happiness += 1
  - rate: 100..100%

### choice: Wallow
- outcome: 1
  - text: A month of sad songs.
  - effect: stat.happiness -= 5
  - rate: 100..100%

## break-up
- trigger: action
- icon: 🚪
- menu: relationships
- label: Break up
- scope: person
- target: core-loop/partner
- max_per_life: 2
- needs: role dating/ex: role id, no range: the role a former partner or spouse moves to after the player breaks up or divorces; keeps no pay, no household
- tags: relationship
- text: You work up the nerve to end things with {person.first_name}.
- opens: 0.5..1.5 per life

### outcomes
- outcome: 60
  - text: You both agree it is for the best. You part on civil terms, maybe friends one day.
  - effect: relationship(person).closeness += -15
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 2
  - rate: 55..65%
- outcome: 40
  - text: It gets ugly. Voices rise, and the last thing you hear is a slammed door.
  - effect: relationship(person).closeness += -35
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 5
  - rate: 35..45%

## divorce
- trigger: action
- icon: 📄
- menu: relationships
- label: Divorce
- scope: person
- target: core-loop/spouse
- max_per_life: 1
- needs: quality dating_prenup: flag, default false: the player signed a prenup at the wedding; a divorce then takes a tenth of cash instead of half
- needs: quality dating_pays_support: flag, default false: the ex keeps the kids, so the player pays child support; dating/family-child-support-year reads it
- needs: role dating/ex: role id, no range: the role a former partner or spouse moves to after the player breaks up or divorces; keeps no pay, no household
- tags: relationship
- text: You ask {person.first_name} for a divorce.
- opens: 0.1..0.5 per life

### choice: You keep the kids
- when: count_kin(child, 0, 17) > 0
- outcome: 1
  - when: quality.dating_prenup
  - text: You keep the kids, and the prenup does its job. Most of what you built stays yours, minus a hefty lawyer's bill.
  - effect: money -= max(0, money) / 10
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 8
- outcome: 1
  - when: not quality.dating_prenup
  - text: You keep the kids. With no prenup, the settlement splits your savings straight down the middle.
  - effect: money -= max(0, money) / 2
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 10

### choice: Your ex keeps the kids
- when: count_kin(child, 0, 17) > 0
- outcome: 1
  - when: quality.dating_prenup
  - text: {person.first_name} takes the kids, and the prenup does its job. You will pay support until they grow up.
  - effect: money -= max(0, money) / 10
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 8
  - effect: quality.dating_pays_support = true
  - effect: schedule(dating/family-child-support-year, after: 1-1 years)
- outcome: 1
  - when: not quality.dating_prenup
  - text: {person.first_name} takes the kids. With no prenup, the settlement splits your savings, and you will pay support until they grow up.
  - effect: money -= max(0, money) / 2
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 10
  - effect: quality.dating_pays_support = true
  - effect: schedule(dating/family-child-support-year, after: 1-1 years)

### choice: Sign the papers
- when: count_kin(child, 0, 17) == 0
- outcome: 1
  - when: quality.dating_prenup
  - text: The prenup does its job. Most of what you built stays yours, minus a hefty lawyer's bill.
  - effect: money -= max(0, money) / 10
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 8
- outcome: 1
  - when: not quality.dating_prenup
  - text: With no prenup, the settlement splits your savings straight down the middle.
  - effect: money -= max(0, money) / 2
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 10

## divorce-forced
- trigger: event
- icon: 📄
- chance: 0%
- scope: person
- target: core-loop/spouse
- max_per_life: 1
- needs: quality dating_prenup: flag, default false: the player signed a prenup at the wedding; a divorce then takes a tenth of cash instead of half
- needs: quality dating_pays_support: flag, default false: the ex keeps the kids, so the player pays child support; dating/family-child-support-year reads it
- needs: role dating/ex: role id, no range: the role a former partner or spouse moves to after the player breaks up or divorces; keeps no pay, no household
- tags: relationship
- text: The marriage cannot survive what just came out, and {person.first_name} files for divorce.
- opens: 0.05..0.3 per life

### choice: You keep the kids
- when: count_kin(child, 0, 17) > 0
- outcome: 1
  - when: quality.dating_prenup
  - text: You keep the kids, and the prenup does its job. Most of what you built stays yours, minus a hefty lawyer's bill.
  - effect: money -= max(0, money) / 10
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 8
- outcome: 1
  - when: not quality.dating_prenup
  - text: You keep the kids. With no prenup, the settlement splits your savings straight down the middle.
  - effect: money -= max(0, money) / 2
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 10

### choice: Your ex keeps the kids
- when: count_kin(child, 0, 17) > 0
- outcome: 1
  - when: quality.dating_prenup
  - text: {person.first_name} takes the kids, and the prenup does its job. You will pay support until they grow up.
  - effect: money -= max(0, money) / 10
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 8
  - effect: quality.dating_pays_support = true
  - effect: schedule(dating/family-child-support-year, after: 1-1 years)
- outcome: 1
  - when: not quality.dating_prenup
  - text: {person.first_name} takes the kids. With no prenup, the settlement splits your savings, and you will pay support until they grow up.
  - effect: money -= max(0, money) / 2
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 10
  - effect: quality.dating_pays_support = true
  - effect: schedule(dating/family-child-support-year, after: 1-1 years)

### choice: Sign the papers
- when: count_kin(child, 0, 17) == 0
- outcome: 1
  - when: quality.dating_prenup
  - text: The prenup does its job. Most of what you built stays yours, minus a hefty lawyer's bill.
  - effect: money -= max(0, money) / 10
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 8
- outcome: 1
  - when: not quality.dating_prenup
  - text: With no prenup, the settlement splits your savings straight down the middle.
  - effect: money -= max(0, money) / 2
  - effect: relationship(person).closeness += -40
  - effect: relationship(person).role = dating/ex
  - effect: stat.happiness -= 10
