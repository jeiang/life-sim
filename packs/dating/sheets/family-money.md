# Content sheet: Family money (child support and merge money)

- pack: dating
- packs: dating
- profile: unfaithful
- lives: 1000

> Chain 12 (child support) and chain 13 (merge money) of the dating outline, grilled in #239 and #240.
> Household cost (the dependents term) stays in core-loop `living.household`. This sheet adds no cost.
> The payment is capped at cash on hand (`min(max(0, money), ...)`), like other core-loop costs, so a broke player is never pushed further into debt by it.
> Custody v1: support runs only when the divorce gives the kids to the ex. Chain 8 sets `quality.dating_pays_support`. It stops when no child under 18 remains.
> Divorce (chain 8) queues `dating/family-child-support-year` with `schedule(..., after: 1-1 years)`. This sheet only re-queues itself yearly.
> The wedding (chain 7) runs `merge_money()` before it sets the spouse role, then `next: family-merge-money`. The merge only matches the `partner` role, so this storylet is a text beat and has no merge effect. The wedding must be `scope: person` with the partner bound.

## family-child-support-year
- trigger: event
- chance: 0%
- when: count_kin(child, 0, 17) > 0 and quality.dating_pays_support
- text: Another year, another child support payment. The ex's lawyer always remembers the due date.
- opens: 0.5..3 per life
- needs: quality dating_pays_support: flag, default false: set by the divorce when the ex keeps the kids; child support runs while it is true

### outcomes
- outcome: 1
  - text: The payment clears. The kids are still under 18, so the next one is already on its way.
  - effect: money -= min(max(0, money), 300000 * count_kin(child, 0, 17))
  - effect: schedule(dating/family-child-support-year, after: 1-1 years)
  - rate: 100..100%

## family-merge-money
- trigger: event
- scope: person
- target: core-loop/spouse
- chance: 0%
- once: true
- text: With no prenup, your bank accounts become one. {person.first_name}'s savings are now in yours too.
- opens: 0.1..0.35 per life

### outcomes
- outcome: 1
  - text: Joint money, joint problems. {person.first_name} is not thrilled about the paperwork, but the account is merged.
  - rate: 100..100%
