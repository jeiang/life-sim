# Content sheet: Markets in the news

- pack: investing
- packs: investing, core-loop
- profile: all
- lives: 1000

> Chain C4 `markets-in-the-news` (issue #232). Two yearly storylets for a player aged 18+ who holds something: `market-headline` (one headline a year about the biggest move of the broad index or Quark Coin) and `portfolio-statement` (the annual statement, with the `portfolio` readable). No player choice.
> Both are `weight` events, not `chance: 100%`. A chance event is kept by the year cap only after the chance pass, so 100% events can be dropped when the cap is hit. Weight events draw from the flavour slots, which the cap never drops ahead of chance hits. Scheduling a yearly self-renewing chain was rejected: a scheduled storylet whose `when` fails is dropped for good, so one year with no holdings would end the chain.
> Both carry weight 100 so they win most flavour draws. This crowds other flavour events in years with few slots; the frequency is measured, not designed (see open questions).
> Entry is `portfolio > 0`, not `units(k) > 0` as the outline wrote it. The two differ only for a player whose only holding is a delisted penny stock (worth 0). The statement would otherwise say "less than your cash" for it. Switch to `units` if the reviewer prefers the outline.
> Units: `change(id)` is in basis points (10000 = 100%). All thresholds are integers, and falls are written as `change(id) + N <= 0`, so the expressions need no percent literals or negative literals.
> Headline rule. The index qualifies at +30% (`>= 3000`) or -25% (`+ 2500 <= 0`). Quark Coin qualifies at +50% (`>= 5000`) or -40% (`+ 4000 <= 0`). If only one side qualifies, it is reported. If both do, the larger move wins, compared by square so a rise and a fall are comparable; a tie goes to the index. Otherwise the year is quiet. The gates are exclusive and exhaustive, so each year resolves to exactly one outcome. Outcomes are gated, not weighted, so they carry no `rate` lines and weight 1.
> Scope limit: the headline reads the broad index and Quark Coin only. Stocks follow the index (beta 60 to 110%) and bonds do not make the news. The 10x penny-stock jump and the delisting headlines belong to chain C5 and are left out here.
> Opens bands are an estimate [INFERENCE], 30..80 per life for each storylet, under `profile: all`. Archive v1 recorded 74,732 holding-years in the 1000-life investor-profile run (about 75 per investor life), with 82.8% of random players investing. The investor profile sits near the top of the band and the random profile lower; `all` averages them. Both storylets are weight events now, so the flavour draw can cut the count below the holder-years. Measure in #233 and #234 and tighten.
> `portfolio` is a readable (`readables/portfolio.yaml`, DATA): the sum of `holding_value(k)` over all 12 kinds, in minor units. It is declared under `needs` on the headline storylet and used by both storylets. The statement's text uses `{portfolio}` and assumes the engine renders an int readable as money, the way `{money}` does; if not, the implementer adds a formatter and this sheet does not change.

## market-headline
- trigger: event
- icon: 📰
- weight: 100
- when: age >= 18 and portfolio > 0
- tags: investing, money
- text: The evening news leads with the markets, and for once the story is about your money.
- opens: 30..80 per life

### outcomes
- outcome: 1
  - text: Markets crash. The broad index loses a quarter of its value, and your brokerage app turns the color of a bruise.
  - when: change(investing/total-market) + 2500 <= 0 and (not (change(investing/quark-coin) >= 5000 or change(investing/quark-coin) + 4000 <= 0) or change(investing/total-market) * change(investing/total-market) >= change(investing/quark-coin) * change(investing/quark-coin))
  - effect: stat.happiness -= 3
  - effect: journal("Markets crashed at age {age}.")
- outcome: 1
  - text: A market rally. The broad index gains 30% or more, and suddenly everyone at work is a stock picker.
  - when: change(investing/total-market) >= 3000 and (not (change(investing/quark-coin) >= 5000 or change(investing/quark-coin) + 4000 <= 0) or change(investing/total-market) * change(investing/total-market) >= change(investing/quark-coin) * change(investing/quark-coin))
  - effect: stat.happiness += 2
- outcome: 1
  - text: Quark Coin is the story of the year, up at least half in twelve months. The group chat talks about nothing else.
  - when: change(investing/quark-coin) >= 5000 and (not (change(investing/total-market) + 2500 <= 0 or change(investing/total-market) >= 3000) or change(investing/quark-coin) * change(investing/quark-coin) > change(investing/total-market) * change(investing/total-market))
  - effect: stat.happiness += 1
- outcome: 1
  - text: Quark Coin loses 40% of its value in a year, and the message boards go quiet. Somebody is calling it a learning experience.
  - when: change(investing/quark-coin) + 4000 <= 0 and (not (change(investing/total-market) + 2500 <= 0 or change(investing/total-market) >= 3000) or change(investing/quark-coin) * change(investing/quark-coin) > change(investing/total-market) * change(investing/total-market))
  - effect: stat.happiness -= 2
- outcome: 1
  - text: Markets drift sideways. The business section has nothing to say that anyone reads.
  - when: not ((change(investing/total-market) + 2500 <= 0 or change(investing/total-market) >= 3000) or (change(investing/quark-coin) >= 5000 or change(investing/quark-coin) + 4000 <= 0))

## portfolio-statement
- trigger: event
- icon: 🧾
- weight: 100
- when: age >= 18 and portfolio > 0
- tags: investing, money
- text: Your annual statement arrives. You open it on the stairs, which is where the important letters get opened.
- opens: 30..80 per life

### outcomes
- outcome: 1
  - text: Your holdings are worth {portfolio}, more than twice your cash. The brokerage sends a cheerful letter about it.
  - when: portfolio >= money * 2
- outcome: 1
  - text: Your holdings are worth {portfolio}, at least as much as the cash you have. A fair split, you decide.
  - when: portfolio >= money and portfolio < money * 2
- outcome: 1
  - text: Your holdings are worth {portfolio}, less than the cash in your account. The statement is polite about it.
  - when: portfolio < money
