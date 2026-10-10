# Content sheet: Moving in and wedding

- pack: dating
- packs: dating
- profile: romantic
- lives: 1000

> Chains 6 and 7 of #239: moving in together, and a wedding (elope, small or big, with an optional prenup).
> Both entries are person actions on the partner (`target: core-loop/partner`, `menu: relationships`), following the core-loop `spend-time-with-loved-ones` pattern.
> `move_in()` and `merge_money()` both need the partner row to hold the household `partner_role` (`core-loop/partner`). So `merge_money()` MUST run before `relationship(person).role = core-loop/spouse`, or it does nothing.
> Gaining the spouse role fires the Core `married` milestone, so this sheet does not declare its own marriage milestone. `plan-wedding` is once per life through `not milestone_reached(married)`.
> `plan-wedding` requires an accepted proposal: `person.quality.dating_engaged`, set by the propose accept in the finding chain.
> Costs come from the player's cash (`money -=`). Amounts are minor units: elope $800, small wedding $12,000, big wedding $40,000, prenup $1,500.
> `once: true` on an action with `scope: person` counts per bound partner, so a declined move-in is final for that partner.

> Tweak (focused sim): wedding and prenup bands are the `romantic` profile (about half of its lives marry); random lives plan 0.05 a life.

## move-in-together
- trigger: action
- icon: 🏠
- menu: relationships
- label: Ask them to move in
- scope: person
- target: core-loop/partner
- when: person.closeness >= 50
- once: true
- text: You ask {person.first_name} to move in and split the bills.
- opens: 0.25..1.0 per life

### outcomes
- outcome: 75
  - text: {person.first_name} packs a bag that weekend, and the place suddenly feels full.
  - effect: move_in()
  - rate: 75..75%
- outcome: 25
  - text: {person.first_name} wants to keep their own place for a while longer.
  - rate: 25..25%

## plan-wedding
- trigger: action
- icon: 💍
- menu: relationships
- label: Plan a wedding
- scope: person
- target: core-loop/partner
- when: person.quality.dating_engaged and person.closeness >= 60 and age >= 18 and count_role(core-loop/spouse, 0, 100) == 0 and not milestone_reached(married) and money >= 80000
- once: true
- text: You start planning the big day with {person.first_name}.
- opens: 0.2..0.6 per life
- needs: quality dating_engaged: flag, default false, scope person: the partner accepted a proposal; set by the propose accept in the finding chain

> The action is offered only to an engaged partner, and only with cash for the cheapest option (elope). Each choice hands on to `wedding-prenup` with `next`; the person carries over because both storylets have `scope: person`.

### choice: Elope
- when: money >= 80000
- outcome: 1
  - text: You slip off to the courthouse with two strangers as witnesses and a ring from the gas station.
  - effect: money -= 80000
  - next: wedding-prenup
  - rate: 100..100%

### choice: Small wedding
- when: money >= 1200000
- outcome: 1
  - text: Forty guests, a rented hall, and a cake that leans a little to the left.
  - effect: money -= 1200000
  - next: wedding-prenup
  - rate: 100..100%

### choice: Big wedding
- when: money >= 4000000
- outcome: 1
  - text: A venue with a view, a band that knows every song, and a speech from a cousin you barely know.
  - effect: money -= 4000000
  - next: wedding-prenup
  - rate: 100..100%

## wedding-prenup
- trigger: event
- chance: 0%
- scope: person
- target: core-loop/partner
- text: Before the vows, you and {person.first_name} sit down with a lawyer to talk about money.
- opens: 0.2..0.6 per life
- needs: quality dating_prenup: flag, default false: the player signed a prenup, so savings stay separate after the wedding

> A chain step (`chance: 0%`), reached only by `next` from `plan-wedding`, and a person decision the player answers.
> Both choices finish the marriage. The prenup choice needs cash for the lawyer's fee. "Skip the prenup" is always enabled, so the step always has an answer.
> Order in each outcome: `merge_money()` first (needs the partner role), then the role change, which fires Core `married`. The prenup path skips `merge_money()`.

### choice: Sign a prenup
- when: money >= 150000
- outcome: 1
  - text: Your savings stay yours. The lawyer's bill is steep, but the papers are signed.
  - effect: money -= 150000
  - effect: quality.dating_prenup = true
  - effect: relationship(person).role = core-loop/spouse
  - rate: 100..100%

### choice: Skip the prenup
- outcome: 1
  - text: You merge your accounts and your lives in one go. The paperwork is shorter than you expected.
  - effect: merge_money()
  - effect: relationship(person).role = core-loop/spouse
  - next: family-merge-money
  - rate: 100..100%
