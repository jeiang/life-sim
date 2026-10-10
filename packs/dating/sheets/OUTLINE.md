# Pack `dating` outline (Phase D, outline only)

- Pack id: `dating`. Namespace: `dating`. Quality prefix: `dating_`.
- Issues: #239 (dating, relationship, marriage, divorce), #240 (children, adoption, household, child support, pregnancy), #241 (balance on artemis).
- Base: origin/main `d3ca2206`. Vocab checked with `pnpm tool vocab --packs dating`.
- Decisions: grilled in #54 (closed as NOT_PLANNED; decisions refiled into #239, #240, #241). Constraints from `local://sheets/GAPS-RESOLVED.md`: mandatory events use `schedule(...)` or `on_age_up_post`, never `chance: 100%`; `reach_milestone` and `milestone_reached` fire once per life; `end_group`, harness `adjust`/`pick`, and market measures are available.

## Required capabilities

Existing: `dating/attraction` (provides `dating_attracted_men|women|nonbinary`; requires `core-loop/stats`).

New (proposed split, one capability per issue area):
- `dating/romance`: requires `core-loop/family`, `core-loop/singletons`. Dating, date night, ask out, affairs, break up, dating-app and decision slots.
- `dating/marriage`: requires `dating/romance`, `core-loop/singletons`. Proposal, wedding, prenup, moving in, divorce, child support.
- `dating/family`: requires `dating/marriage`, `core-loop/family`, `core-loop/housing` (for `kickout_pct` and standards). Pregnancy, children, adoption, move-out, spend time with a child.

Each capability provides only the names it declares (`qualities`, `generators`, `milestones`); roles are reused from core-loop (`partner`, `spouse`, `child`), not redeclared.

## Chains

Each chain lists Summary, Trigger, Entry conditions, Effects, Frequency, Grilled decisions covered, Engine features, and Vocab status. Ages are the player's age unless marked `person.age`.

### 1. Attraction and dating preference
- Summary: the player's attraction values (`dating_attracted_*`) drive pool pick for dates, proposals, and affairs.
- Trigger: the existing `roll-attraction` at first age-up (kept).
- Entry conditions: none beyond the current birth roll.
- Effects: writes `dating_attracted_*` on the player; generated persons already roll the same table at spawn (`spawn_qualities`).
- Frequency: once per life.
- Grilled decisions covered: dating preference replaces men/women/anyone (#196 moved attraction to dating).
- Engine features: `scope: person` qualities; `spawn_qualities`.
- Vocab status: `dating_attracted_*` exist on main.
- Note: `roll-attraction` uses `chance: 100%`. GAPS-RESOLVED forbids this for mandatory events. Change to an `on_age_up_post` hook or `schedule(..., after: 1)`.

### 2. Dating from 14+ (find a date, dating app, ask out)
- Summary: a teen or adult meets a date; the dating app is a separate adult choice.
- Trigger: event (find a date, 14+); dating-app event (18+); ask-out is a person-scoped decision.
- Entry conditions: all dating storylets carry the guard `(age < 18) == (person.age < 18)` (14+ means the dating partner is also under 18 or both are 18+). Dating-app: `age >= 18`. Intimacy, pregnancy, marriage: 18+.
- Effects: spawns `date-gen` persons with `dating_attracted_*` matching the player; a date becomes `core-loop/partner` on success; `stat.happiness` and `stat.looks` deltas as in the core-loop `dating-app` outcomes.
- Frequency: find a date ~1 to 3 per year over ages 14 to 30; app: at most once per 6 years (cooldown).
- Grilled decisions covered: dating 14+ with guard; dating app 18+.
- Engine features: `scope: person` storylets with `target` and `chance`; `cooldown`; `count_role`.
- Vocab status: `count_role`, `relationship(<p>).role`, `date-gen` (to declare).
- Move: the core-loop `dating-app` storylet (`decisions-adult.yaml:174`) moves into dating. Requires a core-loop change (see GAPS).

### 3. Date night (repeatable) and spend time with a child (repeatable)
- Summary: repeat storylets for an existing partner or child.
- Trigger: event with `repeat` singleton; `when` requires `count_role(core-loop/partner, 1, 100)` or `count_role(core-loop/child, 1, 100)`.
- Effects: `relationship(p).closeness +=`; happiness deltas. Repeatable gains shrink with use count (#106, the `repeat` singleton).
- Frequency: repeatable; gains shrink with use.
- Grilled decisions covered: date night and time with child are repeatable (#106); other actions are limited.
- Engine features: `repeat` singleton (`full: 3`, `reduced: 8`, `factor: 25%`); `relationship(p).closeness`.
- Vocab status: `relationship(<p>).closeness +=` and `person.closeness` (read-only, player's highest closeness) confirmed.

### 4. Ask out and propose (person-scoped decisions)
- Summary: the player asks a person out or proposes. Person-scoped choice events join the slot pool (#214).
- Trigger: `scope: person` decision; one candidate, uniform pick, weight = max.
- Entry conditions: ask-out: 14+ with guard; propose: 18+, existing partner (`core-loop/partner`) with closeness >= threshold.
- Effects: ask out: `relationship(p).role = core-loop/partner`; propose: `relationship(p).role = core-loop/partner` continues to the wedding chain.
- Frequency: ask out 1 to 4 per year; propose at most 1 per partner.
- Grilled decisions covered: person-scoped decisions (proposals, confessions) use the #214/#103 slot pool.
- Engine features: `scope: person` decisions; `npcPass` skips decision events.
- Vocab status: `relationship(<p>).role = <id>` and `count_role` confirmed.

### 5. Affairs (both ways)
- Summary: the player can cheat with a risk of being caught; partners can cheat too.
- Trigger: event (player-initiated decision, plus partner-initiated event).
- Entry conditions: player has `core-loop/partner` or `core-loop/spouse`.
- Effects: player cheat outcomes set `dating_affair` quality; caught ends the relationship (role unset) and drops closeness; partner cheat sets `dating_cheated` on the relationship.
- Frequency: low (1 to 3 times per life).
- Grilled decisions covered: affairs both ways, with risk of being caught.
- Engine features: `person.quality.<id> +=/=` (person-scoped quality writes); `relationship(p).role`.
- Vocab status: `person.quality.<id>` writes exist; affair detection is a GAP (no mechanic in vocab for "caught" chance beyond expression rolls).

### 6. Moving in together (choice)
- Summary: the partner moves in; the household shares cost.
- Trigger: decision with `core-loop/partner`.
- Entry conditions: partner closeness above a threshold; not already in a `core-loop/spouse` marriage with a prenup.
- Effects: `move_in`; `living.household` `partner_share: 50%` already applies.
- Frequency: once per relationship.
- Grilled decisions covered: moving in together is a choice.
- Engine features: `move_in` effect; `living.household` in core-loop pack.yaml (`partner_share: 50%`, `dependent_cost: 400000`).
- Vocab status: `move_in`, `move_out`, `merge_money` confirmed.

### 7. Wedding (elope, small, big; optional prenup)
- Summary: a wedding plan turns a partner into a spouse. A prenup keeps money separate.
- Trigger: `propose` accepted (chain 4); the wedding plan is a person-scoped decision.
- Entry conditions: partner; 18+; not already married.
- Effects: `relationship(p).role = core-loop/spouse`; `reach_milestone married` (once per life); elope/small/big cost money (`person.money -=`); prenup choice sets `dating_prenup` on the player.
- Without prenup: `merge_money` (savings merged; spouse income added yearly).
- With prenup: money stays separate; the prenup is shown on the profile (quality `format: money` for amounts).
- Frequency: marriage 0 to 1 per life (target share from harness).
- Grilled decisions covered: elope/small/big with optional prenup; married without prenup merges savings and spouse income adds yearly; prenup keeps money separate.
- Engine features: `merge_money`; `reach_milestone`/`milestone_reached` (once per life); `dating_prenup` quality.
- Vocab status: all confirmed. Prenup support exists in core docs (`docs/spec/pack-format/content-kinds.md`, `docs/spec/core-loop.md`, `household.test.ts`).

### 8. Break up and divorce
- Summary: the relationship ends. Divorce splits cash; child support applies while kids under 18 live with the ex.
- Trigger: break-up decision (partner); divorce decision (spouse).
- Entry conditions: divorce requires `core-loop/spouse`.
- Effects: break up: `relationship(p).role` unset; closeness drops. Divorce: role unset; without prenup, player loses half of cash (`person.money -=` half of current cash), with prenup, most is protected; `unschedule` for pending spouse-scoped events.
- Frequency: break up 0 to 2 per life; divorce 0 to 1 per life.
- Grilled decisions covered: break up and divorce; divorce without prenup loses half cash; prenup protects most.
- Engine features: `unschedule`; `relationship(p).role` unset; `count_role`.
- Vocab status: `unschedule` and `relationship` confirmed. Cash split formula is a GAP (see Data).

### 9. Try for a baby and pregnancy (keep, adopt, abortion, rare miscarriage)
- Summary: the couple tries for a child; pregnancy follows, ends in birth, adoption, abortion, or rare miscarriage.
- Trigger: decision "try for a baby" (spouse or partner, 18+). Pregnancy is scheduled, not rolled per year.
- Entry conditions: 18+, `core-loop/partner` or `core-loop/spouse`; not already pregnant (`dating_pregnant` quality).
- Effects: sets `dating_pregnant`; `schedule(pregnancy-end, after: 9 months)`; outcomes: birth spawns `baby-gen` as `core-loop/child`; keep/adopt/abortion (neutral text per #54); miscarriage scheduled at low chance.
- Frequency: 0 to 2 pregnancies per life when trying.
- Grilled decisions covered: unplanned pregnancy offers keep/adoption/abortion (neutral text); rare miscarriage.
- Engine features: `schedule`/`unschedule`; `spawn_person` (via `baby-gen`); `person.quality`/`dating_pregnant`.
- Vocab status: `schedule`, `spawn_person`, `spawn` generators confirmed. Pregnancy engine is NOT in vocab (see GAPS; dating owns it as content only).

### 10. Children milestones and move-out
- Summary: children grow up, get stats, and move out between 18 and 25.
- Trigger: `on_age_up_post` hook for children (per child); milestones on first child.
- Entry conditions: child role `core-loop/child`, age per child.
- Effects: `reach_milestone first_child` (once per life); child random stats (v1; inherit to #55 later); move-out at 18 to 25: `move_out` (child no longer counted by household `dependent_role: child`).
- Frequency: milestones once; move-out once per child.
- Grilled decisions covered: children milestones; random stats in v1 (inherit to #55); move out 18 to 25 and stop costing.
- Engine features: `on_age_up_post` hook (confirmed in `packages/core/src/sim/flow.ts`); `reach_milestone`; `move_out`.
- Vocab status: confirmed. Stop-costing relies on `living.household` counting living `child` role rows (to verify).

### 11. Adoption (21+, living on own, fee, child 0 to 17)
- Summary: the player adopts a child.
- Trigger: decision "adopt" (21+, living on own, #108).
- Entry conditions: 21+; living standard not `homeless`; `living.with_parents` false (#108 expression).
- Effects: `person.money -=` fee; `spawn_person` via `adoptee-gen` (child 0 to 17) as `core-loop/child`; `reach_milestone(adopted)` (once per life, or a shared `first_child` if the milestone is the first child).
- Frequency: 0 to 1 per life.
- Grilled decisions covered: adoption 21+, living on own (#108), fee, child 0 to 17.
- Engine features: `spawn_person`; `living.with_parents` (#108 expression); `reach_milestone`.
- Vocab status: `adoptee-gen` to declare; `living.with_parents` name to verify in vocab.

### 12. Child support
- Summary: while kids under 18 live with the ex, the player pays yearly.
- Trigger: `schedule` yearly while kids under 18 live with the ex after divorce.
- Entry conditions: divorced (no `core-loop/spouse`); child with `core-loop/child` under 18 and not in the player's household.
- Effects: `person.money -=` yearly; stops when child turns 18.
- Frequency: yearly while applicable.
- Grilled decisions covered: yearly child support while kids under 18 live with ex.
- Engine features: `schedule` with yearly repetition; `count_role(core-loop/child, ...)`; `person.age`.
- Vocab status: no child-support mechanism on main (GAP; expressed with schedule and money effects).

### 13. Household cost and merge money
- Summary: each child at home adds living cost (#109 dependents term) through core-loop household; married without prenup merges savings.
- Trigger: yearly via core-loop household (`dependent_cost: 400000` per child at home).
- Entry conditions: children at home (`dependent_role: child`).
- Effects: already handled by core-loop `living.household`; dating only sets roles and moves children out.
- Frequency: yearly.
- Grilled decisions covered: each child at home adds living cost (#109 dependents term; settlement line #190).
- Engine features: `living.household` in core-loop (confirmed), settlement lines (#190; `settlement.test.ts`).
- Vocab status: confirmed.

## Data

- Qualities (`scope: person` unless noted): `dating_attracted_men|women|nonbinary` (existing); `dating_pregnant` (bool, player); `dating_prenup` (bool, player, format: money for the amount shown); `dating_affair` (player, int or bool); `dating_cheated` (on relationship, bool).
- Generators: `date-gen` (spawn a date with `dating_attracted_*` from the player's gender); `baby-gen` (child, age 0); `adoptee-gen` (child, age 0 to 17). Each declares `qualities:`, `can_carry:` and `spawn_qualities:` (pack-level).
- Roles: reuse `core-loop/partner`, `core-loop/spouse`, `core-loop/child`. No new roles.
- Milestones: `married` (once per life), `first_child` (once per life), `adopted` (once per life). Declared in the `dating/family` capability.
- Metrics (`harness/metrics.yaml`): partner share, marriage share, divorce share, age at first marriage, age at first child, children per life, share with living child at death, persons per save, pregnancy share, adoption share, affair share.
- Profiles (`harness/profiles.yaml`): `adjust` weights for partner/marry/divorce; `pick: max|min` with `by:` for age at first marriage and first child.
- Money: `format: money` on `dating_prenup` and cash split quality; market/outcome measures in `metrics.yaml` for net worth at 65 (parents vs non-parents, #241).
- Force scripts: pregnancy, miscarriage, adoption, divorce (rare events).

## GAPS

1. Pregnancy engine: no pregnancy mechanism on main (only `docs/spec/pack-roadmap.md` mentions it). Dating expresses pregnancy as a `schedule` plus a `dating_pregnant` quality; no engine change in dating.
2. Child support: no mechanism on main (`grep` for `child support` returns nothing). Dating expresses it with yearly `schedule` and `person.money -=`.
3. Affairs detection: no "caught" mechanic in vocab. Dating expresses it as a rolled outcome with a `dating_affair` quality; no engine change.
4. Core-loop storylets that conflict with the dating rules (need a core-loop owner or Main decision; the dating implementer does not touch core-loop):
   - `dating-app` (`packs/core-loop/storylets/decisions-adult.yaml:174`): moves to dating (18+). Remove from core-loop.
   - `heartbreak` (`decisions-teen.yaml:293`): needs the dating guard or a move into dating.
   - `grandchild-babysit` (`decisions-senior.yaml:26`) and `tell-old-stories` (`decisions-senior.yaml:403`): need guards, or are a core-loop decision.
5. `roll-attraction` uses `chance: 100%` (in `packs/dating/storylets/attraction.yaml`). GAPS-RESOLVED forbids this for mandatory events; convert to `on_age_up_post` or `schedule(..., after: 1)`.
6. Gender expressions: `player.gender` is used by `roll-attraction`. Confirm `person.gender` exists in vocab (pronouns test suggests yes); verify before writing.
7. `living.with_parents` and `living.on_own` names (#108): verify in vocab before adoption and move-out.
8. Stop-costing for move-out children: verify `living.household` counts only living `child` rows (core-loop, outside dating).
9. Cash split on divorce without prenup (half of cash): no vocab expression for "half of cash" beyond `person.money` arithmetic; write it with `min` in an effect, not a new macro.
10. Child random stats (v1): inherit to #55 later; v1 uses core-loop child stats only.
11. Decision slot pool: person-scoped proposals and confessions depend on #214 (closed, present).
12. #105 (gender identity), #107 (gender field), #109 (dependents term), #190 (settlement line): status to verify on main before the sheet is final. #109 and #190 are present in core-loop (`dependent_cost`, `settlement.test.ts`); #105 and #107 are not verified here.

## Checks Main should run

- `pnpm tool vocab --packs dating` (confirm names before each sheet).
- Per topic sheet: `pnpm tool scaffold packs/dating/sheets/<topic>.md --pack dating --stdout` (review), then `pnpm tool scaffold ... --pack dating` (write).
- `node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs`.
- `pnpm exec vitest run packs/dating` (the pack's tests).
- `pnpm harness --check-packs`.
- `pnpm tool lint --packs dating`.
- `pnpm tool focused-sim --pack dating --sheet packs/dating/sheets/<topic>.md`.
- After the whole pack: `scripts/artemis-run.sh <slug> build/<slug>` (only after the branch is pushed), then `pnpm tool pack-delta <main report.json> /tmp/<slug>/new/report.json --pack dating` and `pnpm tool balance-context ... --pack dating`.
- Core-loop changes (GAPS item 4): Main decides whether `dating-app`, `heartbreak`, `grandchild-babysit`, `tell-old-stories` move or get guards; the dating implementer does not edit core-loop.
- Update `packs/dating/BALANCE.md` and `CONTEXT.md` (both exist; BALANCE needs the balance numbers, CONTEXT needs new terms).
