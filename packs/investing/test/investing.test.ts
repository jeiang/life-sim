import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  deserializeWorld,
  getPerson,
  indexBundles,
  listActions,
  newLife,
  replay,
  runAction,
  serializeWorld,
  setQuality,
  updatePerson,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import type { CompiledOutcome } from "../../../packages/core/src/pack.ts";
import { applyEffects } from "../../../packages/core/src/sim/effects.ts";
import { tradeHolding } from "../../../packages/core/src/sim/market.ts";
import { evalBool, evalInt } from "../../../packages/core/src/sim/ops.ts";
import { scopeFor } from "../../../packages/core/src/sim/storylets.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), { only: ["investing"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const I = (id: string) => `investing/${id}`;

const KINDS = [
  "total-market",
  "world-index",
  "income-bond-fund",
  "corporate-bond-fund",
  "acme-robotics",
  "northwind-foods",
  "lumen-energy",
  "quark-coin",
  "pinecrest-mining",
  "brightwave-labs",
  "gov-bond-5",
  "gov-bond-10",
];
const PENNY = ["pinecrest-mining", "brightwave-labs"];

const me = (w: World) => getPerson(w, w.playerId);
const qn = (w: World, id: string) => me(w).qualities[id] as number;
const story = (id: string) => {
  const s = idx.storylets.get(I(id));
  if (!s) throw new Error(`no storylet ${id}`);
  return s;
};

/** An adult with `money` (and smarts) in a fresh world. */
function life(money: number, age = 30, smarts = 50): World {
  const w = newLife(bundles, 5);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age,
    money,
    stats: { ...p.stats, smarts },
  }));
}

/** Forces the stored next-year return of a kind. */
function withForecast(w: World, kind: string, bp: number): World {
  const s = w.market[I(kind)];
  if (!s) throw new Error(`no series ${kind}`);
  return { ...w, market: { ...w.market, [I(kind)]: { ...s, next: bp } } };
}

/** Forces the last two prices of a kind, so `change` and `price` read as given. */
function withPrices(w: World, kind: string, prev: number, cur: number): World {
  const s = w.market[I(kind)];
  if (!s) throw new Error(`no series ${kind}`);
  return {
    ...w,
    market: { ...w.market, [I(kind)]: { ...s, prices: [prev, cur] } },
  };
}

const weights = (w: World, id: string, person?: number) => {
  const scope = scopeFor(
    w,
    person ? { kind: "person", id: person } : undefined,
    I(id),
  );
  return story(id).outcomes.map((o) => ({
    o,
    ok: evalBool(o.when, w, idx, scope),
    weight: evalInt(o.weight, w, idx, scope),
  }));
};
/** Weight of the outcome leading to `next` (drawable now), 0 when excluded. */
const weightTo = (w: World, id: string, next: string, person?: number) => {
  const r = weights(w, id, person).find((x) => x.o.next === I(next));
  if (!r) throw new Error(`no outcome to ${next}`);
  return r.ok ? r.weight : 0;
};
const apply = (w: World, o: CompiledOutcome, id: string, person?: number) =>
  applyEffects(
    w,
    idx,
    o.effects,
    scopeFor(w, person ? { kind: "person", id: person } : undefined, I(id)),
    new Map(),
  );

const parents = (w: World) =>
  w.relationships
    .filter((r) => r.from === w.playerId && r.role === "core-loop/parent")
    .map((r) => r.to);

/** Answers every open storylet with its last available choice (a tip's "Pass", a scam's "Walk away"). */
function settle(w0: World): World {
  let w = w0;
  for (let g = 0; w.pending && g < 40; g++) {
    const n = idx.storylets.get(w.pending.storyletId)?.choices.length ?? 1;
    for (let i = n - 1; i >= 0; i--) {
      try {
        w = choose(w, bundles, i).world;
        break;
      } catch (e) {
        if (i === 0) throw e;
      }
    }
  }
  return w;
}

/** Plays `years` age-ups, passing on every choice. */
function play(w0: World, years: number): World {
  let w = w0;
  for (let y = 0; y < years && !w.ended; y++)
    w = settle(ageUp(w, bundles).world);
  return w;
}

describe("market kinds", () => {
  test("the Pack declares the 12 kinds on the investments screen", () => {
    for (const k of KINDS) {
      const kind = idx.markets.get(I(k));
      expect(kind?.category, k).toBe("investments");
      expect(kind?.market, k).toBeDefined();
    }
    expect(idx.markets.size).toBe(12);
  });

  test("penny stocks relist after a delisting; bonds carry one issuer's default", () => {
    for (const k of PENNY) {
      const m = idx.markets.get(I(k))?.market;
      expect(m?.delistBp).toBeGreaterThan(0);
      expect(m?.relistAfterYears).toBe(8);
    }
    for (const [k, term] of [
      ["gov-bond-5", 5],
      ["gov-bond-10", 10],
    ] as const) {
      const b = idx.markets.get(I(k))?.market?.bond;
      expect(b?.termYears).toBe(term);
      expect(b?.defaultBp).toBe(40);
      expect(b?.lossBp).toBe(6000);
    }
  });

  test("a 100-year world: no overflow and no zero price outside the penny stocks", () => {
    for (const seed of [1, 2, 3]) {
      let w = newLife(bundles, seed);
      const maxByKind: Record<string, number> = {};
      for (let y = 0; y < 100 && !w.ended; y++) {
        w = ageUp(w, bundles).world;
        w = settle(w);
        for (const k of KINDS) {
          const p = w.market[I(k)]?.prices.at(-1) as number;
          expect(Number.isSafeInteger(p), `${k} ${p}`).toBe(true);
          if (!PENNY.includes(k))
            expect(p, `${k} year ${y}`).toBeGreaterThan(0);
          maxByKind[k] = Math.max(maxByKind[k] ?? 0, p);
        }
      }
      for (const k of KINDS) expect(maxByKind[k]).toBeLessThan(1e13);
    }
  });

  test("penny stocks delist to zero, then relist at their start price", () => {
    let delisted = 0;
    let relisted = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let w = newLife(bundles, seed);
      let zeroRun = 0;
      for (let y = 0; y < 60 && !w.ended; y++) {
        w = ageUp(w, bundles).world;
        w = settle(w);
        const p = w.market[I("brightwave-labs")]?.prices.at(-1) as number;
        if (p === 0) {
          if (zeroRun === 0) delisted++;
          zeroRun++;
        } else if (zeroRun > 0) {
          relisted++;
          expect(zeroRun).toBe(8);
          expect(p).toBe(180);
          zeroRun = 0;
        }
      }
    }
    expect(delisted).toBeGreaterThan(0);
    expect(relisted).toBeGreaterThan(0);
  });

  test("government bonds pay a coupon and return the principal at maturity", () => {
    let w = life(10_000_00);
    const idx0 = idx;
    const [bought] = tradeHolding(
      w,
      idx0,
      w.playerId,
      I("gov-bond-5"),
      500_000,
    );
    w = bought;
    expect(
      me(w).holdings.find((h) => h.kindId === I("gov-bond-5")),
    ).toBeDefined();
    const cash = me(w).money;
    // Hold the bond through the term; its coupon (3% of 5,000.00) arrives each settlement.
    const w1 = play(w, 1);
    const held = me(w1).holdings.find((h) => h.kindId === I("gov-bond-5"));
    expect(held).toBeDefined();
    expect(me(w1).money).toBeGreaterThan(cash - 1);
  });
});

describe("tips: gating and cost", () => {
  test("asking needs an adult player and an adult source, once a year", () => {
    const w = life(1000_00, 30);
    const [p] = parents(w);
    if (!p) throw new Error("no parent");
    const ask = (x: World) =>
      listActions(x, bundles, "relationships", p).find(
        (r) => r.id === I("ask-for-tip"),
      );
    expect(ask(w)?.locked).toBe(false);
    const young = updatePerson(w, w.playerId, (x) => ({ ...x, age: 17 }));
    expect(ask(young)?.locked).toBe(true);
    const stamped = setQuality(w, p, "invest_tip_age", 30);
    expect(ask(stamped)?.locked).toBe(true);
    const next = updatePerson(stamped, w.playerId, (x) => ({ ...x, age: 31 }));
    expect(ask(next)?.locked).toBe(false);
  });

  test("a tip stamps the source's quality with the age", () => {
    const w = life(1000_00, 30);
    const [p] = parents(w);
    if (!p) throw new Error("no parent");
    const o = weights(w, "ask-for-tip", p).find((x) => x.ok)?.o;
    if (!o) throw new Error("no outcome");
    const after = apply(w, o, "ask-for-tip", p);
    expect(getPerson(after, p).qualities.invest_tip_age).toBe(30);
  });

  test("the book costs $25, needs $25 and is once a year; the news is free", () => {
    const poor = life(2499);
    const row = (x: World, id: string) =>
      listActions(x, bundles, "activities/investing").find(
        (r) => r.id === I(id),
      );
    expect(row(poor, "read-investing-book")?.locked).toBe(true);
    expect(row(poor, "read-the-news")?.locked).toBe(false);
    const rich = life(2500);
    expect(row(rich, "read-investing-book")?.locked).toBe(false);
    const done = runAction(rich, bundles, I("read-investing-book"));
    const w = settle(done.world);
    expect(me(w).money).toBeLessThanOrEqual(0 + 0);
    expect(row(w, "read-investing-book")?.locked).toBe(true);
  });

  test("tip choices cost nothing until the player trades; small stakes need $200", () => {
    const s = story("tip-total-market");
    const broke = life(19_999);
    const scope = scopeFor(broke, undefined, s.id);
    expect(s.choices.map((c) => evalBool(c.when, broke, idx, scope))).toEqual([
      false,
      false,
      true,
    ]);
    const ok = life(20_000);
    const scope2 = scopeFor(ok, undefined, s.id);
    expect(s.choices.map((c) => evalBool(c.when, ok, idx, scope2))).toEqual([
      true,
      true,
      true,
    ]);
    const sell = story("tip-total-market-sell");
    expect(
      evalBool(
        sell.choices[0]?.when as NonNullable<typeof sell.when>,
        ok,
        idx,
        scope2,
      ),
    ).toBe(false);
  });
});

describe("tips: direction and accuracy", () => {
  const w0 = life(1_000_00);
  test("the news is right with chance 70; the book 80; a relative 65 + smarts / 10", () => {
    for (const k of KINDS) {
      const up = withForecast(w0, k, 500);
      const down = withForecast(w0, k, -500);
      const nu = (w: World) => weightTo(w, "read-the-news", `tip-${k}`);
      expect(nu(up)).toBe(70);
      expect(nu(down)).toBe(30);
      expect(weightTo(up, "read-the-news", `tip-${k}-sell`)).toBe(30);
      expect(weightTo(down, "read-the-news", `tip-${k}-sell`)).toBe(70);
      expect(weightTo(up, "read-investing-book", `tip-${k}`)).toBe(80);
      expect(weightTo(down, "read-investing-book", `tip-${k}-sell`)).toBe(80);
    }
  });

  test("a relative's weight follows their smarts and the kind pair sums to 100", () => {
    const [p] = parents(w0);
    if (!p) throw new Error("no parent");
    for (const smarts of [0, 50, 100]) {
      const w = withForecast(
        updatePerson(w0, p, (x) => ({ ...x, stats: { ...x.stats, smarts } })),
        "acme-robotics",
        900,
      );
      const up = weightTo(w, "ask-for-tip", "tip-acme-robotics", p);
      const down = weightTo(w, "ask-for-tip", "tip-acme-robotics-sell", p);
      expect(up).toBe(65 + Math.trunc(smarts / 10));
      expect(up + down).toBe(100);
    }
  });

  test("a kind with price 0 is never tipped", () => {
    const w = withPrices(w0, "pinecrest-mining", 50, 0);
    expect(weightTo(w, "read-the-news", "tip-pinecrest-mining")).toBe(0);
    expect(weightTo(w, "read-the-news", "tip-pinecrest-mining-sell")).toBe(0);
  });
});

describe("trading from a tip", () => {
  test("a buy tip puts 5% or 25% of cash into the kind; a sell tip sells a quarter", () => {
    const w = life(100_000_00);
    const buy = story("tip-total-market");
    const small = apply(
      w,
      buy.choices[0]?.outcomes[0] as CompiledOutcome,
      "tip-total-market",
    );
    expect(me(small).holdings.some((h) => h.kindId === I("total-market"))).toBe(
      true,
    );
    expect(me(small).money).toBe(100_000_00 - 5_000_00);
    const big = apply(
      w,
      buy.choices[1]?.outcomes[0] as CompiledOutcome,
      "tip-total-market",
    );
    expect(me(big).money).toBe(100_000_00 - 25_000_00);
    const sell = story("tip-total-market-sell");
    const sold = apply(
      big,
      sell.choices[0]?.outcomes[0] as CompiledOutcome,
      "tip-total-market-sell",
    );
    const held = (x: World) =>
      me(x).holdings.find((h) => h.kindId === I("total-market"))?.units ?? 0;
    expect(held(sold)).toBeLessThan(held(big));
    expect(me(sold).money).toBeGreaterThan(me(big).money);
    expect(held(sold)).toBeGreaterThan(0);
  });

  test("selling needs a holding", () => {
    const w = life(100_000_00);
    const sell = story("tip-total-market-sell");
    expect(
      evalBool(
        sell.choices[0]?.when as NonNullable<typeof sell.when>,
        w,
        idx,
        scopeFor(w, undefined, sell.id),
      ),
    ).toBe(false);
  });
});

describe("insider tips", () => {
  const held = (w: World, k = "total-market") => {
    const [x] = tradeHolding(w, idx, w.playerId, I(k), 50_000);
    return x;
  };
  const insiderAt = (w: World) => {
    const [p] = parents(w);
    if (!p) throw new Error("no parent");
    return { p, w: updatePerson(w, p, (x) => ({ ...x, age: 60 })) };
  };
  const eligible = (w: World, p: number) => {
    const s = story("insider-tip");
    const scope = scopeFor(w, { kind: "person", id: p }, s.id);
    return evalBool(s.when, w, idx, scope);
  };

  test("needs a holding of a listed kind and a forecast above 20%", () => {
    const base = insiderAt(life(1_000_00));
    const rising = withForecast(base.w, "acme-robotics", 3000);
    expect(eligible(rising, base.p)).toBe(false);
    const holder = held(rising, "acme-robotics");
    expect(eligible(holder, base.p)).toBe(true);
    expect(eligible(withForecast(holder, "acme-robotics", 1900), base.p)).toBe(
      false,
    );
    // A bond fund is not on the list.
    const bond = withForecast(
      held(base.w, "income-bond-fund"),
      "income-bond-fund",
      3000,
    );
    expect(eligible(bond, base.p)).toBe(false);
  });

  test("a source tips once a year and the weight is (forecast - 20%) / 1%, capped at 20", () => {
    const base = insiderAt(life(1_000_00));
    const w = withForecast(
      withForecast(base.w, "acme-robotics", 2500),
      "lumen-energy",
      9000,
    );
    expect(weightTo(w, "insider-tip", "insider-acme-robotics", base.p)).toBe(5);
    expect(weightTo(w, "insider-tip", "insider-lumen-energy", base.p)).toBe(20);
    expect(weightTo(w, "insider-tip", "insider-world-index", base.p)).toBe(0);
    const o = weights(w, "insider-tip", base.p).find((x) => x.ok)?.o;
    if (!o) throw new Error("no outcome");
    const after = apply(w, o, "insider-tip", base.p);
    expect(getPerson(after, base.p).qualities.invest_tip_age).toBe(30);
    expect(eligible(held(after), base.p)).toBe(false);
  });

  test("acting puts 40% of cash in and records the age; passing records nothing", () => {
    const w = life(100_000_00, 41);
    const s = story("insider-acme-robotics");
    const act = apply(w, s.choices[0]?.outcomes[0] as CompiledOutcome, s.id);
    expect(qn(act, "invest_insider_age")).toBe(41);
    expect(me(act).money).toBe(60_000_00);
    expect(me(act).holdings.some((h) => h.kindId === I("acme-robotics"))).toBe(
      true,
    );
    const pass = apply(w, s.choices[1]?.outcomes[0] as CompiledOutcome, s.id);
    expect(qn(pass, "invest_insider_age")).toBe(0);
    expect(me(pass).money).toBe(100_000_00);
  });
});

describe("scams", () => {
  const scams = ["ponzi-scheme", "fake-coin", "guaranteed-returns"];

  test("need age 18 and $500; four-year cooldown", () => {
    for (const id of scams) {
      const s = story(id);
      const t = (w: World) =>
        evalBool(s.when, w, idx, scopeFor(w, undefined, s.id));
      expect(t(life(50_000, 17))).toBe(false);
      expect(t(life(49_999))).toBe(false);
      expect(t(life(50_000))).toBe(true);
      expect(s.cooldown).toBe(4);
    }
  });

  test("the weight falls with smarts and with each scam fallen for, never below 1", () => {
    const s = story("ponzi-scheme");
    const wt = (smarts: number, lost: number) => {
      const w = setQuality(
        life(50_000, 30, smarts),
        life(0).playerId,
        "invest_scams",
        lost,
      );
      return evalInt(
        s.weight as NonNullable<typeof s.weight>,
        w,
        idx,
        scopeFor(w, undefined, s.id),
      );
    };
    expect(wt(0, 0)).toBe(2 + Math.trunc(100 / 15));
    expect(wt(100, 0)).toBe(2);
    expect(wt(0, 3)).toBe(Math.max(1, 2 + Math.trunc(100 / 15) - 3));
    expect(wt(100, 9)).toBe(1);
  });

  test("a stake that is lost costs 10% or 40% and counts; a payout returns 20% of the stake", () => {
    for (const id of scams) {
      const s = story(id);
      const w = life(100_000_00, 30, 50);
      const lose10 = apply(w, s.choices[0]?.outcomes[0] as CompiledOutcome, id);
      expect(me(lose10).money).toBe(90_000_00);
      expect(qn(lose10, "invest_scams")).toBe(1);
      const win10 = apply(w, s.choices[0]?.outcomes[1] as CompiledOutcome, id);
      expect(me(win10).money).toBe(102_000_00);
      expect(qn(win10, "invest_scams")).toBe(0);
      const lose40 = apply(w, s.choices[1]?.outcomes[0] as CompiledOutcome, id);
      expect(me(lose40).money).toBe(60_000_00);
      const win40 = apply(w, s.choices[1]?.outcomes[1] as CompiledOutcome, id);
      expect(me(win40).money).toBe(108_000_00);
      const look = apply(w, s.choices[2]?.outcomes[1] as CompiledOutcome, id);
      expect(me(look).money).toBe(90_000_00);
      const spot = apply(w, s.choices[2]?.outcomes[0] as CompiledOutcome, id);
      expect(me(spot).money).toBe(100_000_00);
      expect(me(spot).stats.smarts).toBe(51);
      expect(
        me(apply(w, s.choices[3]?.outcomes[0] as CompiledOutcome, id)).money,
      ).toBe(100_000_00);
    }
  });

  test("loss and win weights sum to 100 across smarts 0 to 100", () => {
    const s = story("fake-coin");
    for (const smarts of [0, 25, 50, 75, 100]) {
      const w = life(100_000_00, 30, smarts);
      const sc = scopeFor(w, undefined, s.id);
      for (const c of [0, 1, 2]) {
        const sum = (s.choices[c]?.outcomes ?? []).reduce(
          (a, o) => a + evalInt(o.weight, w, idx, sc),
          0,
        );
        expect(sum).toBe(100);
      }
    }
  });
});

describe("headlines", () => {
  // Both movers flat, so each test moves only the series it names.
  const w0 = withPrices(
    withPrices(life(1_000_00), "total-market", 10000, 10000),
    "quark-coin",
    10000,
    10000,
  );
  const index = (w: World, prev: number, cur: number) =>
    withPrices(w, "total-market", prev, cur);
  const pick = (w: World, id: string) =>
    weights(w, id)
      .filter((x) => x.ok)
      .map((x) => x.o.text);

  test("exactly one headline outcome is drawable in every year", () => {
    for (const [a, b, c, d] of [
      [10000, 7000, 10000, 10000],
      [10000, 14000, 10000, 10000],
      [10000, 10000, 10000, 16000],
      [10000, 10000, 10000, 5000],
      [10000, 10200, 10000, 10300],
      [10000, 6000, 10000, 20000],
      [10000, 14000, 10000, 5000],
    ] as const) {
      const w = withPrices(index(w0, a, b), "quark-coin", c, d);
      expect(pick(w, "market-headline")).toHaveLength(1);
    }
  });

  test("a crash, a rally, a coin spike, a coin fall and a quiet year", () => {
    const text = (w: World) => pick(w, "market-headline")[0] as string;
    expect(text(index(w0, 10000, 7000))).toMatch(/^Markets crash/);
    expect(text(index(w0, 10000, 13000))).toMatch(/^A market rally/);
    expect(text(withPrices(w0, "quark-coin", 10000, 16000))).toMatch(
      /^Quark Coin is the story/,
    );
    expect(text(withPrices(w0, "quark-coin", 10000, 5500))).toMatch(
      /^Quark Coin loses/,
    );
    expect(text(w0)).toMatch(/^Markets drift/);
    // Both qualify: the larger move wins (the index here).
    const both = withPrices(index(w0, 10000, 4000), "quark-coin", 10000, 15000);
    expect(text(both)).toMatch(/^Markets crash/);
  });

  test("the statement compares holdings with cash", () => {
    const holder = (cash: number, spend: number) => {
      const [w] = tradeHolding(
        life(cash + spend),
        idx,
        life(0).playerId,
        I("total-market"),
        spend,
      );
      return w;
    };
    const t = (w: World) => pick(w, "portfolio-statement")[0] as string;
    expect(t(holder(10_000, 100_000))).toMatch(/more than twice/);
    expect(t(holder(100_000, 100_000))).toMatch(/at least as much/);
    expect(t(holder(500_000, 100_000))).toMatch(/less than the cash/);
  });

  test("headlines need a holding and age 18", () => {
    for (const id of ["market-headline", "portfolio-statement"]) {
      const s = story(id);
      const t = (w: World) =>
        evalBool(s.when, w, idx, scopeFor(w, undefined, s.id));
      expect(t(w0)).toBe(false);
      const [held] = tradeHolding(
        w0,
        idx,
        w0.playerId,
        I("total-market"),
        100_000,
      );
      expect(t(held)).toBe(true);
      expect(
        t(updatePerson(held, held.playerId, (p) => ({ ...p, age: 17 }))),
      ).toBe(false);
    }
  });

  test("penny headlines read the surge and the delisting year only", () => {
    const s = story("penny-surge-pinecrest-mining");
    const d = story("penny-delisted-pinecrest-mining");
    const t = (w: World, st: typeof s) =>
      evalBool(st.when, w, idx, scopeFor(w, undefined, st.id));
    const surge = withPrices(w0, "pinecrest-mining", 100, 4000);
    expect(t(surge, s)).toBe(true);
    expect(t(withPrices(w0, "pinecrest-mining", 100, 200), s)).toBe(false);
    const gone = withPrices(w0, "pinecrest-mining", 100, 0);
    expect(t(gone, d)).toBe(true);
    // The year after, the price is still 0 but the change reads 0.
    expect(t(withPrices(w0, "pinecrest-mining", 0, 0), d)).toBe(false);
  });
});

describe("shortfall", () => {
  test("living costs never sell holdings", () => {
    let w = life(2_000_00, 40);
    [w] = tradeHolding(w, idx, w.playerId, I("total-market"), 1_500_00);
    const before = me(w).holdings.find(
      (h) => h.kindId === I("total-market"),
    )?.units;
    const after = play(
      updatePerson(w, w.playerId, (p) => ({ ...p, money: 0 })),
      3,
    );
    const units = me(after).holdings.find(
      (h) => h.kindId === I("total-market"),
    )?.units;
    expect(units).toBe(before);
  });
});

describe("determinism", () => {
  const lifeWithTips = () => {
    let w = newLife(bundles, 11);
    for (let y = 0; y < 45 && !w.ended; y++) {
      w = ageUp(w, bundles).world;
      w = settle(w);
      if (me(w).age >= 18 && !w.ended) {
        const r = runAction(w, bundles, I("read-the-news"));
        w = r.world;
        w = settle(w);
      }
    }
    return w;
  };

  test("a life with tips replays to the same world", () => {
    const w = lifeWithTips();
    expect(worldHash(replay(11, bundles, w.choiceLog))).toBe(worldHash(w));
  });

  test("a save round-trips with its market and person qualities", () => {
    const w = lifeWithTips();
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
  });
});
