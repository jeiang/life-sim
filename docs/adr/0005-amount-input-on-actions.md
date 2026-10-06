# Actions can ask for an amount through one shared picker

An action storylet may declare `amount { min, max, step }`. Before it runs, the player picks an amount (money, minor units) from one shared picker component; the Core then binds `amount` in the storylet's choice and outcome `when`, `weight`, effects and text, and nowhere else. `min`, `max` and `step` are integer expressions over the player, evaluated when the menu is listed, so a range can follow the player's means (`max: money`). An action whose minimum exceeds the player's money is listed disabled. `{amount}` renders as money. `next:` does not carry the amount, and the compiler rejects a `next:` that targets a storylet with an `amount` because it would have none.

The amount enters the world through `runAction(..., amount)`, which rejects any value off the `min + k * step` grid or outside `[min, max]` (the UI only offers valid ones, so this guards callers such as the harness and replay). It is logged inside the `action` choice-log entry (`{ t: "action", id, target?, amount? }`) and held in `world.pending.amount` while choices are open, so a save made mid-choice resumes with the same amount and replay reproduces the life. The balance harness draws amounts uniformly from the grid (`pickAmount` in the profiles).

We rejected a separate `amount` log entry because it would let a log hold an action without its amount, or an amount without an action. We rejected a second picker for the Investing market screen: it reuses the same component through `requestAmount` in the web store. We rejected binding `amount` in the storylet-level `when` and prompt text because the player has not picked yet when those are read.

## Consequences

- `SCHEMA_VERSION` is 2. Version 1 saves load through a migration that only restamps worlds: both new fields are optional, and an old log or pending storylet never has an amount.
- Authors must keep `max` affordable themselves; the Core only enforces the minimum against cash at listing.
- Any new place that opens an action with an amount (a market screen, a harness move) must pass an amount on the grid, and log it the same way.
