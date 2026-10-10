# Content sheet: Gambling sample

- pack: gambling
- packs: gambling
- profile: gambler
- lives: 60

> Fixture for the focused-sim test: two real gambling storylets with expected rates.

## hot-tip
- trigger: event
- weight: 5
- when: age >= 18 and money >= 10000
- cooldown: 4
- text: A guy at the bar swears he has a sure thing in the fourth race.
- opens: 1.0..1.8 per life

### choice: Back the tip (stake about 10% of your cash)
- outcome: 25
  - text: The horse romps home.
  - effect: stat.happiness += 3
  - rate: 15..35%
- outcome: 75
  - text: It was never a sure thing.
  - effect: stat.happiness -= 2
  - rate: 65..85%

### choice: Ignore him
- outcome: 1
  - text: There are no sure things.
  - effect: stat.smarts += 1

## play-slots
- trigger: action
- menu: activities/casino
- label: Play the slots
- repeatable: true
- text: Rows of flashing machines.
- opens: 15..30 per life

### outcomes
- outcome: 10
  - text: JACKPOT!
  - effect: stat.happiness += 3
- outcome: 100
  - text: Three of a kind.
  - effect: stat.happiness += 3
- outcome: 400
  - text: A good line pays out.
  - effect: stat.happiness += 3
- outcome: 1200
  - text: Two matching symbols and a small payout.
  - effect: stat.happiness += 3
- outcome: 1600
  - text: The reels line up and give you your money back.
  - effect: stat.happiness += 1
  - rate: 12..20%
- outcome: 6690
  - text: The reels stop on nothing in particular.
  - effect: stat.happiness -= 1
  - rate: 60..74%
