# dating balance

Moved from core-loop (`roll-attraction`, weights unchanged); ids renamed `attracted_*` -> `dating_attracted_*`. Pattern by the player's gender: 78% of men / women are attracted mainly to the other binary gender, 8% to their own, 10% to both, 2% mostly nonbinary people, 2% to nobody; unset or nonbinary gender shares one table.

NPC attraction: every generated person (family, friends, partners, children; not animals, not the player) rolls the same table by their own gender at spawn (`spawn_qualities` in `pack.yaml`; the player's own roll stays at the first age-up). Keep the two tables in step.

## Numbers (focused-sim, 1000-life budgeted runs; the final numbers are in the #241 section below)

Profiles. `romantic` (default, 4 moves a year: wedding, move in, try for a baby, apply for work, date night, time with a child; never breaks up, cheats or divorces) and `unfaithful` (opt-in: builds a relationship, from 30 cheats and divorces, from 60 breaks up) are this Pack's. `random` has break-up, divorce and affairs down-weighted to 0.05 and adoption to 0.2 (a uniform picker with $5,000 would otherwise adopt in about a quarter of its lives). `idle` still partners through events (ask-out and propose are decisions), never marries.

Whole-population run, 3000 lives, `random, studious, spender, idle, romantic, unfaithful` (seed 1, `pnpm harness --packs dating`): 0 faults; decision slots 90% / 49.8% / 29.1%; persons per save p50 17, p99 24 (max 26); events per year 5.1.

| measure | all | romantic | unfaithful | random | idle |
|---|---|---|---|---|---|
| had a partner (ask-out) | 66.5% | 72.6% | 75.8% | 65.6% | 76.2% |
| married | 11.3% | 43% | 18.6% | 6% | 0% |
| divorced | 3.1% | 0% | 18.4% | 0.2% | 0% |
| had an affair | 12.2% | 0% | 71.8% | 1.6% | 0% |
| had a pregnancy | 20.2% | 55.4% | 45.2% | 10.6% | 2.4% |
| had a child | 18.6% | 54.4% | 43.6% | 10.6% | 0.4% |
| adopted | 1.1% | 0% | 0% | 6.6% | 0% |
| children per life | 0.32 | 1.05 | 0.73 | 0.11 | 0.004 |

Age at the first marriage: median 44 for all, 47 for romantic (p10 26, p90 77), 32 for unfaithful. Age when the first child joined: median 36 (romantic), 31 (unfaithful). Net worth at 65 (median, major units): parents $2,201,669, childless $1,369,820, divorced $1,852,974. Share of deaths with a living child is a core-loop measure.

Per-storylet fire rates are in each sheet's `opens` band; `focused-sim` flags are clean for every sheet. Where a band was written for a typical life but the storylet is a deliberate player action, the band was moved to the profile that plays it and the sheet says so (`Tweak` notes): date night and time with a child (random), move in and wedding (romantic), try for a baby, children's scenes and adoption (romantic / random), affairs, break-up and divorce (unfaithful). The per-event probabilities are the sheets' own: 20% of affairs are caught at once and 25% of the rest later, 5% of due dates are a miscarriage, 25% of tries for a baby take, a quarter of move-outs a year from 18.

Weights moved from the sheets: `find-a-date-teen` 8 to 16, `find-a-date` 10 to 18, `dating-app` 10 to 2 (the sheets' weights gave 0.5 teen dates, 1.6 adult dates and 2.2 app prompts a life against bands of 1..2.5, 2..5 and 0.3..0.8; the app lost the core-loop age cap of 50 in the move, so its weight carries the rate).

## Tuning for #241 (artemis, seed 1, 10,000 lives, ref `cdc5c73`)

The first artemis run (ref `8515093`) flagged a median age at the first marriage of 47 (romantic) and 50 (all), a child in 51% of romantic and 7.8% of all lives, adoption 0.4%, child support 0%. The pack was tuned (chances, weights, gates only):

- `ask-out` weight 8 to 10 and a rejection weight cut to a third (`(100 - attraction) / 3`): more first partners without opening the ask-out decision more (it sits at 2.5% of decisions; at weight 20 it passed 4%, so the weight is capped by the 3% rule, not by the partner rate).
- `propose` weight 6 to 100 (it is eligible once per partner, and 6 left proposals waiting years behind other decisions).
- `unplanned-pregnancy` 0.25% to 5% a partner-year: a partnered life of any profile (including idle, studious, spender) now sometimes has a child, and the keep / adopt / end choice stays the player's.
- `random` profile `adjust`: `plan-wedding` x100, `move-in-together` and `try-for-a-baby` x8 (a uniform picker otherwise meets these once in dozens of menu rows), `divorce` x1 (was 0.05; the ex-keeps-the-kids path needs a divorce with children), break-up and affairs stay at 0.05.
- Tried and dropped: the closeness gate 60 to 45 for `propose` and `plan-wedding` (no effect), a cooldown on `ask-out` (no effect on opens), `find-a-date` 18 to 30 (more friends, fewer partners per decision).

| measure | before: all | before: romantic | after: all | after: romantic |
|---|---:|---:|---:|---:|
| faults | 0 | 0 | 0 | 0 |
| decision slots (1 / 2 / 3+) | 89.9 / 49.3 / 28.1 | 89.9 / 49.4 / 28.3 | 89.9 / 49.2 / 28.1 | 89.9 / 49.4 / 28.3 |
| top decision share | 2.33% | 2.48% | 2.54% (`ask-out`) | 2.43% |
| persons per save p50 / p99 (max) | 16 / 24 | 19 / 28 | 16 / 28 (36) | 20 / 32 (38) |
| had a partner | 56.1% | 71.2% | 67.3% | 82.3% |
| married | 5.5% | 40.3% | 13.9% | 68.4% |
| age at the first marriage, median | 50 | 47 | 38 | 33 |
| had a child | 7.8% | 51.4% | 23.9% | 65.1% |
| adopted | 0.4% | 0% | 0.4% | 0% |
| paid child support | 0% | 0% | 0.2% | 0% |
| first child joined, median age | 39 | 35 | 42 | 35 |
| children per life | 0.1 | 1.0 | 0.48 | 2.10 |

The `all` run mixes 18 bot profiles with no dating moves (gambler, investor, idle, spender and others), which never plan a wedding or try for a baby, so the all-profile marriage and child shares count only the random and romantic lives and the events (partner, proposal, unplanned pregnancy). By profile (10k, all): random 40.8% married (median 45), 28% a child, 3.5% adopted; romantic 70.3% married (median 32), 65.8% a child; idle 23% a child through unplanned pregnancies. Divorce with children happens in `random` (15% of its lives divorced) but the share that then lets the ex keep the kids is small; in the opt-in `unfaithful` profile the child support path is exercised (41% of lives paid support in the 1000-life run). Net worth at 65, romantic: parents $2,417,419, childless $2,189,605 (no divorced lives).

Remaining gap: the all-profile median age at the first marriage is 38 (target late 20s to mid 30s). It is the random profile (median 45) that holds it up; a uniform picker answers "Propose" half the time and asks out half the time, and no weight on the dating side changes that without passing the 3% share cap on `ask-out`. Romantic lives marry at a median of 32.

## Known limits and flags for the balance issue

- **Child support and the dependent cost can double-charge.** `family-child-support-year` charges $3,000 a child a year when the ex keeps the kids, but the kids stay in the player's `child` role, so core-loop's household cost (`dependent_cost`) still counts every child under 18 who lives with their parents. In the common path the custody choice avoids it: "You keep the kids" pays no support and carries the dependent cost; "Your ex keeps the kids" pays support and, because the child role is unchanged, also keeps the dependent cost. A child who stops being a dependent (18, moved out, dead) stops both. v1 accepts the double charge for the "ex keeps the kids" branch (2% of lives pay child support); a later core change that drops dependents who live with the ex fixes it.
- **Late marriages.** Addressed in #241 (romantic median 33 after tuning; the random profile still marries late, see above).
- **Grandchildren** (`adult-child-has-baby`, a person event on the player's children aged 22 to 45, 9% a year, at most 6 grandchildren; spawns `dating/grandchild` with `parent: person`, so the child is the only birth parent). 1000 lives (seed 1): 49.5% of parents become grandparents; grandchildren per grandparent over a whole life: p10 1, median 2, p90 6 (mean 2.9). `core-loop/grandchild-babysit` (37 opens) and `core-loop/tell-old-stories` (21) fire. Persons per save p50 16, p99 25 (max 30). Most lives have children late (median first child 36), so the whole-life median over all parents is 0; the rate was 6% (grandparents: 42% of parents, too few) and 14% (median 4, p90 8 capped) before.
- `try-for-a-baby`'s two pregnant outcomes split by who carries (o1 the player, o2 the partner), so each reads about half of the sheet's 22..28%; the pair sums to 24.6%.
- A caught affair, a partner's walk-away and a break-up leave the relationship as `dating/ex`; the ex is never used again (no reconciliation or ex-contact content in v1).
- The spouse checks in the affair and divorce chains read `count_role(core-loop/spouse, 0, 100)`, the number of spouses, not the bound person's role; there is only one spouse per life (`plan-wedding` once, no remarriage).
