# Visual style and accessibility baseline

Decided in [Visual style and accessibility baseline](https://github.com/jeiang/life-sim/issues/22). It applies to the Classic layout in [screens](screens.md) and the icon rules in [Emoji and icon policy](https://github.com/jeiang/life-sim/issues/17).

## Themes

- Light and dark themes follow `prefers-color-scheme`. There is no in-app toggle.
- Colours are semantic Tailwind tokens with a light and a dark value each. Components use the tokens, never raw palette classes.

| Token | Light (from the prototype) | Use |
|---|---|---|
| `primary` | sky | Header, links, choice buttons |
| `action` | emerald | Age button, confirm |
| `surface`, `surface-raised`, `text`, `text-muted` | slate scale | Backgrounds, cards, body text |
| `stat-good`, `stat-mid`, `stat-bad` | green, amber, red | Stat bars (above 66, 34-66, 33 and below) |
| `danger`, `warning` | rose, amber | Destructive actions, loan warnings |

Dark values are chosen to meet the same contrast targets.

## Typography

- The system font stack (SF on iOS, Roboto on Android). No bundled fonts.
- All sizes are in `rem`, so the OS text-size settings apply.

## Accessibility (WCAG 2.2 AA)

- Text contrast of at least 4.5:1 (3:1 for large text and UI parts) in both themes.
- Touch targets of at least 44 by 44 px.
- Usable at 200% text size: no clipped text and no loss of function in the Classic layout.
- Colour is never the only signal. Every stat bar also shows its number.
- Screen readers: stat bars expose a label and value ("Health, 96 percent"). Content icons have text names (the storylet or item label). Decorative icons are hidden. Modals trap focus and return it to the control that opened them. Journal updates after an age-up are announced politely.
- The `e2e` check runs axe-core on every screen kind in both themes and fails on any violation ([CI](ci.md)).

## Motion

- Stat bar changes ease over about 300 ms. Modals fade and scale in. New journal lines slide in.
- All motion is disabled under `prefers-reduced-motion`.
