import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  getPerson,
  indexBundles,
  listActions,
  newLife,
  runAction,
  setQuality,
  updatePerson,
  type World,
} from "../../../packages/core/src/index.ts";
import type { CompiledOutcome } from "../../../packages/core/src/pack.ts";
import { applyEffects } from "../../../packages/core/src/sim/effects.ts";
import { evalBool, evalInt } from "../../../packages/core/src/sim/ops.ts";
import { scopeFor } from "../../../packages/core/src/sim/storylets.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), {
  only: ["gambling"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const G = (id: string) => `gambling/${id}`;

const me = (w: World) => getPerson(w, w.playerId);
const q = (w: World, id: string) => me(w).qualities[id];
const qn = (w: World, id: string) => q(w, id) as number;

/** An adult with `money`, optional smarts and qualities. */
function life(
  money: number,
  opts: {
    age?: number;
    smarts?: number;
    q?: Record<string, number | boolean>;
  } = {},
): World {
  const w0 = newLife(bundles, 5);
  let w = updatePerson(w0, w0.playerId, (p) => ({
    ...p,
    age: opts.age ?? 30,
    money,
    stats: { ...p.stats, smarts: opts.smarts ?? 50 },
  }));
  for (const [k, v] of Object.entries(opts.q ?? {}))
    w = setQuality(w, w.playerId, k, v);
  return w;
}

type Outcome = CompiledOutcome;
const story = (id: string) => {
  const s = idx.storylets.get(id.includes("/") ? id : G(id));
  if (!s) throw new Error(`no storylet ${id}`);
  return s;
};
const outcomesOf = (id: string, choice?: number): readonly Outcome[] =>
  choice === undefined
    ? story(id).outcomes
    : (story(id).choices[choice]?.outcomes ?? []);

function apply(w: World, o: Outcome, amount?: number, id?: string): World {
  return applyEffects(
    w,
    idx,
    o.effects,
    scopeFor(w, undefined, id, amount),
    new Map(),
  );
}

/** Outcomes that can be drawn now with their integer weights. */
function eligible(
  w: World,
  id: string,
  choice: number | undefined,
  amount?: number,
) {
  const scope = scopeFor(w, undefined, id, amount);
  return outcomesOf(id, choice)
    .filter((o) => evalBool(o.when, w, idx, scope))
    .map((o) => ({ o, weight: evalInt(o.weight, w, idx, scope) }));
}

/**
 * Expected change of cash for one use, following `next:` chains and taking the best-valued
 * enabled choice at each later step (`first` takes choice 0 instead).
 */
function expectedDelta(
  w: World,
  id: string,
  choice: number | undefined,
  amount: number | undefined,
  policy: "best" | "first" = "best",
): number {
  const rows = eligible(w, id, choice, amount);
  const total = rows.reduce((a, r) => a + r.weight, 0);
  let sum = 0;
  for (const { o, weight } of rows) {
    const after = apply(w, o, amount, id);
    let d = me(after).money - me(w).money;
    if (o.next) {
      const nx = idx.storylets.get(o.next);
      if (!nx) throw new Error("dangling next");
      const scope = scopeFor(after, undefined, nx.id);
      const opts = nx.choices
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => evalBool(c.when, after, idx, scope))
        .map(({ i }) => expectedDelta(after, nx.id, i, undefined, policy));
      d += policy === "best" ? Math.max(...opts) : (opts[0] as number);
    }
    sum += (weight / total) * d;
  }
  return sum;
}

const ret = (
  w: World,
  id: string,
  choice: number | undefined,
  amount: number,
  p: "best" | "first" = "best",
) => 1 + expectedDelta(w, id, choice, amount, p) / amount;

describe("gating", () => {
  test("casino games need age 18, an open door and the table minimum", () => {
    expect(
      listActions(
        life(100000, { age: 17 }),
        bundles,
        "activities/casino",
      ).every((r) => r.locked),
    ).toBe(true);
    const rows = listActions(life(100000), bundles, "activities/casino");
    expect(rows.map((r) => r.id)).toEqual(
      [
        "baccarat",
        "blackjack",
        "horse-races",
        "poker",
        "roulette",
        "slots",
        "craps",
      ]
        .map((n) =>
          G(
            { "horse-races": "bet-on-horse-races", craps: "roll-craps" }[n] ??
              `play-${n}`,
          ),
        )
        .sort(),
    );
    expect(rows.every((r) => !r.locked)).toBe(true);
    // Minimums: $5 roulette, $1 slots, $10 blackjack, $50 poker.
    const broke = (m: number) =>
      Object.fromEntries(
        listActions(life(m), bundles, "activities/casino").map((r) => [
          r.id,
          r.locked,
        ]),
      );
    expect(broke(99)[G("play-slots")]).toBe(true);
    expect(broke(100)[G("play-slots")]).toBe(false);
    expect(broke(499)[G("play-roulette")]).toBe(true);
    expect(broke(500)[G("play-roulette")]).toBe(false);
    expect(broke(4999)[G("play-poker")]).toBe(true);
    expect(broke(5000)[G("play-poker")]).toBe(false);
  });

  test("a ban locks the casinos until the player reaches the ban age, but not the lottery", () => {
    const banned = life(100000, { q: { gambling_banned_until: 35 } });
    expect(
      listActions(banned, bundles, "activities/casino").every((r) => r.locked),
    ).toBe(true);
    expect(
      listActions(banned, bundles, "activities").find(
        (r) => r.id === G("buy-lottery-ticket"),
      )?.locked,
    ).toBe(false);
    const later = updatePerson(banned, banned.playerId, (p) => ({
      ...p,
      age: 35,
    }));
    expect(
      listActions(later, bundles, "activities/casino").every((r) => !r.locked),
    ).toBe(true);
  });

  test("the table limit caps the amount at cash, and the VIP room raises it", () => {
    const max = (w: World, id: string) =>
      listActions(w, bundles, "activities/casino").find((r) => r.id === G(id))
        ?.amount;
    expect(max(life(30000), "play-roulette")).toMatchObject({
      min: 500,
      max: 30000,
      step: 100,
    });
    expect(max(life(900000), "play-roulette")?.max).toBe(50000);
    expect(
      max(life(900000, { q: { gambling_vip: true } }), "play-roulette")?.max,
    ).toBe(500000);
    expect(
      max(life(20000000, { q: { gambling_vip: true } }), "play-poker")?.max,
    ).toBe(1000000);
    expect(max(life(20000000), "play-poker")?.max).toBe(100000);
  });

  test("games repeat all year; payouts and costs are never scaled, only happiness gains", () => {
    let w = life(1000000);
    const row = (x: World) =>
      listActions(x, bundles, "activities/casino").find(
        (r) => r.id === G("play-slots"),
      );
    for (let i = 0; i < 25; i++)
      w = runAction(w, bundles, G("play-slots"), undefined, 100).world;
    expect(row(w)?.locked).toBe(false);
    expect(story("play-slots").repeatable).toBe(true);
    // No game or lottery payout/cost depends on how often it was used.
    const ids =
      bundles
        .find((b) => b.id === "gambling")
        ?.storylets.filter((s) => s.trigger === "action") ?? [];
    for (const s of ids)
      expect(JSON.stringify(s)).not.toContain("uses_this_year");
  });

  test("the lottery ticket costs $2 and needs age 18", () => {
    const row = (w: World) =>
      listActions(w, bundles, "activities").find(
        (r) => r.id === G("buy-lottery-ticket"),
      );
    expect(row(life(199))?.locked).toBe(true);
    expect(row(life(200))?.locked).toBe(false);
    expect(row(life(1000, { age: 17 }))?.locked).toBe(true);
    const w = runAction(life(1000), bundles, G("buy-lottery-ticket")).world;
    expect(qn(w, "gambling_wagered")).toBe(200);
    expect(me(w).money).toBeLessThanOrEqual(800 + 500000000);
  });

  test("support meetings are for the addicted and once a year", () => {
    const row = (w: World) =>
      listActions(w, bundles, "activities").find(
        (r) => r.id === G("gambling-support-meeting"),
      );
    expect(row(life(1000))?.locked).toBe(true);
    const addicted = life(1000, { q: { gambling_addicted: true } });
    expect(row(addicted)?.locked).toBe(false);
    const went = runAction(
      addicted,
      bundles,
      G("gambling-support-meeting"),
    ).world;
    expect(qn(went, "gambling_recovery")).toBe(1);
    expect(row(went)?.locked).toBe(true);
  });
});

describe("every bet keeps the books and never takes more than the stake", () => {
  const games = [
    "play-roulette",
    "play-slots",
    "bet-on-horse-races",
    "roll-craps",
    "play-baccarat",
    "play-blackjack",
    "play-poker",
  ].map(G);
  for (const id of games) {
    test(`${id}: stake counted, loss counted, cash never below 0`, () => {
      const s = idx.storylets.get(id);
      if (!s) throw new Error(id);
      const choices =
        s.choices.length > 0 ? s.choices.map((_, i) => i) : [undefined];
      for (const amount of [s.amount ? 500 : 0, 500, 10000]) {
        for (const c of choices) {
          const w0 = life(amount, { smarts: 100 });
          for (const { o } of eligible(w0, id, c, amount)) {
            const w = apply(w0, o, amount, id);
            expect(qn(w, "gambling_bets_year")).toBe(1);
            expect(qn(w, "gambling_wagered")).toBe(amount);
            if (o.next) {
              expect(me(w).money).toBe(0); // the stake sits in the pot
              expect(qn(w, "gambling_pot")).toBe(amount);
              for (
                let k = 0;
                k < story(o.next.split("/")[1] as string).choices.length;
                k++
              ) {
                // Raise needs spare cash; give half the pot and none.
                for (const spare of [0, Math.floor(amount / 2)]) {
                  const w1 = updatePerson(w, w.playerId, (p) => ({
                    ...p,
                    money: spare,
                  }));
                  const sc = scopeFor(w1, undefined, o.next);
                  const ch = idx.storylets.get(o.next)?.choices[k];
                  if (!evalBool(ch?.when, w1, idx, sc)) continue;
                  for (const r of eligible(w1, o.next, k)) {
                    const w2 = apply(w1, r.o);
                    expect(me(w2).money).toBeGreaterThanOrEqual(0);
                    const lostNow = qn(w2, "gambling_lost");
                    expect(lostNow).toBeLessThanOrEqual(amount * 2);
                    // A loss resets the streak; a win adds one.
                    const streak = qn(w2, "gambling_streak");
                    expect(streak === 0 || streak === 1).toBe(true);
                  }
                }
              }
            } else {
              const money = me(w).money;
              expect(money).toBeGreaterThanOrEqual(0);
              const lost = qn(w, "gambling_lost");
              if (money < amount) {
                // Lost: cash drops by exactly the stake, counted as lost, streak reset.
                expect(money).toBe(0);
                expect(lost).toBe(amount);
                expect(qn(w, "gambling_streak")).toBe(0);
              } else if (money > amount) {
                expect(lost).toBe(0);
                expect(qn(w, "gambling_streak")).toBe(1);
              } else {
                expect(lost).toBe(0); // push
              }
            }
          }
        }
      }
    });
  }
});

describe("table returns", () => {
  const r = (
    id: string,
    choice: number | undefined,
    p: "best" | "first" = "best",
    smarts = 50,
  ) => ret(life(1000000, { smarts }), G(id), choice, 10000, p);

  test("roulette pays about 95%, slots about 90%, horses about 93%", () => {
    for (const c of [0, 1, 2])
      expect(r("play-roulette", c)).toBeCloseTo(0.95, 2);
    expect(r("play-slots", undefined)).toBeCloseTo(0.9, 2);
    for (const c of [0, 1, 2])
      expect(r("bet-on-horse-races", c)).toBeCloseTo(0.93, 2);
  });

  test("craps, baccarat and blackjack favour the house", () => {
    expect(r("roll-craps", 0)).toBeCloseTo(0.944, 2);
    expect(r("roll-craps", 1)).toBeCloseTo(0.833, 2);
    expect(r("play-baccarat", 0)).toBeCloseTo(0.9896, 2);
    expect(r("play-baccarat", 2)).toBeCloseTo(0.8577, 2);
    const best = r("play-blackjack", undefined, "best");
    const stand = r("play-blackjack", undefined, "first");
    expect(best).toBeGreaterThan(0.94);
    expect(best).toBeLessThan(0.99);
    expect(stand).toBeLessThanOrEqual(best + 1e-9);
  });

  test("poker: smarts help but the house still edges the best play", () => {
    const low = r("play-poker", undefined, "best", 0);
    const high = r("play-poker", undefined, "best", 100);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThan(1);
    expect(low).toBeGreaterThan(0.8);
  });

  test("the lottery returns about half the ticket price, with a $5,000,000 jackpot", () => {
    const w = life(100000);
    expect(ret(w, G("buy-lottery-ticket"), undefined, 200)).toBeCloseTo(0.5, 2);
    const top = outcomesOf("buy-lottery-ticket").map((o) =>
      evalInt(o.weight, w, idx, scopeFor(w, undefined)),
    );
    expect(top[0]).toBe(1);
    expect(top.reduce((a, b) => a + b, 0)).toBe(10000000);
    const hit = apply(w, outcomesOf("buy-lottery-ticket")[0] as Outcome);
    expect(me(hit).money - me(w).money).toBe(500000000 - 200);
  });
});

describe("habit, addiction and cheating", () => {
  const only = (w: World, id: string) => {
    const rows = eligible(w, id, undefined);
    expect(rows).toHaveLength(1);
    return apply(w, rows[0]?.o as Outcome, undefined, G(id));
  };
  const year = (bets: number, extra: Record<string, number | boolean> = {}) =>
    only(
      life(100000, {
        q: { gambling_bets_year: bets, gambling_heat: 30, ...extra },
      }),
      "year-at-the-tables",
    );

  test("four or more bets in a year build the habit, fewer let it fade", () => {
    expect(qn(year(4), "gambling_heat")).toBe(30 + 8 + 8);
    expect(qn(year(9), "gambling_heat")).toBe(30 + 8 + 18);
    expect(qn(year(2), "gambling_heat")).toBe(25);
    expect(qn(year(0), "gambling_heat")).toBe(10);
    for (const b of [0, 2, 4])
      expect(qn(year(b), "gambling_bets_year")).toBe(0);
  });

  test("addicted: betting again resets recovery and costs happiness; a clean year adds recovery and withdrawal", () => {
    const happy = (w: World) => me(w).stats.happiness as number;
    const w0 = life(100000, {
      q: {
        gambling_addicted: true,
        gambling_recovery: 2,
        gambling_bets_year: 3,
        gambling_heat: 40,
      },
    });
    const still = only(w0, "year-at-the-tables");
    expect(qn(still, "gambling_recovery")).toBe(0);
    expect(happy(still)).toBe(happy(w0) - 3);
    const clean = only(
      life(100000, {
        q: { gambling_addicted: true, gambling_recovery: 1, gambling_heat: 40 },
      }),
      "year-at-the-tables",
    );
    expect(qn(clean, "gambling_recovery")).toBe(2);
    expect(qn(clean, "gambling_heat")).toBe(30);
  });

  test("addiction starts from a high habit and ends after three clean steps", () => {
    const hooked = story("gambling-hooked");
    const chance = (heat: number) =>
      evalInt(
        hooked.chance as never,
        life(0, { q: { gambling_heat: heat } }),
        idx,
        scopeFor(life(0), undefined),
      );
    expect(chance(21)).toBe(40);
    expect(chance(60)).toBe(1600);
    const noHabit = life(0, { q: { gambling_heat: 20 } });
    expect(
      evalBool(hooked.when, noHabit, idx, scopeFor(noHabit, undefined)),
    ).toBe(false);
    const w = only(life(0, { q: { gambling_heat: 50 } }), "gambling-hooked");
    expect(q(w, "gambling_addicted")).toBe(true);

    const done = life(0, {
      q: { gambling_addicted: true, gambling_recovery: 3, gambling_heat: 40 },
    });
    const rec = story("gambling-recovered");
    expect(evalBool(rec.when, done, idx, scopeFor(done, undefined))).toBe(true);
    const free = only(done, "gambling-recovered");
    expect([
      q(free, "gambling_addicted"),
      qn(free, "gambling_heat"),
      qn(free, "gambling_recovery"),
    ]).toEqual([false, 0, 0]);
    const notYet = life(0, {
      q: { gambling_addicted: true, gambling_recovery: 2 },
    });
    expect(evalBool(rec.when, notYet, idx, scopeFor(notYet, undefined))).toBe(
      false,
    );
  });

  test("an urge: resisting costs mood, giving in costs up to $500 and resets recovery", () => {
    const w0 = life(10000000, {
      q: { gambling_addicted: true, gambling_recovery: 2 },
    });
    const resist = apply(w0, outcomesOf("gambling-urge", 0)[0] as Outcome);
    expect(me(resist).money).toBe(me(w0).money);
    expect(qn(resist, "gambling_recovery")).toBe(2);
    const give = apply(w0, outcomesOf("gambling-urge", 1)[0] as Outcome);
    expect(me(give).money).toBe(me(w0).money - 50000);
    expect(qn(give, "gambling_recovery")).toBe(0);
    expect(qn(give, "gambling_lost")).toBe(50000);
    const poor = life(3000, { q: { gambling_addicted: true } });
    expect(
      me(apply(poor, outcomesOf("gambling-urge", 1)[0] as Outcome)).money,
    ).toBe(2700);
  });

  test("a win streak of five can end in a ban of 3, 5 or 10 years", () => {
    const cheat = story("gambling-suspected-cheating");
    const w = life(0, { age: 40, q: { gambling_streak: 5 } });
    expect(evalBool(cheat.when, w, idx, scopeFor(w, undefined))).toBe(true);
    const short = life(0, { age: 40, q: { gambling_streak: 4 } });
    expect(evalBool(cheat.when, short, idx, scopeFor(short, undefined))).toBe(
      false,
    );
    const banned = life(0, {
      age: 40,
      q: { gambling_streak: 9, gambling_banned_until: 50 },
    });
    expect(evalBool(cheat.when, banned, idx, scopeFor(banned, undefined))).toBe(
      false,
    );
    const bans = eligible(w, "gambling-suspected-cheating", undefined).map(
      ({ o, weight }) => [
        qn(apply(w, o), "gambling_banned_until"),
        weight,
        qn(apply(w, o), "gambling_streak"),
      ],
    );
    expect(bans).toEqual([
      [43, 3, 0],
      [45, 5, 0],
      [50, 2, 0],
    ]);
  });

  test("the VIP room opens once, from lifetime losses or from wealth that has gambled", () => {
    const vip = story("gambling-vip-invite");
    const ok = (w: World) => evalBool(vip.when, w, idx, scopeFor(w, undefined));
    expect(ok(life(0, { q: { gambling_lost: 2000000 } }))).toBe(true);
    expect(ok(life(0, { q: { gambling_lost: 1999999 } }))).toBe(false);
    expect(ok(life(10000000, { q: { gambling_wagered: 50000 } }))).toBe(true);
    expect(ok(life(10000000))).toBe(false);
    expect(ok(life(9999999, { q: { gambling_wagered: 50000 } }))).toBe(false);
    expect(
      ok(life(0, { q: { gambling_lost: 2000000, gambling_vip: true } })),
    ).toBe(false);
    expect(story("gambling-vip-invite").once).toBe(true);
    expect(
      q(
        only(life(0, { q: { gambling_lost: 2000000 } }), "gambling-vip-invite"),
        "gambling_vip",
      ),
    ).toBe(true);
  });
});

describe("friends, tips and splurges stake a share of cash and never overdraw", () => {
  const cases: [string, number, number][] = [
    ["casino-night-invite", 0, 20000],
    ["betting-pool-invite", 0, 10000],
    ["hot-tip", 0, 10000],
  ];
  for (const [id, choice, minMoney] of cases) {
    test(`${id}: stake is a share of cash, within the cap`, () => {
      for (const money of [minMoney, 1000000, 100000000]) {
        const w0 = life(money);
        for (const { o } of eligible(w0, id, choice)) {
          const w = apply(w0, o);
          const stake = qn(w, "gambling_wagered");
          const share = id === "casino-night-invite" ? 20 : 10;
          const cap = id === "casino-night-invite" ? 200000 : 100000;
          expect(stake).toBe(Math.min(Math.floor(money / share), cap));
          expect(me(w).money).toBeGreaterThanOrEqual(0);
          const lost = qn(w, "gambling_lost");
          expect(lost === 0 || lost === stake).toBe(true);
          expect(
            me(w).money === money - stake ? lost === stake : lost === 0,
          ).toBe(true);
        }
      }
    });
    test(`${id}: gated by age and a cash floor`, () => {
      const s = story(id);
      const ok = (w: World) => evalBool(s.when, w, idx, scopeFor(w, undefined));
      expect(ok(life(minMoney))).toBe(true);
      expect(ok(life(minMoney - 1))).toBe(false);
      expect(ok(life(minMoney, { age: 17 }))).toBe(false);
      expect(s.cooldown).toBeGreaterThan(0);
    });
  }

  test("casino night is closed to the banned; pool and tip are not casinos", () => {
    const night = story("casino-night-invite");
    const w = life(1000000, { q: { gambling_banned_until: 99 } });
    expect(evalBool(night.when, w, idx, scopeFor(w, undefined))).toBe(false);
    for (const id of ["betting-pool-invite", "hot-tip"])
      expect(evalBool(story(id).when, w, idx, scopeFor(w, undefined))).toBe(
        true,
      );
  });

  test("pool and tip are about 90% and 92% returns; declining changes nothing", () => {
    const w = life(1000000);
    const stake = 100000;
    expect(
      1 + expectedDelta(w, G("betting-pool-invite"), 0, undefined) / stake,
    ).toBeCloseTo(0.9, 2);
    expect(
      1 + expectedDelta(w, G("hot-tip"), 0, undefined) / stake,
    ).toBeCloseTo(0.925, 2);
    for (const id of [
      "betting-pool-invite",
      "hot-tip",
      "casino-night-invite",
    ]) {
      const o = apply(w, outcomesOf(id, 1)[0] as Outcome);
      expect(me(o).money).toBe(me(w).money);
    }
  });

  test("a splurge needs a streak and cash, and costs at most $5,000", () => {
    const s = story("big-win-splurge");
    const ok = (w: World) => evalBool(s.when, w, idx, scopeFor(w, undefined));
    expect(ok(life(100000, { q: { gambling_streak: 3 } }))).toBe(true);
    expect(ok(life(100000, { q: { gambling_streak: 2 } }))).toBe(false);
    expect(ok(life(99999, { q: { gambling_streak: 3 } }))).toBe(false);
    const rich = life(10000000);
    const spent = apply(rich, outcomesOf("big-win-splurge", 0)[0] as Outcome);
    expect(me(spent).money).toBe(10000000 - 500000);
    expect(
      (me(spent).stats.happiness as number) -
        (me(rich).stats.happiness as number),
    ).toBeGreaterThan(0);
    const keep = apply(rich, outcomesOf("big-win-splurge", 1)[0] as Outcome);
    expect(me(keep).money).toBe(10000000);
  });
});
