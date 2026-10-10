# Content sheet: Source tips

- pack: investing
- packs: investing, core-loop
- profile: all
- lives: 3000

> Chain C1 of the investing pack (issue #232, outline `source-tips`). Three sources give tips: an action to ask a relative or friend (`ask-for-tip`), the financial news (`read-the-news`), and an investing book (`read-investing-book`). Relatives and friends are gated per person by `person.quality.invest_tip_age` (the year they last gave you a tip), so each gives at most one tip a year, and every tip stamps it with the current age. News and book have no bound person, so each keeps `cooldown: 1` (one tip a year per source).
> A source draws a kind from the 12 market kinds that are priced above 0 (the gate is `price(k) > 0` on each outcome), then a direction. Sell advice for a kind is only drawable while the player holds it (`units(k) > 0`), so a source never tips you to sell something unowned. The direction is "up" (buy advice, `tip-<kind>`) or "down" (sell advice, `tip-<kind>-sell`). The advice is right with chance Q: the outcome weight for up advice is Q when `forecast(k) > 0`, else 100 - Q; down advice is the mirror. With a holding, each kind's two outcomes sum to 100 per source.
> Q: relatives and friends 65 + smarts / 10 (65 to 75); news 70; book 80. The target is a tipped kind rising 65 to 80 percent of the time.
> Rates are not given: outcome weights depend on the forecast sign, so the share of each outcome is not a constant. `opens` is given for every storylet.
> Gov bonds are included in the draw (the grilled decision names no exclusion). The archive excluded them; main should confirm.
> Insider tips (C2) and scams (C3) are not in this sheet. The relatives target list omits `core-loop/child`, `core-loop/classmate` and `core-loop/coworker` (outline: relatives and friends).

## ask-for-tip
- trigger: action
- menu: relationships
- label: Ask for a tip
- icon: 💡
- scope: person
- target: core-loop/parent, core-loop/sibling, core-loop/friend, core-loop/partner, core-loop/spouse
- when: age >= 18 and person.age >= 18 and person.quality.invest_tip_age < age
- tags: relationship
- text: You ask {person.first_name} whether they have heard anything about the markets.
- opens: 6..12 per life
- needs: quality invest_tip_age: integer 0.., default 0: age of the last year this person gave you a market tip; gates one tip per person per year

### outcomes
- outcome: (forecast(investing/total-market) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/total-market) > 0
  - text: {person.first_name} swears the Total market fund is about to climb.
  - effect: person.quality.invest_tip_age = age
  - next: tip-total-market
- outcome: (forecast(investing/total-market) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/total-market) > 0
  - text: {person.first_name} says to get out of the Total market fund before it slides.
  - effect: person.quality.invest_tip_age = age
  - next: tip-total-market-sell
- outcome: (forecast(investing/world-index) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/world-index) > 0
  - text: {person.first_name} says the World index fund is due a good year.
  - effect: person.quality.invest_tip_age = age
  - next: tip-world-index
- outcome: (forecast(investing/world-index) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/world-index) > 0
  - text: {person.first_name} warns that the World index fund is heading for a rough one.
  - effect: person.quality.invest_tip_age = age
  - next: tip-world-index-sell
- outcome: (forecast(investing/income-bond-fund) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/income-bond-fund) > 0
  - text: {person.first_name} says the Income bond fund is about to pay off nicely.
  - effect: person.quality.invest_tip_age = age
  - next: tip-income-bond-fund
- outcome: (forecast(investing/income-bond-fund) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/income-bond-fund) > 0
  - text: {person.first_name} says the Income bond fund is about to wobble. Get out.
  - effect: person.quality.invest_tip_age = age
  - next: tip-income-bond-fund-sell
- outcome: (forecast(investing/corporate-bond-fund) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/corporate-bond-fund) > 0
  - text: {person.first_name} says the Corporate bond fund is quietly about to rise.
  - effect: person.quality.invest_tip_age = age
  - next: tip-corporate-bond-fund
- outcome: (forecast(investing/corporate-bond-fund) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/corporate-bond-fund) > 0
  - text: {person.first_name} says the Corporate bond fund is about to slip.
  - effect: person.quality.invest_tip_age = age
  - next: tip-corporate-bond-fund-sell
- outcome: (forecast(investing/acme-robotics) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/acme-robotics) > 0
  - text: {person.first_name} has a friend who says Acme Robotics is about to take off.
  - effect: person.quality.invest_tip_age = age
  - next: tip-acme-robotics
- outcome: (forecast(investing/acme-robotics) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/acme-robotics) > 0
  - text: {person.first_name} says Acme Robotics is about to crash, so sell.
  - effect: person.quality.invest_tip_age = age
  - next: tip-acme-robotics-sell
- outcome: (forecast(investing/northwind-foods) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/northwind-foods) > 0
  - text: {person.first_name} says people always eat, so Northwind Foods is going up.
  - effect: person.quality.invest_tip_age = age
  - next: tip-northwind-foods
- outcome: (forecast(investing/northwind-foods) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/northwind-foods) > 0
  - text: {person.first_name} says Northwind Foods has a bad year coming.
  - effect: person.quality.invest_tip_age = age
  - next: tip-northwind-foods-sell
- outcome: (forecast(investing/lumen-energy) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/lumen-energy) > 0
  - text: {person.first_name} says Lumen Energy is about to light up the market.
  - effect: person.quality.invest_tip_age = age
  - next: tip-lumen-energy
- outcome: (forecast(investing/lumen-energy) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/lumen-energy) > 0
  - text: {person.first_name} says Lumen Energy is about to go dark.
  - effect: person.quality.invest_tip_age = age
  - next: tip-lumen-energy-sell
- outcome: (forecast(investing/quark-coin) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/quark-coin) > 0
  - text: {person.first_name} says Quark Coin is about to moon. Trust the feeling.
  - effect: person.quality.invest_tip_age = age
  - next: tip-quark-coin
- outcome: (forecast(investing/quark-coin) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/quark-coin) > 0
  - text: {person.first_name} says Quark Coin is about to crash, so sell it.
  - effect: person.quality.invest_tip_age = age
  - next: tip-quark-coin-sell
- outcome: (forecast(investing/pinecrest-mining) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/pinecrest-mining) > 0
  - text: {person.first_name} says Pinecrest Mining is about to strike gold.
  - effect: person.quality.invest_tip_age = age
  - next: tip-pinecrest-mining
- outcome: (forecast(investing/pinecrest-mining) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/pinecrest-mining) > 0
  - text: {person.first_name} says Pinecrest Mining is about to dig itself into a hole.
  - effect: person.quality.invest_tip_age = age
  - next: tip-pinecrest-mining-sell
- outcome: (forecast(investing/brightwave-labs) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/brightwave-labs) > 0
  - text: {person.first_name} says Brightwave Labs is about to light up.
  - effect: person.quality.invest_tip_age = age
  - next: tip-brightwave-labs
- outcome: (forecast(investing/brightwave-labs) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/brightwave-labs) > 0
  - text: {person.first_name} says Brightwave Labs is about to fizzle.
  - effect: person.quality.invest_tip_age = age
  - next: tip-brightwave-labs-sell
- outcome: (forecast(investing/gov-bond-5) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/gov-bond-5) > 0
  - text: {person.first_name} says the 5-year government bond is about to tick up. Boring, but right.
  - effect: person.quality.invest_tip_age = age
  - next: tip-gov-bond-5
- outcome: (forecast(investing/gov-bond-5) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/gov-bond-5) > 0
  - text: {person.first_name} says the 5-year government bond is about to tick down. Cash out.
  - effect: person.quality.invest_tip_age = age
  - next: tip-gov-bond-5-sell
- outcome: (forecast(investing/gov-bond-10) > 0) ? 65 + person.stat.smarts / 10 : 35 - person.stat.smarts / 10
  - when: price(investing/gov-bond-10) > 0
  - text: {person.first_name} says the 10-year government bond is about to tick up.
  - effect: person.quality.invest_tip_age = age
  - next: tip-gov-bond-10
- outcome: (forecast(investing/gov-bond-10) > 0) ? 35 - person.stat.smarts / 10 : 65 + person.stat.smarts / 10
  - when: price(investing/gov-bond-10) > 0
  - text: {person.first_name} says the 10-year government bond is about to tick down.
  - effect: person.quality.invest_tip_age = age
  - next: tip-gov-bond-10-sell

## read-the-news
- trigger: action
- menu: activities/investing
- label: Read the financial news
- icon: 📰
- cooldown: 1
- tags: learning
- text: You skim the financial pages over breakfast.
- opens: 5..12 per life

### outcomes
- outcome: (forecast(investing/total-market) > 0) ? 70 : 30
  - when: price(investing/total-market) > 0
  - text: A financial column says the Total market fund is set to climb.
  - next: tip-total-market
- outcome: (forecast(investing/total-market) > 0) ? 30 : 70
  - when: price(investing/total-market) > 0
  - text: A financial column says the Total market fund is set to slide.
  - next: tip-total-market-sell
- outcome: (forecast(investing/world-index) > 0) ? 70 : 30
  - when: price(investing/world-index) > 0
  - text: A market note expects the World index fund to have a good year.
  - next: tip-world-index
- outcome: (forecast(investing/world-index) > 0) ? 30 : 70
  - when: price(investing/world-index) > 0
  - text: A market note expects the World index fund to have a rough year.
  - next: tip-world-index-sell
- outcome: (forecast(investing/income-bond-fund) > 0) ? 70 : 30
  - when: price(investing/income-bond-fund) > 0
  - text: A bond column says the Income bond fund is about to pay off.
  - next: tip-income-bond-fund
- outcome: (forecast(investing/income-bond-fund) > 0) ? 30 : 70
  - when: price(investing/income-bond-fund) > 0
  - text: A bond column says the Income bond fund is about to wobble.
  - next: tip-income-bond-fund-sell
- outcome: (forecast(investing/corporate-bond-fund) > 0) ? 70 : 30
  - when: price(investing/corporate-bond-fund) > 0
  - text: A bond column says the Corporate bond fund is quietly about to rise.
  - next: tip-corporate-bond-fund
- outcome: (forecast(investing/corporate-bond-fund) > 0) ? 30 : 70
  - when: price(investing/corporate-bond-fund) > 0
  - text: A bond column says the Corporate bond fund is about to slip.
  - next: tip-corporate-bond-fund-sell
- outcome: (forecast(investing/acme-robotics) > 0) ? 70 : 30
  - when: price(investing/acme-robotics) > 0
  - text: A business page says Acme Robotics is about to take off.
  - next: tip-acme-robotics
- outcome: (forecast(investing/acme-robotics) > 0) ? 30 : 70
  - when: price(investing/acme-robotics) > 0
  - text: A business page says Acme Robotics is about to crash.
  - next: tip-acme-robotics-sell
- outcome: (forecast(investing/northwind-foods) > 0) ? 70 : 30
  - when: price(investing/northwind-foods) > 0
  - text: A business page says Northwind Foods is about to climb.
  - next: tip-northwind-foods
- outcome: (forecast(investing/northwind-foods) > 0) ? 30 : 70
  - when: price(investing/northwind-foods) > 0
  - text: A business page says Northwind Foods has a bad year coming.
  - next: tip-northwind-foods-sell
- outcome: (forecast(investing/lumen-energy) > 0) ? 70 : 30
  - when: price(investing/lumen-energy) > 0
  - text: An energy column says Lumen Energy is about to light up.
  - next: tip-lumen-energy
- outcome: (forecast(investing/lumen-energy) > 0) ? 30 : 70
  - when: price(investing/lumen-energy) > 0
  - text: An energy column says Lumen Energy is about to go dark.
  - next: tip-lumen-energy-sell
- outcome: (forecast(investing/quark-coin) > 0) ? 70 : 30
  - when: price(investing/quark-coin) > 0
  - text: A crypto blog says Quark Coin is about to moon.
  - next: tip-quark-coin
- outcome: (forecast(investing/quark-coin) > 0) ? 30 : 70
  - when: price(investing/quark-coin) > 0
  - text: A crypto blog says Quark Coin is about to crash.
  - next: tip-quark-coin-sell
- outcome: (forecast(investing/pinecrest-mining) > 0) ? 70 : 30
  - when: price(investing/pinecrest-mining) > 0
  - text: A mining column says Pinecrest Mining is about to strike gold.
  - next: tip-pinecrest-mining
- outcome: (forecast(investing/pinecrest-mining) > 0) ? 30 : 70
  - when: price(investing/pinecrest-mining) > 0
  - text: A mining column says Pinecrest Mining is about to dig itself into a hole.
  - next: tip-pinecrest-mining-sell
- outcome: (forecast(investing/brightwave-labs) > 0) ? 70 : 30
  - when: price(investing/brightwave-labs) > 0
  - text: A tech column says Brightwave Labs is about to light up.
  - next: tip-brightwave-labs
- outcome: (forecast(investing/brightwave-labs) > 0) ? 30 : 70
  - when: price(investing/brightwave-labs) > 0
  - text: A tech column says Brightwave Labs is about to fizzle.
  - next: tip-brightwave-labs-sell
- outcome: (forecast(investing/gov-bond-5) > 0) ? 70 : 30
  - when: price(investing/gov-bond-5) > 0
  - text: A bond column says the 5-year government bond is about to tick up.
  - next: tip-gov-bond-5
- outcome: (forecast(investing/gov-bond-5) > 0) ? 30 : 70
  - when: price(investing/gov-bond-5) > 0
  - text: A bond column says the 5-year government bond is about to tick down.
  - next: tip-gov-bond-5-sell
- outcome: (forecast(investing/gov-bond-10) > 0) ? 70 : 30
  - when: price(investing/gov-bond-10) > 0
  - text: A bond column says the 10-year government bond is about to tick up.
  - next: tip-gov-bond-10
- outcome: (forecast(investing/gov-bond-10) > 0) ? 30 : 70
  - when: price(investing/gov-bond-10) > 0
  - text: A bond column says the 10-year government bond is about to tick down.
  - next: tip-gov-bond-10-sell

## read-investing-book
- trigger: action
- menu: activities/investing
- label: Buy an investing book ($25)
- icon: 📚
- when: age >= 18 and money >= 2500
- cooldown: 1
- tags: learning
- text: A paperback on investing is on sale. You pick it up.
- opens: 0.5..6 per life

### outcomes
- outcome: (forecast(investing/total-market) > 0) ? 80 : 20
  - when: price(investing/total-market) > 0
  - text: The chapter on index funds makes sense. It says the Total market fund is set to climb, and you believe it.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-total-market
- outcome: (forecast(investing/total-market) > 0) ? 20 : 80
  - when: price(investing/total-market) > 0
  - text: The chapter on index funds makes sense. It says the Total market fund is set to slide, and you believe it.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-total-market-sell
- outcome: (forecast(investing/world-index) > 0) ? 80 : 20
  - when: price(investing/world-index) > 0
  - text: The book's example is a World index fund, and it is due a good year.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-world-index
- outcome: (forecast(investing/world-index) > 0) ? 20 : 80
  - when: price(investing/world-index) > 0
  - text: The book's example is a World index fund, and it is heading for a rough year.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-world-index-sell
- outcome: (forecast(investing/income-bond-fund) > 0) ? 80 : 20
  - when: price(investing/income-bond-fund) > 0
  - text: A section on bond funds says the Income bond fund is about to pay off.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-income-bond-fund
- outcome: (forecast(investing/income-bond-fund) > 0) ? 20 : 80
  - when: price(investing/income-bond-fund) > 0
  - text: A section on bond funds says the Income bond fund is about to wobble.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-income-bond-fund-sell
- outcome: (forecast(investing/corporate-bond-fund) > 0) ? 80 : 20
  - when: price(investing/corporate-bond-fund) > 0
  - text: A section on corporate bonds says the Corporate bond fund is quietly about to rise.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-corporate-bond-fund
- outcome: (forecast(investing/corporate-bond-fund) > 0) ? 20 : 80
  - when: price(investing/corporate-bond-fund) > 0
  - text: A section on corporate bonds says the Corporate bond fund is about to slip.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-corporate-bond-fund-sell
- outcome: (forecast(investing/acme-robotics) > 0) ? 80 : 20
  - when: price(investing/acme-robotics) > 0
  - text: The stock-picking chapter is sure Acme Robotics is about to take off.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-acme-robotics
- outcome: (forecast(investing/acme-robotics) > 0) ? 20 : 80
  - when: price(investing/acme-robotics) > 0
  - text: The stock-picking chapter is sure Acme Robotics is about to crash.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-acme-robotics-sell
- outcome: (forecast(investing/northwind-foods) > 0) ? 80 : 20
  - when: price(investing/northwind-foods) > 0
  - text: The stock-picking chapter says Northwind Foods is about to climb.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-northwind-foods
- outcome: (forecast(investing/northwind-foods) > 0) ? 20 : 80
  - when: price(investing/northwind-foods) > 0
  - text: The stock-picking chapter says Northwind Foods has a bad year coming.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-northwind-foods-sell
- outcome: (forecast(investing/lumen-energy) > 0) ? 80 : 20
  - when: price(investing/lumen-energy) > 0
  - text: The stock-picking chapter says Lumen Energy is about to light up.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-lumen-energy
- outcome: (forecast(investing/lumen-energy) > 0) ? 20 : 80
  - when: price(investing/lumen-energy) > 0
  - text: The stock-picking chapter says Lumen Energy is about to go dark.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-lumen-energy-sell
- outcome: (forecast(investing/quark-coin) > 0) ? 80 : 20
  - when: price(investing/quark-coin) > 0
  - text: A chapter on speculative coins says Quark Coin is about to moon.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-quark-coin
- outcome: (forecast(investing/quark-coin) > 0) ? 20 : 80
  - when: price(investing/quark-coin) > 0
  - text: A chapter on speculative coins says Quark Coin is about to crash.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-quark-coin-sell
- outcome: (forecast(investing/pinecrest-mining) > 0) ? 80 : 20
  - when: price(investing/pinecrest-mining) > 0
  - text: A chapter on penny stocks says Pinecrest Mining is about to strike gold.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-pinecrest-mining
- outcome: (forecast(investing/pinecrest-mining) > 0) ? 20 : 80
  - when: price(investing/pinecrest-mining) > 0
  - text: A chapter on penny stocks says Pinecrest Mining is about to dig itself into a hole.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-pinecrest-mining-sell
- outcome: (forecast(investing/brightwave-labs) > 0) ? 80 : 20
  - when: price(investing/brightwave-labs) > 0
  - text: A chapter on penny stocks says Brightwave Labs is about to light up.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-brightwave-labs
- outcome: (forecast(investing/brightwave-labs) > 0) ? 20 : 80
  - when: price(investing/brightwave-labs) > 0
  - text: A chapter on penny stocks says Brightwave Labs is about to fizzle.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-brightwave-labs-sell
- outcome: (forecast(investing/gov-bond-5) > 0) ? 80 : 20
  - when: price(investing/gov-bond-5) > 0
  - text: The bond chapter says the 5-year government bond is about to tick up.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-gov-bond-5
- outcome: (forecast(investing/gov-bond-5) > 0) ? 20 : 80
  - when: price(investing/gov-bond-5) > 0
  - text: The bond chapter says the 5-year government bond is about to tick down.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-gov-bond-5-sell
- outcome: (forecast(investing/gov-bond-10) > 0) ? 80 : 20
  - when: price(investing/gov-bond-10) > 0
  - text: The bond chapter says the 10-year government bond is about to tick up.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-gov-bond-10
- outcome: (forecast(investing/gov-bond-10) > 0) ? 20 : 80
  - when: price(investing/gov-bond-10) > 0
  - text: The bond chapter says the 10-year government bond is about to tick down.
  - effect: money -= 2500
  - effect: stat.smarts += 1
  - next: tip-gov-bond-10-sell

## tip-total-market
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says the Total market fund is about to climb. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/total-market, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/total-market, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-total-market-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says the Total market fund is about to slide. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/total-market) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/total-market, 0 - holding_value(investing/total-market) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-world-index
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says the World index fund is due a good year. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/world-index, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/world-index, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-world-index-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says the World index fund is heading for a rough year. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/world-index) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/world-index, 0 - holding_value(investing/world-index) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-income-bond-fund
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says the Income bond fund is about to pay off nicely. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/income-bond-fund, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/income-bond-fund, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-income-bond-fund-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says the Income bond fund is about to wobble. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/income-bond-fund) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/income-bond-fund, 0 - holding_value(investing/income-bond-fund) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-corporate-bond-fund
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says the Corporate bond fund is quietly about to rise. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/corporate-bond-fund, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/corporate-bond-fund, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-corporate-bond-fund-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says the Corporate bond fund is about to slip. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/corporate-bond-fund) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/corporate-bond-fund, 0 - holding_value(investing/corporate-bond-fund) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-acme-robotics
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says Acme Robotics is about to take off. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/acme-robotics, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/acme-robotics, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-acme-robotics-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says Acme Robotics is about to crash. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/acme-robotics) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/acme-robotics, 0 - holding_value(investing/acme-robotics) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-northwind-foods
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says Northwind Foods is about to climb. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/northwind-foods, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/northwind-foods, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-northwind-foods-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says Northwind Foods has a bad year coming. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/northwind-foods) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/northwind-foods, 0 - holding_value(investing/northwind-foods) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-lumen-energy
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says Lumen Energy is about to light up. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/lumen-energy, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/lumen-energy, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-lumen-energy-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says Lumen Energy is about to go dark. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/lumen-energy) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/lumen-energy, 0 - holding_value(investing/lumen-energy) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-quark-coin
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says Quark Coin is about to moon. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/quark-coin, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/quark-coin, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-quark-coin-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says Quark Coin is about to crash. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/quark-coin) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/quark-coin, 0 - holding_value(investing/quark-coin) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-pinecrest-mining
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says Pinecrest Mining is about to strike gold. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/pinecrest-mining, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/pinecrest-mining, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-pinecrest-mining-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says Pinecrest Mining is about to dig itself into a hole. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/pinecrest-mining) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/pinecrest-mining, 0 - holding_value(investing/pinecrest-mining) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-brightwave-labs
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says Brightwave Labs is about to light up. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/brightwave-labs, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/brightwave-labs, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-brightwave-labs-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says Brightwave Labs is about to fizzle. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/brightwave-labs) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/brightwave-labs, 0 - holding_value(investing/brightwave-labs) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-gov-bond-5
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says the 5-year government bond is about to tick up. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/gov-bond-5, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/gov-bond-5, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-gov-bond-5-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says the 5-year government bond is about to tick down. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/gov-bond-5) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/gov-bond-5, 0 - holding_value(investing/gov-bond-5) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.

## tip-gov-bond-10
- trigger: event
- icon: 📈
- chance: 0%
- tags: money
- text: A tip says the 10-year government bond is about to tick up. Do you put money in?
- opens: 0.5..1.2 per life

### choice: Put in 5% of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a small slice and keep the rest in your pocket.
  - effect: trade(investing/gov-bond-10, money / 20)

### choice: Put in a quarter of your cash
- when: money >= 20000
- outcome: 1
  - text: You put in a big slice and try not to think about it.
  - effect: trade(investing/gov-bond-10, money / 4)

### choice: Pass
- outcome: 1
  - text: You leave your cash where it is.

## tip-gov-bond-10-sell
- trigger: event
- icon: 📉
- chance: 0%
- tags: money
- text: A tip says the 10-year government bond is about to tick down. Do you sell?
- opens: 0.5..1.2 per life

### choice: Sell a quarter of your holding
- when: units(investing/gov-bond-10) > 0
- outcome: 1
  - text: You sell a quarter of your holding and feel smart about it.
  - effect: trade(investing/gov-bond-10, 0 - holding_value(investing/gov-bond-10) / 4)

### choice: Pass
- outcome: 1
  - text: You hold on to what you have.
