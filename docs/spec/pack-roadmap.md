# Pack roadmap

Decided in [Later Pack roadmap](https://github.com/jeiang/life-sim/issues/21). These Packs follow the [Core loop](core-loop.md), in this order (most fun first, as chosen by the user).

## Rules

- Each Pack is one backlog epic. The epic starts with its Core additions, built just in time (consistent with ADRs 0002 and 0004: new effects, functions, and primitives arrive as Core releases).
- Each epic then opens with a short grilling session that fixes its content list (the Core loop spec is the model), followed by content authoring and balance passes with the [harness](harness.md).
- A Pack declares its dependencies in its manifest and only adds content ([Pack format](pack-format.md#composition)).

## Order

| # | Pack | Scope | Core prerequisites | Depends on |
|---|---|---|---|---|
| 1 | Dating, marriage, kids | Partners, dating, weddings, divorce, pregnancy, children | Partner, spouse, and child relationship roles; spawning a child; household costs at settlement if needed | `core-loop` |
| 2 | Generations | Inheritance and continuing as your child | Estate transfer on death (money, assets, loans); moving the player pointer to an heir (ADR 0002); heir picker on the obituary | 1 |
| 3 | Gambling | Casino games and horse races | An `amount` input on action storylets, bound for expressions and chosen through the amount picker | `core-loop` |
| 4 | Investing | Stocks, bonds, funds with price history | Per-item-kind price series updated at settlement, with history; buying and selling by amount (the `trade` effect and holdings); the chart screen for any series. It shares the amount picker with Gambling but does not depend on that Pack | `core-loop` |
| 5 | Crime and prison | Crimes, arrests, sentences, escape | Occupations that lock other menus while held | `core-loop` |
| 6 | Vacations | Trips and cruises as happiness purchases | None: trips are priced actions, as with doctor visits and the driving test | `core-loop` |
| 7 | Grad school | Medical, law, and business school off university majors; top careers | Group checks: `in_group(g)` and `years_in_group(g)` (no `end_group`) | `core-loop` |
| 8 | Relocation | Moving cities and countries | None beyond the cities of [Cities and moving out](https://github.com/jeiang/life-sim/issues/108): countries extend them with an optional city `country` field. One currency, no multi-currency | `core-loop` |

The order is a preference, not a hard sequence, except for the dependencies in the last column.
