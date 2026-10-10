# Content sheet: Grad programs

- pack: grad-school
- packs: grad-school, core-loop
- profile: all
- lives: 3000

> Chain 2: the yearly stage for the four programs. Entry (`start_occupation`, `grad_program`, `grad_gpa` start) is chain 1; tuition and funding are chain 3 (a yearly hook in pack.yaml) and scholarships are chain 4.
> Both the year review and the graduation event are scheduled at admission (GAPS-RESOLVED: mandatory events never rely on `chance: 100%`). The school stage ends itself at `duration_years` during settlement, so graduation is `grad_program == k and not in_group(school)`; the year review needs `grad_enrolled` and reschedules itself, so it drops out in the graduation year.
> Graduation and drop-out convert `grad_debt` into a graduate loan (take_loan credits the money, the paired money line pays the school) and reset the program qualities. `grad_gpa` is kept for the career sheets.
> Review outcome weights are expressions over `stat.smarts` (integer division), so no outcome `rate` is given.
> `drop-out-grad` is one storylet over all four programs, so its `opens` band is the sum of the per-school drop-outs.

## grad-year-review
- trigger: event
- icon: 📚
- chance: 0%
- when: grad_enrolled
- text: The year-end transcript lands in your mailbox. Time to see how you really did.
- opens: 0.45..0.75 per life

### outcomes
- outcome: 10 + stat.smarts / 2
  - text: Your professors start learning your name. Top marks this year.
  - effect: quality.grad_gpa += 5
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)
- outcome: 50
  - text: A solid year of B minuses. Nobody is writing letters for you yet.
  - effect: quality.grad_gpa += 1
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)
- outcome: 60 - stat.smarts / 2
  - text: Your transcript reads like a cry for help. Your grades slide badly.
  - effect: quality.grad_gpa += 0 - 4
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)

## graduate-medical-school
- trigger: event
- icon: 🩺
- chance: 0%
- when: quality.grad_program == 1 and not in_group(school)
- text: The last rotation ends and the hospital hands you a diploma. Your mother cries first.
- opens: 0.03..0.05 per life

### outcomes
- outcome: 1
  - text: You finish the rotations and the faculty signs off on your degree.
  - effect: take_loan(grad-school/grad-loan, quality.grad_debt)
  - effect: money -= quality.grad_debt
  - effect: quality.grad_degree_medical = true
  - effect: reach_milestone(grad_medical_graduated)
  - effect: stat.happiness += 6
  - effect: quality.grad_program = 0
  - effect: quality.grad_tuition = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_parents = 0
  - effect: quality.grad_loan = false
  - effect: quality.grad_debt = 0
  - effect: journal("Graduated from medical school at age {age}.")

## graduate-law-school
- trigger: event
- icon: ⚖️
- chance: 0%
- when: quality.grad_program == 2 and not in_group(school)
- text: The last exam is done. The bar results are weeks away, but the degree is yours.
- opens: 0.03..0.05 per life

### outcomes
- outcome: 1
  - text: You turn in your last brief and the registrar confirms your degree.
  - effect: take_loan(grad-school/grad-loan, quality.grad_debt)
  - effect: money -= quality.grad_debt
  - effect: quality.grad_degree_law = true
  - effect: reach_milestone(grad_law_graduated)
  - effect: stat.happiness += 6
  - effect: quality.grad_program = 0
  - effect: quality.grad_tuition = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_parents = 0
  - effect: quality.grad_loan = false
  - effect: quality.grad_debt = 0
  - effect: journal("Graduated from law school at age {age}.")

## graduate-mba-program
- trigger: event
- icon: 💼
- chance: 0%
- when: quality.grad_program == 3 and not in_group(school)
- text: You present your capstone to a room of executives. They applaud, and they hand you a diploma.
- opens: 0.04..0.06 per life

### outcomes
- outcome: 1
  - text: The capstone goes well enough. The degree is official.
  - effect: take_loan(grad-school/grad-loan, quality.grad_debt)
  - effect: money -= quality.grad_debt
  - effect: quality.grad_degree_mba = true
  - effect: reach_milestone(grad_mba_graduated)
  - effect: stat.happiness += 6
  - effect: quality.grad_program = 0
  - effect: quality.grad_tuition = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_parents = 0
  - effect: quality.grad_loan = false
  - effect: quality.grad_debt = 0
  - effect: journal("Graduated from mba school at age {age}.")

## graduate-phd-program
- trigger: event
- icon: 🎓
- chance: 0%
- when: quality.grad_program == 4 and not in_group(school)
- text: Your dissertation survives the defense with only minor corrections. You are now a doctor of philosophy.
- opens: 0.022..0.04 per life

### outcomes
- outcome: 1
  - text: The committee signs the last form and the degree is yours.
  - effect: take_loan(grad-school/grad-loan, quality.grad_debt)
  - effect: money -= quality.grad_debt
  - effect: quality.grad_degree_phd = true
  - effect: reach_milestone(grad_phd_graduated)
  - effect: stat.happiness += 6
  - effect: quality.grad_program = 0
  - effect: quality.grad_tuition = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_parents = 0
  - effect: quality.grad_loan = false
  - effect: quality.grad_debt = 0
  - effect: journal("Graduated from phd school at age {age}.")

## study-grad
- trigger: action
- icon: 📖
- menu: occupation
- label: Hit the books for your program
- cooldown: 1
- when: grad_enrolled
- text: You settle in for another stretch of reading and problem sets.
- opens: 0.8..2.5 per life

### outcomes
- outcome: 60
  - text: You live in the library until it closes, and the notes start to make sense.
  - effect: quality.grad_gpa += 4
  - rate: 58..62%
- outcome: 40
  - text: You cram all night and forget to eat. The grades go up, and so does the stress.
  - effect: quality.grad_gpa += 3
  - effect: stat.health -= 2
  - rate: 38..42%

## drop-out-grad
- trigger: action
- icon: 🚪
- menu: occupation
- label: Drop out of grad school
- when: grad_enrolled
- text: You stop going to class, then stop answering the emails. The school quietly stops waiting for you.
- opens: 0.04..0.065 per life

### outcomes
- outcome: 1
  - text: You leave without a degree. The loan paperwork arrives a few weeks later.
  - effect: end_group(school)
  - effect: unschedule(grad-school/grad-year-review)
  - effect: unschedule(grad-school/grad-scholarship-review)
  - effect: unschedule(grad-school/graduate-medical-school)
  - effect: unschedule(grad-school/graduate-law-school)
  - effect: unschedule(grad-school/graduate-mba-program)
  - effect: unschedule(grad-school/graduate-phd-program)
  - effect: take_loan(grad-school/grad-loan, quality.grad_debt)
  - effect: money -= quality.grad_debt
  - effect: stat.happiness -= 4
  - effect: quality.grad_program = 0
  - effect: quality.grad_tuition = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_parents = 0
  - effect: quality.grad_loan = false
  - effect: quality.grad_debt = 0
  - effect: journal("Dropped out of grad school at age {age}.")
