# dating glossary

Terms owned by the dating Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Attraction**:
Three hidden int qualities, `dating_attracted_men`, `dating_attracted_women` and `dating_attracted_nonbinary` (0 to 100, default 0), rolled once at the first age-up by `dating/roll-attraction` from the player's gender. They are `scope: person`: every generated person (not animals, not the player) gets their own values at spawn from the pack's `spawn_qualities`, the same table by their own gender. Provided by the `dating/attraction` capability.

**Date**:
A person met through `find-a-date-teen` (a classmate aged 14 to 17) or `find-a-date` (a friend aged 18 to 30). One generator per gender (`date-teen-gen-*`, `date-gen-*`), so the name, body (`can_carry`) and attraction (`spawn_qualities`) follow the gender the player's own attraction picked. A date becomes a **partner** when `ask-out` succeeds.

**Age guard**:
Every romantic storylet carries `(age < 18) == (person.age < 18)`; dating needs 14+ on both sides, the dating app, marriage, pregnancy and adoption need an adult (adoption 21+).

**Ex** (`dating/ex`):
The role of a former partner or spouse. A role cannot be unset, so a break-up, a caught affair or a divorce moves the tie here: no pay, no household, no `partner`/`spouse` row. Closeness drops before the role changes (`setRole` keeps the highest closeness across rows).

**Engaged** (`dating_engaged`, person flag) and **proposed** (`dating_proposed`):
`propose` asks each partner at most once; an accepted proposal sets both. `plan-wedding` needs `dating_engaged`, and once per life through the Core `married` milestone.

**Wedding chain**:
`plan-wedding` (elope $800, small $12,000, big $40,000) hands on with `next` to `wedding-prenup`. A prenup ($1,500, `dating_prenup`) keeps money apart; skipping it runs `merge_money()` (before the role change, which fires `married`) and a text beat, `family-merge-money`.

**Divorce split**:
`money -= max(0, money) / 2` without a prenup, `/ 10` with one. A child under 18 offers custody: you keep the kids, or your ex keeps them and `dating_pays_support` queues `family-child-support-year` (a yearly $3,000 per child under 18, capped at cash, re-queued until none is left).

**Affair**:
`affair-cheat` (player, at most 3 per life) either is caught at once or schedules `affair-found-out` (25% caught). A caught affair ends a partnership (ex) or opens `divorce-forced` for a spouse. `partner-cheats` marks the partner (`dating_cheated`); `partner-cheat-found` lets the player forgive or walk away.

**Pregnancy**:
`try-for-a-baby` (25% a try) or `unplanned-pregnancy` sets `dating_pregnant` on the carrier (the player if `player.can_carry`, else a partner with `person.can_carry`) and schedules the due date a year later. The due date has a 5% miscarriage, else a decision: keep the baby (`baby-gen`, both birth parents linked), place for adoption, or end the pregnancy. Own and partner pregnancies are parallel chains (`pregnancy-*`, `partner-pregnancy-*`).

**Adoption**:
`adopt-a-child` (21+, living on your own, $5,000): a 0 to 17 child from `adoptee-gen` with `link: adopted` parent links, and the `adopted` milestone (`dating/family`).

**Harness qualities** (`dating_children`, `dating_married_age`, `dating_first_child_age`):
Written for the metrics only: a child tally, and the player's age at the `married` and `first_child` milestones (`on_milestone` hooks).
