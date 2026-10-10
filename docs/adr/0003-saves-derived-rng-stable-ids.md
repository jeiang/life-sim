# Saves are snapshots with derived RNG streams and permanent content ids

Each life is autosaved to IndexedDB after every action and age-up as a World snapshot plus its choice log. Randomness is sfc32, seeded per roll site from (life seed, age, purpose key, counter), so the save holds only the seed and counters, a reload cannot reroll an outcome, and adding or changing one storylet does not reshuffle unrelated outcomes. Pack content ids are permanent: removing or renaming one requires a Pack migration (one `migrations/<name>.yaml` file per migration), and the build fails without it. Saves record the capability ids they were made with and the ids of the Pack migrations already applied to them; on load, the migrations a save has not yet applied run once. We rejected a single sequential RNG stream because every content edit would shift all later outcomes and make balance comparisons noisy. We rejected archiving or pinning saves on content change because content updates ship with every service worker update.

## Consequences

- Age-up runs in a fixed order: age every person, then settlement (occupations, loans, assets, in id order), then the player's events, then the NPC yearly pass. Changing this order changes every seeded outcome.
- A choice log replays exactly only on the build that wrote it. Replay is a debugging and test tool, not a save format.
- Saves can be lost when the browser evicts storage, so export/import is the backup path. The app nudges for it when `navigator.storage.persist()` returns false.
- The yearly cap never favours a Pack by id: when chance hits exceed the cap, the survivors come from a keyed draw (purpose key `year/chance-cap/<i>`), taken only when the cap actually bites, so years where it does not are unchanged. Only Pack `core-loop` may declare the singleton `year` and `family` manifest blocks, so a Pack sorting before it cannot silently replace them.

## Amendment 2026-10-06: generations and the world-year clock

- Streams are derived from (life seed, **generation**, age, purpose key, counter). Generation 0 uses the original input string, so existing lives replay unchanged; generation `n > 0` inserts `g<n>` after the seed, so an heir never replays the founder's draws at the same ages.
- `World.generation` (0 for the founder, +1 per succession) and `World.worldYear` (+1 per age-up, never reset) are saved and hashed. Price series read `worldYear`, not the player's age, so markets do not restart when an heir takes over. Saves without the fields load as generation 0 with `worldYear` equal to the player's age (schema version 4 restamps them).
- `succeed(world, heir)` moves the player pointer, bumps the generation, and resets `storyletLog`, the roll-site counters and the repeatable-action counters. It is logged as a `succeed` choice entry so replay reproduces it. Clearing `ended` and archiving the obituary stay with the dynasty flow.

## Note (2026-10-06): NPC career rolls (#131)

Age-up order becomes: age every person, the NPC career pass, settlement, events, NPC yearly pass. The career pass rolls per person with purpose keys `career/<id>/education|pick|hire|loss|promotion`, so persons added or removed never shift another person's rolls; a generator that declares `jobs` takes one extra draw at the end of the spawn stream, so other draws do not move. `Person.job` is optional and additive: old saves load unchanged (schema version stays), and the world hash changes only for persons that have it or a career.

## Amendment 2026-10-09: save schema reset (#182)

- `SCHEMA_VERSION` 5 became 6 as a one-time reset. The migration chain (`v0to1` to `v4to5`) is deleted: a save below version 6 is rejected on load with a message saying it is from an older, incompatible version, and a save above is rejected as newer. Decision 2 of the restructure: no compatibility is promised before the first `v<N>` release tag; from that tag on, schema changes ship with migrations again.
- `World` and `SaveFile` carry `capabilities` (sorted capability ids) and `appliedMigrations` (sorted migration ids, `<pack>/<name>`) instead of per-Pack versions. Importing a save that needs a capability the build lacks is refused ("this version of the game does not include" it). A Pack migration runs on a world exactly when its id is not in `appliedMigrations`, so migrations merge as separate files without a shared counter.

## Amendment 2026-10-10: forced-outcome seam (#197)

- `setStreamOverride((age, purposeKey, counter) => Rng | undefined)` (`rng.ts`, exported from `@life/core`) is consulted in `nextStream` after the counter is read and advanced, so counters move exactly as without it and unforced rolls (and their world hashes) are unchanged. A returned `ScriptedRng({ chance?, int?, pick? })` forces `chanceBp` (hit or miss), `int` (value) and `weightedPick` (index, or a label: outcomes are matched by their `text`) for that roll site; purpose keys are the ones above, e.g. `gambling/play-slots` (chance storylets) and `outcome/gambling/play-slots`.
- Forced rolls are not logged: a forced life is not replayable from its choice log. The seam is module-level state for vitest and the harness; `apps/web` never imports it and the e2e production-bundle guard (`e2e/check-prod-bundle.ts`) fails if `setStreamOverride` or `ScriptedRng` appears in `dist`.
