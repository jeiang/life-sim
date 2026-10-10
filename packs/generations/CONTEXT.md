# generations glossary

Terms owned by the generations Pack (namespace `gen`). General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md); succession itself (heir, estate, guardian, trust, genetics) is Core's, see [core-loop](../../docs/spec/core-loop.md#succession).

**Will**:
`will-make` (four kinds: even split among children, all to the spouse, charity, tear it up) and `will-heir` (one named child, `scope: person`, `target: [child, step-child]`) in the Assets menu `assets/estate`, from 18, each with a 3-year cooldown. They call the Core `set_will` / `will_heir`; the estate rule at death (and the no-will rule: spouse half, children split the rest) is Core's. Every option writes `gen_will_kind` (0 none, 1 heir, 2 even, 3 spouse, 4 charity), read at the heir's side as `deceased.quality.gen_will_kind`.

**Generation counter** (`world.gen_generation`):
World counter, 0 for the founder, incremented by the `on_succession` hook. It persists across succession (a world counter), so the heir's lineage position is readable.

**Succession openers** (`inherit-under-12`, `inherit-12-17`, `inherit-18-39`, `inherit-40-plus`):
`trigger: succession` storylets, one per heir age band. The bands are exhaustive so exactly one opens in the heir's first age-up; each is `once`, which fires again per generation because Core clears the log at succession. Each writes `gen_inherit_band` (0..3).

**Aftermath**:
`aftermath-grief`, `aftermath-cash-left` and `aftermath-family-home` are `trigger: succession`; `aftermath-anniversary` is scheduled a year after grief; `aftermath-sibling-contests` and `aftermath-spouse-share` are `scope: person` events gated on `deceased.money` / `deceased.quality.gen_will_kind`. They only react to the estate Core settled.

**Minor heir** (`gen_minor_heir`, int 0..1):
Set in `on_succession` as `age < 18`. `minor-guardian-takes-in` (`trigger: succession`), `minor-guardian-review` (a kin adult, in the Core guardian order), `minor-on-own` (no guardian) and `minor-handover-at-18` (the story beat of the trust release; clears the flag).

**Heirloom** (kind `gen_heirloom`, table `gen_heirloom`):
Five entries (watch, quilt, clock, violin, letters) with `base`, `gain` (percent per generation) and `story`. They are not market holdings and add nothing to net worth. The per-person table holds `<id>_held`, `_value`, `_passed`, `_told`, `_sold`. `heirloom-attic-find` sets `held` and `value = base`; `heirloom-sell` (Assets menu `assets/heirlooms`) pays `value` in cash and sets `sold`; `on_succession` copies the dead player's row from `deceased.table.gen_heirloom`, and for a held one adds `gain` percent and one to `passed`.

**NPC-parent inheritance**:
Cut from this Pack until Core has a `person_death` trigger (#341); [sheets/npc-parent-inheritance.md](sheets/npc-parent-inheritance.md) is kept as a note.

**Harness**:
Profile `dynasty` (opt-in) builds a family and writes a will so `--generations N` runs reach succession; metrics in `harness/metrics.yaml`. Heir availability, inheritance, heir age, minor-heir and insolvent-estate rates by generation are core-loop's generation tables.
