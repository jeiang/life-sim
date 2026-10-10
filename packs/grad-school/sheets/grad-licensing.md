# Content sheet: Grad licensing exams

- pack: grad-school
- packs: grad-school, core-loop
- profile: all
- lives: 3000

> Chain 5 of the grad-school pack (outline section 5). Two licensing exams (medical boards, bar), one prep action, and a cheat choice on each exam.
> Exams are offered yearly (cooldown 1) only after the degree and never during school. Each sitting, pass or fail, sets grad_prep back to 0.
> Pass weights are expressions, so the rate bands are for a typical player (stat.smarts 60, grad_prep 2). Honest sitting: pass 76 vs fail 37, so 67% pass. Cheat: pass 110 vs caught 30, so 79% pass.
> Cheat beats sitting straight on pass chance for most players (honest and cheat cross near stat.smarts 90 with grad_prep 4), and every cheat outcome sets grad_cheated.
> Honest pass chance: about 50% at smarts 40 with no prep, 67% at smarts 60 with prep 2, 86% at smarts 90 with prep 5. The outline targets about 70% per attempt.
> opens are design estimates before the #231 run: each degree is held by about 3 to 4.5% of lives (4 to 6% enrol, about 75% complete), with about 1.4 sittings per holder and about 2.5 prep uses per sitting. lives is 3000 so the rarer exam storylets have enough fires to measure.
> grad_cheated is set on every cheat outcome. The dishonesty case in grad-scholarship (chain 4) reads it and clears it. A caught cheat on the exam does not change the scholarship by itself.

## sit-medical-boards
- trigger: action
- menu: activities/career
- label: Sit the medical boards
- icon: 🩺
- tags: education
- when: (quality.grad_degree_medical and not quality.grad_licensed_medical) and not in_group(school)
- cooldown: 1
- text: Three days in a testing hall, one question after another, while the clock on the wall loses ground. {player.first_name} is about to find out whether the years of school count.
- opens: 0.03..0.09 per life

### choice: Sit it straight
- outcome: 30 + stat.smarts / 2 + 8 * quality.grad_prep
  - text: The letter arrives in the spring. You passed, and you may now practice medicine under supervision.
  - effect: quality.grad_licensed_medical = true
  - effect: quality.grad_prep = 0
  - effect: stat.happiness += 4
  - effect: journal("Passed the medical boards.")
  - rate: 60..75%
- outcome: 60 - stat.smarts / 4 - 4 * quality.grad_prep
  - text: You miss the cut-off by a handful of points. The letter is very polite about it.
  - effect: quality.grad_prep = 0
  - effect: stat.happiness -= 4
  - effect: journal("Failed the medical boards.")
  - rate: 25..40%

### choice: Cheat
- outcome: 60 + stat.smarts / 2 + 10 * quality.grad_prep
  - text: Nobody notices the notes tucked in your cuff, and the letter says you passed.
  - effect: quality.grad_licensed_medical = true
  - effect: quality.grad_cheated = true
  - effect: schedule(grad-school/grad-dishonesty-case, after: 1-1 years)
  - effect: quality.grad_prep = 0
  - effect: stat.happiness -= 2
  - effect: journal("Passed the medical boards with help you should not have had.")
  - rate: 70..85%
- outcome: 30
  - text: A proctor spots the notes in your cuff. The exam is void, and the file goes on record.
  - effect: quality.grad_cheated = true
  - effect: schedule(grad-school/grad-dishonesty-case, after: 1-1 years)
  - effect: quality.grad_prep = 0
  - effect: stat.happiness -= 8
  - effect: journal("Caught cheating on the medical boards.")
  - rate: 15..30%

## sit-bar-exam
- trigger: action
- menu: activities/career
- label: Sit the bar exam
- icon: 📜
- tags: education
- when: (quality.grad_degree_law and not quality.grad_licensed_law) and not in_group(school)
- cooldown: 1
- text: Two days of essays and multiple choice in a hall that smells of toner. {player.first_name} gets one shot a year at a bar card, and today is that shot.
- opens: 0.03..0.09 per life

### choice: Sit it straight
- outcome: 30 + stat.smarts / 2 + 8 * quality.grad_prep
  - text: The results post at midnight. You passed the bar and can take on clients.
  - effect: quality.grad_licensed_law = true
  - effect: quality.grad_prep = 0
  - effect: stat.happiness += 4
  - effect: journal("Passed the bar exam.")
  - rate: 60..75%
- outcome: 60 - stat.smarts / 4 - 4 * quality.grad_prep
  - text: You fail the essay section by a few points. The next sitting is a year away.
  - effect: quality.grad_prep = 0
  - effect: stat.happiness -= 4
  - effect: journal("Failed the bar exam.")
  - rate: 25..40%

### choice: Cheat
- outcome: 60 + stat.smarts / 2 + 10 * quality.grad_prep
  - text: You lean on a classmate's essay plan, nobody catches it, and you are admitted to the bar.
  - effect: quality.grad_licensed_law = true
  - effect: quality.grad_cheated = true
  - effect: schedule(grad-school/grad-dishonesty-case, after: 1-1 years)
  - effect: quality.grad_prep = 0
  - effect: stat.happiness -= 2
  - effect: journal("Passed the bar exam with help you should not have had.")
  - rate: 70..85%
- outcome: 30
  - text: The proctor reads your phone log, and the exam is voided on the spot. The file goes on record.
  - effect: quality.grad_cheated = true
  - effect: schedule(grad-school/grad-dishonesty-case, after: 1-1 years)
  - effect: quality.grad_prep = 0
  - effect: stat.happiness -= 8
  - effect: journal("Caught cheating on the bar exam.")
  - rate: 15..30%

## grad-exam-prep
- trigger: action
- menu: activities/career
- label: Study for your licensing exam
- icon: 📚
- tags: education, learning
- repeatable: true
- when: ((quality.grad_degree_medical and not quality.grad_licensed_medical) or (quality.grad_degree_law and not quality.grad_licensed_law)) and quality.grad_prep < 5 and not in_group(school)
- text: Old practice papers, flashcards at the kitchen table, and a highlighter running low. {player.first_name} starts to see the patterns in the questions.
- opens: 0.08..0.25 per life

### outcomes
- outcome: 1
  - text: You work through the practice papers until the questions stop looking new.
  - effect: quality.grad_prep += 1
  - effect: stat.smarts += 1
  - effect: stat.happiness -= 2
  - rate: 100..100%
