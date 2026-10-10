# Content sheet: Penny stock headlines

- pack: investing
- packs: investing, core-loop
- profile: all
- lives: 1000

> Chain C5 (OUTLINE: penny-stock headlines). Two yearly events per penny kind, both flavour only: a surge headline and a delisting notice.
> Core owns the market: prices, the surge and the delisting rolls, the write-off of holdings and the journal line for a delisted holding. These storylets carry no effects.
> Surge gate: `change(k) >= 40000` (+400%). A normal year for either kind tops out near +340% (drift plus six sigma of the 12-draw shock), so the gate never fires without a jump. A jump lands the price at ten times the year's base return, so the gate catches the jumps whose base return is -50% or better (about 69% for pinecrest-mining and 76% for brightwave-labs). The headline texts say "soared", not "10x", because the multiple is not exact.
> Delisting gate: `price(k) == 0 and change(k) == -10000`. Price stays 0 for good, but `change` is 0 once the previous price was 0, so the -100% change marks the delisting year alone. The headline fires once per kind per life.
> Entry: age 18+. Holding the kind is not required; these are headlines about the market.
> The `opens` bands: surge is about 0.7% per listed year per kind (1% jump roll times the share of jumps that clear the gate), over adult years while listed, trimmed for deaths before age 75 (median death 72-82). Delisting is 6% (pinecrest-mining) and 5% (brightwave-labs) per listed year, so the chance of it landing in the player's adult years, assuming each life starts with a fresh world at world year 0.

## penny-surge-pinecrest-mining
- trigger: event
- icon: 🚀
- chance: 100%
- when: age >= 18 and change(investing/pinecrest-mining) >= 40000
- tags: investing, news
- text: You skim the business pages and there it is: Pinecrest Mining, the penny stock you forgot existed, has soared.
- opens: 0.02..0.045 per life

### outcomes
- outcome: 1
  - text: You skim the business pages and there it is: Pinecrest Mining, the penny stock nobody talked about last week, has soared. Someone says they found gold. You are not sure which rock.
  - rate: 50..50%
- outcome: 1
  - text: Your phone lights up with alerts. Pinecrest Mining shares went vertical this year, and the stock that got laughed at over dinner is suddenly the one everyone wants to talk about.
  - rate: 50..50%

## penny-surge-brightwave-labs
- trigger: event
- icon: 🚀
- chance: 100%
- when: age >= 18 and change(investing/brightwave-labs) >= 40000
- tags: investing, news
- text: Brightwave Labs makes the business pages for once. You forgot you owned a piece of it, and now it has shot up.
- opens: 0.035..0.065 per life

### outcomes
- outcome: 1
  - text: You forgot you owned a few shares of Brightwave Labs. Now it has shot up, and the investor forums are full of exclamation marks.
  - rate: 50..50%
- outcome: 1
  - text: A press release from Brightwave Labs finally turns out to matter. You watch its shares surge, and you quietly check your brokerage app to be sure.
  - rate: 50..50%

## penny-delisted-pinecrest-mining
- trigger: event
- icon: 🪦
- chance: 100%
- when: age >= 18 and price(investing/pinecrest-mining) == 0 and change(investing/pinecrest-mining) == -10000
- tags: investing, news
- text: You see a short notice about Pinecrest Mining in the business pages.
- opens: 0.30..0.38 per life

### outcomes
- outcome: 1
  - text: The exchange pulls Pinecrest Mining from the board. You read the company's last press release, which thanks shareholders for their patience.
  - rate: 50..50%
- outcome: 1
  - text: Pinecrest Mining has been delisted. If you are still holding shares, you are now holding a very expensive souvenir.
  - rate: 50..50%

## penny-delisted-brightwave-labs
- trigger: event
- icon: 🪦
- chance: 100%
- when: age >= 18 and price(investing/brightwave-labs) == 0 and change(investing/brightwave-labs) == -10000
- tags: investing, news
- text: Brightwave Labs has a notice in the business pages, and it is not about a launch.
- opens: 0.36..0.45 per life

### outcomes
- outcome: 1
  - text: The exchange has delisted Brightwave Labs. Its CEO calls it a "strategic pause," which is what people say right before they stop. You are not fooled.
  - rate: 50..50%
- outcome: 1
  - text: The launch that was "next quarter" for years will now never happen. You read that Brightwave Labs is off the board.
  - rate: 50..50%
