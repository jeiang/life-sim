# Content sheet: Insider tips

- pack: investing
- packs: investing,core-loop
- profile: all
- lives: 1000

> Chain C2 (issue #232, grilled decision 5): a relative or friend occasionally whispers a tip about a kind that will rise 20% or more.
> Acting on it records `invest_insider_age`. Nothing reads that quality in this pack; the crime bridge (#58, #103) is later.
> Kinds: the six kinds whose forecast can reach 20%. Left out on purpose: the two bond funds and the two government bonds (vol 1 to 6%, so a 20% year is out of reach), and the two penny stocks (a delist or jump can override the forecast, so a 20% rise is not guaranteed). Deviation from the archive's eight-kind list; confirm with the owner.
> Holding gate (outline entry): the player must hold at least one of the six listed kinds (`units(k) > 0`). The tip itself is weighted by forecast, so it can name any listed kind that is forecast to rise 20% or more.
> The forecast is the stored next-year return including jump, crash and beta, so a tip with forecast over 2000 bps rises 20% or more by construction (target 90%).
> Weights: `min(20, max(0, (forecast - 2000) / 100))` per kind, so a kind with a 40% forecast is weighted 20 and one at 22% is weighted 2.
> Once per source per year (decision 4): the gate reads `person.quality.invest_tip_age < age`. C1 (source-tips) stamps it when a source gives a tip; each offer here stamps it as well, so the gate holds even if C1 does not.
> Event `opens` is about 0.07 per life (archive v1 target); the chance `0.1%` is calibrated against about 75 eligible source-years per life. Recalibrate with focused-sim.
> Outcome `rate` is omitted on the event: the weights are forecasts, so the share is not constant. The chain choices carry `rate`.


## insider-tip
- trigger: event
- icon: 🤫
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/friend
- chance: 0.1%
- tags: money, relationship
- when: age >= 18 and person.age >= 25 and person.quality.invest_tip_age < age and (units(investing/total-market) > 0 or units(investing/world-index) > 0 or units(investing/acme-robotics) > 0 or units(investing/northwind-foods) > 0 or units(investing/lumen-energy) > 0 or units(investing/quark-coin) > 0) and (forecast(investing/total-market) > 2000 or forecast(investing/world-index) > 2000 or forecast(investing/acme-robotics) > 2000 or forecast(investing/northwind-foods) > 2000 or forecast(investing/lumen-energy) > 2000 or forecast(investing/quark-coin) > 2000)
- text: {person.first_name} pulls you aside at the next family gathering and drops their voice.
- opens: 0.04..0.10 per life
- needs: quality invest_insider_age: int 0.., default 0: age the player acted on an insider tip, written by this chain
- needs: quality invest_tip_age: int 0.., default 0, scope person: last age a source tipped the player, stamped by each offer here and by source-tips (C1); read here
- needs: readable person.age: int: the bound source's age (the spec lists it as readable under scope person; confirm it is declared and do not duplicate)

### outcomes
- outcome: min(20, max(0, (forecast(investing/total-market) - 2000) / 100))
  - when: forecast(investing/total-market) > 2000
  - effect: person.quality.invest_tip_age = age
  - text: The total market fund is about to rip. Put what you can spare into it, and don't ask how I know.
  - next: insider-total-market
- outcome: min(20, max(0, (forecast(investing/world-index) - 2000) / 100))
  - when: forecast(investing/world-index) > 2000
  - effect: person.quality.invest_tip_age = age
  - text: The world index fund is due a big year. Quietly, mind you.
  - next: insider-world-index
- outcome: min(20, max(0, (forecast(investing/acme-robotics) - 2000) / 100))
  - when: forecast(investing/acme-robotics) > 2000
  - effect: person.quality.invest_tip_age = age
  - text: Acme Robotics is about to take off. Someone in their finance office owes me a favor, so trust me on this.
  - next: insider-acme-robotics
- outcome: min(20, max(0, (forecast(investing/northwind-foods) - 2000) / 100))
  - when: forecast(investing/northwind-foods) > 2000
  - effect: person.quality.invest_tip_age = age
  - text: Northwind Foods has a contract coming through. It is going to be big, and it is going to be soon.
  - next: insider-northwind-foods
- outcome: min(20, max(0, (forecast(investing/lumen-energy) - 2000) / 100))
  - when: forecast(investing/lumen-energy) > 2000
  - effect: person.quality.invest_tip_age = age
  - text: Lumen Energy is about to jump. The board is not telling anyone yet, so you did not hear it from me.
  - next: insider-lumen-energy
- outcome: min(20, max(0, (forecast(investing/quark-coin) - 2000) / 100))
  - when: forecast(investing/quark-coin) > 2000
  - effect: person.quality.invest_tip_age = age
  - text: Quark Coin is about to go parabolic. Get in before the news does.
  - next: insider-quark-coin

## insider-total-market
- trigger: event
- icon: 📈
- chance: 0%
- text: Acting on an inside tip about the Total Market Index Fund is not quite legal. It is also a very good tip.
- opens: 0.003..0.007 per life

### choice: Back it with 40% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put 40% of your cash into the Total Market Index Fund and try not to think about it.
  - effect: trade(investing/total-market, money * 2 / 5)
  - effect: quality.invest_insider_age = age
  - effect: journal("Acted on an insider tip about the Total Market Index Fund.")
  - rate: 100..100%

### choice: Pass
- outcome: 1
  - text: You let it go. Some tips are better left alone.
  - rate: 100..100%

## insider-world-index
- trigger: event
- icon: 📈
- chance: 0%
- text: Acting on an inside tip about the World Index Fund is not quite legal. The tip is about as clean as these things get.
- opens: 0.002..0.005 per life

### choice: Back it with 40% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put 40% of your cash into the World Index Fund and wait for the good news.
  - effect: trade(investing/world-index, money * 2 / 5)
  - effect: quality.invest_insider_age = age
  - effect: journal("Acted on an insider tip about the World Index Fund.")
  - rate: 100..100%

### choice: Pass
- outcome: 1
  - text: You let it go. Some tips are better left alone.
  - rate: 100..100%

## insider-acme-robotics
- trigger: event
- icon: 🤖
- chance: 0%
- text: Acting on an inside tip about Acme Robotics is not quite legal. Nobody has ever said that to your face and meant it.
- opens: 0.010..0.024 per life

### choice: Back it with 40% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put 40% of your cash into Acme Robotics and try not to refresh the price every five minutes.
  - effect: trade(investing/acme-robotics, money * 2 / 5)
  - effect: quality.invest_insider_age = age
  - effect: journal("Acted on an insider tip about Acme Robotics.")
  - rate: 100..100%

### choice: Pass
- outcome: 1
  - text: You let it go. Some tips are better left alone.
  - rate: 100..100%

## insider-northwind-foods
- trigger: event
- icon: 🥫
- chance: 0%
- text: Acting on an inside tip about Northwind Foods is not quite legal. Everyone in the room seemed to know, so maybe it is not much of a secret.
- opens: 0.003..0.008 per life

### choice: Back it with 40% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put 40% of your cash into Northwind Foods and start planning what to do with the profit.
  - effect: trade(investing/northwind-foods, money * 2 / 5)
  - effect: quality.invest_insider_age = age
  - effect: journal("Acted on an insider tip about Northwind Foods.")
  - rate: 100..100%

### choice: Pass
- outcome: 1
  - text: You let it go. Some tips are better left alone.
  - rate: 100..100%

## insider-lumen-energy
- trigger: event
- icon: 💡
- chance: 0%
- text: Acting on an inside tip about Lumen Energy is not quite legal. The tip came with a wink, which is never a good sign or a bad one.
- opens: 0.011..0.027 per life

### choice: Back it with 40% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put 40% of your cash into Lumen Energy and keep the confirmation email open in a tab.
  - effect: trade(investing/lumen-energy, money * 2 / 5)
  - effect: quality.invest_insider_age = age
  - effect: journal("Acted on an insider tip about Lumen Energy.")
  - rate: 100..100%

### choice: Pass
- outcome: 1
  - text: You let it go. Some tips are better left alone.
  - rate: 100..100%

## insider-quark-coin
- trigger: event
- icon: 🪙
- chance: 0%
- text: Acting on an inside tip about Quark Coin is not quite legal. Your gut says it is also the riskiest thing you could do this year.
- opens: 0.013..0.030 per life

### choice: Back it with 40% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put 40% of your cash into Quark Coin and tell yourself you can afford to lose it.
  - effect: trade(investing/quark-coin, money * 2 / 5)
  - effect: quality.invest_insider_age = age
  - effect: journal("Acted on an insider tip about Quark Coin.")
  - rate: 100..100%

### choice: Pass
- outcome: 1
  - text: You let it go. Some tips are better left alone.
  - rate: 100..100%
