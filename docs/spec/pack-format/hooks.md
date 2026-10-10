# Lifecycle hooks

A Pack subscribes to fixed phases of a life with effect statements, so "set this quality at birth" or "record the offence at death" needs no Core release (restructure decision 4). A hook is built only from the closed Core effects and effect macros, and is run by the Core at a pinned position of the flow. Part of the [Pack format](index.md); the ordering and RNG rules are recorded in [ADR 0003](../../adr/0003-saves-derived-rng-stable-ids.md).

## Declaring

A `hooks` block in `pack.yaml` (schema: `packages/pack-tools/schema/pack.schema.json`). Each phase is a list of effect statements in the language of storylet effects (see [Expressions and effects](expressions.md)), including calls to [effect macros](effects.md) (`<pack>.<macro>(args)`) of this Pack or a required one:

```yaml
hooks:
  on_birth:
    - quality.crime_record = 0
    - crime.add_heat(0, 10)
  on_age_up_post:
    - journal("A year goes by.")
  on_death:
    - crime.add_heat(1, 10)
  on_milestone:
    graduated:
      - stat.smarts += 2
```

| Phase | Runs |
|---|---|
| `on_birth` | Once, at the end of `newLife`: the player, family, birth city and market already exist. It replaces setting qualities at birth in a storylet. |
| `on_age_up_pre` | Once per age-up, after everyone has aged a year and the per-age roll counters are reset, before the NPC careers, living-with-parents and settlement run. |
| `on_age_up_post` | Once per age-up, after settlement, before the year's events are drawn. A storylet that stops the year for a choice does not move it: the hook has already run. |
| `on_death` | Once, when the player dies (the `die` effect with no person in scope), right after the obituary is written. |
| `on_milestone: <id>` | Once per life, when the life reaches milestone `<id>` (see [Milestones](#milestones)). Keyed by milestone id. |

Each phase is optional and non-empty. Milestone hooks are keyed by id under `on_milestone`. `on_succession` is added by its own issue (#219). Yearly income and cost lines are in [Settlement line items](settlement.md).

## Meaning

- **Subject.** Effects act on the player, in the player's scope (`age`, `stat.*`, `quality.*`, `money`, state containers, readables). There is no `person`, `amount` or storylet scope. `spawn_person(...) as pal` binds `pal` for the later statements of that Pack's list in that phase only.
- **Order.** Packs run in bundle order: dependency order (a Pack after every Pack whose capabilities it requires), then Pack id. Inside a Pack, statements run top to bottom. The order across Packs is therefore the same as the order the Packs are listed in the bundle array.
- **Death.** If a statement of a phase kills the player (a macro or a `die`), the rest of that phase and of the age-up is skipped, and `on_death` runs as for any death. In `on_death` the player is already dead: effects still apply (the obituary, as written, is not changed) and `die` is a build error there.
- **Build time.** Statements are checked and macros expanded like storylet effects: the compiled hook holds only closed primitives (`PackBundle.hooks`, `HooksDecl`: per phase a list of statements, each the list of effects it expanded to). Nothing is added to saves, the choice log or the world hash; a life with hooks replays and round-trips like one without.
- **Milestones.** See [Milestones](#milestones): each fires once per life and records itself generically.

## Milestones

A milestone is a moment of a life, named by an opaque id (`^[a-z][a-z0-9_-]*$`). It **fires once per life**: reaching it a second time does nothing, whoever asks. Reaching one

1. records it in the Core-owned world state container `_milestones` (`{ <id>: true }`, see [State containers](state.md#the-milestone-record)); the record is the readable flag `milestone_reached(<id>)` (a boolean usable in any `when`, any scope);
2. runs the `on_milestone: <id>` statements of every Pack, in Pack order (a hook may reach further milestones; the record stops a loop);
3. queues the milestone's `trigger: milestone` storylets (see [Milestone storylets](storylets.md#milestone-storylets)), in id order, to open at the next age-up.

The Core emits five milestones itself, with no declaration needed. A milestone whose trigger the Packs never use (no household roles, no retirement kind) simply never fires:

| id | Reached when |
|---|---|
| `graduated` | The player finishes an occupation of the `school` group by its `duration_years` and that kind has no `promotes_to` (the end of the last school stage). |
| `first_job` | The player starts an occupation that pays (pay above 0 when it starts), is not in the `school` group, does not `confines`, and is not the retirement kind. Any start of it counts: `start_occupation(...)` in a storylet or a hook. |
| `married` | The `merge_money()` effect merges a partner's money into the player's (`living.household.partner_role`). |
| `first_child` | A person joins the player in the `living.household.dependent_role` role: `spawn_person(<role>, ...)` or `relationship(p).role = <role>`. |
| `retired` | The player starts the occupation kind `npc_careers.retired`. |

A Pack declares its own milestone with `provides: milestones` in a capability file (the owner Pack; another Pack needs to require that capability to name it, like any content id; two Packs cannot provide one id) and fires it with the effect `reach_milestone(<id>)` from a storylet, macro or hook. `reach_milestone` cannot fire a Core milestone, and listing a Core id in `provides: milestones` only makes that Pack its owner for `vocab`. The build rejects an id nobody declares in `on_milestone`, `milestone_reached`, `reach_milestone` and `trigger: milestone`.

Succession starts the heir's record empty, so the heir reaches each milestone again. The record is in saves and the world hash like any state; a world that never reaches one has no `_milestones` entry. `fireMilestone(world, bundles, id)` (`@life/core`) is the same operation as `reach_milestone` for a caller outside a logged action (a test or tool); it is not logged.

## Randomness

A hook has no roll of its own except `spawn_person`. Statement `n` (0-based, in source order, so a macro call counts as one statement) of Pack `<id>` in phase `<hook>` draws under the purpose key `pack/<id>/<hook>/<n>`; for a milestone the hook is `on_milestone/<milestone id>`. The key replaces the storylet-wide `spawn/<generator>`, so a hook subscriber never moves the counter of any other roll site, and adding or removing a hook never changes an existing purpose key. Adding a statement in the middle of a list renumbers the later ones of the same Pack and phase only.

## Position in the age-up

```
age every person -> reset counters -> on_age_up_pre -> living with parents -> NPC careers
  -> settlement -> on_age_up_post -> draw events -> open events -> NPC yearly pass
```

Changing this position changes every seeded outcome that follows it, so it is pinned by `packages/core/test/hooks.test.ts`.
