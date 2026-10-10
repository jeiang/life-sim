# Content sheet: NPC-parent inheritance

- pack: generations
- packs: generations,core-loop,dating

> Chain 6 is CUT to zero storylets (GAPS-RESOLVED, gap 5 check: a person-scoped storylet must be able to bind a dead parent; it cannot).
> Evidence, in the clone at /tmp/ls-review:
> - packages/core/src/sim/storylets.ts, bindingLive(): a person binding is live only while `p.alive` holds, so ineligibility() returns "Not available" for any `scope: person` storylet bound to a dead person. `when: not person.alive` therefore never holds for a bound person.
> - packages/core/src/sim/flow.ts, npcPass(): the NPC yearly pass iterates only `p.alive && p.id !== playerId`.
> - packages/core/src/sim/schedule.ts: a scheduled entry with a `person` is dropped once that person is dead (docs/spec/pack-format/storylets.md: "A person who died drops their entry at once").
> - No pack-side workaround: hooks bind the player or the heir only (no person in scope), so a hook cannot schedule(person) or read a dead parent's money; count_kin and count_role count living people only.
> Engine issue for Main to file (not built here): a death-moment trigger that binds the dead parent for one storylet (for example `trigger: person_death` with `person` bound, reading `person.money` and `person.quality.<id>`), with bindingLive relaxed for that trigger only. Core's parent-death content is not extendable by a pack, so the trigger must come from the engine.
> When the trigger exists, re-draft these four storylets from OUTLINE.md chain 6, `gen` namespace, `once` per death: npc-parent/cash-left (money += person.money, split by will kind), npc-parent/home-left (grant_asset of the home the parent owned), npc-parent/heirloom-left (grant_asset of one gen-heirloom, feeds chain 5), npc-parent/contested (scope: person, target: sibling; the will is contested).
> Storylet count: 0. Needs: none (no vocabulary is used here; nothing new is declared).
