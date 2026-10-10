# Content sheet: MBA business career

- pack: grad-school
- packs: core-loop, grad-school
- profile: scholar
- lives: 3000

> Chain 8 of grad-school (issue #230). The MBA ladder: apply-business-manager (action) -> business-manager-interview (chance 0% chain step) -> business-manager-result (chain step, hire or reject). Five years as business-manager can open ceo-offer (rare, once per life).
> Apply mirrors core apply-* gates: not in_group("full-time") and not hiring_blocked. Entry is quality.grad_degree_mba and not in_group(school).
> Interview scoring: one question, quality.interview_score ends at 0..2. Hire weight 30 + score * 15 + smarts / 4; reject weight 50 - score * 10, so reject never goes negative.
> Quit and retire for grad rungs are handled generically in core-loop (#298), so this sheet has no quit storylet.

## apply-business-manager
- trigger: action
- menu: activities/job-board
- label: Apply for a business manager job
- tags: job, apply
- cooldown: 1
- when: quality.grad_degree_mba and not in_group(school) and not in_group("full-time") and not hiring_blocked
- text: You dust off the MBA, tailor your resume, and send it to every company with a corner office.
- opens: 0.06..0.16 per life

### outcomes
- outcome: 1
  - text: The application is in. Now you wait for someone to call back.
  - effect: quality.interview_score = 0
  - next: business-manager-interview
  - rate: 100..100%

## business-manager-interview
- trigger: event
- chance: 0%
- text: The hiring manager leans back. "Tell me about a time you made a call with incomplete numbers."
- opens: 0.06..0.16 per life

### choice: Walk them through the model you built
- outcome: 60
  - text: You explain the model cleanly. They nod, and they write something down.
  - effect: quality.interview_score += 2
  - next: business-manager-result
  - rate: 58..62%
- outcome: 40
  - text: You explain it, but you skip the part where it nearly failed. They notice.
  - effect: quality.interview_score += 1
  - next: business-manager-result
  - rate: 38..42%

### choice: Admit you have never run a team
- outcome: 50
  - text: You say so plainly. They respect the honesty, and they write something down.
  - effect: quality.interview_score += 1
  - next: business-manager-result
  - rate: 48..52%
- outcome: 50
  - text: You ramble. The silence after your answer is very long.
  - next: business-manager-result
  - rate: 48..52%

## business-manager-result
- trigger: event
- chance: 0%
- text: A week later your phone rings.
- opens: 0.06..0.16 per life

### outcomes
- outcome: 30 + quality.interview_score * 15 + stat.smarts / 4
  - text: They want you. The title has "Manager" in it, and the salary has a comma.
  - effect: start_occupation(grad-school/business-manager)
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: spawn_person(core-loop/coworker, core-loop/coworker-gen) as c1
  - effect: spawn_person(core-loop/coworker, core-loop/coworker-gen) as c2
  - effect: stat.happiness += 4
  - effect: journal("You got the business manager job.")
- outcome: 50 - quality.interview_score * 10
  - text: They thank you for your time. It is the coldest email you have ever read.
  - effect: stat.happiness -= 2
  - effect: journal("The business manager job went to someone else.")

## ceo-offer
- trigger: event
- icon: 🏢
- chance: 0.3%
- once: true
- tags: job, promotion
- when: has_occupation(grad-school/business-manager) and years_in(grad-school/business-manager) >= 5
- text: The board chair asks to see you. Her office smells like money and carpet cleaner.
- opens: 0.005..0.012 per life

### outcomes
- outcome: 1
  - text: She offers you the top job. You take a long breath and say yes.
  - effect: start_occupation(grad-school/ceo)
  - effect: quality.times_promoted += 1
  - effect: stat.happiness += 6
  - effect: journal("The board named you CEO.")
  - rate: 100..100%
