# Core knows life-sim primitives and owns a closed effect set

The Core is content-agnostic, but not fully generic. It has built-in models for the world (persons with a movable player pointer), yearly age-ups, money in integer minor units of one currency, loans, occupations, assets, relationships, and the journal. Packs declare stats, qualities, item kinds, occupations, people-generation data, and all storylets. Storylets change the world only through a closed set of Core effects: stat or quality, money, loan, asset, occupation, spawn person, relationship, journal, and die. We rejected a fully generic Core, where money and people are Pack-defined, because generic screens (purchase dialog with cash/loan, profile, chart) need to know what price, cash, and person mean. We rejected Pack-defined effects because a closed set can be fully checked at build time and keeps saves safe across Pack changes.

## Consequences

- A new kind of change, such as currency exchange for relocation, needs a Core release, not only a Pack.
- Death is never automatic: a Pack must ship a mortality storylet, or no one dies.
- Continuing as a child is a pointer move in the world, not a state migration.
- Amendment (confinement): occupations may declare `confines { menus, events }`. Core locks content by whitelist, not blocklist: while confined, only storylets tagged `custody-ok` (a Core-owned tag) run in a locked trigger kind, the shop is locked, and housing is provided. Core exposes the boolean `confined`. Future menus and events therefore lock by default; a Pack that wants one to work in custody tags it.
