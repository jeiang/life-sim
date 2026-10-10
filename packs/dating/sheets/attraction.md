# Content sheet: Attraction roll at birth

- pack: dating
- packs: dating
- profile: all
- lives: 1000

> Chain 1 of #239 (attraction and dating preference). Replaces the `chance: 100%` storylet `roll-attraction` (GAPS-RESOLVED item 5).
> The id stays `roll-attraction`: shipped content ids are permanent, so keeping it avoids a migration. Only its trigger changes.
> A hook cannot roll a weighted table, so the table stays here and the hook only queues it. In `packs/dating/pack.yaml`, `hooks.on_birth` gets one statement: `"schedule(dating/roll-attraction, after: 1-1 years)"`. `1-1 years` opens it at the first age-up (window of one age-up, certain roll), the same point the old `age >= 1` roll fired. Scheduled entries open outside the decision slots and the yearly cap.
> Hidden roll: no prose, nothing is journaled, so there is no `text`. The sheet grammar requires `text` on storylets and outcomes; see the open question in the hand-off, not a made-up line here.
> Three tables, selected by `player.gender`: male and female (each 100 weight across five outcomes) and unset or nonbinary (100 across five outcomes). Each outcome's `rate` is its share within its own table: `weight / 100`.
> NPCs do not use this storylet. Every generated person rolls the same table by their own gender at spawn through `spawn_qualities` in `pack.yaml`. Keep that table and this one in step; both are unchanged by this sheet.
> The player is never spawned, so the player's values stay 0 at `newLife` and are set at the first age-up.

## roll-attraction
- trigger: event
- chance: 0%
- when: age >= 1
- once: true
- opens: 0.95..1.00 per life

> Opened only by the `on_birth` schedule above, never by a chance roll. `once` is a safety: the schedule queues it once per life.

### outcomes
- outcome: 78
  - when: player.gender == "male"
  - effect: quality.dating_attracted_men = 4
  - effect: quality.dating_attracted_women = 92
  - effect: quality.dating_attracted_nonbinary = 12
  - rate: 78..78%
- outcome: 8
  - when: player.gender == "male"
  - effect: quality.dating_attracted_men = 90
  - effect: quality.dating_attracted_women = 6
  - effect: quality.dating_attracted_nonbinary = 15
  - rate: 8..8%
- outcome: 10
  - when: player.gender == "male"
  - effect: quality.dating_attracted_men = 60
  - effect: quality.dating_attracted_women = 65
  - effect: quality.dating_attracted_nonbinary = 20
  - rate: 10..10%
- outcome: 2
  - when: player.gender == "male"
  - effect: quality.dating_attracted_men = 8
  - effect: quality.dating_attracted_women = 10
  - effect: quality.dating_attracted_nonbinary = 70
  - rate: 2..2%
- outcome: 2
  - when: player.gender == "male"
  - effect: quality.dating_attracted_men = 3
  - effect: quality.dating_attracted_women = 3
  - effect: quality.dating_attracted_nonbinary = 3
  - rate: 2..2%
- outcome: 78
  - when: player.gender == "female"
  - effect: quality.dating_attracted_men = 92
  - effect: quality.dating_attracted_women = 4
  - effect: quality.dating_attracted_nonbinary = 12
  - rate: 78..78%
- outcome: 8
  - when: player.gender == "female"
  - effect: quality.dating_attracted_men = 6
  - effect: quality.dating_attracted_women = 90
  - effect: quality.dating_attracted_nonbinary = 15
  - rate: 8..8%
- outcome: 10
  - when: player.gender == "female"
  - effect: quality.dating_attracted_men = 65
  - effect: quality.dating_attracted_women = 60
  - effect: quality.dating_attracted_nonbinary = 20
  - rate: 10..10%
- outcome: 2
  - when: player.gender == "female"
  - effect: quality.dating_attracted_men = 10
  - effect: quality.dating_attracted_women = 8
  - effect: quality.dating_attracted_nonbinary = 70
  - rate: 2..2%
- outcome: 2
  - when: player.gender == "female"
  - effect: quality.dating_attracted_men = 3
  - effect: quality.dating_attracted_women = 3
  - effect: quality.dating_attracted_nonbinary = 3
  - rate: 2..2%
- outcome: 30
  - when: player.gender != "male" and player.gender != "female"
  - effect: quality.dating_attracted_men = 85
  - effect: quality.dating_attracted_women = 15
  - effect: quality.dating_attracted_nonbinary = 20
  - rate: 30..30%
- outcome: 30
  - when: player.gender != "male" and player.gender != "female"
  - effect: quality.dating_attracted_men = 15
  - effect: quality.dating_attracted_women = 85
  - effect: quality.dating_attracted_nonbinary = 20
  - rate: 30..30%
- outcome: 28
  - when: player.gender != "male" and player.gender != "female"
  - effect: quality.dating_attracted_men = 60
  - effect: quality.dating_attracted_women = 60
  - effect: quality.dating_attracted_nonbinary = 25
  - rate: 28..28%
- outcome: 6
  - when: player.gender != "male" and player.gender != "female"
  - effect: quality.dating_attracted_men = 20
  - effect: quality.dating_attracted_women = 20
  - effect: quality.dating_attracted_nonbinary = 85
  - rate: 6..6%
- outcome: 6
  - when: player.gender != "male" and player.gender != "female"
  - effect: quality.dating_attracted_men = 3
  - effect: quality.dating_attracted_women = 3
  - effect: quality.dating_attracted_nonbinary = 3
  - rate: 6..6%
