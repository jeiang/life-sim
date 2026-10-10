# Pack `generations` outline (Phase D, outline only)

- Pack id: `generations`. Namespace: `gen`. Quality prefix: `gen_`.
- Issues: #242 (content: succession openers, aftermath, will, minor heir, heirlooms, NPC-parent inheritance), #243 (metrics and balance on artemis; supersedes #142 part 2).
- Base: origin/main `3ae57a66` (feat(pack-dating) #338). Vocab checked on a fresh clone of origin/main with `pnpm -s tool vocab --packs core-loop,dating`.
- Already on main, not re-done here: #219 succession (PR #304, merge `ca30e1a1`), #221 minor heir (PR #311, merge `8976a7f2`), #220 heir picker and per-generation graveyard (closed COMPLETED), #240 dating children (closed).
- Decisions: #242 and #243 bodies, and epic #55 comments 6019837728 and 6020818484 (epic closed NOT_PLANNED; decisions refiled into #219, #220, #221, #242, #243). Constraints: `local://sheets/GAPS-RESOLVED.md` (mandatory events use `schedule(...)`, `on_age_up_post` or a hook, never `chance: 100%`; milestones fire once per life).

## Required capabilities

Requires (cross-pack names this pack uses, each must be provided by a required capability):
- `core-loop/family`, `core-loop/singletons`, `core-loop/housing` (guardian, living cost, `living.with_guardian`), `core-loop/economy` (assets, loans, cash).
- `dating/family` (provides `dating_children`, milestone `adopted`; requires `dating/marriage`, which provides milestone `married`). Also list `dating/marriage` directly because `married` is read in the spouse checks.

New (one capability per area, each provides only names it declares):
- `generations/succession`: requires `core-loop/family`, `core-loop/singletons`, `core-loop/housing`, `dating/marriage`, `dating/family`. Provides qualities `gen_generation`, `gen_minor_heir`, `gen_inherit_band`, `gen_will_kind`. Contains the will action, succession openers, aftermath, minor-heir storylets and the `on_succession` bookkeeping.
- `generations/heirlooms`: requires `generations/succession`, `core-loop/economy`. Provides the heirloom market kinds (`items`) and the `gen_heirloom_*` qualities.
- `generations/estates`: requires `generations/succession`, `core-loop/family`. Provides the NPC-parent inheritance storylets. Blocked, see GAP 5.

Roles are reused from core-loop (`child`, `parent`, `spouse`, `partner`, `sibling`, `friend`); no new roles or generators. Guardian and grandparent are not roles (see GAP 3).

## Chains

Each chain lists Summary, Trigger, Entry, Effects, Frequency, Decisions covered, Engine features, Vocab status, Size. Ages are the player's age unless marked `person.age`. Each chain is sized for one drafter.

### 1. Will (action, player-initiated)
- Summary: the player writes or changes a will in the assets menu (`assets/estate`, a submenu the pack declares).
- Trigger: action, age 18+, player alive.
- Entry conditions: `age >= 18`.
- Effects: one option per will kind: `set_will(even)`, `set_will(spouse)`, `set_will(charity)`, or a person-scoped option `will_heir(person)` picking one living child (`set_will(heir)` plus the named person). Each option writes `gen_will_kind` (0 none, 1 heir, 2 even, 3 spouse, 4 charity) for metrics. A no-will option is the default (no will); the core no-will rule applies.
- Frequency: repeatable, cooldown 3 years (a will is revised, not spammed).
- Decisions covered: will (one heir, even split, all to spouse, or charity; no-will rule; #242, #219).
- Engine features: action storylet with `menu: assets/estate`; `scope: person` option for the heir pick; `set_will`, `will_heir`, `has_will()`.
- Vocab status: confirmed on main (`set_will(even|spouse|charity|none)`, `will_heir(person)`, `has_will()`).
- Size: 1 action, 4 options.

### 2. Succession openers (4 storylets, one per heir age band)
- Summary: the story of the heir taking over, by the heir's age at succession.
- Trigger: `trigger: succession`, queued at the next age-up (#219). Each opener has a `once` flag (fires once per generation, cleared by succession).
- Bands (the heir's age, read at the next age-up): `age < 12`; `12 <= age < 18`; `18 <= age < 40`; `age >= 40`. Bands are exhaustive, so exactly one opener fires per generation.
- Entry conditions: `when` on the band only; read-only `deceased.*` names the dead player (`deceased.first_name`, `deceased.kin`, `deceased.age`, `deceased.cause`, `deceased.money`).
- Effects: a journal line and a choice (accept, or a band-specific reaction, e.g. a child's first question). Each opener sets `gen_inherit_band` to its band (0..3) for metrics. Openers can schedule aftermath with `schedule(gen/<aftermath-id>, after: 0-2 years, lineage: true)`.
- Frequency: exactly one per generation (harness checks this).
- Decisions covered: succession openers by heir age band (#242); one obituary per generation is #220 (already done, not here).
- Engine features: `trigger: succession`, `deceased.*`, `schedule(..., lineage: true)`.
- Vocab status: `trigger: succession`, `deceased.*` (read-only, kin, money, age, cause), `schedule` and `lineage` confirmed on main.
- Size: 4 storylets, each a short choice.

### 3. Aftermath (6 storylets)
- Summary: the heir deals with what the dead parent left (cash, debts, will contests, the family home, grief).
- Trigger: scheduled from the openers (`lineage: true`) or from the succession queue; each `once` per generation.
- Entry conditions: each storylet's `when` on `deceased.*` and the `gen_*` flags above.
  1. `aftermath/grief`: `when: deceased.kin == "mother" or deceased.kin == "father"`; happiness drop, `once`.
  2. `aftermath/cash-left`: `when: deceased.money > 0`; journal line, optional spend choice.
  3. `aftermath/sibling-contests`: `scope: person`, `target: [sibling]`, `when: deceased.money > 0`; the sibling disputes the will (choice: settle, fight; closeness change).
  4. `aftermath/spouse-share`: `scope: person`, `target: [spouse]`, `when: has_will() == false`; spouse share confirmed (no-will rule, half to spouse).
  5. `aftermath/family-home`: `when: asset.years` is not yet verified; gate on the home the heir inherited (`remove_asset` on sell); see GAP 6.
  6. `aftermath/anniversary`: scheduled 1 year after death via `schedule(..., after: 1, lineage: true)`; short reflection, happiness +/-.
- Frequency: each `once` per generation.
- Decisions covered: estate after death (#219 estate order, no estate tax, debts written off); siblings and spouse share.
- Engine features: `scope: person` with `target: [sibling]`, `set_will`/`has_will`, `remove_asset`, `schedule(..., lineage: true)`.
- Vocab status: `deceased.money`, `deceased.kin`, `has_will()`, `remove_asset`, `schedule` confirmed. Debts written off and inherited secured loans are not readable (GAP 4, GAP 6).
- Size: 6 storylets.

### 4. Minor heir (4 storylets)
- Summary: the heir is under 18 and lives with a guardian with assets in trust (#221).
- Trigger: `trigger: succession` queued with the openers; the minor storylets have `when: gen_minor_heir == 1`.
- Entry conditions: `gen_minor_heir` is set in `on_succession` (`gen_minor_heir = age < 18`, see Chain 7).
  1. `minor/guardian-takes-in`: `when: living.with_guardian and age < 18`; a choice that names the guardian's closeness (`guardian_kin` order is core).
  2. `minor/guardian-review` (age 14 to 17): `scope: person`, `target: [grandparent, aunt-uncle, sibling, cousin]`; the guardian checks on the heir (kinship ids, not roles; GAP 3).
  3. `minor/on-own`: `when: living.no_guardian`; a minor on their own (no trust, default standard). Choice about the first job or first lease.
  4. `minor/handover-at-18`: `when: age == 18 and gen_minor_heir == 1`; trust is released by core at 18; this storylet is the story beat, then sets `gen_minor_heir = 0`.
- Frequency: each `once` per generation.
- Decisions covered: minor heir to guardian, assets in trust until 18 (#221); no estate tax.
- Engine features: `living.with_guardian`, `living.no_guardian`, `guardian_kin`, `target` by kinship.
- Vocab status: `living.with_guardian`, `living.no_guardian`, `living.dependents`, `guardian_kin` (core-loop), `is_kin`, kinship ids confirmed.
- Size: 4 storylets.

### 5. Heirlooms (4 storylets; 5 market kinds)
- Summary: 5 heirlooms are held in the family and pass down whole at succession (#219: holdings pass whole). They gain value through the market drift and gain stories through `on_succession`.
- Trigger: `attic-find` is a `weight` event (age 20 to 60, once per life); others are succession-scoped or event-scoped as listed.
- Entry conditions: `holding_value(<heirloom>) > 0` for the story beats; `gen_heirloom_<id>_passed >= 1` for "passed down" beats.
  1. `heirloom/attic-find`: event, age 20 to 60, `once` per life: `grant_asset(gen-heirloom-<id>)` picked from the 5 kinds (weight per kind).
  2. `heirloom/history`: `when: gen_heirloom_<id>_passed >= 1`; a story line, `once` per heirloom.
  3. `heirloom/appraisal`: `when: holding_value(<id>) > 0`; journal with `holding_value`/`cost_basis`, one choice (keep, or sell via `trade(<id>, -units)` if the market allows, GAP 1).
  4. `heirloom/family-quarrel`: `scope: person`, `target: [sibling]`, `when: holding_value(gen-heirloom-<id>) > 0`; the sibling wants the heirloom (choice; closeness change).
- Frequency: attic-find once per life; others `once` per generation.
- Decisions covered: 4 to 6 heirlooms (`shop` off, see GAP 1), passed down, gain value or stories (#242).
- Engine features: market kinds with `market: { start, drift, vol }`; `grant_asset`, `trade`, `holding_value`, `cost_basis`, `holding_years`, `units`.
- Vocab status: market block, `trade`, `grant_asset`, `holding_value`, `cost_basis`, `holding_years`, `units`, `price`, `change`, `forecast` confirmed in `docs/spec/pack-format/content-kinds.md`. The shop-exclusion field does not exist (GAP 1).
- Size: 4 storylets, 5 item kinds.

### 6. NPC-parent inheritance (4 storylets)
- Summary: a parent dies while the player is alive; the player inherits (cash, a home, an heirloom, or a contested share).
- Trigger: a non-player parent death. BLOCKED: no hook or trigger fires on a non-player's death (GAP 5).
- Entry conditions (once the trigger exists): `scope: person`, `target: [parent]`, `person.money` read for the parent's cash (`person.money` exists for NPCs).
  1. `npc-parent/cash-left`: effect `money += person.money` (share by will kind).
  2. `npc-parent/home-left`: `grant_asset(core-loop/<home>)` when the parent owned one (`person.quality.gen_home` written at spawn or by `set_will`).
  3. `npc-parent/heirloom-left`: `grant_asset(gen-heirloom-<id>)`, one heirloom per generation (feeds Chain 5).
  4. `npc-parent/contested`: `scope: person`, `target: [sibling]`; the will is contested (choice).
- Frequency: once per parent death (the parent is one person, one death).
- Decisions covered: NPC-parent inheritance (#242, 4 storylets).
- Engine features: `scope: person`, `person.money`, `grant_asset`, `money +=`.
- Vocab status: `person.money` and `grant_asset` confirmed; the death trigger is missing (GAP 5).
- Size: 4 storylets, BLOCKED.

### 7. Generation bookkeeping (`on_succession` hook, no storylets)
- Summary: the hook writes the per-generation state that core does not clear.
- Trigger: `on_succession` (hooks doc: runs for the heir after the estate, genetics, guardian; effects act on the heir).
- Effects: `gen_generation += 1`; `gen_minor_heir = age < 18` (set after the guardian is chosen); reset `gen_inherit_band = 0`, `gen_will_kind = 0`; for each heirloom `gen_heirloom_<id>_passed += 1` when `holding_value(gen-heirloom-<id>) > 0`.
- Frequency: once per succession.
- Decisions covered: generation counter for metrics; per-generation reset (core clears storyletLog and uses, not qualities; GAP 2).
- Engine features: `on_succession` hook, `holding_value`, qualities.
- Vocab status: `on_succession` confirmed on main; qualities persist across succession (not in the reset list, core-loop spec "Succession" step 3).
- Size: 1 hook block.

### 8. Metrics and balance (#243)
- Summary: harness metrics and profiles for `--generations N`.
- Trigger: harness run (`--generations N`, `--heir eldest|richest|random`).
- Content: `harness/metrics.yaml` with `generation: <name>` blocks for: reached, died, heir_available, heirs, death_age, net_worth, inheritance (p10/p50/p90), heir_age, minor_heir, insolvent_estate, repeated_once; `visible_if_measure` on generation tables. Faults: `once-repeated`, `unresolved-family`, `minor-living-cost` must be 0. Persons per world and save size by generation are reported.
- Forced scripts: one per opener band, one minor-heir run (forced heir under 18), one no-will run, one heirloom-pass run (the force names the heirloom), and one insolvent-estate run.
- Balance targets (set in `BALANCE.md`): no storylet over 3% of decisions; slots 90/50/30 within 3 points; heir availability and minor-heir rates recorded per generation.
- Size: harness files only.

## Data

Qualities (`gen_` prefix, owned by `generations/succession` and `generations/heirlooms`):
- `gen_generation` (int, 0 founder): mirror of the generation counter (GAP 2).
- `gen_minor_heir` (bool): heir under 18 at succession.
- `gen_inherit_band` (int 0..3): opener band.
- `gen_will_kind` (int 0..4): will kind (none, heir, even, spouse, charity).
- `gen_heirloom_<id>_passed` (int): generations an heirloom has passed.

Item kinds (`items/heirlooms.yaml`, category `heirlooms`), market kinds, five proposed (tune in `BALANCE.md`):
- `gen-heirloom-watch`: `market: { start: 250000, drift: 3%, vol: 6% }`.
- `gen-heirloom-quilt`: `market: { start: 120000, drift: 1%, vol: 3% }`.
- `gen-heirloom-clock`: `market: { start: 180000, drift: 2%, vol: 5% }`.
- `gen-heirloom-violin`: `market: { start: 400000, drift: 4%, vol: 12% }`.
- `gen-heirloom-letters`: `market: { start: 5000, drift: 2%, vol: 2% }`.
- All five: `requires: false` so the market screen never offers a purchase (GAP 1).

Storylets: 22 (Chains 2 to 6: 4 openers, 6 aftermath, 4 minor, 4 heirloom, 4 NPC-parent), plus 1 action (will).

Hooks: `on_succession` (Chain 7). No `on_age_up_post` needed (no mandatory event).

Milestones: none new. Declared under `provides: milestones` is not needed.

Harness: `harness/metrics.yaml`, `harness/force/*.yaml` (listed in Chain 8), `harness/profiles` (none new).

Docs: `packs/generations/CONTEXT.md` (succession, heir, will, minor heir, heirloom, NPC-parent inheritance), `packs/generations/BALANCE.md` (targets, rates, numbers). Tests: `packs/generations/test/`.

## GAPS

1. **`shop: false` is not a real item field.** The items schema (`packages/pack-tools/schema/items.schema.json`) has `id`, `label`, `category`, `price`, `value`, `requires`, `loan`, `market`, `icon`. A non-market kind must have `price` and `value`, and the shop lists non-market kinds. Chosen: heirlooms are market kinds (the shop never lists them), each with `requires: false`. Unverified: whether a `market` kind still appears on the market screen with a locked row, whether `requires` also blocks the `trade` effect, and how many units `grant_asset` gives a market kind (assumed one whole unit = 10000 units). Check with a test before drafting Chain 5. If `requires: false` does not hide the kind, decide between a pack-level exclusion and a non-market kind with a locked price (needs an owner decision).
2. **`generation` is not readable, and qualities are not cleared at succession.** Only `fame_value`, `hiring_blocked`, `karma_value` are readables; core clears `storyletLog`, `uses`, roll counters, `ended`, will, milestones, not qualities. The pack keeps `gen_generation` itself (Chain 7) and resets its own per-generation qualities in `on_succession`. Test: a save round-trip across succession with `gen_*` values set.
3. **"Roles `guardian` and `grandparent`" in #242 are not roles.** Guardian is derived by core (`living.with_guardian`, `living.no_guardian`, `guardian_kin` order). Grandparent is a kinship id (`is_kin(person, grandparent)`, `target: [grandparent]`). Chains use kinship and derived names; comment #242 with the correction.
4. **Estate shortfall is not visible to the pack.** Aftermath 2 can read `deceased.money` (cash at death, before debts), but debts written off (unsecured loans paid from cash, shortfall written off) are not readable. Options: an engine readable for the write-off, or the aftermath uses `deceased.money` only and drops the write-off beat. Owner decision before drafting Chain 3.
5. **No trigger for a non-player parent's death while the player lives.** `on_death` is the player's only death hook; core's `parent-death` is core content and not extendable by a pack. Chain 6 (4 storylets) is BLOCKED until an engine trigger exists (for example a `person_death` trigger with `person` bound, or a readable for a living parent's death). Shrinking the count to 18 is a scope change and needs Main's explicit approval.
6. **Inherited secured loan and home are not readable.** `scope: loan` storylets run once per loan held, but there is no readable for "this loan was inherited" or "this home is the inherited asset". Aftermath 5 needs one of: a readable (`asset.inherited`, `asset.years` exists, check), or a journal-only beat. Verify `asset.years` before drafting.
7. **Pending engine issues (GAPS-RESOLVED):** #293 (`end_group`, not needed here), #292 (harness profile `adjust`/`pick`, needed for forced scripts in Chain 8 if used), #294 (market measures, needed for heirloom value and net worth in metrics), #295 (employment exclusion, not used). Chains 5 and 8 depend on #294 and #292 respectively; if not merged, the pack can still ship with the market metrics stubbed out of the harness, which is a scope reduction and needs Main's approval.
8. **Cross-pack dependencies on dating.** `married` and `dating_children`/`first_child` come from dating. The pack's `requires` must name `dating/marriage` and `dating/family`, so the `compilePacks({only: [core-loop, dating, generations]})` closure must include dating. Verify `flake.nix` `depsSrc` lists `packs/generations` (or derives it), since a new pack dir may need to be added.
9. **#142 part 2 is superseded by #243.** Close #142 part 2 with a link, do not build it.
10. **#243 is blocked by #242.** Chain 8 starts only after Chains 1 to 7 merge.

## Checks (from #242 and #243 acceptance)

- Pack validates with only its required closure: `compilePacks({only: [core-loop, dating, generations]})` (dating via `dating/marriage` and `dating/family`).
- Tests under `packs/generations/test/`: openers exactly one per generation; will kinds; minor heir with guardian; heirloom passes whole; no-will rule (spouse half, children split the rest evenly).
- Declared metrics, profiles and forced scripts run in the harness (`--generations N`, `--heir eldest|richest|random`).
- `CONTEXT.md` and `BALANCE.md` in the pack.
- Determinism: replay and save round-trip across succession (GAP 2).
- Harness: 0 faults (`once-repeated`, `unresolved-family`, `minor-living-cost`); no storylet over 3% of decisions; slots 90/50/30 within 3 points.
- Touches only `packs/generations/**`, plus `flake.nix` if GAP 8 requires it.
- Build protocol: worktree under `.worktrees/<slug>`, Conventional Commits, PR with `Closes #242` and `Closes #243`, required `ci` green, squash-merge.
