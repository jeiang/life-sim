# Life Sim

A text-first life simulation game, played offline on a phone, whose rules and content come from authored data rather than hard-coded logic.

## Language

**Core**:
The content-agnostic part of the game that reads packs, advances a life, resolves probabilities, and renders generic screens.
_Avoid_: Engine framework, runtime

**Pack**:
A bundle of authored content (events, actions, items, jobs) compiled into the game at build time.
_Avoid_: Mod, plugin, DLC

**Core loop**:
The minimum playable cycle of one life: birth, aging up year by year, school, a job, money, shopping, and random events, until death.
_Avoid_: MVP, base game
