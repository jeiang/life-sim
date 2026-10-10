# Effect macros

A Pack names a sequence of effects once and calls it from storylets and from other macros, so a cross-Pack behaviour such as "record an offence" is one line wherever it happens (restructure decision 4). A macro is built only from the closed Core effects (ADR 0002): it adds no primitive, no TypeScript and no runtime. A genuinely new kind of change still needs a Core release. Part of the [Pack format](index.md); the decision is recorded in [ADR 0002](../../adr/0002-core-life-sim-primitives-closed-effects.md).

## Declaring

`packs/<id>/effects/<topic>.yaml` is a list of macros, merged across files like `state/*.yaml` (schema: `packages/pack-tools/schema/effects.schema.json`):

```yaml
- id: add_heat
  params: [amount, cap]
  effects:
    - quality.heat += min(amount, cap)
    - journal("The neighbours talk.")

- id: lay_low
  effects:
    - crime.add_heat(0 - 2, 10)   # a macro of this or a required Pack, as <pack>.<macro>(...)
```

- `id`: a bare name (`^[a-z][a-z0-9_]*$`), unique within the Pack.
- `params`: optional list of integer parameter names. Inside the body a parameter is a plain integer name (`amount`). A parameter may not take a name already visible to the Pack (`money`, a stat's `stat.x` path root, a readable id, ...) or a reserved root; the compiler says so.
- `effects`: one or more effect statements, in the language of storylet effects (see [Expressions and effects](expressions.md)): every closed primitive (stat, quality, state, money, `take_loan`, `grant_asset`, `trade`, `spawn_person`, `relationship(...)`, occupations, `journal`, `die`, ...) and calls to other macros.

## Calling

A macro is called as an effect statement, `<pack>.<macro>(args)`, where `<pack>` is the owning Pack's id with hyphens written as underscores (`core-loop` calls `core_loop.x(...)`; two Packs whose ids collapse to one prefix are a build error). Arguments are integer expressions, checked in the caller's scope (a bare `amount` of an action, `stat.smarts`, a readable); arity and type are checked at the call. A macro is callable from the Pack that declares it, and from a Pack that requires a capability providing it:

```yaml
# capabilities/<feature>.yaml of the owner
provides:
  effects:
    - add_heat
```

Anything else is `unknown effect macro '<pack>.<macro>'`. The same list makes the macro part of the Pack's contract: renaming or removing one is as breaking as removing a quality.

## Meaning

Macros are expanded at build time, and nothing of them reaches the Core:

- **Resolve and check once.** The body is checked and resolved in the owning Pack's scope (its own and required names, content ids and macros), and errors point at the macro's file. A caller needs no visibility of what the body uses.
- **Substitute.** At each call the argument expressions replace the parameters, as whole expressions (`n + 1` stays one subtree), and the body's effects are inlined in order where the call stood. The compiled storylet holds only closed primitives, so saves, the world hash, the choice log and replay are unchanged: a macro life replays the same as its inlined equivalent, byte for byte.
- **Local people.** `spawn_person(...) as pal` in a body binds `pal` for the rest of that body only, and each expansion gets a fresh binding, so the caller's own bound names and two calls of one macro never collide. A caller's text and effects cannot see it. A body cannot reach the caller's scope (`person.*`, bound people, `amount`): pass what it needs as an argument.
- **Cycles and depth.** A macro that calls itself, directly or through others, is a build error naming the loop (`effect macros form a cycle: a -> b -> a`). Nesting is limited to 8 levels (a macro of primitives is level 1).
- **Text.** `journal` and `die` text in a body is checked against the owning Pack's names; parameters are not text placeholders.

## Not covered

Macros take integers only, return nothing, and cannot branch or loop: put conditions in storylet `when`, `weight` and outcomes. A Pack cannot declare a new primitive, and a body statement that is not a closed effect or a macro is `unknown effect '<name>'`.
