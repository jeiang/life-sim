import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  evaluate,
  getPerson,
  indexBundles,
  listActions,
  listMarket,
  makeEnv,
  newLife,
  type PackBundle,
  runAction,
  type Series,
  updatePerson,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"));
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);

const K = (id: string) => `investing/${id}`;
const TIPPED = [
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
];
const PENNY = ["pinecrest-mining", "brightwave-labs"];
const ASK = K("ask-for-tip");
const NEWS = K("read-the-news");
const BOOK = K("read-investing-book");
const SCAMS = ["ponzi-scheme", "fake-coin", "guaranteed-returns"].map(K);

const me = (w: World) => getPerson(w, w.playerId);

/** A life at `age` with `money`, smarts 50. */
function at(age: number, money: number, seed = 5): World {
  const w = newLife(bundles, seed);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age,
    money,
    stats: { ...p.stats, smarts: 50, happiness: 50 },
  }));
}

const parentOf = (w: World): number =>
  w.relationships.find(
    (r) => r.from === w.playerId && r.role === "core-loop/parent",
  )?.to as number;

const withForecast = (w: World, kind: string, bp: number): World => ({
  ...w,
  market: {
    ...w.market,
    [K(kind)]: { ...(w.market[K(kind)] as Series), next: bp },
  },
});

/** The bundles with every outcome weight of `storyletId` (in `choice`, or its own list) 0 except `pick`. */
function only(
  storyletId: string,
  choice: number | null,
  pick: number,
): PackBundle[] {
  const copy = structuredClone(bundles) as PackBundle[];
  for (const b of copy)
    for (const s of b.storylets) {
      if (s.id !== storyletId) continue;
      const outs = choice === null ? s.outcomes : s.choices[choice]?.outcomes;
      outs?.forEach((o, i) => {
        (o as { weight: unknown }).weight = i === pick ? 1 : 0;
      });
    }
  return copy;
}

const outcomes = (id: string) => idx.storylets.get(id)?.outcomes ?? [];
const weightOf = (w: World, id: string, i: number, person?: number): number =>
  evaluate(
    outcomes(id)[i]?.weight as never,
    makeEnv(w, idx, {
      subject: w.playerId,
      ...(person === undefined ? {} : { person }),
    }),
  ) as number;
/** Index of the outcome that chains to `next`. */
const toward = (id: string, next: string): number =>
  outcomes(id).findIndex((o) => o.next === next);

const ask = (w: World, id: string) =>
  id === ASK
    ? listActions(w, bundles, "relationships", parentOf(w)).find(
        (r) => r.id === id,
      )
    : listActions(w, bundles, "activities/investing").find((r) => r.id === id);

describe("market kinds", () => {
  test("the Pack trades the decided kinds, all from age 18", () => {
    const rows = listMarket(at(30, 0), bundles).map((r) => r.id);
    expect(rows.sort()).toEqual(
      [...TIPPED, "gov-bond-10", "gov-bond-5"].map(K).sort(),
    );
    for (const r of listMarket(at(17, 100000), bundles)) {
      expect(r.locked, r.id).toBe(true);
      expect(r.reason, r.id).toBe("Age 18+");
    }
    for (const r of listMarket(at(18, 100000), bundles))
      expect(r.locked, r.id).toBe(false);
  });

  test("penny stocks swing, can 10x and can be delisted, with a negative mean", () => {
    for (const p of PENNY) {
      const m = idx.markets.get(K(p))?.market;
      expect(m?.jump?.multiple).toBe(10);
      expect(m?.delistBp).toBeGreaterThan(0);
      expect(m?.volBp).toBeGreaterThanOrEqual(5000);
      expect(m?.driftBp).toBeLessThan(0);
    }
  });

  test("government bonds: 5 and 10 years, a coupon and a small shared issuer default chance", () => {
    const [b5, b10] = ["gov-bond-5", "gov-bond-10"].map(
      (k) => idx.markets.get(K(k))?.market?.bond,
    );
    expect([b5?.termYears, b10?.termYears]).toEqual([5, 10]);
    expect(b5?.couponBp).toBeGreaterThan(0);
    expect(b10?.couponBp).toBeGreaterThan(0);
    expect(b5?.defaultBp).toBe(b10?.defaultBp);
    expect(b5?.defaultBp).toBeGreaterThan(0);
    expect(b5?.defaultBp).toBeLessThanOrEqual(100);
    expect(b5?.lossBp).toBeGreaterThan(0);
  });

  test("a shortfall never sells holdings", () => {
    const b = only(NEWS, null, toward(NEWS, K("tip-total-market")));
    let w = updatePerson(at(30, 1_000_000), 1, (p) => p);
    w = choose(runAction(w, b, NEWS).world, b, 0).world;
    const held = me(w).holdings;
    expect(held.length).toBe(1);
    const broke = updatePerson(w, w.playerId, (p) => ({
      ...p,
      withParents: false,
      money: 0,
    }));
    expect(me(ageUp(broke, bundles).world).holdings).toEqual(held);
  });
});

describe("tip sources", () => {
  test("relatives and friends: adults only, one tip a year each", () => {
    expect(ask(at(17, 0), ASK)?.locked).toBe(true);
    const w = at(18, 0);
    expect(ask(w, ASK)?.locked).toBe(false);
    const b = only(ASK, null, toward(ASK, K("tip-total-market")));
    const done = runAction(w, b, ASK, parentOf(w)).world;
    expect(done.pending?.storyletId).toBe(K("tip-total-market"));
    const cleared = choose(done, b, 2).world;
    expect(ask(cleared, ASK)?.locked).toBe(true);
    const next = updatePerson(cleared, cleared.playerId, (p) => ({
      ...p,
      age: p.age + 1,
    }));
    expect(ask(next, ASK)?.locked).toBe(false);
  });

  test("the news and a book: adults only, one a year; the book costs $25 and teaches a little", () => {
    expect(ask(at(17, 100000), NEWS)?.locked).toBe(true);
    expect(ask(at(18, 0), NEWS)?.locked).toBe(false);
    expect(ask(at(17, 100000), BOOK)?.locked).toBe(true);
    expect(ask(at(18, 2499), BOOK)?.locked).toBe(true);
    const w = at(18, 2500);
    expect(ask(w, BOOK)?.locked).toBe(false);
    const b = only(BOOK, null, 0);
    const read = runAction(w, b, BOOK).world;
    expect(me(read).money).toBe(0);
    expect(me(read).stats.smarts).toBe(51);
    const cleared = choose(read, b, 2).world;
    expect(
      ask(
        updatePerson(cleared, cleared.playerId, (p) => ({ ...p, money: 9999 })),
        BOOK,
      )?.locked,
    ).toBe(true);
    const n = runAction(at(18, 0), only(NEWS, null, 0), NEWS).world;
    expect(me(n).money).toBe(0);
  });

  test("every source can name every tippable kind, and nothing else", () => {
    for (const id of [ASK, NEWS, BOOK]) {
      const named = outcomes(id)
        .map((o) => o.next)
        .filter((n) => n?.startsWith(K("tip-")));
      expect(named.sort()).toEqual(TIPPED.map((k) => K(`tip-${k}`)).sort());
    }
  });

  test("a higher forecast and a better source make a kind likelier, never certain", () => {
    const w = at(30, 0);
    const person = parentOf(w);
    for (const [id, p] of [
      [ASK, person],
      [NEWS, undefined],
      [BOOK, undefined],
    ] as const) {
      const i = toward(id, K("tip-acme-robotics"));
      const low = weightOf(withForecast(w, "acme-robotics", -5000), id, i, p);
      const flat = weightOf(withForecast(w, "acme-robotics", 0), id, i, p);
      const high = weightOf(withForecast(w, "acme-robotics", 5000), id, i, p);
      expect(low, id).toBeGreaterThanOrEqual(100);
      expect(low, id).toBeLessThan(flat);
      expect(high, id).toBeGreaterThan(flat);
      expect(high, id).toBeLessThan(flat * 2);
    }
    const fc = (id: string, p?: number) =>
      weightOf(
        withForecast(w, "acme-robotics", 5000),
        id,
        toward(id, K("tip-acme-robotics")),
        p,
      );
    expect(fc(BOOK)).toBeGreaterThan(fc(NEWS));
    const smart = updatePerson(w, person, (x) => ({
      ...x,
      stats: { ...x.stats, smarts: 100 },
    }));
    const dull = updatePerson(w, person, (x) => ({
      ...x,
      stats: { ...x.stats, smarts: 0 },
    }));
    const rel = (x: World) =>
      weightOf(
        withForecast(x, "acme-robotics", 5000),
        ASK,
        toward(ASK, K("tip-acme-robotics")),
        person,
      );
    expect(rel(smart)).toBeGreaterThan(rel(dull));
  });

  test("no source tips a kind that is worth next to nothing", () => {
    const w = at(30, 0);
    const dead = {
      ...w,
      market: {
        ...w.market,
        [K("quark-coin")]: {
          ...(w.market[K("quark-coin")] as Series),
          prices: [1, 1],
          next: 9000,
        },
      },
    };
    for (const id of [NEWS, BOOK])
      expect(weightOf(dead, id, toward(id, K("tip-quark-coin")))).toBe(0);
    expect(
      weightOf(dead, ASK, toward(ASK, K("insider-quark-coin")), parentOf(w)),
    ).toBe(0);
  });

  test("a tip chains to its kind's offer, so the player never names the kind", () => {
    for (const k of TIPPED) {
      const w = at(30, 1_000_000);
      const b = only(NEWS, null, toward(NEWS, K(`tip-${k}`)));
      expect(runAction(w, b, NEWS).world.pending?.storyletId).toBe(
        K(`tip-${k}`),
      );
    }
  });
});

describe("acting on a tip", () => {
  for (const k of TIPPED) {
    test(`${k}: small, large and no trade`, () => {
      const b = only(NEWS, null, toward(NEWS, K(`tip-${k}`)));
      const start = at(30, 1_000_000);
      const pending = runAction(start, b, NEWS).world;
      const view = pending.pending?.storyletId;
      expect(view).toBe(K(`tip-${k}`));
      const small = choose(pending, b, 0).world;
      expect(me(small).money).toBe(1_000_000 - 50000);
      expect(me(small).holdings.map((h) => h.kindId)).toEqual([K(k)]);
      const large = choose(pending, b, 1).world;
      expect(me(large).money).toBe(750000);
      const pass = choose(pending, b, 2).world;
      expect(me(pass).money).toBe(1_000_000);
      expect(me(pass).holdings).toEqual([]);
    });
  }

  test("a trade needs $200 in cash", () => {
    const b = only(NEWS, null, toward(NEWS, K("tip-total-market")));
    const poor = runAction(at(30, 19999), b, NEWS).world;
    const enabled = idx.storylets
      .get(K("tip-total-market"))
      ?.choices.map((c) =>
        c.when
          ? evaluate(
              c.when as never,
              makeEnv(poor, idx, { subject: poor.playerId }),
            )
          : true,
      );
    expect(enabled).toEqual([false, false, true]);
  });
});

describe("insider tips", () => {
  test("only relatives and friends offer them, never on a penny stock", () => {
    expect(
      outcomes(ASK).filter((o) => o.next?.startsWith(K("insider-"))).length,
    ).toBe(TIPPED.length - PENNY.length);
    for (const id of [NEWS, BOOK])
      expect(outcomes(id).some((o) => o.next?.includes("insider"))).toBe(false);
    for (const p of PENNY)
      expect(idx.storylets.has(K(`insider-${p}`))).toBe(false);
  });

  test("rare: only a kind forecast to soar is named, with a capped weight, from an adult", () => {
    const w = at(30, 0);
    const person = parentOf(w);
    const i = toward(ASK, K("insider-acme-robotics"));
    expect(
      weightOf(withForecast(w, "acme-robotics", 2000), ASK, i, person),
    ).toBe(0);
    expect(
      weightOf(withForecast(w, "acme-robotics", -3000), ASK, i, person),
    ).toBe(0);
    const mid = weightOf(
      withForecast(w, "acme-robotics", 3500),
      ASK,
      i,
      person,
    );
    expect(mid).toBeGreaterThan(0);
    expect(
      weightOf(withForecast(w, "acme-robotics", 90000), ASK, i, person),
    ).toBe(20);
    expect(mid).toBeLessThan(20);
    // an ordinary tip stays far likelier than the insider one
    expect(
      weightOf(
        withForecast(w, "acme-robotics", 90000),
        ASK,
        toward(ASK, K("tip-total-market")),
        person,
      ),
    ).toBeGreaterThan(20 * 10);
    expect(outcomes(ASK)[i]?.when).toBeDefined();
    const young = updatePerson(w, person, (x) => ({ ...x, age: 24 }));
    const old = updatePerson(w, person, (x) => ({ ...x, age: 25 }));
    const gate = (x: World) =>
      evaluate(
        outcomes(ASK)[i]?.when as never,
        makeEnv(x, idx, { subject: x.playerId, person }),
      );
    expect([gate(young), gate(old)]).toEqual([false, true]);
  });

  test("acting records the age; passing does not", () => {
    const w = at(37, 1_000_000);
    const b = only(ASK, null, toward(ASK, K("insider-acme-robotics")));
    const pending = runAction(w, b, ASK, parentOf(w)).world;
    expect(pending.pending?.storyletId).toBe(K("insider-acme-robotics"));
    const acted = choose(pending, b, 0).world;
    expect(me(acted).qualities.invest_insider_age).toBe(37);
    expect(me(acted).money).toBe(600000);
    expect(me(acted).holdings[0]?.kindId).toBe(K("acme-robotics"));
    const passed = choose(pending, b, 1).world;
    expect(me(passed).qualities.invest_insider_age ?? 0).toBe(0);
    expect(me(passed).money).toBe(1_000_000);
  });
});

describe("scams", () => {
  const weightIn = (w: World, id: string) =>
    evaluate(
      idx.storylets.get(id)?.weight as never,
      makeEnv(w, idx, { subject: w.playerId }),
    ) as number;
  const eligible = (w: World, id: string) =>
    evaluate(
      idx.storylets.get(id)?.when as never,
      makeEnv(w, idx, { subject: w.playerId }),
    );

  test("adults with $500 or more only", () => {
    for (const id of SCAMS) {
      expect(eligible(at(17, 1_000_000), id), id).toBe(false);
      expect(eligible(at(18, 49999), id), id).toBe(false);
      expect(eligible(at(18, 50000), id), id).toBe(true);
      expect(idx.storylets.get(id)?.cooldown).toBeGreaterThan(0);
    }
  });

  test("likelier at low smarts, less likely after each scam lost to", () => {
    const smarts = (s: number, scams = 0) => {
      const w = at(30, 1_000_000);
      return updatePerson(w, w.playerId, (p) => ({
        ...p,
        stats: { ...p.stats, smarts: s },
        qualities: { ...p.qualities, invest_scams: scams },
      }));
    };
    for (const id of SCAMS) {
      expect(weightIn(smarts(0), id)).toBeGreaterThan(
        weightIn(smarts(100), id),
      );
      expect(weightIn(smarts(100), id)).toBeGreaterThanOrEqual(1);
      expect(weightIn(smarts(0, 3), id)).toBeLessThan(weightIn(smarts(0), id));
      expect(weightIn(smarts(0, 50), id)).toBe(1);
    }
  });

  for (const id of SCAMS)
    test(`${id}: every branch`, () => {
      const m = 1_000_000;
      const run = (choice: number, out: number) => {
        const b = only(id, choice, out);
        let w = at(30, m);
        w = { ...w, pending: { storyletId: id } as never };
        return choose(w, b, choice).world;
      };
      // choice 0: 10% stake. lose / early payout
      let w = run(0, 0);
      expect(me(w).money).toBe(m - m / 10);
      expect(me(w).qualities.invest_scams).toBe(1);
      expect(me(w).stats.happiness).toBe(44);
      w = run(0, 1);
      expect(me(w).money).toBe(m + m / 50);
      expect(me(w).qualities.invest_scams ?? 0).toBe(0);
      // choice 1: 40% stake
      w = run(1, 0);
      expect(me(w).money).toBe(m - (m * 2) / 5);
      expect(me(w).qualities.invest_scams).toBe(1);
      expect(me(w).stats.happiness).toBe(40);
      w = run(1, 1);
      expect(me(w).money).toBe(m + Math.trunc(m / 12));
      // choice 2: look into it. spot / miss
      w = run(2, 0);
      expect(me(w).money).toBe(m);
      expect(me(w).stats.smarts).toBe(51);
      w = run(2, 1);
      expect(me(w).money).toBe(m - m / 10);
      expect(me(w).qualities.invest_scams).toBe(1);
      // choice 3: walk away
      w = run(3, 0);
      expect(me(w).money).toBe(m);
      expect(me(w).qualities.invest_scams ?? 0).toBe(0);
    });

  test("looking into it works more often with smarts", () => {
    for (const id of SCAMS) {
      const outs = idx.storylets.get(id)?.choices[2]?.outcomes ?? [];
      const sm = (s: number) => {
        const w = updatePerson(at(30, 1_000_000), at(30, 0).playerId, (p) => ({
          ...p,
          stats: { ...p.stats, smarts: s },
        }));
        return outs.map((o) =>
          evaluate(o.weight as never, makeEnv(w, idx, { subject: w.playerId })),
        ) as number[];
      };
      expect(sm(100)).toEqual([100, 0]);
      expect(sm(0)).toEqual([0, 100]);
    }
  });
});
