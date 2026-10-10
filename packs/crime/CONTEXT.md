# crime glossary

Terms owned by the crime Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Criminal record**:
The `criminal_record` flag, set by a conviction. It feeds core-loop's `hiring_blocked` slot (`readables/hiring.yaml`), so professional `apply-*` jobs refuse the player while it is set; entry jobs still hire.
_Avoid_: Rap sheet

**Wanted**:
The `wanted` flag: the player is a fugitive.

**Pending charge** (mailbox quality):
The `pending_charge` int, 0 = none. A mailbox: any Pack that produces a crime writes a charge code, crime reads it and clears it back to 0. Producers never read it and crime is the only one that resets it.
