# dating balance

Moved from core-loop (`roll-attraction`, weights unchanged); ids renamed `attracted_*` -> `dating_attracted_*`. Pattern by the player's gender: 78% of men / women are attracted mainly to the other binary gender, 8% to their own, 10% to both, 2% mostly nonbinary people, 2% to nobody; unset or nonbinary gender shares one table.

NPC attraction: every generated person (family, friends, partners, children; not animals, not the player) rolls the same table by their own gender at spawn (`spawn_qualities` in `pack.yaml`; the player's own roll stays at the first age-up). Keep the two tables in step.
