# Investing Pack

Terms (namespace `invest`, qualities `invest_*`).

- **Holding**: units of a market kind the player owns; valued by Core at the current price (`holding_value`, `portfolio`).
- **Market kind**: one of 12 items in category `investments`: 2 index funds, 2 bond funds, 3 fictional stocks, a coin, 2 penny stocks, 2 government bonds. Traded on the `assets/investments` screen from 18.
- **Tip**: a source (relative or friend, the news, an investing book) names a kind and a direction. It is right with chance Q (52 + smarts / 30 for people, 53 news, 55 book). Each source tips at most once a year (`invest_tip_age` per person, `cooldown: 1` for news and book).
- **Insider tip**: a rare tip from a parent, sibling or friend about a kind forecast to rise 20%+. Acting on it sets `invest_insider_age`; nothing in this Pack reads it (a later Crime bridge will).
- **Scam**: a decision event (Ponzi scheme, fake coin, guaranteed returns) that usually takes money; each loss raises `invest_scams`, which lowers the next offer's weight.
- **Delisting**: a penny stock's price falls to 0, holdings are written off by Core, and it relists at its start price 8 world years later.
- **Government bond**: fixed coupon, principal at maturity, one issuer (0.4% yearly default, 60% loss). Per-country defaults are deferred.
- `portfolio` is Core's name; `invest_portfolio` mirrors it at each age-up for harness measures only.
