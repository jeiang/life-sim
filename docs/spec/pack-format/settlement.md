# Settlement line items

A Pack adds yearly income and cost lines to settlement with a `settlement:` list in `pack.yaml` (restructure decision 4), instead of a Core release. Part of the [Pack format](index.md); settlement itself is described in [ADR 0003](../../adr/0003-saves-derived-rng-stable-ids.md).

```yaml
settlement:
  - { id: dividend, kind: income, label: Dividend, amount: "quality.shares * 20", when: quality.shares > 0 }
  - { id: club_dues, kind: cost,   label: Club dues, amount: 1200 }
```

| Key | Meaning |
|---|---|
| `id` | Line id, unique within the Pack. |
| `kind` | `income` adds money, `cost` removes it. |
| `label` | Journal text prefix. |
| `amount` | Int expression in the player's scope (minor units, same names as hooks: `age`, `money`, `stat.*`, `quality.*`, state, readables). |
| `when` | Optional bool expression; false skips the line. Absent: every year. |

## Meaning

- **Order.** Core lines first (occupation pay, market, living cost, loan payments, asset values), then Pack lines: Packs in bundle order (dependencies first, then id), lines in source order. Existing living, NPC pay and household costs stay Core.
- **Subject.** The player only; a dead player settles nothing. Lines run only in the yearly settlement.
- **Zero skip.** An amount of zero or less (after evaluation) posts nothing and writes no journal line.
- **Journal.** One line per applied line in that year's entry: `<label>: you received <money>.` or `<label>: you paid <money>.`
- **Shortfall.** A cost is capped at the player's cash (never below zero, like living costs); a capped cost journals `<label>: you could only pay <paid> of <amount>.` and no debt is created.
- **Determinism.** Amounts and conditions are pure functions of the world; nothing is added to saves, the choice log or the world hash. A line that rolls would draw under `pack/<id>/settlement/<line id>`.
