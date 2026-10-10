# core-loop glossary

Terms owned by the core-loop Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Mailbox quality**:
A core-loop quality that one Pack writes and another reads on a later age-up, so neither depends on the other. `crime_pending_charge` is the first (now owned by the crime Pack): any Pack sets it, Crime arrests at the next age-up.

**Family wealth**:
A hidden quality (`family_wealth`, 1 to 5) rolled once at the first age-up and shared by every Pack that needs the player's family means (parents' help, weddings, family standing). Packs read it and never roll their own.

**Fame**:
A leaf capability (`core-loop/fame`): the quality `fame` (0-100) with `fame_age`, the age it was last set. Fame fades 5 points a year since `fame_age`; Packs read the readable `fame_value` (never `quality.fame`) and change it with `core_loop.add_fame(points)`.
