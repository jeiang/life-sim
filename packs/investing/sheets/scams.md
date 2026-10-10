# Content sheet: Investment scams

- pack: investing
- packs: investing, core-loop
- profile: all
- lives: 1000

> Chain C3 `scams` (issue #232, decision 6). Three decision events that offer a fake investment and usually take money. They share one shape: a 10% stake, a 40% stake, "look into it", and "walk away".
> Entry: age 18+, cash of $500 or more (50000 minor units). Weight `max(1, 2 + (100 - smarts) / 15 - invest_scams)` (archive v1, unchanged): likelier at low smarts, less likely after each loss. 4-year cooldown per storylet.
> Frequency: archive v1 measured about 2.26 offers per life for all three together across all profiles, so about 0.75 each. The opens bands are that figure widened about 20%. Not measured for this pack yet (#233 and #234).
> Odds: a stake that is lost is lost in full. A stake that pays out returns 20% of the stake (`money / 50` for 10%, `money * 2 / 25` for 40%). "Look into it" spots the scam with weight `stat.smarts` and falls for it with weight `100 - stat.smarts`, losing a tenth.
> Rate bands for the loss and win splits cover smarts 0 to 100 (the weights sum to 100 at every smarts value). The "look into it" split depends on smarts across its whole range, so it has no rate.
> Balance note: at these settings a `random` player loses about 1.2 scams per life (archive v1: 1.18). That misses the archive target of under 1, which is not in the #232 acceptance. Decide in #234 whether to cut the weight or the stakes.
> Tags: `wager` marks money at risk, so the harness reports the realised return of each scam.

## ponzi-scheme
- trigger: event
- icon: 🕴️
- weight: max(1, 2 + (100 - stat.smarts) / 15 - quality.invest_scams)
- when: age >= 18 and money >= 50000
- cooldown: 4
- tags: investing, scam, wager
- needs: quality invest_scams: integer 0.., default 0: scams the player has lost money to; each one lowers the weight of the next offer
- text: An acquaintance pitches you a members-only fund that pays 20% a month. Everyone in the room is investing.
- opens: 0.6..0.9 per life

### choice: Put in 10% of your savings
- outcome: 85 + (100 - stat.smarts) / 10
  - text: The fund collapses. The organisers are gone and so is the money.
  - effect: money -= money / 10
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 6
  - effect: journal("Lost money to a Ponzi scheme at age {age}.")
  - rate: 85..95%
- outcome: 15 - (100 - stat.smarts) / 10
  - text: The first payouts arrive on time and you pull out early with a profit. Later the scheme collapses around everyone else.
  - effect: money += money / 50
  - effect: journal("Got out of a Ponzi scheme in time at age {age}.")
  - rate: 5..15%

### choice: Go all in with 40% of your savings
- outcome: 85 + (100 - stat.smarts) / 10
  - text: The fund collapses. The organisers are gone and so is the money.
  - effect: money -= money * 2 / 5
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 10
  - effect: journal("Lost money to a Ponzi scheme at age {age}.")
  - rate: 85..95%
- outcome: 15 - (100 - stat.smarts) / 10
  - text: The first payouts arrive on time and you pull out early with a profit. Later the scheme collapses around everyone else.
  - effect: money += money * 2 / 25
  - effect: journal("Got out of a Ponzi scheme in time at age {age}.")
  - rate: 5..15%

### choice: Look into it first
- outcome: stat.smarts
  - text: You ask for the licence and the audited accounts. There are none, and you walk away.
  - effect: stat.smarts += 1
- outcome: 100 - stat.smarts
  - text: You cannot find anything wrong, and the glossy brochure wins you over. You lose a tenth of your savings before you realise.
  - effect: money -= money / 10
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 6
  - effect: journal("Lost money to a Ponzi scheme at age {age}.")

### choice: Walk away
- outcome: 1
  - text: You decline, and the offer goes to someone else.
  - rate: 100..100%

## fake-coin
- trigger: event
- icon: 🪙
- weight: max(1, 2 + (100 - stat.smarts) / 15 - quality.invest_scams)
- when: age >= 18 and money >= 50000
- cooldown: 4
- tags: investing, scam, wager
- text: A stranger online tells you a brand-new coin, MoonPaw, will be worth a hundred times more by spring.
- opens: 0.6..0.9 per life

### choice: Put in 10% of your savings
- outcome: 85 + (100 - stat.smarts) / 10
  - text: The coin's makers drain the pool overnight. The coin is worth nothing.
  - effect: money -= money / 10
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 6
  - effect: journal("Lost money to a fake coin at age {age}.")
  - rate: 85..95%
- outcome: 15 - (100 - stat.smarts) / 10
  - text: The coin spikes the same week and you sell near the top before it collapses.
  - effect: money += money / 50
  - effect: journal("Sold a fake coin before it collapsed at age {age}.")
  - rate: 5..15%

### choice: Go all in with 40% of your savings
- outcome: 85 + (100 - stat.smarts) / 10
  - text: The coin's makers drain the pool overnight. The coin is worth nothing.
  - effect: money -= money * 2 / 5
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 10
  - effect: journal("Lost money to a fake coin at age {age}.")
  - rate: 85..95%
- outcome: 15 - (100 - stat.smarts) / 10
  - text: The coin spikes the same week and you sell near the top before it collapses.
  - effect: money += money * 2 / 25
  - effect: journal("Sold a fake coin before it collapsed at age {age}.")
  - rate: 5..15%

### choice: Look into it first
- outcome: stat.smarts
  - text: The token contract is a copy of a scam you read about last year. You skip it.
  - effect: stat.smarts += 1
- outcome: 100 - stat.smarts
  - text: The website looks professional and the chat is full of happy investors. You lose a tenth of your savings before you realise.
  - effect: money -= money / 10
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 6
  - effect: journal("Lost money to a fake coin at age {age}.")

### choice: Walk away
- outcome: 1
  - text: You decline, and the offer goes to someone else.
  - rate: 100..100%

## guaranteed-returns
- trigger: event
- icon: ☎️
- weight: max(1, 2 + (100 - stat.smarts) / 15 - quality.invest_scams)
- when: age >= 18 and money >= 50000
- cooldown: 4
- tags: investing, scam, wager
- text: A caller from an "investment bureau" offers you guaranteed 15% returns, but only if you decide today.
- opens: 0.6..0.9 per life

### choice: Put in 10% of your savings
- outcome: 85 + (100 - stat.smarts) / 10
  - text: The bureau stops answering the phone. The money is gone.
  - effect: money -= money / 10
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 6
  - effect: journal("Lost money to a boiler-room caller at age {age}.")
  - rate: 85..95%
- outcome: 15 - (100 - stat.smarts) / 10
  - text: A first statement arrives showing a gain, and you withdraw some profit before the line goes dead.
  - effect: money += money / 50
  - effect: journal("Took profit from a boiler-room scheme just in time at age {age}.")
  - rate: 5..15%

### choice: Go all in with 40% of your savings
- outcome: 85 + (100 - stat.smarts) / 10
  - text: The bureau stops answering the phone. The money is gone.
  - effect: money -= money * 2 / 5
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 10
  - effect: journal("Lost money to a boiler-room caller at age {age}.")
  - rate: 85..95%
- outcome: 15 - (100 - stat.smarts) / 10
  - text: A first statement arrives showing a gain, and you withdraw some profit before the line goes dead.
  - effect: money += money * 2 / 25
  - effect: journal("Took profit from a boiler-room scheme just in time at age {age}.")
  - rate: 5..15%

### choice: Look into it first
- outcome: stat.smarts
  - text: A guaranteed return is not a thing. You hang up and report the number.
  - effect: stat.smarts += 1
- outcome: 100 - stat.smarts
  - text: The caller knows your name and your bank, and sounds so sure that you are convinced. You lose a tenth of your savings before you realise.
  - effect: money -= money / 10
  - effect: quality.invest_scams += 1
  - effect: stat.happiness -= 6
  - effect: journal("Lost money to a boiler-room caller at age {age}.")

### choice: Walk away
- outcome: 1
  - text: You decline, and the offer goes to someone else.
  - rate: 100..100%
