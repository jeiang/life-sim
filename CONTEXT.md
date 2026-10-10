# Life Sim

A text-first life simulation game, played offline on a phone, whose rules and content come from authored data rather than hard-coded logic.

This file is a stable index of the glossaries. It is never edited when a pack is added or changed.

## Glossaries

- [Core and pack format](packages/core/CONTEXT.md): the game-agnostic vocabulary (world, person, stat, quality, storylet, age-up, effect, persistence, presentation).
- Per pack: `packs/<id>/CONTEXT.md` holds the terms that pack owns; `packs/<id>/BALANCE.md` its balance targets and harness notes.

## Related documents

- [Architecture decisions](docs/adr/)
- [Specifications](docs/spec/): [pack format](docs/spec/pack-format/index.md), [harness](docs/spec/harness.md), [CI](docs/spec/ci.md), [deploy](docs/spec/deploy.md), [screens](docs/spec/screens.md), [visual](docs/spec/visual.md), [core loop](docs/spec/core-loop.md), [pack roadmap](docs/spec/pack-roadmap.md)

## Pack layout

`packs/<id>/{pack.yaml, capabilities/, qualities/, <content dirs>/, CONTEXT.md, BALANCE.md, test/}`: everything a pack adds lives under its own directory.
