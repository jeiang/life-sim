# BitLife mechanics and screen inventory

Ticket: jeiang/life-sim#5 (map: #1). Researched 2026-10-05.

## Question

What mechanics and screen types does BitLife actually have, so the Core loop and screen kinds are grounded in the reference game? Inventory core stats, age-up log, activities menu, school/job flows, shop/purchase dialog (pay cash, loan, cancel), investment screen with graph, gambling, travel, relationships, death and continue-as-child. For each, note the generic screen pattern it uses.

## Summary

- BitLife is one loop: press **Age** -> game rolls the year -> a scrolling text **journal** of that year's events appears, some of which interrupt with a **choice dialog**. Everything else is optional side menus. (Age wiki page, BitLife wiki page.)
- Screen vocabulary is small. Nearly every mechanic reduces to: **feed** (journal), **menu list** (Activities, Assets, Occupation, Relationships), **choice dialog** (events, interviews, arguments), **purchase dialog**, **profile/stat panel** (a person or yourself, with 0-100 bars), **amount picker** (bet, invest), and **chart** (investments only).
- Core state is tiny: four 0-100 stats (Happiness, Health, Smarts, Looks), money, age, plus a few hidden or secondary bars (Karma; Fame/Approval only in later expansions). Per-person stats are the same shape (Relationship + a few others).
- School and jobs are **state machines with a menu of verbs**, not minigames: enrol -> per-year verbs (study harder, drop out; work harder, ask for promotion, resign, retire) -> terminal states (graduate, promoted, fired, retired). Careers are tables of `job -> promotes_to, education required, starting wage`. This maps directly onto authored Pack data.
- Shopping is **catalogue list -> detail -> purchase dialog**. Houses can be bought outright or via mortgage; cars/aircraft/boats can be financed by a loan. The cash/loan/cancel dialog the project wants is a faithful simplification. (Exact button labels are not in a primary source I could read; see caveats.)
- The investment screen with graph is a **late expansion** (Stock Market Update, late 2022 per a Jan 2023 guide), not part of BitLife's original loop. It is the only true chart screen: Portfolio + per-asset price history + a news/advice tool. It is skippable for a Core loop.
- Gambling (casino, horse races) is a bet-amount picker + a small RNG resolution; mostly a minigame. Several features are gated by country law. Skippable.
- Death shows a tombstone/obituary (profile-like summary) with Journal / Share / Continue. Continue offers: new life, restart as same character, or **continue as a child** (Generations), who inherits money (minus estate tax, per country), houses/cars (auctioned if the heir is a minor) and heirlooms, per the Will.
- Most of the game's bulk is **content** (hundreds of random events, ~hundreds of jobs, crimes, diseases, countries), which supports the content-agnostic Core / authored Pack split. Almost none of the mechanics need bespoke code beyond the generic screens above.

## Findings

### Source quality

The BitLife Wiki on Fandom is community-maintained and several pages are marked "under construction". Direct page fetches return HTTP 403 from this environment, so wikitext was retrieved through Fandom's public MediaWiki `api.php?action=parse` endpoint. The game itself is closed source (Candywriter LLC); there is no first-party design documentation beyond store listings. Claims below are tagged **[wiki]** (community wiki wikitext), **[guide]** (third-party strategy guide), **[store]** (first-party store listing) or **[inference]**.

### 1. Core loop and main screen

- The game starts at birth (infant): it shows parents and their occupations, date of birth, star sign, conception method, siblings and pets; stats start random with happiness and health "usually very high". Pressing the **Age** button in the middle of the screen adds one year (or six months with a setting). [wiki: BitLife, Age]
- Every age-up can fire random events, deaths, surprise pregnancies etc. [wiki: Age]
- After death the Age button becomes a "New life" button. [wiki: Age]
- Store listing positions it as "a text-based life simulator", "Live an entire virtual life from birth to death", choices each year, and the listing carries the "Offline" tag. [store: Google Play]
- Bottom navigation (Occupation, Assets, Age, Relationships, Activities) is how the app routes into the secondary menus; the wiki pages treat Activities, Assets (a.k.a. shopping), Occupation and Relationships as separate sections. Exact tab labels were only confirmed from an aggregated search summary of those wiki pages; treat as **[inference]** for naming.
- Screen pattern: **feed** (journal of the year, newest at the bottom, interleaved with **choice dialogs**), plus a persistent **stat panel** (four bars under the character's name/age) and the **Age** button.

### 2. Stats

- Four core bars: Happiness, Health, Smarts, Looks. A fifth bar, Fame, appears once famous, and Approval for politicians (expansions). Boosts to raise a low bar were added May 2019 (ad-gated). [wiki: Stats]
- Starting ranges: Happiness 50-100, Health 80-100, Smarts 0-100, Looks 0-100. [wiki: Stats]
- Stats drift by a few points every age-up; high Happiness and Health lengthen life. [wiki: Stats, Death]
- The wiki lists many discrete triggers with fixed deltas, e.g. new child +50 Happiness, divorce -30, spouse dying -50, child dying -100, passing driver's test +8, rejection from a full-time job -16. [wiki: Stats] This is exactly the "event outcome = list of stat deltas" shape.
- Karma is a hidden-ish bar, visible via meditation and on the tombstone; good choices raise it, bad ones lower it. It helps longevity. [wiki: Karma]
- Other people use the same bar idea with different fields: Parent (Relationship, Religiousness, Generosity, Money), Sibling (Relationship, Smarts, Looks, Petulance), Lover (Relationship, Looks, Smarts, Money, Craziness), Teacher (Relationship, Looks, Strictness, Popularity). [wiki: Stats, Profile]
- Money is a number that may go negative (debt); also tracked: bank balance and net worth. Inflation/currency differ per country. [wiki: Money]
- Screen pattern: **stat panel** (labelled 0-100 bars) for the player and, in **profile** screens, for other people.

### 3. Age-up log (journal)

- Each age-up appends the year's outcomes as text lines grouped by age, and events that need a decision pop up as a modal with 2+ options. Outcomes can attach ribbons/achievements and shift relationships or send you to prison. [wiki: Events]
- Event content kinds on the wiki: random (flavour, no choice, mostly world-news style with templated placeholders like `[Number]`, `[Country]`), choice events, SOS/life-saving situations, witnessed crimes, animal encounters, childhood events (which "do not do much"), and career/vacation-specific events. [wiki: Events]
- The Journal (re-read the life) is offered on the death screen. [wiki: Death]
- Screen pattern: **feed** + **choice dialog**. Templated strings with placeholders are a strong hint that the Pack needs a text template syntax.

### 4. Activities menu

- A scrolling list; entries are greyed out until the minimum age; some depend on country (driving age, gambling law); a Favourite Activities setting pins items to the top. [wiki: Activities]
- Documented entries include Accessories, Adoption, Crime, Doctor, and many more (casino, horse races, vacation, etc.). Minimum ages are per entry, e.g. Crime sub-options from age 8 (shoplift) to 18 (hitman). [wiki: Activities]
- Selecting an entry opens a nested menu list, a choice dialog, or a results popup.
- Screen pattern: **menu list** with per-row availability predicate (min age, country, has-job, has-asset...) - a Pack-expressible condition.

### 5. School

- Stages: elementary (4-8 years depending on country), optional middle school, high school, optional GED if dropped/expelled (cost over $1000), community college (free, accepts anyone who finished high school/GED), university (4 years, with majors), then graduate/business/law/medical/etc. gated by major. [wiki: Education]
- Per-year verbs in school: view the school screen (type, years completed, years left), **study harder**, **drop out** (parents/law may forbid). Since the Sept 2019 update: teachers, classmates, clubs, principal's office. [wiki: Education]
- University tuition: scholarship, parents, student loan or cash. Applying with an unrelated major is rejected; majors map to eligible post-graduate schools in an explicit table. [wiki: Education]
- Screen pattern: **menu list** (verbs) + **choice dialog** (apply/drop out) + **profile** of classmates/teachers.
- Data shape: `school_stage -> years, min_age, country_variants`; `major -> allowed_graduate_programs`.

### 6. Jobs and careers

- Interviews are required to get hired (some paths, e.g. fraternity membership, skip them); the interview is a short series of multiple-choice questions where answer choice, plus randomness, decides the offer. Each question has many surface wordings with a few effect classes (marked with `*` on the wiki for neutral answers). [wiki: Careers]
- Jobs are ladders: `Jr. X -> X -> Sr. X`, each with required education/experience, starting wage, and a flag for whether it can be held with a criminal record. Raises depend on performance and, by job, looks/smarts. A career is "collected" after 20 years. [wiki: Careers, Careers/Jobs]
- Some careers (Acting, Composing) have a "breakthrough" with a large income jump; others rise gradually (Doctor, CEO). [wiki: Careers]
- Per-year job verbs (Nov 2019 careers update): Co-Workers (interact; popularity bar), Hours (38-70 per week), Human Resources (report someone), Resign (unavailable after 20 years), Retire (pension if old enough and/or 20 years), Work Harder (short performance burst). Military has Desert/Discharge/Report/Retire/Work Harder; mandatory retirement at 62. [wiki: Careers/Job activities]
- Co-worker actions: Ask Out, Befriend, Compliment, Conversation, Gift, Hook-up, Insult, Prank, Promotion (boss), Rumor, Spend Time, each with probabilistic outcomes dependent on the relationship bar. [wiki: Careers/Job activities]
- Part-time jobs and freelance gigs came May 2019 (age 13+). [wiki: Careers/Jobs]
- Screen pattern: **menu list** of jobs (browse/apply) -> **choice dialog** sequence (interview) -> **menu list** of verbs -> **profile** of coworkers.

### 7. Shop and purchase dialog

- Shopping reaches assets through Activities (iOS) or Assets: Real Estate, Cars, Planes, Boats, Jewelry, Instruments, and Pets (separate path). Heirlooms are assets but cannot be bought. [wiki: Shopping, Assets]
- Dealers are grouped into shops (e.g. Car Dealers shows 3 shops, Real Estate Brokers shows 2); each lists items with price and a condition/quality bar; cars require a driver's licence, aircraft a pilot licence (40 flight-lesson hours), boats a boating licence. [wiki: Shopping]
- Houses: "a player may buy it or get a mortgage"; the mortgage payment keeps being charged yearly even if bought with cash (upkeep is monthly cost x12), renovations raise it; haunted houses are flagged. Cars, aircraft and boats "can apply for a loan". [wiki: Shopping, Assets]
- Rejected pet adoption reasons include "insufficient funds to pay a monthly payment", i.e. loans/monthly payments gate purchases. [wiki: Shopping]
- Jewelry loses value each year; houses appreciate; selling shows profit/loss. [wiki: Assets]
- Cash vs loan prompt: a secondary summary of the Shopping page describes the prompt as "Pay Cash" vs "Apply for a Mortgage/Loan", with a recurring monthly payment shown. The wikitext I read states the options (buy outright vs mortgage/loan) but not the button labels or a cancel button. The project's `pay cash / loan / cancel` spec matches the documented behaviour; it should be treated as the project's own design **[inference]**.
- Screen pattern: **menu list** (shops) -> **menu list** (items with bars) -> **purchase dialog** (cash / loan / cancel) -> result line in the **feed**.
- Ongoing cost model implied: per-asset recurring `upkeep` and `loan_payment`, charged at each age-up.

### 8. Investments with graph

- Added by the Stock Market Update (late 2022). Path: Assets -> Investments. Menu sections: Portfolio (all holdings, buy/sell, total value, amount invested, % return, years investing, starting age), Tools (Financial News, ask friend/family, Financial Advisor), and Investment Types: Bonds, Crypto, Funds, Penny Stocks, Stocks. Open to anyone; no special career needed. [guide: LevelWinner Stock Market Update]
- Bonds and Stocks have a Market Health bar; Crypto, Funds, Penny Stocks do not. Fictional tickers/companies. [guide: LevelWinner]
- Bond details: entity, maturity, coupon, minimum investment, risk (default risk); selling early loses value. [guide: LevelWinner]
- Funds: Active vs Index, 1/5/10-year returns, a five-year performance graph with a Performance bar. [guide: LevelWinner]
- Prices change when you age up; Financial News shows three headlines; advisors/friends give advice of uneven reliability; crypto sales offer a tax payment option and evasion/insider trading can lead to arrest. [guide: LevelWinner]
- Screen pattern: **chart** (price history, simple line) inside a **menu list** of instruments; **amount picker** for buy/sell; **profile-style stat panel** for portfolio totals.
- Note: a different aggregated search summary claimed buy/sell flows with typed amounts; only the LevelWinner guide was read directly.

### 9. Gambling

- Casino: first gambling option in Activities; must be legal in the country; bet amount chosen from the player's cash; free game is Blackjack (win = double, blackjack = triple, five-card Charlie rule); eight more games in the Casino expansion (Craps, High-low, Keno, Roulette, Slots, Sports betting, Texas Hold'em, Three-card shuffle). Losing more than you have gets you in debt, possibly charged with defrauding the casino and banned; betting too much can cause a gambling addiction; Highroller and Addict ribbons attach. [wiki: Casino]
- Horse races: $10 admission, pick one of five horses and a bet; luck-based; illegal in some countries; notifications hint at winners (sometimes wrong). [wiki: Horse Races]
- Screen pattern: **amount picker** + **choice dialog** + result in feed; Blackjack itself is a bespoke minigame. Core can model non-interactive gambling as "stake -> probability table -> payout" and skip the minigames.

### 10. Travel

- Vacation and cruise are separate Activities. Vacation: plane class (Budget, Economy, Business, First) and a destination from a large list (several hundred cities/places; custom cities possible); children may be taken by parents (go gratefully / complain but go / refuse). Cruise: four cabin classes (Interior, Ocean View, Balcony, Suite), a short destination list; cruises raise happiness more than vacations. [wiki: Vacation]
- Vacations raise Happiness (listed as a happiness booster). [wiki: Stats]
- Emigration also exists (forces a new career). [wiki: Careers]
- Screen pattern: **menu list** (destination) -> **menu list** (class) -> **purchase dialog** (pay cash; cancel) -> feed line + random vacation event (**choice dialog**).

### 11. Relationships

- Relationship list groups family, partners, children, friends, classmates, coworkers; selecting a person opens their **profile** (age, education, occupation, stats as above) plus an interaction menu. [wiki: Profile, Relationships]
- Interaction options for all relationships (not pets): Compliment, Conversation, Gift, Insult, Spend Time, and more (Assault, Ask Out, etc.), with probabilistic responses that depend on the relationship bar: compliment may be returned (+8 Happiness), ignored or insulted; conversation may become an argument with apologise / agree to disagree / insult / assault choices. [wiki: Relationships]
- Families are randomly generated (married parents, unknown father, one-night stand, remarriage and step-families); adoption lets you pick one of up to 6 juveniles. [wiki: Profile, Activities]
- Child stats inherit the average of both parents' looks and smarts. [wiki: Stats]
- Under 3 years old: profile only, no interactions. [wiki: Profile]
- Screen pattern: **menu list** of people -> **profile/stat panel** -> **menu list** of verbs -> **choice dialog** (argument follow-ups).
- Largest content volume in the game by far (relationship page ~71 KB of wikitext, mostly template strings).

### 12. Crime, prison, health, addiction (side systems)

- Crime is an Activities submenu with age gates; caught -> Prison (fired, title "Prisoner", sentence length by crime, doubled on repeat; yearly escape attempt minigame). [wiki: Activities, Prison]
- Doctor visits cure diseases with some chance; untreated deadly illness kills; addictions arise from repeated use and lower happiness if unfed. [wiki: Activities, Death, Addictions]
- Screen pattern: **menu list** + **choice dialog**; prison replaces the Activities list with a different available-verb set (**context-dependent menu**).

### 13. Death and continue-as-child

- Death shows a tombstone/obituary with ribbon, name, age, net worth, country/city, career, education, children/grandchildren counts, lovers, murders, prison years, cause of death, attendees, a short life description, and Happiness and Karma bars (shortened if died before 18). [wiki: Death]
- Buttons: Journal, Bulldoze (erase tombstone from cemetery), Share, Continue. Continue -> new random/custom life, restart as the same character, or continue as one of their children. [wiki: Death]
- Death causes include old age (more likely at low health; Geriatric ribbon at 120+), illness, assault, failed murder, witch doctor, stress-related heart attack, and voluntary surrender (always gives the "Wasteful" ribbon, possible at any age). [wiki: Death]
- Generations: play as any living child (adopted/step also). The child starts at the age it was when the parent died, with the deceased's inheritance (per Will: divide evenly or give all to one), minus estate tax in some countries, plus Heirlooms. If the heir is a minor, houses and cars are auctioned and the proceeds kept. Non-Bitizens get limited generations (the wiki says "once" on one page and "two" on another; paid tier unlimited). The new life begins with how the parent died. [wiki: Generations, Will/Testament, Bitizenship]
- Screen pattern: **profile/stat panel** (tombstone) + **menu list** (continue options, heir picker). Carry-over state: money, assets, heirlooms, relationships (as family), will.

### 14. Monetisation and non-core features to ignore

Ads for boosts, Bitizenship (no ads, more generations/pets, dark mode), God Mode, ribbons/achievements, challenges, heirlooms attic minigame, fame/politics/royalty/mafia/casino-owner expansions. [wiki: Bitizenship, Stats, Heirloom] None belong in a thin Core loop.

## Mechanic -> screen kind

Screen kinds: **Feed** (scrolling text log), **Menu list** (list rows with availability), **Choice dialog** (modal with 2+ options), **Purchase dialog** (price, cash / loan / cancel), **Chart** (value over time), **Profile / stat panel** (labelled bars + facts), **Amount picker** (slider or numeric input, a variant of choice dialog).

| Mechanic | Screen kind(s) | Notes |
|---|---|---|
| Age-up result | Feed | One entry per event of the year |
| Random event with options | Choice dialog | Outcomes = stat deltas, money, flags, text |
| Random flavour event | Feed | No input |
| Core stats | Stat panel | 4 bars + money + age |
| Karma / fame | Stat panel | Optional extra bars |
| Activities menu | Menu list | Rows gated by age/country/state |
| School (enrol, study, drop out) | Menu list + choice dialog | Year-based state machine |
| University application, majors | Menu list + choice dialog | Major -> eligible grad programs |
| Job search/apply | Menu list | Listing from job table |
| Interview | Choice dialog sequence | Answers + RNG decide hire |
| Job verbs (work harder, resign, retire, promotion) | Menu list + choice dialog | Per-year verbs |
| Shop (cars, houses, jewelry...) | Menu list -> Purchase dialog | Item bars; licences gate |
| Mortgage / loan | Purchase dialog | Recurring monthly cost afterwards |
| Owned assets, sell | Menu list + choice dialog | Value changes yearly |
| Investments | Chart + Amount picker + Menu list | Expansion; skippable |
| Gambling | Amount picker + Choice dialog | Stake -> probability -> payout |
| Travel | Menu list + Purchase dialog | Plus vacation events |
| Relationships list | Menu list | |
| Person profile | Profile / stat panel | Same bar shape, different fields |
| Social verbs (compliment, gift, argue) | Menu list + choice dialog | Outcome from relationship bar |
| Marriage, children, divorce | Choice dialog + feed | Updates relationships and money |
| Crime and prison | Menu list + choice dialog | Replaces menu while jailed |
| Doctor and illness | Menu list + choice dialog | |
| Will | Choice dialog | Divide evenly / pick heir |
| Death / obituary | Profile / stat panel | Includes summary facts |
| Continue as child | Menu list (heir picker) | Carries money, assets |
| New life | Menu list | |

## Implications for open decisions

Suggested thin Core loop subset (matches CONTEXT.md "Core loop": birth, year-by-year, school, a job, money, shopping, random events, until death):

1. **Birth**: random start stats (Happiness, Health, Smarts, Looks); name, country (a Pack concept), parents as a minimal profile.
2. **Age-up**: Age button -> apply passive drift -> roll Pack events for the age -> append to feed -> death check (age + health).
3. **Events**: feed events and choice-dialog events with stat/money/flag outcomes; templated text.
4. **School**: fixed stages by age (with an optional study verb and dropout); university optional as a later Pack.
5. **Job**: browse a list gated by education/age, apply (one probability roll or a short interview), per-year salary, a promotion ladder, work harder, resign, retire.
6. **Money and shop**: income and expenses on age-up; shop menu with item list and the purchase dialog (cash / loan / cancel); recurring loan payment and asset value drift.
7. **Death**: obituary profile, then (if included) pick an heir.
8. **Screens needed for the loop**: feed, stat panel, menu list, choice dialog, purchase dialog, profile. **Chart can be deferred** (only investments use it) but the project explicitly lists it, so keep it in the generic screen set, driven by e.g. net worth over age, which gives a reasonable first use without implementing stocks.

Defer: relationships beyond family/partner basics, crime/prison, travel, gambling, investments, pets, fame, and Bitizen-style monetisation.

Facts later tickets will need:

- Pack schema must express: availability predicates (min age, country, has job/asset), probabilistic outcome tables, stat/money deltas, flags, templated text with placeholders, job ladders (`promotes_to`, required education, wage), item catalogue (price, condition, upkeep, loan eligibility).
- Core state that must persist across a life and across generations: stats, money, assets, loans, relationships, will, plus inheritance rules and a per-country estate tax (if country is modelled).
- Per-country variation is pervasive (school years, gambling law, healthcare, tax, currency). A thin loop should either fix a single fictional country or make "country" a Pack-level constant.
- The game is closed source and the wiki is community-edited; replicate behaviours, not text or assets. Event wording on the wiki is Candywriter's; the project should author its own (consistent with "hand-authored (AI-assisted)" and emoji/open-licensed icons).

Newly surfaced questions for later tickets: (a) does the thin loop model countries/currencies at all; (b) how are procedurally generated people (family, coworkers, classmates) represented as Pack content vs Core generation; (c) how does a Pack express a probability/outcome table and text templates; (d) is generation-continuation (heir) in v1 or deferred; (e) what is the monthly/yearly cost model for loans (interest, payment schedule, default behaviour) - BitLife's own formula is undocumented in sources found.

## Caveats

- Wiki pages Stats, Profile and Money carry "under construction" tags; wiki numbers may lag current game versions.
- Generations limit for non-paying players is contradictory across wiki pages ("once" vs "two").
- The cash/loan/cancel button labels, and the main bottom-tab labels, were not confirmed from a primary page read.
- Investments information is from one third-party guide (LevelWinner, Jan 2023) and may have changed.

## Sources

- BitLife Wiki (Fandom), read via MediaWiki API `https://bitlife-life-simulator.fandom.com/api.php?action=parse&page=<Page>&prop=wikitext`:
  - Activities: https://bitlife-life-simulator.fandom.com/wiki/Activities
  - Age: https://bitlife-life-simulator.fandom.com/wiki/Age
  - Assets: https://bitlife-life-simulator.fandom.com/wiki/Assets
  - BitLife (main page): https://bitlife-life-simulator.fandom.com/wiki/BitLife
  - Bitizenship: https://bitlife-life-simulator.fandom.com/wiki/Bitizenship
  - Careers: https://bitlife-life-simulator.fandom.com/wiki/Careers
  - Careers/Jobs: https://bitlife-life-simulator.fandom.com/wiki/Careers/Jobs
  - Careers/Job activities: https://bitlife-life-simulator.fandom.com/wiki/Careers/Job_activities
  - Casino: https://bitlife-life-simulator.fandom.com/wiki/Casino
  - Death: https://bitlife-life-simulator.fandom.com/wiki/Death
  - Education: https://bitlife-life-simulator.fandom.com/wiki/Education
  - Events: https://bitlife-life-simulator.fandom.com/wiki/Events
  - Generations: https://bitlife-life-simulator.fandom.com/wiki/Generations
  - Heirloom: https://bitlife-life-simulator.fandom.com/wiki/Heirloom
  - Horse Races: https://bitlife-life-simulator.fandom.com/wiki/Horse_Races
  - Karma: https://bitlife-life-simulator.fandom.com/wiki/Karma
  - Money: https://bitlife-life-simulator.fandom.com/wiki/Money
  - Prison: https://bitlife-life-simulator.fandom.com/wiki/Prison
  - Profile: https://bitlife-life-simulator.fandom.com/wiki/Profile
  - Relationships: https://bitlife-life-simulator.fandom.com/wiki/Relationships
  - Shopping: https://bitlife-life-simulator.fandom.com/wiki/Shopping
  - Stats: https://bitlife-life-simulator.fandom.com/wiki/Stats
  - Vacation: https://bitlife-life-simulator.fandom.com/wiki/Vacation
  - Will/Testament: https://bitlife-life-simulator.fandom.com/wiki/Will/Testament
  - Addictions: https://bitlife-life-simulator.fandom.com/wiki/Addictions
- LevelWinner, "BitLife Stock Market Update Guide" (2023-01-09): https://www.levelwinner.com/bitlife-stock-market-update-guide-everything-you-need-to-know-about-the-stock-market-update/
- Google Play store listing (Candywriter LLC): https://play.google.com/store/apps/details?id=com.candywriter.bitlife&hl=en_US
- Not used as evidence (fetch blocked or low value): progameguides.com house guide (HTTP 403); bitlifewiki.com investing guide (generic content).
