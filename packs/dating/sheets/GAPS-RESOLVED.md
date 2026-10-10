# Dating gap resolutions (Main, binding)

Schedule targets take the full pack-prefixed id: `schedule(dating/<storylet>, after: a-b years)` (docs/spec/pack-format/storylets.md, Scheduled consequences). Ended relationships use role `dating/ex`. A `next:` must point at an event (chance 0%), never at an action.

1-3. Pregnancy, child support, affairs: express in pack content (dating_ qualities + schedule + person.money effects). No engine change.
4. Core-loop overlap (decision 3, shared content moves to owner): move `dating-app` and `heartbreak` from core-loop into dating (the dating implementer may delete them from core-loop in the same PR). `grandchild-babysit` and `tell-old-stories` stay in core-loop but get a guard: require a grandchild via `count_kin(grandchild, 0, 120) > 0` (kinship readables exist); the dating implementer may add those guards in core-loop.
5. `roll-attraction`: replace the chance 100% storylet with an `on_birth` hook in dating's pack.yaml (NPC attraction already comes from spawn_qualities).
6-7. Verify names with vocab: `player.gender`, `person.gender` exist (PR 118 era); living names per docs/spec/core-loop.md.
8. Verify at implementation; if household cost counts dead or moved-out children, file a core-loop bug, do not patch around it.
9. Half of cash: `money -= money / 2` style effects.
10. Child stats: genetics exists now (`inherit:` on stats, PR 311) and applies at succession; children at birth use core-loop child stats.
11-12. Present on main (#214 person decisions, gender fields, dependent_cost, settlement lines).
Also: children born to the player must create kinship links (spawn_person with a child role links `_parents`; spouse becomes the other birth parent; PR 290). Adoption uses `addParentLink` semantics via the adopted parent kind if exposed; otherwise a child role row (implementer verifies).
