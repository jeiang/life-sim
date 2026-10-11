# Content sheet: Paying for grad school

- pack: grad-school
- packs: grad-school, core-loop
- profile: scholar
- lives: 3000

> Chain 3 (grad-funding). Who pays tuition. Each year after admission the `grad-tuition-due` prompt asks how to pay: from savings (`pay-tuition-cash`), borrow (`take-grad-loan`), or apply for a scholarship (`grad-scholarship-offer`, which asks again). Options the player cannot afford are greyed out through `when`. The yearly `on_age_up_pre` hook is only a fallback: when no choice was made that year and the player cannot cover it in cash, it sets `grad_loan`.
> `pay-tuition-cash` and `take-grad-loan` are terminal events reached through `next`, not actions. A choice at age-up A governs the settlement at A+1. The hook clears `grad_funded` after each settlement, so the prompt is asked again the next year. Tuition is charged automatically by Pack data: a school stage's pay is `0 - grad_tuition_cash` (cash), and the hook adds `grad_tuition_due` to `grad_debt` while `grad_loan` is set. Admission starts every program in cash with no parents' share.
> Parent weights: x = role_closeness(core-loop/parent) * quality.family_wealth, which runs 0 to 500. Yes-all weight is x / 20, yes-part is x / 10, no is 100 - x / 5. The rates assume closeness 60 and family_wealth 3, so x = 180: yes-all 9, yes-part 18, no 64 of 91.
> `ask-parents-tuition` uses cooldown 1 (one change a year). The grad loan is a normal loan: payments are Core settlement and misses use Core's missed-payment event; Core has no loan-kind name in expressions, so there is no grad-specific missed-payment story (harness metrics count Core's).
> The PhD has no tuition, so none of these options are offered for it (`quality.grad_tuition > 0`).

## grad-tuition-due
- trigger: event
- icon: 🧾
- chance: 0%
- when: grad_enrolled and quality.grad_tuition > 0
- text: Tuition for the coming year is due. How will you pay it?

### choice: Pay from savings
- when: money >= grad_tuition_due
- outcome: 1
  - text: Savings will cover this year's bill.
  - effect: quality.grad_funded = true
  - effect: schedule(grad-school/grad-tuition-due, after: 1-1 years)
  - next: pay-tuition-cash

### choice: Borrow the tuition
- outcome: 1
  - text: The school takes a promise to pay for this year.
  - effect: quality.grad_funded = true
  - effect: schedule(grad-school/grad-tuition-due, after: 1-1 years)
  - next: take-grad-loan

### choice: Apply for a scholarship
- when: quality.grad_scholarship == 0 and not quality.grad_reapplied
- outcome: 1
  - text: You send the financial aid forms in again.
  - effect: quality.grad_reapplied = true
  - next: grad-scholarship-offer

## pay-tuition-cash
- trigger: event
- icon: 💵
- chance: 0%
- text: The school wants its money every year. Savings are where the money lives.

### outcomes
- outcome: 1
  - text: You will cover the bills from savings, one year at a time.
  - effect: quality.grad_loan = false
  - effect: journal("Tuition will come out of savings each year.")
  - rate: 100..100%

## take-grad-loan
- trigger: event
- icon: 🏦
- chance: 0%
- text: The school takes a promise to pay instead of cash. The promise comes due after the degree.

### outcomes
- outcome: 1
  - text: The tuition goes on a tab. You will settle it when the program ends.
  - effect: quality.grad_loan = true
  - effect: journal("Tuition will go on a graduate loan, settled when the program ends.")
  - rate: 100..100%

## ask-parents-tuition
- trigger: action
- menu: occupation/education
- label: Ask your parents to pay tuition
- icon: 👪
- tags: family, money
- cooldown: 1
- when: grad_enrolled and quality.grad_tuition > 0 and quality.grad_parents < 100
- text: Your parents have opinions about your education, and most of them are about money.
- opens: 0.2..0.7 per life

### outcomes
- outcome: role_closeness(core-loop/parent) * quality.family_wealth / 20
  - text: They will pay the rest of the bill. You can stop thinking about tuition for now.
  - effect: quality.grad_parents = 100
  - effect: journal("Your parents agreed to pay the rest of the tuition.")
- outcome: role_closeness(core-loop/parent) * quality.family_wealth / 10
  - when: quality.grad_parents == 0
  - text: They will cover half. The rest is still yours to find.
  - effect: quality.grad_parents = 50
  - effect: journal("Your parents agreed to cover half the tuition.")
- outcome: 100 - role_closeness(core-loop/parent) * quality.family_wealth / 5
  - text: They are sorry, but they cannot help this time.

## grad-funding-gap
- trigger: event
- icon: 🧮
- chance: 0%
- when: grad_enrolled and quality.grad_tuition > 0
- text: Your scholarship shrank, and the school wants the difference this year. Who pays it?
- opens: 0..0.12 per life

### choice: Keep paying as before
- outcome: 1
  - text: The extra just joins the rest of your tuition.
  - rate: 100..100%

### choice: Borrow the extra
- when: not quality.grad_loan
- outcome: 1
  - text: Your share of tuition goes on a loan from now on. Dull, but manageable.
  - effect: quality.grad_loan = true
  - rate: 100..100%

### choice: Pay from savings
- when: quality.grad_loan and money >= grad_tuition_due
- outcome: 1
  - text: Savings will cover the bill each year. The school stops sending letters.
  - effect: quality.grad_loan = false
  - rate: 100..100%

### choice: Ask your parents to cover more
- when: quality.grad_parents < 100
- outcome: role_closeness(core-loop/parent) * quality.family_wealth / 20
  - text: They agree to take the rest of your tuition from now on.
  - effect: quality.grad_parents = 100
- outcome: role_closeness(core-loop/parent) * quality.family_wealth / 10
  - when: quality.grad_parents == 0
  - text: They agree to cover half of your tuition from now on.
  - effect: quality.grad_parents = 50
- outcome: 100 - role_closeness(core-loop/parent) * quality.family_wealth / 5
  - text: They are short this year. The gap is still yours to cover.
