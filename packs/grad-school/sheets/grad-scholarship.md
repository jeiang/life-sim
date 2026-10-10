# Content sheet: Grad scholarship

- pack: grad-school
- packs: grad-school, core-loop
- profile: scholar
- lives: 3000

> Chain 4 (#230): offer at admission, yearly renewal and step-down, and the dishonesty case. The offer is chained from the admit-* steps (`next`) so the first year already benefits. The offer and each renewing review schedule `grad-scholarship-review` one year on (GAPS-RESOLVED: no chance 100%); a review of a player no longer enrolled or without a scholarship is dropped by its `when`, so the chain ends by itself. The case is scheduled by the cheat outcomes of chain 5.
> Admission starts `grad_gpa` at 50 + smarts / 4, so grades are never "unreported". Step-down reading: grades of 70 or more keep whatever is held; 50 to 69 drop a full scholarship to partial and keep a partial; under 50 drop full to partial and partial to none. Each step-down is followed by `grad-funding-gap`.
> Offer weights are linear in smarts: at smarts 100 about 47% any scholarship and 11% full; at 60 about 22% any and no full. The PhD has no tuition, so no offer.
> Suspension has no separate case: it is the caught outcome for a player still enrolled on a scholarship. The program continues.

## grad-scholarship-offer
- trigger: event
- icon: 🎓
- chance: 0%
- when: grad_enrolled
- tags: education, money
- text: The financial aid office opens your file, {player.first_name}, and starts reading.
- opens: 0.15..0.30 per life

### outcomes
- outcome: 25
  - text: A form letter arrives. Financial aid thanks you for applying and wishes you luck with tuition.
- outcome: 25
  - text: Another form letter, a little warmer. No scholarship this year, but they liked your essay.
- outcome: max(0, stat.smarts - 30) / 4
  - text: A partial scholarship is offered. Half your tuition is covered, for now.
  - effect: quality.grad_scholarship = 50
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
  - effect: journal("Partial scholarship awarded, half of tuition covered")
- outcome: max(0, stat.smarts - 30) / 4
  - text: The committee splits the difference. Half your tuition is covered by a scholarship.
  - effect: quality.grad_scholarship = 50
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
  - effect: journal("Partial scholarship awarded, half of tuition covered")
- outcome: max(0, stat.smarts - 60) / 4
  - text: A full scholarship. The committee calls your transcript a pleasure to read, and your bank account agrees.
  - effect: quality.grad_scholarship = 100
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
  - effect: journal("Full scholarship awarded, tuition covered")

## grad-scholarship-review
- trigger: event
- icon: 📝
- chance: 0%
- when: grad_enrolled and quality.grad_scholarship > 0
- tags: education, money
- text: The scholarship committee checks your grade report, {player.first_name}.
- opens: 0.12..0.25 per life

### outcomes
- outcome: 1
  - text: Strong grades. The scholarship renews for another year without a fuss.
  - when: quality.grad_gpa >= 70
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
- outcome: 1
  - text: Your grades slip, and the committee cuts the scholarship to half.
  - when: quality.grad_gpa >= 50 and quality.grad_gpa < 70 and quality.grad_scholarship == 100
  - effect: quality.grad_scholarship = 50
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
  - effect: journal("Scholarship cut to partial, grades slipped")
  - next: grad-funding-gap
- outcome: 1
  - text: Middling grades. The partial scholarship survives one more year.
  - when: quality.grad_gpa >= 50 and quality.grad_gpa < 70 and quality.grad_scholarship == 50
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
- outcome: 1
  - text: Failing grades. The full scholarship drops to half, and the committee wants to see a turnaround.
  - when: quality.grad_gpa < 50 and quality.grad_scholarship == 100
  - effect: quality.grad_scholarship = 50
  - effect: stat.happiness -= 1
  - effect: schedule(grad-school/grad-scholarship-review, after: 1-1 years)
  - effect: journal("Scholarship cut to partial, grades failing")
  - next: grad-funding-gap
- outcome: 1
  - text: Failing grades again. The scholarship is gone, and so is some of your confidence.
  - when: quality.grad_gpa < 50 and quality.grad_scholarship == 50
  - effect: quality.grad_scholarship = 0
  - effect: stat.happiness -= 2
  - effect: journal("Scholarship ended, grades failing")
  - next: grad-funding-gap

## grad-dishonesty-case
- trigger: event
- icon: 🚨
- chance: 0%
- when: quality.grad_cheated
- tags: education
- text: Someone on the exam board has noticed your answers were a little too neat, {player.first_name}.
- opens: 0.01..0.08 per life

### outcomes
- outcome: 40
  - text: Caught cheating. The committee revokes your scholarship and you are suspended for a week.
  - when: grad_enrolled and quality.grad_scholarship > 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_cheated = false
  - effect: stat.happiness -= 5
  - effect: journal("Caught cheating, scholarship revoked, suspended for a week")
  - next: grad-funding-gap
- outcome: 40
  - text: Caught cheating. The board makes a note of it, and you feel very small.
  - when: not (grad_enrolled and quality.grad_scholarship > 0)
  - effect: quality.grad_cheated = false
  - effect: stat.happiness -= 5
  - effect: journal("Caught cheating on an exam")
- outcome: 60
  - text: The records office never notices, and your secret stays buried.
  - effect: quality.grad_cheated = false
