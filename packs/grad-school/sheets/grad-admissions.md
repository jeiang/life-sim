# Content sheet: Grad school admissions

- pack: grad-school
- packs: grad-school, core-loop
- profile: all
- lives: 1000

> Chain 1 (grad-admissions): four apply actions (one per school) and four admission steps that enroll the player.
> Each apply has six outcomes in three smarts bands: low (stat.smarts under 40), mid (40 to 69), high (70 and up). Each band's two outcome weights sum to 100, so the admit share inside a band is its weight out of 100. Band gates sit on the outcomes, so per-outcome rates are per band and are not written as rate bands here.
> Admitted outcomes route with next to admit-<school>, a chance 0% step that sets enrollment state and starts the occupation. The scholarship offer (chain 4) is a root event that fires on its own after enrollment, and the funding actions (chain 3) are menu actions gated on grad.enrolled, so neither is routed from here.
> Gate: age 22 or older, the prerequisite degree (per school), not in school, quality.grad_program == 0 (not enrolled anywhere), and no degree yet for that school. Cooldown 1 lets a rejected player apply again next year.
> Opens: an apply opens once per attempt (admit plus reject); an admit step opens once per enrollment. Admit bands follow the outline's enrollment targets (medical and law 4-6%, MBA 5-8%, PhD 3-5% of lives) widened about 20%. Apply bands are estimated from those targets and the band admit shares; they are design estimates until measured in #231.
> The shared grad_ qualities are declared once, on the first storylet that uses each name. Names used by a later storylet and declared earlier in this sheet need no second line.

## apply-medical-school
- trigger: action
- menu: occupation/education
- label: Apply to medical school
- icon: 🩺
- tags: education, apply
- when: age >= 22 and (quality.has_degree_nursing or quality.has_degree_engineering) and not in_group(school) and quality.grad_program == 0 and not quality.grad_degree_medical
- cooldown: 1
- text: Medical school wants transcripts, a personal statement and three references. Send an application?
- opens: 0.12..0.35 per life

### outcomes
- outcome: 5
  - text: A surprise envelope. The committee took a long shot on you.
  - when: stat.smarts < 40
  - next: admit-medical-school
- outcome: 95
  - text: A short letter arrives. Not this year. You can apply again next year.
  - when: stat.smarts < 40
  - effect: stat.happiness -= 2
- outcome: 25
  - text: A thick envelope with a crest on the front. You are in.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - next: admit-medical-school
- outcome: 75
  - text: Waitlisted, then rejected. You can apply again next year.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - effect: stat.happiness -= 3
- outcome: 50
  - text: Your interview goes brilliantly and the offer follows that week.
  - when: stat.smarts >= 70
  - next: admit-medical-school
- outcome: 50
  - text: The committee has too many strong candidates. You are not one of them this year.
  - when: stat.smarts >= 70
  - effect: stat.happiness -= 3

## admit-medical-school
- trigger: event
- icon: 🩺
- chance: 0%
- text: Medical school starts this autumn, along with the twelve-hour shifts you were warned about.
- opens: 0.04..0.07 per life

### outcomes
- outcome: 1
  - text: You enroll in medical school. Four years of lectures, labs and night shifts start now.
  - effect: quality.grad_program = 1
  - effect: quality.grad_tuition = 3000000
  - effect: quality.grad_loan = false
  - effect: quality.grad_parents = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_debt = 0
  - effect: quality.grad_gpa = 50 + stat.smarts / 4
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)
  - effect: schedule(grad-school/graduate-medical-school, after: 4-4 years)
  - effect: start_occupation(grad-school/grad-medical-school)
  - effect: stat.happiness += 4
  - effect: journal("Admitted to medical school at age {age}.")
  - next: grad-scholarship-offer

## apply-law-school
- trigger: action
- menu: occupation/education
- label: Apply to law school
- icon: 📜
- tags: education, apply
- when: age >= 22 and (quality.has_degree_business or quality.has_degree_arts) and not in_group(school) and quality.grad_program == 0 and not quality.grad_degree_law
- cooldown: 1
- text: Law school wants a personal statement, an admissions test score and a letter from a professor. Send an application?
- opens: 0.10..0.28 per life

### outcomes
- outcome: 10
  - text: The admissions panel has a soft spot for long shots, and so do you.
  - when: stat.smarts < 40
  - next: admit-law-school
- outcome: 90
  - text: A form letter arrives with one kind line at the bottom. You can apply again next year.
  - when: stat.smarts < 40
  - effect: stat.happiness -= 2
- outcome: 30
  - text: A letter with a law school crest. You are in.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - next: admit-law-school
- outcome: 70
  - text: Your application is rejected. The panel wants more legal experience than you have. You can apply again next year.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - effect: stat.happiness -= 3
- outcome: 55
  - text: The panel loves your essay. An offer comes back by return post.
  - when: stat.smarts >= 70
  - next: admit-law-school
- outcome: 45
  - text: Rejected, despite a good file. The competition was ferocious. Try again next year.
  - when: stat.smarts >= 70
  - effect: stat.happiness -= 3

## admit-law-school
- trigger: event
- icon: 📜
- chance: 0%
- text: Law school starts, with reading lists longer than your arm.
- opens: 0.04..0.07 per life

### outcomes
- outcome: 1
  - text: You enroll in law school. Three years of case law and cold calls start now.
  - effect: quality.grad_program = 2
  - effect: quality.grad_tuition = 2400000
  - effect: quality.grad_loan = false
  - effect: quality.grad_parents = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_debt = 0
  - effect: quality.grad_gpa = 50 + stat.smarts / 4
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)
  - effect: schedule(grad-school/graduate-law-school, after: 3-3 years)
  - effect: start_occupation(grad-school/grad-law-school)
  - effect: stat.happiness += 4
  - effect: journal("Admitted to law school at age {age}.")
  - next: grad-scholarship-offer

## apply-mba
- trigger: action
- menu: occupation/education
- label: Apply to business school (MBA)
- icon: 💼
- tags: education, apply
- when: age >= 22 and (quality.has_degree_business or quality.has_degree_engineering) and not in_group(school) and quality.grad_program == 0 and not quality.grad_degree_mba
- cooldown: 1
- text: The MBA program wants test scores, an essay and two references. Send an application?
- opens: 0.12..0.32 per life

### outcomes
- outcome: 10
  - text: An offer, and a note that they like your ambition more than your spreadsheet.
  - when: stat.smarts < 40
  - next: admit-mba
- outcome: 90
  - text: Rejected. Your test scores were not quite enough. You can apply again next year.
  - when: stat.smarts < 40
  - effect: stat.happiness -= 2
- outcome: 35
  - text: An acceptance email lands in your inbox at midnight. You are in.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - next: admit-mba
- outcome: 65
  - text: Rejected after a long wait. Round two is next year.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - effect: stat.happiness -= 3
- outcome: 60
  - text: The committee loved your case study. Admitted.
  - when: stat.smarts >= 70
  - next: admit-mba
- outcome: 40
  - text: Rejected despite a strong interview. Reapply next year.
  - when: stat.smarts >= 70
  - effect: stat.happiness -= 3

## admit-mba
- trigger: event
- icon: 💼
- chance: 0%
- text: The MBA program starts with a case study before breakfast.
- opens: 0.05..0.09 per life

### outcomes
- outcome: 1
  - text: You enroll in the MBA program. Two years of case studies and networking dinners start now.
  - effect: quality.grad_program = 3
  - effect: quality.grad_tuition = 2000000
  - effect: quality.grad_loan = false
  - effect: quality.grad_parents = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_debt = 0
  - effect: quality.grad_gpa = 50 + stat.smarts / 4
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)
  - effect: schedule(grad-school/graduate-mba-program, after: 2-2 years)
  - effect: start_occupation(grad-school/grad-mba-program)
  - effect: stat.happiness += 4
  - effect: journal("Admitted to business school (MBA) at age {age}.")
  - next: grad-scholarship-offer

## apply-phd
- trigger: action
- menu: occupation/education
- label: Apply to a PhD program
- icon: 🔬
- tags: education, apply
- when: age >= 22 and (quality.has_degree_business or quality.has_degree_engineering or quality.has_degree_nursing or quality.has_degree_arts) and not in_group(school) and quality.grad_program == 0 and not quality.grad_degree_phd
- cooldown: 1
- text: A PhD program wants a research statement, a writing sample and a professor willing to vouch for you. Send an application?
- opens: 0.08..0.22 per life

### outcomes
- outcome: 8
  - text: A lab with an empty desk and a bigger budget than you expected says yes.
  - when: stat.smarts < 40
  - next: admit-phd
- outcome: 92
  - text: The rejection says your research statement needed more research. You can apply again next year.
  - when: stat.smarts < 40
  - effect: stat.happiness -= 2
- outcome: 30
  - text: The department admits you to the PhD program. The stipend is small, but it is a stipend.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - next: admit-phd
- outcome: 70
  - text: Rejected. The department wants a clearer research question.
  - when: stat.smarts >= 40 and stat.smarts < 70
  - effect: stat.happiness -= 3
- outcome: 55
  - text: Your writing sample gets passed around the department. Admitted, with a stipend.
  - when: stat.smarts >= 70
  - next: admit-phd
- outcome: 45
  - text: Rejected by the one department you wanted. Try again next year.
  - when: stat.smarts >= 70
  - effect: stat.happiness -= 3

## admit-phd
- trigger: event
- icon: 🔬
- chance: 0%
- text: A PhD is five years of reading, failing and reading more.
- opens: 0.03..0.06 per life

### outcomes
- outcome: 1
  - text: You enroll in the PhD program. The stipend covers rent, roughly.
  - effect: quality.grad_program = 4
  - effect: quality.grad_tuition = 0
  - effect: quality.grad_loan = false
  - effect: quality.grad_parents = 0
  - effect: quality.grad_scholarship = 0
  - effect: quality.grad_debt = 0
  - effect: quality.grad_gpa = 50 + stat.smarts / 4
  - effect: schedule(grad-school/grad-year-review, after: 1-1 years)
  - effect: schedule(grad-school/graduate-phd-program, after: 5-5 years)
  - effect: start_occupation(grad-school/grad-phd-program)
  - effect: stat.happiness += 4
  - effect: journal("Admitted to a PhD program at age {age}.")
