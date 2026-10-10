# Content sheet: Grad school law career

- pack: grad-school
- packs: grad-school, core-loop
- profile: all
- lives: 10000

> Chain 7 (grad-law-career). Lawyer ladder: associate-lawyer (apply, needs law degree and bar pass), then partner-lawyer (scheduled 4 years after hire), then a rare judge offer (partner only, once per life).
> Occupation ids are full ids (grad-school/...) as in the outline's chain 1 and 2 notation.
> Chance is a percent literal in this grammar, so the judge offer's smarts dependence is written as outcome weights: offer weight stat.smarts, passed-over weight 100 - stat.smarts. The two weights always sum to 100, so the offer share of a firing is stat.smarts / 100. No rate is given for those two outcomes, because the weights are expressions.
> Frequency design (estimates from the outline's upstream targets, not measured): law enrolment ~5% of lives x 75% completion x ~90% bar pass gives ~3.5% of lives licensed. Hire is 75% per application (3 to 1), so associates are ~3.3% of lives, a little under the outline's ~4%; #231 may tune. Partner-track is scheduled 4 years after hire (mandatory-event rule in GAPS-RESOLVED), so partners are ~3% of lives. Judge: the first firing decides the cap (either outcome sets grad_judge_offered), 5% per eligible partner year, so P(fires) = 1-0.95^15 = ~54% over ~15 years, times smarts/100 for the offer. At smarts 50 that is ~27% of partners, so judge ~0.7% of lives, a little under the ~1% target.
> The `opens` bands below are design estimates widened about 20 to 30 percent. They are checked by focused-sim after scaffold.
> Outcome `rate` is exact (75% and 25%) where the weights are constant.
> `spawn_person(core-loop/coworker, core-loop/coworker-gen)` follows the outline. core-loop/coworker-gen is not in the VOCAB.md listing; see the reviewer questions in the hand-off.

## apply-associate-lawyer
- trigger: action
- menu: activities/job-board
- label: Apply as an associate lawyer
- icon: 📄
- tags: job, apply
- when: quality.grad_degree_law and quality.grad_licensed_law and not in_group(school) and not in_group("full-time") and not hiring_blocked
- cooldown: 1
- text: A mid-sized law firm is taking applications for associates.
- opens: 0.03..0.06 per life

### outcomes
- outcome: 3
  - text: The partners like your moot court answers and offer you an associate's chair.
  - effect: start_occupation(grad-school/associate-lawyer)
  - effect: spawn_person(core-loop/coworker, core-loop/coworker-gen) as c1
  - effect: schedule(grad-school/partner-track, after: 4-4 years)
  - effect: journal("You start as an associate at a law firm.")
  - rate: 75..75%
- outcome: 1
  - text: They go with a candidate who clerked for a federal judge. Maybe next year.
  - rate: 25..25%

## partner-track
- trigger: event
- icon: ⚖️
- tags: job, promotion
- chance: 0%
- when: has_occupation(grad-school/associate-lawyer) and years_in(grad-school/associate-lawyer) >= 4
- text: The managing partner calls {player.first_name} into a corner office.
- opens: 0.02..0.035 per life

### outcomes
- outcome: 1
  - text: You make partner, and the letterhead gets your name.
  - effect: start_occupation(grad-school/partner-lawyer)
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - rate: 100..100%

## judge-offer
- trigger: event
- icon: ⚖️
- tags: job, promotion
- chance: 5%
- when: has_occupation(grad-school/partner-lawyer) and years_in(grad-school/partner-lawyer) >= 2 and not quality.grad_judge_offered
- text: A state judicial nominating committee wants a word with {player.first_name}.
- opens: 0.01..0.02 per life

### outcomes
- outcome: stat.smarts
  - text: They want you on the bench. The robe fits better than you expected.
  - effect: start_occupation(grad-school/judge)
  - effect: quality.grad_judge_offered = true
  - effect: quality.times_promoted += 1
  - effect: quality.raise_bonus = 0
  - effect: quality.work_effort = 0
  - effect: journal("The governor appoints you a judge.")
- outcome: 100 - stat.smarts
  - text: The committee asks about your availability, then never calls back.
  - effect: quality.grad_judge_offered = true
