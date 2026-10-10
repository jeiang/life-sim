# Pack format: text and icons

Placeholders, pronouns and icons. Part of the [Pack format](index.md).

## Text

- Inline English. Placeholders (`{player.first_name}`, `{money}`, or a person bound by `spawn_person(...) as <name>`) are checked at build time against what is in scope. Every person reference (`player`, `person`, a bound name) also has pronoun placeholders from that person's gender: `{n.subject}` (he/she/they), `{n.object}` (him/her/them), `{n.possessive}` (his/her/their), and capitalised `{n.Subject}`, `{n.Object}`, `{n.Possessive}` for sentence starts. A person with no gender (old saves) reads as they/them/their. Expressions read `player.gender` and `person.gender` (or `<name>.gender`) as the string `"male"`, `"female"` or `"nonbinary"` (empty when absent), for example `person.gender == "female"`. Pronouns do not conjugate verbs, so write text that works for "they" (past tense, or "{n.first_name} says").
- Localization later extracts strings keyed by content id and field path. Keyed text is not required now.

## Icons

Optional `icon`: a literal emoji (Twemoji subset) or `gameicons/<author>/<name>`. Lucide ids are rejected in Packs. The build copies only referenced icons and writes the credits manifest ([Emoji and icon policy](https://github.com/jeiang/life-sim/issues/17)).
