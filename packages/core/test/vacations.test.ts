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
  makeEnv,
  newLife,
  type PackBundle,
  replay,
  runAction,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"));
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const PLAYER = newLife(bundles, 5).playerId;

const VAC = "vacations/take-vacation";
const CRUISE = "vacations/go-on-cruise";
const FAMILY = "vacations/family-trip";
const BOND = "vacations/family-trip-bond";
const STEP: Record<string, number> = { [VAC]: 50000, [CRUISE]: 120000 };
const DESTS = ["beach", "city", "mountains", "theme-park", "abroad"];

const me = (w: World) => getPerson(w, w.playerId);
const stat = (w: World, id: string) => me(w).stats[id] as number;

/** A life at `age` with `money`, every stat at 50. */
function at(age: number, money: number, seed = 5): World {
  const w = newLife(bundles, seed);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age,
    money,
    stats: { ...p.stats, happiness: 50, health: 50, smarts: 50, looks: 50 },
  }));
}

const row = (w: World, id: string) =>
  listActions(w, bundles, "activities/travel").find((r) => r.id === id);

/** The bundles with every outcome of `storyletId` (in `choice`, or the storylet's own list) weighted 0 except `pick`. */
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

describe("trip gating", () => {
  test("vacation needs age 16 and the cheapest tier", () => {
    expect(row(at(15, 10_000_000), VAC)?.locked).toBe(true);
    expect(row(at(16, 10_000_000), VAC)?.locked).toBe(false);
    const poor = row(at(30, 49999), VAC);
    expect(poor?.locked).toBe(true);
    expect(row(at(30, 50000), VAC)?.locked).toBe(false);
  });

  test("cruise needs age 18 and the cheapest tier", () => {
    expect(row(at(17, 10_000_000), CRUISE)?.locked).toBe(true);
    expect(row(at(18, 119999), CRUISE)?.locked).toBe(true);
    expect(row(at(18, 120000), CRUISE)?.locked).toBe(false);
  });

  test("only affordable tiers are offered, up to five", () => {
    expect(row(at(30, 130000), VAC)?.amount).toEqual({
      min: 50000,
      max: 130000,
      step: 50000,
    });
    expect(row(at(30, 99_000_000), VAC)?.amount?.max).toBe(250000);
    expect(row(at(30, 99_000_000), CRUISE)?.amount?.max).toBe(600000);
  });

  test("loan arrears do not block a trip", () => {
    const w = updatePerson(at(30, 500000), 1, (p) => p);
    const p = updatePerson(w, w.playerId, (x) => ({
      ...x,
      qualities: { ...x.qualities, missed_payments: 3 },
    }));
    expect(row(p, VAC)?.locked).toBe(false);
  });

  test("teens cannot go abroad, adults can", () => {
    const when = idx.storylets.get(VAC)?.choices[DESTS.indexOf("abroad")]?.when;
    for (const [age, enabled] of [
      [17, false],
      [18, true],
    ] as const)
      expect(
        evaluate(
          when as never,
          makeEnv(at(age, 1_000_000), idx, { subject: PLAYER, amount: 50000 }),
        ),
      ).toBe(enabled);
    for (const d of ["beach", "city", "mountains", "theme-park"])
      expect(
        idx.storylets.get(VAC)?.choices[DESTS.indexOf(d)]?.when,
      ).toBeUndefined();
  });
});

describe("trip outcomes", () => {
  test("every trip's weights sum to 10000 with one death outcome", () => {
    const sum = (id: string, outs: readonly { weight: unknown }[], t: number) =>
      outs.reduce(
        (n, o) =>
          n +
          Math.max(
            0,
            evaluate(
              o.weight as never,
              makeEnv(at(30, 99_000_000), idx, {
                subject: PLAYER,
                amount: t * (STEP[id] as number),
              }),
            ) as number,
          ),
        0,
      );
    for (const [id, groups] of [
      [VAC, idx.storylets.get(VAC)?.choices.map((c) => c.outcomes)],
      [CRUISE, [idx.storylets.get(CRUISE)?.outcomes]],
    ] as const)
      for (const outs of groups ?? [])
        for (let t = 1; t <= 5; t++) {
          expect(sum(id, outs ?? [], t)).toBe(10000);
          const last = outs?.at(-1);
          expect(
            evaluate(
              last?.weight as never,
              makeEnv(at(30, 1), idx, { subject: PLAYER, amount: t * 50000 }),
            ),
          ).toBe(1);
        }
  });

  test("bad events get rarer with the tier", () => {
    const s = idx.storylets.get(VAC);
    const bad = s?.choices[0]?.outcomes[3]?.weight as never;
    const at1 = evaluate(
      bad,
      makeEnv(at(30, 1), idx, { subject: PLAYER, amount: 50000 }),
    ) as number;
    const at5 = evaluate(
      bad,
      makeEnv(at(30, 1), idx, { subject: PLAYER, amount: 250000 }),
    ) as number;
    expect(at1).toBeGreaterThan(at5);
  });

  // Per destination, by outcome index (great, good, ok, three bad, death), at tier 3 (amount 150000):
  // [happiness, health, smarts, looks, extra money lost as a divisor of the amount, or 0].
  const VAC_EXPECT: Record<string, number[][]> = {
    beach: [
      [12, 2, 0, 0, 0],
      [6, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [-2, -4, 0, 0, 0],
      [-5, 0, 0, 0, 0],
      [-2, 0, 0, 0, 4],
    ],
    city: [
      [12, 0, 2, 0, 0],
      [6, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [-3, 0, 0, 0, 2],
      [-4, 0, 0, 0, 0],
      [0, -3, 0, 0, 0],
    ],
    mountains: [
      [12, 2, 0, 1, 0],
      [6, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [-2, -6, 0, 0, 0],
      [-5, 0, 0, 0, 0],
      [-1, 0, 0, 0, 3],
    ],
    "theme-park": [
      [12, 0, 0, 0, 0],
      [6, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [-1, -3, 0, 0, 0],
      [-4, 0, 0, 0, 0],
      [-1, 0, 0, 0, 3],
    ],
    abroad: [
      [12, 0, 2, 0, 0],
      [6, 0, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [0, -5, 0, 0, 0],
      [-5, 0, 0, 0, 0],
      [-3, 0, 0, 0, 2],
    ],
  };

  for (const [d, rows] of Object.entries(VAC_EXPECT))
    test(`${d}: effects of every non-fatal outcome`, () => {
      const choice = DESTS.indexOf(d);
      for (const [i, [hap, hp, sm, lk, div]] of rows.entries()) {
        if (
          hap === undefined ||
          hp === undefined ||
          sm === undefined ||
          lk === undefined ||
          div === undefined
        )
          throw new Error(`${d}: outcome row ${i} is incomplete`);
        const b = only(VAC, choice, i);
        let w = runAction(at(30, 1_000_000), b, VAC, undefined, 150000).world;
        w = choose(w, b, choice).world;
        expect(me(w).alive).not.toBe(false);
        expect(w.ended).toBeNull();
        const lost = div === 0 ? 0 : Math.min(850000, Math.trunc(150000 / div));
        expect(me(w).money).toBe(1_000_000 - 150000 - lost);
        expect(stat(w, "happiness")).toBe(50 + hap);
        expect(stat(w, "health")).toBe(50 + hp);
        expect(stat(w, "smarts")).toBe(50 + sm);
        expect(stat(w, "looks")).toBe(50 + lk);
      }
    });

  test("each destination's last outcome is a fatal travel accident", () => {
    for (const [choice, d] of DESTS.entries()) {
      const outs = idx.storylets.get(VAC)?.choices[choice]?.outcomes ?? [];
      const b = only(VAC, choice, outs.length - 1);
      let w = runAction(at(30, 1_000_000), b, VAC, undefined, 50000).world;
      w = choose(w, b, choice).world;
      expect(w.ended?.cause, d).toBe("travel accident");
      expect(me(w).money).toBe(950000);
    }
  });

  test("cruise outcomes: tier 2 (amount 240000)", () => {
    // [happiness, health, extra money lost divisor]; great 8+3*2, good 4+2.
    const rows = [
      [14, 2, 0],
      [6, 0, 0],
      [1, 0, 0],
      [-2, -4, 0],
      [0, -6, 0],
      [-2, 0, 3],
      [-5, 0, 0],
    ];
    for (const [i, [hap, hp, div]] of rows.entries()) {
      const b = only(CRUISE, null, i);
      let w = runAction(at(30, 1_000_000), b, CRUISE, undefined, 240000).world;
      expect(w.pending).toBeNull();
      const lost = div === 0 ? 0 : Math.trunc(240000 / (div as number));
      expect(me(w).money).toBe(1_000_000 - 240000 - lost);
      expect(stat(w, "happiness")).toBe(50 + (hap as number));
      expect(stat(w, "health")).toBe(50 + (hp as number));
      w = at(30, 1);
    }
    const last = (idx.storylets.get(CRUISE)?.outcomes.length ?? 0) - 1;
    const b = only(CRUISE, null, last);
    const w = runAction(at(30, 1_000_000), b, CRUISE, undefined, 120000).world;
    expect(w.ended?.cause).toBe("travel accident");
    expect(me(w).money).toBe(880000);
  });

  test("a money loss never drives cash below zero", () => {
    const b = only(VAC, 1, 3);
    let w = runAction(at(30, 50000), b, VAC, undefined, 50000).world;
    w = choose(w, b, 1).world;
    expect(me(w).money).toBe(0);
  });

  test("repeats keep the cost and bad events, but shrink happiness gains", () => {
    const b = only(VAC, 0, 0); // beach, great: +12 at tier 3
    let w = at(30, 100_000_000);
    const gains: number[] = [];
    for (let n = 1; n <= 21; n++) {
      w = updatePerson(w, w.playerId, (p) => ({
        ...p,
        stats: { ...p.stats, happiness: 20 },
      }));
      const before = me(w).money;
      w = runAction(w, b, VAC, undefined, 150000).world;
      w = choose(w, b, 0).world;
      expect(me(w).money).toBe(before - 150000);
      gains.push(stat(w, "happiness") - 20);
    }
    // core-loop's curve: full to use 3, a quarter to use 8, then nothing.
    expect(gains.slice(0, 3)).toEqual(Array(3).fill(12));
    expect(gains.slice(3, 8)).toEqual(Array(5).fill(3));
    expect(gains[8]).toBe(0);
    expect(gains[20]).toBe(0);
    // A bad outcome stays full at use 21.
    const bad = only(VAC, 0, 3);
    const w2 = runAction(w, bad, VAC, undefined, 150000).world;
    const hp = stat(w2, "health");
    const w3 = choose(w2, bad, 0).world;
    expect(stat(w3, "health")).toBe(hp - 4);
  });
});

describe("family trips", () => {
  const eligible = (w: World) =>
    evaluate(
      idx.storylets.get(FAMILY)?.when as never,
      makeEnv(w, idx, { subject: w.playerId }),
    );

  test("ages 6-17, living with a living parent", () => {
    expect(eligible(at(5, 0))).toBe(false);
    expect(eligible(at(6, 0))).toBe(true);
    expect(eligible(at(17, 0))).toBe(true);
    expect(eligible(at(18, 0))).toBe(false);
  });

  test("not once the player lives alone", () => {
    const w = updatePerson(at(12, 0), 1, (p) => p);
    const alone = updatePerson(w, w.playerId, (p) => ({
      ...p,
      withParents: false,
    }));
    expect(eligible(alone)).toBe(false);
  });

  test("not once no parent is alive", () => {
    let w = at(12, 0);
    for (const r of w.relationships.filter(
      (x) => x.from === w.playerId && x.role === "core-loop/parent",
    ))
      w = updatePerson(w, r.to, (p) => ({ ...p, alive: false }));
    expect(eligible(w)).toBe(false);
  });

  test("cooldown is two years", () => {
    expect(idx.storylets.get(FAMILY)?.cooldown).toBe(2);
  });

  const outcomes = idx.storylets.get(FAMILY)?.choices[0]?.outcomes ?? [];
  // [happiness, health, money lost, sets the bond marker]
  const FAMILY_EXPECT = [
    [8, 0, 0],
    [4, 0, 0],
    [-1, -3, 0],
    [-4, 0, 0],
    [-1, 0, 2000],
  ];
  for (const [i, [hap, hp, lost]] of FAMILY_EXPECT.entries())
    test(`go along, outcome ${i}`, () => {
      const b = only(FAMILY, 0, i);
      let w = startStorylet(at(12, 2000), b, FAMILY).world;
      w = choose(w, b, 0).world;
      expect(stat(w, "happiness")).toBe(50 + (hap as number));
      expect(stat(w, "health")).toBe(50 + (hp as number));
      expect(me(w).money).toBe(2000 - (lost as number));
      expect(me(w).qualities.vac_family_trip_age).toBe(12);
    });

  test("the fatal family outcome is a travel accident with no bond marker", () => {
    const b = only(FAMILY, 0, outcomes.length - 1);
    let w = startStorylet(at(12, 0), b, FAMILY).world;
    w = choose(w, b, 0).world;
    expect(w.ended?.cause).toBe("travel accident");
  });

  test("staying home costs a little happiness and sets no marker", () => {
    let w = startStorylet(at(12, 0), bundles, FAMILY).world;
    w = choose(w, bundles, 1).world;
    expect(stat(w, "happiness")).toBe(49);
    expect(me(w).qualities.vac_family_trip_age ?? 0).toBe(0);
  });

  test("the trip raises closeness with each parent, once", () => {
    const parents = (w: World) =>
      w.relationships.filter(
        (r) => r.from === w.playerId && r.role === "core-loop/parent",
      );
    const base = at(12, 0);
    const ids = parents(base).map((r) => r.to);
    expect(ids.length).toBe(2);
    // Without the marker for this age the bond event is not eligible.
    const idle = startStorylet(base, bundles, BOND, ids[0]).world;
    expect(parents(idle).map((r) => r.closeness)).toEqual(
      parents(base).map((r) => r.closeness),
    );
    const marked = updatePerson(base, base.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, vac_family_trip_age: 12 },
    }));
    let w = marked;
    for (const id of ids) w = startStorylet(w, bundles, BOND, id).world;
    for (const [i, r] of parents(w).entries())
      expect(r.closeness).toBe(
        Math.min(100, (parents(base)[i]?.closeness ?? 0) + 8),
      );
    // The marker is stale a year later.
    const older = updatePerson(marked, marked.playerId, (p) => ({
      ...p,
      age: 13,
    }));
    const stale = startStorylet(older, bundles, BOND, ids[0]).world;
    expect(parents(stale).map((r) => r.closeness)).toEqual(
      parents(base).map((r) => r.closeness),
    );
  });
});

describe("determinism", () => {
  test("a life with family trips replays to the same world", () => {
    let w = newLife(bundles, 9);
    for (let y = 0; y < 17 && !w.ended; y++) {
      w = ageUp(w, bundles).world;
      while (w.pending) w = choose(w, bundles, 0).world;
    }
    expect(worldHash(replay(9, bundles, w.choiceLog))).toBe(worldHash(w));
  });
});
