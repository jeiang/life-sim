# Content sheet: Property crime

- pack: crime
- packs: crime,core-loop,karma
- profile: all
- lives: 3000

> Outline section 1 (issue #235, grill #58 comment 6019451457): six non-repeatable property crimes, each an action in `activities/crime`, `once` per life, `cooldown: 1` as the outline asks.
> Success pays money (minor units) and costs karma. Caught is a weighted outcome that sets the `crime_pending_charge` mailbox to a charge code: 1 petty (shoplift, pickpocket), 2 serious (steal a car, burglary, scam), 3 violent (armed robbery). Producers write the mailbox and never read it, so a later catch overwrites an earlier code. The `arrest` chain reads it, so no crime chains with `next`.
> Caught weight is the crime's base (shoplift 22, pickpocket 26, steal a car 30, burglary 32, scam 32, armed robbery 48) plus 10 for a record and 10 for parole, minus smarts divided by a crime divisor (6, 6, 8, 8, 4, 10), floored at 1. The `rate` bands assume a typical player: smarts 50, no record, not on parole. A record or parole raises the caught share by about 10 weight points each; the band is wide enough for that.
> Frequency: outline proposes about 1 in 4 lives commit at least one property crime. The six `opens` bands sum to about 0.3 per life, which gives roughly that share under once-per-life gating [INFERENCE]; not measured against the 3% storylet cap.
> Entry: age gates 12+ (shoplift, pickpocket), 14+ (steal a car, burglary), 16+ (scam, armed robbery); `not confined` (custody locks the menu anyway).

## shoplift
- trigger: action
- icon: 🛒
- menu: activities/crime
- label: Shoplift
- tags: crime
- when: age >= 12 and not confined
- once: true
- cooldown: 1
- text: The corner shop has one bored clerk and a lot of small, expensive things.
- opens: 0.07..0.12 per life
- needs: tag crime: string tag: groups the crime storylets; no engine effect
- needs: menu activities/crime: submenu under activities: holds the six property-crime actions
- needs: quality crime_on_parole: flag, default false: set by parole-and-release while the player is out on parole; raises the caught weight of the property crimes

### outcomes
- outcome: 55
  - text: You slip a few things under your coat and walk out. Worth about $60.
  - effect: money += 6000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 44..52%
- outcome: 45
  - text: You grab more than you planned, close to $150 of goods.
  - effect: money += 15000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 36..44%
- outcome: max(1, 22 + (quality.crime_record ? 10 : 0) + (quality.crime_on_parole ? 10 : 0) - stat.smarts / 6)
  - text: A security guard grabs your arm at the door and calls the police.
  - effect: quality.karma_score += -3
  - effect: quality.crime_pending_charge = 1
  - rate: 9..16%

## pickpocket
- trigger: action
- icon: 👛
- menu: activities/crime
- label: Pick pockets
- tags: crime
- when: age >= 12 and not confined
- once: true
- cooldown: 1
- text: A crowded market is a good place to lighten someone's load.
- opens: 0.05..0.09 per life

### outcomes
- outcome: 60
  - text: A loose pocket in the crush. You come away with $80.
  - effect: money += 8000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 46..56%
- outcome: 40
  - text: A fat wallet with $250 in cash, and nobody sees a thing.
  - effect: money += 25000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 29..38%
- outcome: max(1, 26 + (quality.crime_record ? 10 : 0) + (quality.crime_on_parole ? 10 : 0) - stat.smarts / 6)
  - text: A hand closes on your wrist. It belongs to an off-duty officer.
  - effect: quality.karma_score += -3
  - effect: quality.crime_pending_charge = 1
  - rate: 12..19%

## steal-a-car
- trigger: action
- icon: 🚗
- menu: activities/crime
- label: Steal a car
- tags: crime
- when: age >= 14 and not confined
- once: true
- cooldown: 1
- text: A row of cars sits with spare keys in the visor and nobody is watching.
- opens: 0.03..0.06 per life

### outcomes
- outcome: 70
  - text: You hot-wire it and sell it on for $4,000.
  - effect: money += 400000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 52..61%
- outcome: 30
  - text: A nice one. The fence pays $9,000.
  - effect: money += 900000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 20..28%
- outcome: max(1, 30 + (quality.crime_record ? 10 : 0) + (quality.crime_on_parole ? 10 : 0) - stat.smarts / 8)
  - text: A patrol car pulls in behind you at the first red light.
  - effect: quality.karma_score += -3
  - effect: quality.crime_pending_charge = 2
  - rate: 15..24%

## burglary
- trigger: action
- icon: 🏠
- menu: activities/crime
- label: Burgle a house
- tags: crime
- when: age >= 14 and not confined
- once: true
- cooldown: 1
- text: The house on the corner has its lights off and its back gate unlatched. Probably on purpose.
- opens: 0.03..0.05 per life

### outcomes
- outcome: 65
  - text: You find jewelry and cash. The fence pays $2,500.
  - effect: money += 250000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 47..56%
- outcome: 35
  - text: A big score: electronics and a safe. $7,000.
  - effect: money += 700000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 23..32%
- outcome: max(1, 32 + (quality.crime_record ? 10 : 0) + (quality.crime_on_parole ? 10 : 0) - stat.smarts / 8)
  - text: An alarm you did not see starts blaring, and the street fills with lights.
  - effect: quality.karma_score += -3
  - effect: quality.crime_pending_charge = 2
  - rate: 16..26%

## fraud
- trigger: action
- icon: 💳
- menu: activities/crime
- label: Run a scam
- tags: crime
- when: age >= 16 and not confined
- once: true
- cooldown: 1
- text: Fake invoices, and phone calls to people too polite to hang up.
- opens: 0.02..0.04 per life

### outcomes
- outcome: 60
  - text: A fake invoice goes through. $6,000 lands in your account.
  - effect: money += 600000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 46..54%
- outcome: 40
  - text: A phone call sweet-talks a stranger into sending $15,000.
  - effect: money += 1500000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 29..37%
- outcome: max(1, 32 + (quality.crime_record ? 10 : 0) + (quality.crime_on_parole ? 10 : 0) - stat.smarts / 4)
  - text: The bank flags the transfer, and a fraud investigator starts reading your file.
  - effect: quality.karma_score += -3
  - effect: quality.crime_pending_charge = 2
  - rate: 13..21%

## armed-robbery
- trigger: action
- icon: 🔫
- menu: activities/crime
- label: Rob a store
- tags: crime
- when: age >= 16 and not confined
- once: true
- cooldown: 1
- text: The corner store is quiet and the clerk looks tired. That is the plan.
- opens: 0.01..0.02 per life

### outcomes
- outcome: 70
  - text: The till gives you $3,500, and you are gone in under a minute.
  - effect: money += 350000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 45..53%
- outcome: 30
  - text: The safe was open. $9,000.
  - effect: money += 900000
  - effect: quality.karma_score += -3
  - effect: stat.happiness += 1
  - rate: 17..25%
- outcome: max(1, 48 + (quality.crime_record ? 10 : 0) + (quality.crime_on_parole ? 10 : 0) - stat.smarts / 10)
  - text: The clerk hits a silent alarm, and police cars box you in.
  - effect: quality.karma_score += -3
  - effect: quality.crime_pending_charge = 3
  - rate: 26..35%
