# dating balance

Moved from core-loop (`roll-attraction`, weights unchanged); ids renamed `attracted_*` -> `dating_attracted_*`. Pattern by the player's gender: 78% of men / women are attracted mainly to the other binary gender, 8% to their own, 10% to both, 2% mostly nonbinary people, 2% to nobody; unset or nonbinary gender shares one table.

NPC attraction: every generated person (family, friends, partners, children; not animals, not the player) rolls the same table by their own gender at spawn (`spawn_qualities` in `pack.yaml`; the player's own roll stays at the first age-up). Keep the two tables in step.

## Numbers (focused-sim, 1000-life budgeted runs; the final numbers come from the artemis run of the balance issue, #241)

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

## Known limits and flags for the balance issue

- **Child support and the dependent cost can double-charge.** `family-child-support-year` charges $3,000 a child a year when the ex keeps the kids, but the kids stay in the player's `child` role, so core-loop's household cost (`dependent_cost`) still counts every child under 18 who lives with their parents. In the common path the custody choice avoids it: "You keep the kids" pays no support and carries the dependent cost; "Your ex keeps the kids" pays support and, because the child role is unchanged, also keeps the dependent cost. A child who stops being a dependent (18, moved out, dead) stops both. v1 accepts the double charge for the "ex keeps the kids" branch (2% of lives pay child support); a later core change that drops dependents who live with the ex fixes it.
- **Late marriages.** Median age at first marriage is 47 in the `romantic` profile. Marriage waits for an ask-out (3 a life), a `propose` decision (weight 6, one per partner) and then the player's `plan-wedding` action; raise the weights of `propose` and `find-a-date` in the balance issue if a median near 30 is wanted.
- **Grandchildren** (`adult-child-has-baby`, a person event on the player's children aged 22 to 45, 9% a year, at most 6 grandchildren; spawns `dating/grandchild` with `parent: person`, so the child is the only birth parent). 1000 lives (seed 1): 49.5% of parents become grandparents; grandchildren per grandparent over a whole life: p10 1, median 2, p90 6 (mean 2.9). `core-loop/grandchild-babysit` (37 opens) and `core-loop/tell-old-stories` (21) fire. Persons per save p50 16, p99 25 (max 30). Most lives have children late (median first child 36), so the whole-life median over all parents is 0; the rate was 6% (grandparents: 42% of parents, too few) and 14% (median 4, p90 8 capped) before.
- `try-for-a-baby`'s two pregnant outcomes split by who carries (o1 the player, o2 the partner), so each reads about half of the sheet's 22..28%; the pair sums to 24.6%.
- A caught affair, a partner's walk-away and a break-up leave the relationship as `dating/ex`; the ex is never used again (no reconciliation or ex-contact content in v1).
- The spouse checks in the affair and divorce chains read `count_role(core-loop/spouse, 0, 100)`, the number of spouses, not the bound person's role; there is only one spouse per life (`plan-wedding` once, no remarriage).
