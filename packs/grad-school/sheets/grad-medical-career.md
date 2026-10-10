# Content sheet: Grad medical career

- pack: grad-school
- packs: grad-school, core-loop
- profile: all
- lives: 1000

> Chain 6 of the grad-school pack (outline section 6), the doctor ladder: resident-doctor (medical degree and boards), attending-doctor after 3 years as a resident, chief-of-medicine after 6 years as an attending (rare).
> apply-residency is an action on activities/job-board with cooldown 1 (one application a year). Its match weight rises with smarts and grad_gpa, so it has expression weights and no rate bands.
> promote-attending is certain once the 3 years are served. promote-chief is a 1.5% yearly roll after 6 years as an attending and fires once per life, so the top rung stays rare.
> doctor-on-call-strain is a 30% yearly roll while in either doctor rung and adjusts stat.happiness only.
> opens are design estimates for the #231 run, widened for the action pick rate and the years-in-rung gates that the harness cannot hold fixed.

## apply-residency
> review: relationship(c1).closeness effect kept; scaffold reports it unknown (bug #300), core-loop uses it, so no needs line added.
- trigger: action
- menu: activities/job-board
- label: Apply for a medical residency
- icon: 🩺
- tags: job, apply
- when: quality.grad_degree_medical and quality.grad_licensed_medical and not in_group(school) and not in_group("full-time") and not hiring_blocked
- cooldown: 1
- text: Residency programs take new doctors every spring. You send applications across the country and wait by the phone.
- opens: 0.04..0.12 per life

### outcomes
- outcome: 20 + stat.smarts / 2 + quality.grad_gpa / 4
  - text: A program director calls with an offer. You start as a resident doctor, and your first shift is tomorrow. {c1.first_name} {c1.last_name} starts the same week and shows you where the good coffee is.
  - effect: start_occupation(grad-school/resident-doctor)
  - effect: schedule(grad-school/promote-attending, after: 3-3 years)
  - effect: spawn_person(core-loop/coworker, core-loop/coworker-gen) as c1
  - effect: relationship(c1).closeness += 10
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: stat.happiness += 4
  - effect: journal("Matched into a residency at age {age}.")
- outcome: 60
  - text: No program calls back this year. The rejection emails are polite and very short.
  - effect: stat.happiness -= 3

## promote-attending
- trigger: event
- icon: 🏥
- chance: 0%
- tags: job, promotion
- when: has_occupation(grad-school/resident-doctor) and years_in(grad-school/resident-doctor) >= 3
- text: Three years of thirty-hour weeks have left a mark. The chief of medicine calls you into the office.
- opens: 0.02..0.04 per life

### outcomes
- outcome: 1
  - text: You are an attending now, with your name on a door and a long list of people who want your time.
  - effect: start_occupation(grad-school/attending-doctor)
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: stat.happiness += 6
  - effect: journal("Promoted to attending doctor at age {age}.")
  - rate: 100..100%

## promote-chief
- trigger: event
- icon: 👑
- chance: 0.3%
- once: true
- tags: job, promotion
- when: has_occupation(grad-school/attending-doctor) and years_in(grad-school/attending-doctor) >= 6
- text: The hospital board wants a new face at the top, and your name keeps coming up in the meetings.
- opens: 0.005..0.012 per life

### outcomes
- outcome: 1
  - text: The board names you chief of medicine. The hospital is yours to run, along with every headache that comes with it.
  - effect: start_occupation(grad-school/chief-of-medicine)
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: stat.happiness += 8
  - effect: journal("Named chief of medicine at age {age}.")
  - rate: 100..100%

## doctor-on-call-strain
- trigger: event
- icon: 🌙
- chance: 30%
- tags: job, health
- when: has_occupation(grad-school/resident-doctor) or has_occupation(grad-school/attending-doctor)
- text: The pager goes off at 3am, and the night shift has no end in sight.
- opens: 0.06..0.15 per life

### outcomes
- outcome: 50
  - text: A run of thirty-hour shifts leaves you running on vending machine coffee and bad decisions.
  - effect: stat.happiness -= 3
  - rate: 45..55%
- outcome: 35
  - text: A patient you pulled through sends a handwritten card, and the ward feels a little less grim for a week.
  - effect: stat.happiness += 3
  - rate: 30..40%
- outcome: 15
  - text: The third night in a row ends with a death you could not prevent. The drive home is a blur.
  - effect: stat.happiness -= 6
  - rate: 10..20%
