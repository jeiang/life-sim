# Content sheet: NPC-parent inheritance

- pack: generations
- packs: generations,core-loop,dating

> Chain 6 ships as 2 storylets on the `person_death` trigger (#341), `once` per death.
> - `npc-parent-cash-left` (`when: person.money > 0`): the player takes the parent's whole cash, `money += person.money`. Not split by will kind: `count_kin` is player-relative and no expression counts a dead parent's living children.
> - `npc-parent-contested` (`when: person.money > 0 and age >= 16`; bare `age` is the player's age): two choices. "Hear the family out" gives `stat.happiness += 1`; "Refuse to discuss the money" gives `stat.happiness -= 2`.
> Dropped from the outline:
> - `home-left`: `owns()` reads the player's assets only (packages/core/src/sim/env.ts:417), so a parent-owned home cannot be checked.
> - `heirloom-left`: NPCs hold no heirlooms.
> `contested` binds the parent (`target: [parent]`), not the sibling: a `person_death` storylet binds the dead person, and a dead sibling cannot be bound under this trigger.
> Storylet count: 2. Needs: `person_death` (engine, #341).
