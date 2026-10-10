# Outline: investing pack

Source of decisions: grilled comment on #57 (comment 6019409793), issues #232 / #233 / #234. Archive draft: `archive/build-pack-investing` (v1 from #139, 10k-life results in its BALANCE.md). Main has no `packs/investing` yet. Vocab on main (`pnpm tool vocab --packs core-loop,gambling,crime`) already lists the market functions and `trade` / `grant_asset` / `remove_asset`; `investing` cannot be vocab-checked until the pack exists.

## Pack

- id: `investing`
- namespace: `invest` (qualities written `invest_*` explicitly, as gambling writes `gambling_*`)
- requires: `core-loop` capabilities that provide stats (`stat.smarts`, `money`, age) and family roles (`core-loop/parent`, `core-loop/sibling`, `core-loop/friend`, `kin()`, `is_kin()`, `count_role()`). [INFERENCE] `economy.yaml` is the likely place for money and assets; confirm when the sheet is drafted.
- provides: qualities `invest_*`, market-kind items (category `investments`), storylets under `investing/`.
- Dependencies: #113, #114, #116 closed (amount picker, trade effect, world-year series). #225 (spawn-time person qualities) is open and listed as a blocker of #232; it matters for `invest_tip_age` (see GAP G6). #207 (pipeline) closed.

## Chains

Each chain is one content sheet, drafted fast and reviewed by smol. Frequencies are targets from the archive v1 run, not measured for this pack.

### C1 `source-tips` (tips from relatives, friends, the news, a book)
- Summary: each source gives at most one tip a year about a random kind chosen by the source (weighted storylet per kind, `tip-<kind>`). Direction is right with chance from source quality, otherwise the opposite. Only kinds with `price(k) > 0` are offered (replaces the archive's "never tip under 20" workaround, #176 fixed by #213).
- Trigger: action for "ask for tip" from a person (relationships menu, `scope: person`), plus yearly events for news and book reads (`read-the-news`, `read-investing-book`, actions).
- Entry: age 18+, `kind` available with `market` block, per-source limit via `person.quality.invest_tip_age < age`.
- Frequency: no archive count recorded for tips; rate set by the source parameter and measured in #233.
- Decisions covered: 4 (also news/book storylets from #232 scope).
- Engine needs: person-scope quality `invest_tip_age` (scope: person), `forecast(k)`, `price(k)`, `?:`, weighted outcomes, `scope: person` storylets. Status: `forecast`, `price`, `trade` present in vocab; `?:` and `scope: person` not yet verified. `forecast(k)` is the stored next-year return; tip direction = `forecast(k) > 0` flipped with chance (1 - source quality). Target (archive table): tips rise 65-80%.

### C2 `insider-tips` (rare, almost always right)
- Summary: a relative or friend gives a rare tip on a named kind that will rise 20%+; acting on it records `invest_insider_age` (age). A later crime bridge (#58, #103) can use it; that bridge is not in this pack.
- Trigger: person-scope event from relatives and friends, very low chance.
- Entry: age 18+, holds at least one listed kind, sets `invest_insider_age` on act.
- Frequency: 0.07 offers per life in archive v1; acted-on rate not recorded.
- Decisions covered: 5.
- Engine needs: quality `invest_insider_age` (int, 0..), `forecast(k)`, chance storylet. Status: present. Target: rises 20%+ at least 90% of the time.

### C3 `scams` (Ponzi, fake coin, guaranteed returns)
- Summary: decision events that lose money, likelier at low smarts (fake coin, Ponzi, guaranteed returns). Loss sizes and odds are set in the sheet, not fixed here; the weight below is a proposal.
- Trigger: decision events (scams join the decision pool).
- Entry: age 18+, cash $500+, weight `max(1, 2 + (100 - smarts) / 15 - invest_scams)` (proposed), 4-year cooldown.
- Frequency: about 2.26 offers per life across all profiles (archive v1); loss rate not recorded.
- Decisions covered: 6.
- Engine needs: quality `invest_scams` (int 0..), `cooldown`, weighted outcomes with expressions, `decision` tag. Status: present.

### C4 `markets-in-the-news` (yearly headlines and portfolio statement)
- Summary: a yearly headline about the largest move of the year (a crash, a boom) and an annual portfolio statement from the `portfolio` readable, shown when the player holds something.
- Trigger: yearly event (`on_age_up_post`-style yearly storylets), no player choice.
- Entry: holds at least one kind (`units(k) > 0`), age 18+.
- Frequency: about once per year where holdings exist.
- Decisions covered: issue #232 scope (news and portfolio storylets); no grilled decision number.
- Engine needs: readable `portfolio` (see DATA), `change(k)`, `units(k)`. Status: `change`/`units` present; `portfolio` must be declared.

### C5 `penny-stock-headlines` (10x surges and delisting)
- Summary: a headline when a penny stock jumps 10x, and a notice on the year a penny stock is delisted (price 0). Holdings are written off by Core; the headline is flavour and the journal line stays Core's.
- Trigger: yearly event, conditional on `change(k)` and `price(k) == 0`.
- Entry: age 18+, penny kind (`pinecrest-mining`, `brightwave-labs`).
- Frequency: a 10x surge about 1% of penny-stock years; delisting about 5-6% of penny-stock years (archive).
- Decisions covered: 2 (penny-stock behaviour), 10.
- Engine needs: `change(k)`, `price(k)`. Status: present. Delisting itself is Core (`delist`, `relist_after`, #213 merged).

## Chains not needed
- Shortfall (decision 7): no authored content. Core downgrades the standard and never sells holdings. Test only, as in archive `investing.test.ts`.
- Retirement, tax, advisor, divorce split (decision 8): deferred, not in this pack. Listed for the record, not as GAPS.

## Decision map

| # | Decision | Where |
|---|---|---|
| 1 | Market screen `assets/investments`, age 18+ | DATA (category, requires age >= 18); Core UI and amount picker (#113) |
| 2 | Kinds: 2 bond funds, 2 index, 3 fictional stocks, 1 coin, penny stocks, government bonds | DATA, 12 kinds (archive list) |
| 3 | Bond default per issuer | DATA (1 issuer, 0.4%); per-country part deferred, GAP G4 |
| 4 | Tips from each source | C1 |
| 5 | Insider tips, `invest_insider_age` | C2 |
| 6 | Scams | C3 |
| 7 | Shortfall | Core, test only |
| 8 | Later items | deferred, not in this pack |
| 9 | Core #114 | met (closed), no content |
| 10 | Qualities `invest_`, harness | DATA |

## GAPS

- G1 (harness): measurement. The harness reads only quality/stat snapshots (`snapshot: net_worth|{stat}|{quality}`), storylet fires, action table columns and `when` measures. It cannot read a market price, a per-kind annualised return, a crash year, a delisting, or a bond default. Options: (a) a harness `market` measure (preferred; the harness owns it); (b) pack hooks that mirror per-kind values into `invest_*` qualities at `on_age_up_post` (needs ternary `?:` support, to verify; each mirror adds a quality). Bond default has no signal at all: Core rolls it silently. Needs a Core signal, or the harness must accept "not measured" for default rate.
- G2 (harness): `tipstacker` asks every source and trades on the majority. Profile `pick` supports only `first` / `random` (harness.md). Needs a harness extension or a documented approximation.
- G3 (balance vs issue acceptance): the archive v1 results miss the #232 acceptance. corporate-bond-fund 4.97% (target 2-3%); gov-bond-10 3.63% (target 2-3%); quark-coin annualised 0.53% (target median at or below 0%). Retune drift/vol in #232/#234.
- G4 (countries): per-country default chance (decision 3, later part). `cities.yaml` says countries are not content yet; deferred until #61 adds them.
- G5 (crime bridge): `invest_insider_age` is written, nothing reads it. The bridge is #58 / #103, later.
- G6 (#225 open): person-scope qualities at spawn may be needed for `invest_tip_age` on relatives and friends. Check whether `scope: person` qualities need #225 or already work; #232 is blocked on it.
- G7 (readable `portfolio`): not in vocab. Must be declared (see DATA) and confirmed as an int expression summing `holding_value(k)` over the 12 kinds (precedent: `karma_value` is a plain readable expression).

## Acceptance (from the issues)

- #232: annualised return per kind (bonds 2-3%, index about 5%, crypto median at or below 0%); crash about once per 15-20 years; no overflow; no zero price outside delisted kinds; UI check of the market screen with the pack loaded.
- #233: tips and insiders as in C1-C2; `tipstacker` within a few points of `investor` (blocked by G2).
- #234: as #228 full-pack run; portfolio at 40 and 65 and share of net worth; net worth vs non-investors; bond default rate (blocked by G1); fill BALANCE.md.
- Common: `compilePacks({only})`, tests in `packs/investing/test/`, harness metrics, profiles, forced scripts, CONTEXT.md, BALANCE.md, quality prefix `invest_`, determinism, 0 faults, no storylet over 3% of decisions, slots 90/50/30 within 3 points.

See `local://sheets/investing/DATA.md` for the pack-level data item.
