# grad-school glossary

Terms owned by the grad-school Pack (namespace `grad`). General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md).

**Program**:
One of four school stages, each an occupation in Core's `school` group: medical school (4 years, from a nursing or engineering degree), law school (3, business or arts), MBA (2, business or engineering), PhD (5, any degree; a stipend, no tuition). `grad_program` (0 none, 1 medical, 2 law, 3 MBA, 4 PhD) is set by the `admit-*` storylet before the stage starts, and the stage's `requires` checks it. One degree per school per life (`grad_degree_*`); at most one program at a time.

**Admission**:
Four yearly `apply-*` actions (`occupation/education`, cooldown 1). Chance is a smarts band (under 40, 40-69, 70+). Admission chains to `admit-*`, which sets the qualities, schedules the year review and the graduation and chains to the scholarship offer.

**Tuition**:
`grad_tuition` is the yearly price, fixed at enrolment. `grad_tuition_due` is what the player owes after the scholarship and the parents' share. A school stage's pay is `0 - grad_tuition_cash` (cash, charged at settlement; Core does not cap an occupation's pay at cash, so a cash year can overdraw). The `on_age_up_pre` hook moves a player who cannot cover the year onto the loan and adds `grad_tuition_due` to `grad_debt` while `grad_loan` is set.

**Graduate loan**:
`grad-school/grad-loan` (6.5%, 20 years, unsecured). Borrowed tuition accrues as `grad_debt` and becomes a loan (`take_loan` plus the matching `money -=`) at graduation or drop-out, so repayment starts then. Core's `missed-payment` event covers its misses; Core exposes no loan kind in expressions, so the harness counts missed-payment events for all loans.

**Funding mix**:
Cash or loan (`take-grad-loan`, `pay-tuition-cash`) and the parents' share (`grad_parents` 0, 50, 100; `ask-parents-tuition`, chance from `role_closeness(parent) * family_wealth`). The scholarship step-down raises the amount due, so the lost amount falls to the existing mix; `grad-funding-gap` lets the player change it.

**Scholarship**:
`grad_scholarship` 0, 50 or 100. Offered at enrolment (`grad-scholarship-offer`, chance and size scale with smarts), reviewed yearly (`grad-scholarship-review`, scheduled): grades 70+ keep it, 50-69 steps full to partial, under 50 steps full to partial and partial to none. A caught cheat (`grad-dishonesty-case`) drops it straight to none; the program continues (suspension is not modelled separately).

**Grades**:
`grad_gpa` starts at 50 + smarts / 4 at enrolment, moves by `grad-year-review` and `study-grad`, and is kept after graduation (the residency match reads it).

**Licensing exams**:
`sit-medical-boards` and `sit-bar-exam` (`activities/career`, cooldown 1, only after the degree). Pass chance from smarts and `grad_prep` (0-5, raised by `grad-exam-prep`, spent by every sitting). The cheat choice raises the pass chance and sets `grad_cheated`, which schedules the dishonesty case.

**Ladders**:
Doctor (`resident-doctor` -> `attending-doctor` -> `chief-of-medicine`), lawyer (`associate-lawyer` -> `partner-lawyer`, then the rare `judge` offer, once per life), business (`business-manager` -> `ceo`), professor (`postdoc` -> `assistant-professor` -> `associate-professor` -> `full-professor`). All are `full-time`, `npc: false`, and applied for on `activities/job-board` with Core's gate (`not in_group("full-time")`, `not hiring_blocked`), so a player with a Core job must quit first. Each rung's last step is a rare event. Medical expansion (#105) may extend the doctor ladder later.

**Milestones**:
`grad_medical_graduated`, `grad_law_graduated`, `grad_mba_graduated`, `grad_phd_graduated` (Core's `graduated` fires once, from the first school).

**Mandatory steps**:
The year review, graduation, scholarship review, dishonesty case and the promotions that must happen are scheduled (`schedule`), never `chance: 100%`; `lint.yaml` allows the resulting L003 findings.
