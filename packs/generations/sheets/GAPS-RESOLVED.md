# Generations gap resolutions (Main, binding)

- Heirlooms: NOT market kinds. Declare a pack content kind `gen_heirloom` (kinds/, docs/spec/pack-format/kinds.md) with fields (label, base value, gain per generation, story text) and per-heirloom state in a pack table (state/*.yaml): held flag and current value. Gain applied in the on_succession hook. Value counts toward net worth only if a settlement/asset mechanism exists; otherwise heirloom value is narrative plus a sell action that pays cash (`money += table...`).
- Generation number: pack counter `world.gen_generation` (state counter) incremented in the on_succession hook. No engine change.
- guardian / grandparent: use kinship readables (kin, is_kin, count_kin) and core guardian; no roles.
- Debt write-off beat: read `deceased.money < 0` (deceased.* exists); no new readable.
- Chain 6 (NPC parent inheritance): drafter checks whether a person-scoped event can bind a dead parent (`person.alive` is readable; check docs/spec/pack-format/storylets.md for binding of dead people). If yes, use `when: not person.alive and not person.quality.gen_inherited` with a stamp. If no, cut chain 6 to 0 storylets and Main files an engine issue for an NPC death hook; do not block the pack.
- #292 and #294 are merged (profile adjust/pick, market/outcome/holdings measures).
- flake.nix depsSrc only matters for packages with package.json; packs have none.
- #243 = metrics and balance for this pack, after #242.
- will-heir targets `child, step-child` (kinship target ids; compiler accepts them; scaffold fix #342). Chain 6 is cut until #341 (person_death trigger); pack ships 18 storylets.
- Schedule ids use the PACK id, not the namespace: `schedule(generations/<id>, after: a-b years)` (namespace `gen` is for qualities/state only).
- Succession openers: the sheet grammar has no `trigger: succession`; write them as chance 0% steps scheduled from on_succession, and the implementer may convert them to `trigger: succession` storylets (engine supports it, PR 304). Minor handover at 18 as a weighted event is accepted for v1.
- Debt write-off beat: dropped (money never goes negative; Core writes off shortfall silently). Spouse-share no-will gate: read `deceased.quality.gen_will_kind == 0` (deceased.quality.* is readable). Family-home has no sale choice (sale goes through the Assets menu).
