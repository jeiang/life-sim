# grad-school balance

Tuned with the [harness](../../docs/spec/harness.md): `pnpm harness --jobs 4 --lives 1000 --profile <p> --packs core-loop,grad-school --seed 1 --out <dir>`. Final numbers come from the artemis run in #231.

## Design numbers

- Tuition per year: medical 30,000, law 24,000, MBA 20,000 (major units); PhD stipend 6,000, no tuition. Graduate loan 6.5% over 20 years.
- Admission per application by smarts band (under 40 / 40-69 / 70+): medical 1/5/11%, law 2/6/13%, MBA 2/7/14%, PhD 2/6/13%. Applications retry yearly, but the schools stop looking after two rejections (`grad_rejections < 2`). The outline's 50-60% top band made every `studious` life (which applies whenever it can) enter grad school; these odds put `studious` at about 25%.
- Enrolment sets `grad_gpa = 40 + smarts / 3`; the yearly review adds +5, +1 or -6 (weights `10 + smarts/2`, 50, `60 - smarts/2`).
- Scholarship offer weights: partial `(smarts - 30) / 4` twice, full `(smarts - 60) / 4`, against 25 + 25 for none. Review thresholds 70 and 50.
- Exam pass weight `30 + smarts / 2 + 8 * prep` against fail `60 - smarts / 4 - 4 * prep`; cheating `60 + smarts / 2 + 10 * prep` against a fixed 30 caught.
- Gross pay per year at a 100% wage index (major units): resident 70,000, attending 150,000, chief 220,000; associate 90,000, partner 180,000, judge 200,000; manager 100,000, CEO 250,000; postdoc 50,000, assistant professor 75,000, associate 100,000, full 130,000. Core's top rung is senior engineer at 115,000. Promotions: resident 3 years, attending 6 (chief is a 0.3% yearly roll, once), associate 4, manager 5 (CEO 0.3% a year, once), postdoc 2, assistant 4, associate professor 5 (tenure 1% a year; judge offer 0.4% a year).

## Targets (#229)

- 15-30% of `studious` lives enter grad school; about 20% of lives overall.
- Completion about 75%, drop-out about 25% (drop-out is a voluntary action, so it depends on the profile).
- Top rungs (chief, judge, CEO, full professor) each under 5% of graduates.
- Break-even net worth against a bachelor-only life around 40-45.

## Local harness findings (1500 lives, `--packs core-loop,grad-school`, seed 2; not the final numbers)

- `studious`: 25.4% enter grad school, 25.3% finish with a degree (target 15-30%). Completion about 99% (the profile never drops out; `random` drops out about 3% of lives that enrol).
- Scholarship: 41% of enrolled `studious` lives hold one; full 0.10 per enrolled life; full-to-partial step-downs 0.018 per enrolled life, partial-to-none about 0 (grades rarely fall under 50). Open flag for #231: step-downs are rarer than the outline's 25% of holders.
- Exams: honest pass rate 70-75% per sitting (medical 74.8%, bar 69.4% in the `scholar` profile).
- Top rungs (scholar, per degree, before the final odds were cut): chief 16%, judge 25%, CEO 19%, full professor 12%. The yearly odds were then lowered (chief 0.3%, CEO 0.3%, judge 0.4%, tenure 1%); #231 must re-measure that each stays under 5% of graduates.
- Grad careers need a free `full-time` slot (Core's `apply-*` gate), so `random` and `studious` lives that already hold a Core job rarely start one (residents 0.005 per life in `random`). Only `scholar` (which skips Core job applications) reaches the ladders. Flag for #231: decide whether a degree-holder should be able to leave the Core job through the grad application.
- Net worth (`studious`, median, grad path against bachelor-only path): 489,517 against 532,360 at 40 and 2,303,954 against 2,376,526 at 65. The grad path does not pay back yet; ladder pay and tuition are the #231 levers (break-even target 40-45).
- Missed-payment events per grad life are about 14 for `studious` because the Core event counts every loan (student and grad) and Core exposes no loan kind to expressions; a per-kind count needs an engine change.
- `drop-out-grad` is voluntary, so the 25% drop-out target is a `random` behaviour only.

## Open flags for the artemis balance issue (#231)

1. Scholarship step-down rate (above). 2. Pay ratio of the top rungs to Core's senior engineer (chief 220,000 and CEO 250,000 against 115,000) and break-even age. 3. Top-rung shares under 5% of graduates. 4. Career entry for lives that already hold a Core job. 5. Per-kind loan-miss reporting.
