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
| `on_milestone: <id>` | Once per `fireMilestone` call for that id (see Milestones). Keyed by milestone id. |

Each phase is optional and non-empty. `on_succession` is added by its own issue (#219). Yearly income and cost lines are in [Settlement line items](settlement.md).

## Meaning

- **Subject.** Effects act on the player, in the player's scope (`age`, `stat.*`, `quality.*`, `money`, state containers, readables). There is no `person`, `amount` or storylet scope. `spawn_person(...) as pal` binds `pal` for the later statements of that Pack's list in that phase only.
- **Order.** Packs run in bundle order: dependency order (a Pack after every Pack whose capabilities it requires), then Pack id. Inside a Pack, statements run top to bottom. The order across Packs is therefore the same as the order the Packs are listed in the bundle array.
- **Death.** If a statement of a phase kills the player (a macro or a `die`), the rest of that phase and of the age-up is skipped, and `on_death` runs as for any death. In `on_death` the player is already dead: effects still apply (the obituary, as written, is not changed) and `die` is a build error there.
- **Build time.** Statements are checked and macros expanded like storylet effects: the compiled hook holds only closed primitives (`PackBundle.hooks`, `HooksDecl`: per phase a list of statements, each the list of effects it expanded to). Nothing is added to saves, the choice log or the world hash; a life with hooks replays and round-trips like one without.
- **Milestones.** The milestone ids a Pack may declare in `on_milestone` are opaque labels (`provides: milestones`); the compiler checks only the id pattern. The Core emits milestones with #216; until then `fireMilestone(world, bundles, id)` (`@life/core`) is the entry point and runs the hooks for `id` in Pack order, once per call. A caller that must fire a milestone once keeps its own record.

## Randomness

A hook has no roll of its own except `spawn_person`. Statement `n` (0-based, in source order, so a macro call counts as one statement) of Pack `<id>` in phase `<hook>` draws under the purpose key `pack/<id>/<hook>/<n>`; for a milestone the hook is `on_milestone/<milestone id>`. The key replaces the storylet-wide `spawn/<generator>`, so a hook subscriber never moves the counter of any other roll site, and adding or removing a hook never changes an existing purpose key. Adding a statement in the middle of a list renumbers the later ones of the same Pack and phase only.

## Position in the age-up

```
age every person -> reset counters -> on_age_up_pre -> living with parents -> NPC careers
  -> settlement -> on_age_up_post -> draw events -> open events -> NPC yearly pass
```

Changing this position changes every seeded outcome that follows it, so it is pinned by `packages/core/test/hooks.test.ts`.
