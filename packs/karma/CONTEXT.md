# karma glossary

Terms owned by the karma Pack, a leaf with no dependencies so core-loop and any content Pack can require it without a cycle. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Karma**:
A hidden quality (`karma_score`, 0 to 100, default 50) that only non-repeatable content writes, so repeating an action cannot farm it. Provided by the `karma/score` capability, together with the readable `karma_value` (the score as an expression name, for outcome weights). Writers (core-loop's wallet, volunteering, cheating and helping-a-stranger choices, Crime, Dating, expansions) require `karma/score`.
