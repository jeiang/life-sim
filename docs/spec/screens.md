# Screens

Decided in [Screen kinds and main play layout](https://github.com/jeiang/life-sim/issues/11), after reacting to the throwaway prototype on branch [`prototype/screens`](https://github.com/jeiang/life-sim/tree/prototype/screens/prototypes/screens) (variant A won). Terms follow [CONTEXT.md](../../CONTEXT.md).

## Main play layout (portrait phone)

```
+--------------------------------------+
| (icon) Name            $108,040  (gear)|  header: player (opens own profile),
|        Occupation      Bank balance  |  occupations, money, settings
+--------------------------------------+
| AGE 23 YEARS                          |
| I earned $12,000 as a Cashier.        |  journal feed, grouped by age,
| ...                                   |  auto-scrolled to the newest year
+--------------------------------------+
| Happiness ===   Health ====           |  compact stat bars (2 columns)
| Smarts ==       Looks ==              |
+--------------------------------------+
| Occupation  Assets  (AGE)  Relationships  Activities |
+--------------------------------------+
```

- The Age button is the large central control. It is disabled while an event is open.
- The install card sits at the top of the feed until dismissed (see Offline PWA research). It returns as an export reminder when `navigator.storage.persist()` is false (ADR 0003).

## Presentation rules

| Situation | Presentation |
|---|---|
| Menu (occupation, assets, relationships, activities, their submenus, settings) | Full page with Back |
| Event or action with choices | Centred modal. Chained `next:` steps stay in the same modal, with earlier outcome lines shown above the current step |
| Purchase dialog, amount picker | Centred modal |
| Profile (player or person), chart | Full page |

## Screen kinds (Pack-driven)

| Kind | Purpose | Driven by |
|---|---|---|
| Feed | The journal: lines grouped by age | Journal effects and outcome text |
| Stat panel | Labelled 0-100 bars | Declared stats |
| Menu list | Rows with icon, label, optional sublabel and value. Locked rows stay visible, greyed, with the reason (for example "Age 18+") | Menus, action storylets, assets, people |
| Choice dialog | Storylet text, icon, and choices; continues through `next:` | Storylets |
| Purchase dialog | Item, price, cash on hand; Pay cash / Take loan / Cancel, each disabled when not affordable | Item kinds; loan terms from the Pack |
| Amount picker | Choose an amount within a range, then confirm or cancel | Action storylets that need an amount (for example a bet) |
| Profile | A person's identity (what they are to you by kinship, else their role), relationship closeness, stats, and interactions; for the player: occupations, money, loans, net worth | Persons, relationships |
| Chart | A value over age (first use: net worth) | Core-tracked series |

## App screens (not Pack-driven)

- Install card (iOS "Add to Home Screen" guidance; Android install button).
- Settings: export lives, import lives, credits (from the build's credits manifest).
- God mode (hidden, an app feature, not a Pack): tapping the build version row in Settings > About 7 times shows a code field (only in a build that has a code hash, see [Deployment](deploy.md#hidden-options-code)). The code is checked with bcrypt against the build's hash, exactly as typed apart from surrounding spaces. A right code unlocks the **Hidden options** section of Settings for this install (local storage); a wrong one shows "That code is not right." The section holds two switches, each persisted per install: **God mode** and **18+ mode**. Turning a switch off does not lock the section again. An install unlocked with the earlier SHA-256 code stays unlocked, with god mode on. With god mode on, Settings also shows an "Edit this life" link. The life list gets a "Custom life" form: first and last name, gender, each starting stat, parent and sibling counts, and the birth city (random by default). "Edit this life" opens the god-mode panel, which sets each stat (0 to 100) and money. A custom start is choice 0 of the life's choice log (`start`) and each edit is a `god-stat` or `god-money` entry, so replay, export and import reproduce the life; lives that have any of these show an "Edited" badge on the profile and in the life list.
- 18+ mode (hidden, an app feature): a per-install switch in Hidden options. The switch is read when a life begins and recorded in the life (a leading `mature` choice log entry), so it affects new lives only (the switch says so) and a save replays the same whatever the setting is later. Packs offer explicit text variants with `mature_text` and `mature_label` (see [Pack format](pack-format/expressions.md#text-variants-for-18-mode)). The switch only hides the option; content stays readable in the source.
- Graveyard: finished lives as obituaries.
- Life list: the ongoing lives to continue, plus "start a new life", which adds a life to the list (several lives, ADR 0003). Only death moves a life to the graveyard.

## Menu ids

Top-level menus are fixed by the Core: `occupation`, `assets`, `relationships`, `activities`. Packs can declare submenus under them and place actions there with `menu: <top>/<sub>` (for example `activities/casino`, `assets/shopping`). Packs cannot add top-level menus.

## Visual language

- Content icons: Twemoji; game-icons.net glyphs as badges (white on a coloured circle) when no emoji fits. Chrome icons: Lucide ([Emoji and icon policy](https://github.com/jeiang/life-sim/issues/17)).
- Stat bar colours by value: green above 66, amber 34-66, red 33 and below.
- Theming, typography, accessibility, and dark mode are not decided yet (map fog).
