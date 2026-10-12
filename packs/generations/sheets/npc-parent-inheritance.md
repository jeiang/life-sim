# Content sheet: NPC-parent inheritance

- pack: generations
- packs: generations,core-loop,dating

> Chain 6 ships as 2 storylets on the `person_death` trigger (#341), `once` per death.
> - `npc-parent-cash-left` (no money gate: NPC money is not modeled, so every parent death pays): the payout is one of three amounts for the player's family wealth tier (`quality.family_wealth`, 1 to 5, rolled once at the first age-up). The tier is a weighted pick of three fixed amounts, since expressions have no random range; the weights are 1, 2, 1 per tier. The amount is split equally among the dead parent's living children, the player included (`money += amount / living_kin_of(person, child)`).
>   - Tier amounts (minor units, design values pending the balance pass): 1 poor $5k / $10k / $15k; 2 modest $10k / $17.5k / $25k; 3 middle $20k / $30k / $40k; 4 comfortable $30k / $40k / $50k; 5 wealthy $50k / $80k / $120k.
> - `npc-parent-contested` (`when: age >= 16`; bare `age` is the player's age): two choices. "Hear the family out" gives `stat.happiness += 1`; "Refuse to discuss the money" gives `stat.happiness -= 2`.
> Dropped from the outline:
> - `home-left`: `owns()` reads the player's assets only (packages/core/src/sim/env.ts:417), so a parent-owned home cannot be checked.
> - `heirloom-left`: NPCs hold no heirlooms.
> `contested` binds the parent (`target: [parent]`), not the sibling: a `person_death` storylet binds the dead person, and a dead sibling cannot be bound under this trigger.
> Storylet count: 2. Needs: `person_death` (engine, #341).
