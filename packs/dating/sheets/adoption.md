# Content sheet: Adoption

- pack: dating
- packs: dating,core-loop,karma
- profile: random
- lives: 2000

> Chain 11 (issue #240), split from the children sheet. Adoption is a deliberate choice, so the focused sim plays the `random` profile, in which the pack down-weights it (`adjust` in `harness/profiles.yaml`).
> Milestones: `first_child` is a Core milestone and fires with the child role; adoption also reaches the dating milestone `adopted`.
> `link: adopted` makes the player (and a living spouse or partner) adoptive parents; the child joins the household through the child role, so the dependent cost applies until they reach 18.

## adopt-a-child
- trigger: action
- icon: 👶
- menu: relationships
- label: Adopt a child
- when: age >= 21 and not living.with_parents and living.standard != core-loop/homeless and money >= 500000
- max_per_life: 1
- text: You fill out a stack of forms, pass the home visit, and bring home a child who has waited a long time for a family.
- opens: 0.05..0.2 per life
- needs: generator dating/adoptee-gen: child, age 0..17: adoption child; first and last names, stats, gender, qualities, can_carry
- needs: milestone adopted: once per life: reached when the player adopts a child (declare in dating/family with `provides: milestones`)
> Fee: $5,000 (500000 minor units). The outline gives no figure; this is a BALANCE choice to revisit in #241.
> The child joins the household through `spawn_person(core-loop/child, ...)`, so the dependent cost applies until the child reaches 18.

### outcomes
- outcome: 1
  - text: The agency hands over the papers. A new child is sitting on your sofa with a small bag and a lot of questions.
  - effect: money -= 500000
  - effect: spawn_person(core-loop/child, dating/adoptee-gen, link: adopted) as kid
  - effect: reach_milestone(adopted)
  - effect: quality.dating_children += 1
  - rate: 100..100%
