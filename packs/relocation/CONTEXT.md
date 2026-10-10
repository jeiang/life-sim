# relocation glossary

Terms owned by the relocation Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Language skill**:
One int quality per language, `reloc_lang_<language>` (0-100): English (default 100), Spanish, French, German, Italian, Japanese, Mandarin, Korean (default 0). Provided by the `relocation/languages` capability, so any Pack may read them.
_Avoid_: Fluency (use Language skill)

**Study a language**:
The repeatable action `relocation/study-a-language` in the `activities/languages` submenu (age 6+, available anywhere). Each use picks one language below 100 and raises its skill; the gain follows the repeat curve by hand because qualities are not scaled by the Core.
