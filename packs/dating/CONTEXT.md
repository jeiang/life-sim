# dating glossary

Terms owned by the dating Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Attraction**:
Three hidden int qualities, `dating_attracted_men`, `dating_attracted_women` and `dating_attracted_nonbinary` (0 to 100, default 0), rolled once at the first age-up by `dating/roll-attraction` from the player's gender. They are `scope: person`: every generated person (not animals, not the player) gets their own values at spawn from the pack's `spawn_qualities`, the same table by their own gender. Provided by the `dating/attraction` capability.
