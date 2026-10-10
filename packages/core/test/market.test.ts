import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addPerson,
  ageUp,
  getPerson,
  godSetMoney,
  indexBundles,
  listMarket,
  listShop,
  makeEnv,
  netWorth,
  newLife,
  parseSave,
  purchase,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  type Series,
  serializeSave,
  succeed,
  trade,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "market"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;
const idx = indexBundles(bundles);

const INDEX = "mkt/index";
const STOCK = "mkt/stock";
const PENNY = "mkt/penny";
const BOND = "mkt/bond";
const SHAKY = "mkt/shaky-bond";

const rich = (money = 1_000_000, seed = 5): World => {
  const w = newLife(bundles, seed);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age: 20, money }));
};
const me = (w: World) => getPerson(w, w.playerId);
const held = (w: World, kind: string) =>
  me(w).holdings.find((h) => h.kindId === kind);
const must = <T>(x: T | undefined): T => {
  if (x === undefined) throw new Error("expected a value");
  return x;
};
const price = (w: World, kind: string) => {
  const s = w.market[kind];
  return s?.prices[s.prices.length - 1];
};
const years = (w: World, n: number): World => {
  let x = w;
  for (let i = 0; i < n; i++) x = ageUp(x, bundles).world;
  return x;
};
const call = (w: World, name: string, kind: string): unknown =>
  makeEnv(w, idx, { subject: w.playerId }).call(name, [kind]);

describe("market series", () => {
  test("a new life starts every series at its starting price with a stored forecast", () => {
    const w = newLife(bundles, 3);
    expect(price(w, INDEX)).toBe(10000);
    expect(w.market[INDEX]?.from).toBe(0);
    expect(call(w, "forecast", INDEX)).toBe(w.market[INDEX]?.next);
  });

  test("the next settlement applies exactly the forecast that was readable beforehand", () => {
    let w = newLife(bundles, 11);
    for (let year = 0; year < 25; year++) {
      const f = call(w, "forecast", INDEX) as number;
      const before = price(w, INDEX) as number;
      w = ageUp(w, bundles).world;
      expect(price(w, INDEX)).toBe(
        Math.max(1, Math.trunc((before * (10000 + f)) / 10000)),
      );
    }
  });

  test("prices depend on the seed and world year only, never on what the player did", () => {
    const plain = years(newLife(bundles, 7), 6);
    let busy = rich(1_000_000, 7);
    busy = trade(busy, bundles, INDEX, 500_000).world;
    busy = years(busy, 6);
    expect(busy.market[INDEX]?.prices).toEqual(plain.market[INDEX]?.prices);
    expect(busy.market[PENNY]?.prices).toEqual(plain.market[PENNY]?.prices);
  });

  test("an heir continues the same series: succession does not replay prices", () => {
    const base = years(newLife(bundles, 9), 4);
    const [withHeir, heir] = addPerson(base, {
      givenName: "H",
      familyName: "Eir",
      age: 3,
    });
    const heirWorld = succeed(withHeir, heir);
    expect(heirWorld.worldYear).toBe(base.worldYear);
    const a = ageUp(base, bundles).world;
    const b = ageUp(heirWorld, bundles).world;
    expect(b.market).toEqual(a.market);
  });

  test("a kind with beta follows its parent's stored return", () => {
    let w = newLife(bundles, 13);
    for (let year = 0; year < 30; year++) {
      const parent = call(w, "forecast", INDEX) as number;
      expect(call(w, "forecast", STOCK)).toBe(
        Math.trunc((12000 * parent) / 10000),
      );
      w = ageUp(w, bundles).world;
    }
    // The 20% yearly crash fires in 30 years of this seed; the stock fell with it.
    const ret = (k: string) =>
      (w.market[k]?.prices ?? []).map((p, i, all) =>
        all[i - 1] ? p / (all[i - 1] as number) : 1,
      );
    expect(Math.min(...ret(INDEX))).toBeLessThan(0.8);
    expect(Math.min(...ret(STOCK))).toBeLessThan(0.8);
  });

  test("history keeps one point per world year and is capped", () => {
    const w = years(newLife(bundles, 2), 130);
    const s = w.market[INDEX];
    expect(s?.prices.length).toBe(100);
    expect(s?.from).toBe(31);
  });
});

describe("trading", () => {
  test("buying converts cash to units at the price and records the basis", () => {
    const w = trade(rich(), bundles, INDEX, 250_000).world;
    expect(me(w).money).toBe(750_000);
    expect(held(w, INDEX)).toMatchObject({
      units: 250_000 * 1, // $2,500.00 at $100.00 a unit = 25 units = 250000
      basis: 250_000,
      firstAge: 20,
    });
    expect(w.choiceLog.at(-1)).toEqual({
      t: "trade",
      kind: INDEX,
      amount: 250_000,
    });
  });

  test("selling part keeps the average cost; selling more than held sells all", () => {
    let w = trade(rich(), bundles, INDEX, 250_000).world;
    w = years(w, 3);
    const p = price(w, INDEX) as number;
    const before = must(held(w, INDEX));
    const half = Math.trunc((before.units * p) / 10000 / 2);
    w = trade(w, bundles, INDEX, -half).world;
    const after = must(held(w, INDEX));
    expect(after.units).toBeLessThan(before.units);
    // basis falls pro rata, so the average cost per unit stays put (to rounding)
    expect(
      Math.abs(after.basis / after.units - before.basis / before.units),
    ).toBeLessThan(0.01);
    const cash = me(w).money;
    w = trade(w, bundles, INDEX, -1_000_000_000).world;
    expect(held(w, INDEX)).toBeUndefined();
    expect(me(w).money).toBeGreaterThan(cash);
  });

  test("buying with less cash than asked spends what there is; never negative", () => {
    const w = trade(rich(10_000), bundles, INDEX, 99_999_999).world;
    expect(me(w).money).toBe(0);
    expect(held(w, INDEX)?.basis).toBe(10_000);
    expect(() => trade(w, bundles, INDEX, 100)).toThrow(/afford/);
    expect(() => trade(w, bundles, STOCK, -100)).toThrow(/none of it/);
  });

  test("the trade effect buys and sells from actions on the picked amount", () => {
    let w = runAction(
      rich(),
      bundles,
      "mkt/buy-index",
      undefined,
      300_000,
    ).world;
    expect(me(w).money).toBe(700_000);
    expect(held(w, INDEX)?.basis).toBe(300_000);
    w = runAction(w, bundles, "mkt/sell-index", undefined, 100_000).world;
    expect(me(w).money).toBe(800_000);
    w = runAction(w, bundles, "mkt/dump-index").world;
    expect(held(w, INDEX)).toBeUndefined();
    expect(me(w).money).toBe(1_000_000);
  });

  test("grant_asset gives one whole unit, remove_asset drops the holding", () => {
    let w = runAction(rich(), bundles, "mkt/gift-index").world;
    expect(held(w, INDEX)).toMatchObject({ units: 10000, basis: 10000 });
    expect(me(w).money).toBe(1_000_000);
    w = runAction(w, bundles, "mkt/lose-index").world;
    expect(held(w, INDEX)).toBeUndefined();
  });

  test("market kinds are not in the shop and cannot be purchased", () => {
    expect(listShop(rich(), bundles)).toEqual([]);
    expect(() => purchase(rich(), bundles, INDEX, "cash")).toThrow(RangeError);
    expect(listMarket(rich(), bundles).map((r) => r.id)).toEqual([
      BOND,
      INDEX,
      PENNY,
      SHAKY,
      STOCK,
    ]);
  });

  test("net worth and expressions include holdings", () => {
    const w = trade(rich(), bundles, INDEX, 400_000).world;
    expect(netWorth(w, me(w))).toBe(1_000_000);
    const later = years(w, 5);
    const value = call(later, "holding_value", INDEX) as number;
    expect(
      makeEnv(later, idx, { subject: later.playerId }).get("portfolio"),
    ).toBe(value);
    expect(netWorth(later, me(later))).toBe(me(later).money + value);
    expect(call(later, "units", INDEX)).toBe(held(later, INDEX)?.units);
    expect(call(later, "cost_basis", INDEX)).toBe(400_000);
    expect(call(later, "holding_years", INDEX)).toBe(5);
  });

  test("a delisted kind prices at 0 for good and its holding can still be cleared", () => {
    let w = trade(rich(), bundles, PENNY, 100_000).world;
    let delisted = false;
    for (let i = 0; i < 40 && !delisted; i++) {
      w = ageUp(w, bundles).world;
      delisted = price(w, PENNY) === 0;
    }
    expect(delisted).toBe(true);
    expect(w.market[PENNY]?.next).toBe(0);
    expect(years(w, 2).market[PENNY]?.prices.at(-1)).toBe(0);
    const cash = me(w).money;
    expect(() => trade(w, bundles, PENNY, 100)).toThrow(/afford/);
    w = trade(w, bundles, PENNY, -1).world;
    expect(held(w, PENNY)).toBeUndefined();
    expect(me(w).money).toBe(cash);
  });
});

describe("government bonds", () => {
  test("pay a yearly coupon, return the principal at maturity and close the holding", () => {
    let w = trade(rich(), bundles, BOND, 500_000).world;
    const maturity = held(w, BOND)?.maturesYear;
    expect(maturity).toBe(w.worldYear + 3);
    w = years(w, 1);
    expect(me(w).money).toBe(500_000 + 20_000);
    w = years(w, 1);
    expect(me(w).money).toBe(500_000 + 40_000);
    w = years(w, 1);
    expect(held(w, BOND)).toBeUndefined();
    expect(me(w).money).toBe(500_000 + 60_000 + 500_000);
    expect(w.journal.flatMap((e) => e.lines).join("\n")).toContain("matured");
  });

  test("can be sold early at the market price", () => {
    let w = trade(rich(), bundles, BOND, 500_000).world;
    w = trade(years(w, 1), bundles, BOND, -1_000_000).world;
    expect(held(w, BOND)).toBeUndefined();
    expect(me(w).money).toBe(500_000 + 20_000 + 500_000);
  });

  test("an issuer default cuts price, coupons and the principal repaid", () => {
    let w = trade(rich(), bundles, SHAKY, 500_000).world;
    w = years(w, 1);
    // default: 100% yearly chance, 40% loss each time the roll hits
    expect(w.market[SHAKY]?.face).toBe(6000);
    expect(price(w, SHAKY)).toBe(6000);
    // the coupon of that settlement already paid on the reduced principal (5% of 60%)
    expect(me(w).money).toBe(500_000 + 15_000);
    expect(w.journal.flatMap((e) => e.lines).join("\n")).toContain("defaulted");
  });
});

describe("persistence", () => {
  const traded = (): World => {
    let w = godSetMoney(newLife(bundles, 21), 1_000_000);
    w = trade(w, bundles, INDEX, 300_000).world;
    w = trade(w, bundles, BOND, 200_000).world;
    w = years(w, 4);
    return trade(w, bundles, INDEX, -100_000).world;
  };
  const file = (w: World) =>
    ({
      schemaVersion: SAVE_SCHEMA_VERSION,
      capabilities: [],
      appliedMigrations: [],
      lives: [{ id: "a", name: "A", world: w }],
      graveyard: [],
    }) as SaveFile;

  test("holdings and series are in the world hash, and replay reproduces them", () => {
    const w = traded();
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    const changed = updatePerson(w, w.playerId, (p) => ({
      ...p,
      holdings: p.holdings.map((h) => ({ ...h, units: h.units + 1 })),
    }));
    expect(worldHash(changed)).not.toBe(worldHash(w));
    const repriced = {
      ...w,
      market: {
        ...w.market,
        [INDEX]: { ...(w.market[INDEX] as Series), next: 1 },
      },
    };
    expect(worldHash(repriced)).not.toBe(worldHash(w));
  });

  test("a save round-trips holdings and series", () => {
    const w = traded();
    const back = parseSave(serializeSave(file(w))).lives[0]?.world as World;
    expect(worldHash(back)).toBe(worldHash(w));
    expect(me(back).holdings).toEqual(me(w).holdings);
  });
});
