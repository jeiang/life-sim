# grad-school balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives 1000 --profile <p> --packs core-loop,grad-school --seed 1 --out <dir>`. Final numbers are the artemis runs of #231 (below).

## Design numbers

- Tuition per year: medical 30,000, law 24,000, MBA 20,000 (major units); PhD stipend 6,000, no tuition. Graduate loan 6.5% over 20 years.
- Admission per application by smarts band (under 40 / 40-69 / 70+): medical 1/5/11%, law 2/6/13%, MBA 2/7/14%, PhD 2/6/13%. Applications retry yearly, but the schools stop looking after two rejections (`grad_rejections < 2`). The outline's 50-60% top band made every `studious` life (which applies whenever it can) enter grad school; these odds put `studious` at about 25%.
- Enrolment sets `grad_gpa = 40 + smarts / 3`; the yearly review adds +5, +1 or -6 (weights `10 + smarts/2`, 50, `60 - smarts/2`).
- Scholarship offer weights: partial `(smarts - 30) / 4` twice, full `(smarts - 60) / 4`, against 25 + 25 for none. Review thresholds 85 (renew) and 67 (below it a full scholarship drops to half and a partial one ends).
- Exam pass weight `30 + smarts / 2 + 8 * prep` against fail `60 - smarts / 4 - 4 * prep`; cheating `60 + smarts / 2 + 10 * prep` against a fixed 30 caught.
- Gross pay per year at a 100% wage index (major units): resident 75,000, attending 160,000, chief 210,000; associate 95,000, partner 190,000, judge 200,000; manager 100,000, CEO 260,000; postdoc 50,000, assistant professor 75,000, associate 100,000, full 130,000. Core's top rung is senior engineer at 115,000. Promotions: resident 3 years, attending 6 (chief is a 0.2% yearly roll, once), associate 4, manager 5 (CEO 0.15% a year, once), postdoc 2, assistant 4, associate professor 5 (tenure 0.8% a year; judge offer 0.2% a year).

## Targets (#229)

- 15-30% of `studious` lives enter grad school; about 20% of lives overall.
- Completion about 75%, drop-out about 25% (drop-out is a voluntary action, so it depends on the profile).
- Top rungs (chief, judge, CEO, full professor) each under 5% of graduates.
- Break-even net worth against a bachelor-only life around 40-45.

## Tuning (#231, artemis, 10,000 lives, `--profile all` and `--profile scholar` at `9bb3d3d`)

Changes: the four career `apply-*` actions no longer require a free `full-time` slot (a grad degree holder leaves the Core job through the exclusivity group; each action instead refuses while the player already holds a rung of its own ladder); pay of the entry and mid rungs raised (above); top-rung yearly odds cut (chief 0.3% to 0.2%, judge 0.4% to 0.2%, CEO 0.3% to 0.15%, tenure 1% to 0.8%); scholarship review thresholds 70/50 to 85/67; `studious` damping (`adjust`, weight 0.05) now covers only the four school applications, so career applications stay at full weight; `random` picks `drop-out-grad` five times as often. Tuition is unchanged. New metrics: unique scholarship holders who stepped down, entrants who dropped out, degree holders who started a grad career or reached a top rung, and net worth of degree holders with and without a grad career. The `scholar` profile also pays tuition from savings (`pay-tuition-cash`), and `grad-school/cheat-caught` forces the dishonesty case.

| Flag | Before (#231) | After | Target |
|---|---|---|---|
| Grad career starters among degree holders | `studious` 0 of ~290 | `studious` 56.8%, `random` 35.7%, `scholar` 99.9% | reachable |
| Net worth at 40, `studious` grad / no grad degree | 473,596 / 531,223 | 584,227 / 540,109 | roughly even |
| Net worth at 65, `studious` grad / no grad degree | 2,054,333 / 2,297,897 | 2,661,089 / 2,256,730 | grad ahead |
| Net worth at 40 / 65, `studious` grad-career starters | not measurable | 689,763 / 2,814,144 | ahead by 65 |
| Net worth at 40 / 65, `studious` degree holders without a grad career | not measurable | 390,346 / 2,180,196 | context |
| Top rungs per degree, `scholar` (chief / judge / CEO / full professor) | 7.2 / 7.5 / 9.4 / 4.4% | 3.3 / 3.3 / 3.8 / 3.2% | under 5% |
| Scholarship holders who stepped down at least once | ~2 per 100 events | `studious` 23.4%, `scholar` 29.0%, `all` 24.8% | ~25% |
| `random` entrants who dropped out | ~8% | 22.9% | ~25% |
| `all` decision slots (1 / 2 / 3 per year) | 88.5 / 48.0 / 27.3% | 89.9 / 49.3 / 28.1% | 90 / 50 / 30 within 3 |
| Largest decision storylet (`all`) | 2.36% | 2.33% (`core-loop/volunteer-weekend`) | under 3% |

Net worth rows are medians in major units; `random` has few degree holders (27 at 40), so its net worth rows are noise. Studious top rungs stay under 5% as well (CEO 4.4%, full professor 1.2%, judges and chiefs not reached because `studious` never sits the licensing exams). Scholar median net worth for no-grad lives is negative because the profile skips Core jobs. Entry: `studious` 21.9%, `scholar` 21.3% of lives hold a grad degree (target 15-30%).

## Open

Per-kind loan-miss reporting (the missed-payment events per grad life count every loan) needs an engine change.

## Tuning after v1 (#365, under #246)

Runs: artemis `grad-school-all-2` (10,000 lives, `--profile all`, seed 20260101, commit f1b6989; report `~/Projects/life-sim/reports/grad-school-all-2-f1b6989-20261011T072857Z/`) and `grad-school-scholar-2` (3,000 lives, `--profile scholar`, `reports/grad-school-scholar-2-f1b6989-20261011T072151Z/`). Baseline: the v1 reports of #245 (`rebalance-v1-all-ab46a88-...`, `rebalance-v1-scholar-ab46a88-...`).

Findings from v1: `take-grad-loan` never fired because no profile rule or `adjust` ever picked it (`scholar` listed only `pay-tuition-cash`, and Core's `studious` takes no grad action but school applications); `studious` and `scholar` never dropped out, since `drop-out-grad` is voluntary.

Changes (data only):

- New event `grad-washout`: 10% a year while enrolled, the player leaves without a degree (same effects as `drop-out-grad`, happiness -6). It is the drop-out path for profiles that never choose `drop-out-grad`. Harness metrics count it (`washouts`, and `dropped_out` includes it).
- `scholar` now includes `take-grad-loan` in its funding rule (weight 0.5 against the other actions); `random` gets weight 50 on `take-grad-loan` through `adjust`. The action stays gated by `not quality.grad_loan`, so it opens only when a player on cash (the `on_age_up_pre` hook sets the loan when money is short) chooses to borrow.

Results (v1 -> now):

| metric | v1 | now |
|---|---|---|
| `take-grad-loan` fires (10,000 `all` lives) | 0 | 7 (also fires in `scholar`) |
| `studious` entrants who dropped out | 0% | 27.5% |
| `scholar` entrants who dropped out | 0% | 28.3% |
| `studious` completion medical / law / MBA / PhD | 98.6 / 96.3 / 98.9 / 95.4% (all) | 65.6 / 82 / 91 / 57% |
| `scholar` completion medical / law / MBA / PhD | 100 / 98.2 / 100 / 99.4% | 78 / 84.2 / 87.7 / 66% |
| `studious` entry / hold a degree | 21.9% / about 21.8% | 22.1% / 17% |
| `studious` stepped-down scholarship holders | 27.5% | 25.7% |
| `studious` top rungs (CEO / full professor) | 2.2% / 4.2% | 2.5% / 3.8% |
| global slots 1 / 2 / 3 decisions | 89.8 / 49.3 / 28.3 | 89.9 / 49.2 / 28.1 |
| death age median, faults | 72, 0 | 72, 0 |

Overall completion is about 72% of entrants (drop-out 27-29% against the 25% target); the PhD (5 years) and medical (4 years) lose the most, the 2-year MBA the least, a consequence of a flat yearly rate. Remaining gap: `take-grad-loan` fires rarely (7 in `all`) because most enrolled players are put on the loan by the hook before they can choose it; making it common needs a different funding model, not weights. `grad-dishonesty-case` still never fires, and `apply-associate-lawyer`, `promote-attending`, `promote-chief`, `judge-offer` stay unreached in `all` (studious never sits the licensing exams), both outside this tuning.
