# Content sheet: Academic career

- pack: grad-school
- packs: core-loop, grad-school
- profile: scholar
- lives: 3000

> Chain 9, the professor ladder: postdoc (apply, then one interview step), assistant professor (2 years served), associate professor (4 years served), full professor (5 years served, then a yearly tenure review).
> Ladder years are years served in the rung, as in the OUTLINE table. Each promotion is a chance event with `once: true`, so a life climbs each rung at most once.
> `chance` is a literal in this grammar, so the smarts dependence sits in outcome weights, the same way core's interview chain does it.
> Rates on weight-expression outcomes are quoted for a mid-band smarts of about 60. Lint can check constant weights only.
> `opens` basis: PhD graduates are about 3% of lives (PhD entry 3-5% times completion about 75%), and postdocs are targeted at about 3% of lives. The top rung is rare, so the sheet is measured on 3000 lives.
> The postdoc interview is one `next` step, not core's two-question chain. Its hire outcome spawns a coworker through `coworker-gen`. Rejected applicants reapply next year (`cooldown: 1`).
> The outline's `grad_gpa` term is dropped: chain 2 resets `grad_gpa` at graduation, and the postdoc and tenure steps both come after that, so only smarts is read here.

## apply-postdoc
- trigger: action
- menu: activities/job-board
- label: Apply for a postdoc
- icon: 🔬
- tags: job, apply
- when: quality.grad_degree_phd and not in_group(school) and not in_group("full-time") and not hiring_blocked
- cooldown: 1
- text: A university lab has a two-year postdoc open and wants someone who can finish a project.
- opens: 0.04..0.09 per life

### outcomes
- outcome: 1
  - text: You send in your application and get asked to come in and present your research.
  - next: postdoc-interview
  - rate: 100..100%

## postdoc-interview
- trigger: event
- chance: 0%
- text: The lab's principal investigator skims your CV and asks what you would do with two years of funding.
- opens: 0.04..0.09 per life

### outcomes
- outcome: 30 + stat.smarts / 2
  - text: The lab offers you the postdoc, and you start on Monday.
  - effect: start_occupation(grad-school/postdoc)
  - effect: spawn_person(core-loop/coworker, core-loop/coworker-gen) as c1
  - effect: stat.happiness += 5
  - effect: journal("Started a postdoc position at age {age}.")
  - rate: 55..75%
- outcome: 50 - stat.smarts / 4
  - text: The committee goes with a candidate who already has more papers out.
  - effect: stat.happiness -= 3
  - rate: 25..45%

## promote-assistant-professor
- trigger: event
- icon: 📈
- tags: job, promotion
- chance: 40%
- once: true
- when: has_occupation(grad-school/postdoc) and years_in(grad-school/postdoc) >= 2
- text: Your principal investigator wants to talk about your next step.
- opens: 0.015..0.035 per life

### outcomes
- outcome: 1
  - text: The lab gives you a faculty title and a bigger office. You are now an assistant professor.
  - effect: start_occupation(grad-school/assistant-professor)
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: stat.happiness += 6
  - effect: journal("Promoted to assistant professor at age {age}.")
  - rate: 100..100%

## promote-associate-professor
- trigger: event
- icon: 📈
- tags: job, promotion
- chance: 35%
- once: true
- when: has_occupation(grad-school/assistant-professor) and years_in(grad-school/assistant-professor) >= 4
- text: The department chair asks whether you are ready to run a lab of your own.
- opens: 0.012..0.03 per life

### outcomes
- outcome: 1
  - text: The department names you associate professor, with a lab, a budget and a tenure clock.
  - effect: start_occupation(grad-school/associate-professor)
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: stat.happiness += 6
  - effect: journal("Promoted to associate professor at age {age}.")
  - rate: 100..100%

## tenure-review
- trigger: event
- icon: 📚
- tags: job, promotion
- chance: 1%
- when: has_occupation(grad-school/associate-professor) and years_in(grad-school/associate-professor) >= 5
- text: The tenure committee meets again this spring, and your file is on the agenda.
- opens: 0.005..0.02 per life

### outcomes
- outcome: 1 + stat.smarts / 30
  - text: The committee grants you tenure, and the title of full professor comes with it.
  - effect: start_occupation(grad-school/full-professor)
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: stat.happiness += 10
  - effect: journal("Granted tenure as a full professor at age {age}.")
  - rate: 15..35%
- outcome: 9
  - text: The committee wants one more year of papers, so the answer is not yet.
  - effect: stat.happiness -= 2
  - rate: 65..85%
