# Saves are snapshots with derived RNG streams and permanent content ids

Each life is autosaved to IndexedDB after every action and age-up as a World snapshot plus its choice log. Randomness is sfc32, seeded per roll site from (life seed, age, purpose key, counter), so the save holds only the seed and counters, a reload cannot reroll an outcome, and adding or changing one storylet does not reshuffle unrelated outcomes. Pack content ids are permanent: removing or renaming one requires a Pack migration entry, and the build fails without it. Saves record the Pack versions they used, and the Core save schema has versioned migrations that run on load. We rejected a single sequential RNG stream because every content edit would shift all later outcomes and make balance comparisons noisy. We rejected archiving or pinning saves on content change because content updates ship with every service worker update.

## Consequences

- Age-up runs in a fixed order: age every person, then settlement (occupations, loans, assets, in id order), then the player's events, then the NPC yearly pass. Changing this order changes every seeded outcome.
- A choice log replays exactly only on the build that wrote it. Replay is a debugging and test tool, not a save format.
- Saves can be lost when the browser evicts storage, so export/import is the backup path. The app nudges for it when `navigator.storage.persist()` returns false.
