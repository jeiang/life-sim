# Content sheet: Paying for grad school

- pack: grad-school
- packs: grad-school, core-loop
- profile: scholar
- lives: 3000

> Chain 3 (grad-funding). Who pays tuition. Tuition is charged automatically by Pack data, not by storylets: a school stage's pay is `0 - grad_tuition_cash` (cash) and the yearly `on_age_up_pre` hook adds `grad_tuition_due` to `grad_debt` while `grad_loan` is set (and moves a player who cannot cover the year in cash onto the loan). Admission starts every program in cash with no parents' share.
> The actions below only change the mix: cash or loan, and the parents' share (0, 50 or 100). A scholarship step-down raises `grad_tuition_due`, so the lost amount falls to whatever mix the player has; `grad-funding-gap` (reached from chain 4) lets the player change that mix right away.
> Parent weights: x = role_closeness(core-loop/parent) * quality.family_wealth, which runs 0 to 500. Yes-all weight is x / 20, yes-part is x / 10, no is 100 - x / 5. The rates assume closeness 60 and family_wealth 3, so x = 180: yes-all 9, yes-part 18, no 64 of 91.
> Actions use cooldown 1 (one change a year). The grad loan is a normal loan: payments are Core settlement and misses use Core's missed-payment event; Core has no loan-kind name in expressions, so there is no grad-specific missed-payment story (harness metrics count Core's).
> The PhD has no tuition, so none of these actions are offered for it (`quality.grad_tuition > 0`).

## pay-tuition-cash
- trigger: action
- menu: occupation/education
- label: Pay tuition from savings
- icon: 💵
- tags: money, education
- cooldown: 1
- when: grad_enrolled and quality.grad_tuition > 0 and quality.grad_loan and money >= grad_tuition_due
- text: The school wants its money every year. Savings are where the money lives.
- opens: 0..0.1 per life

### outcomes
- outcome: 1
  - text: You will cover the bills from savings, one year at a time.
  - effect: quality.grad_loan = false
  - effect: journal("Tuition will come out of savings each year.")
  - rate: 100..100%

## take-grad-loan
- trigger: action
- menu: occupation/education
- label: Borrow the tuition
- icon: 🏦
- tags: loan, education
- cooldown: 1
- when: grad_enrolled and quality.grad_tuition > 0 and not quality.grad_loan
- text: The school takes a promise to pay instead of cash. The promise comes due after the degree.
- opens: 0.02..0.4 per life

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
