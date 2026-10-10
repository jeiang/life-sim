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

## Focused-sim and harness findings

See the numbers section below; open flags are listed for the artemis balance issue (#231).
