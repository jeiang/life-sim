# relocation balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives N --profile all --seed 20260101 --out <dir>`.

## Design numbers

- `study-a-language` (age 6+, repeatable, `activities/languages`): per use, 60% a productive session (skill +6, smarts +1) and 40% a slow one (skill +3, happiness -1). Qualities are not scaled by the repeat curve, so the skill gain follows it by hand: full for uses 1-10 in a year, +2 / +1 for 11-20, none from 21 (the same thresholds as the Core `repeat` default).
- A language at 100 is not offered. English starts at 100.
- Moved from core-loop (Pack version 9 -> 10 numbers unchanged); ids renamed `lang_*` -> `reloc_lang_*`.

## Targets

Behaviour is unchanged from when the content lived in core-loop; no new targets.
