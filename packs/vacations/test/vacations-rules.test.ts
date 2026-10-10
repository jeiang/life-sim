import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  describePending,
  deserializeWorld,
  evaluate,
  getPerson,
  indexBundles,
  listActions,
  makeEnv,
  newLife,
  type PackBundle,
  replay,
  runAction,
  serializeWorld,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), {
  only: ["vacations"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const PLAYER = newLife(bundles, 5).playerId;

const VAC = "vacations/vacation-tier";
const DEST = "vacations/vacation-destination";
const CRUISE = "vacations/go-on-cruise";
const VOYAGE = "vacations/cruise-voyage";
const FAMILY = "vacations/family-trip";
const BOND = "vacations/family-trip-bond";
const PRICE: Record<string, number> = { [VAC]: 50000, [CRUISE]: 120000 };
const TIER_LABELS: Record<string, string[]> = {
  [VAC]: [
    "Backpacking ($500)",
    "Budget ($1,000)",
    "Standard ($1,500)",
    "Luxury ($2,000)",
    "Private jet ($2,500)",
  ],
  [CRUISE]: [
    "Shared cabin ($1,200)",
    "Inside cabin ($2,400)",
    "Ocean view ($3,600)",
    "Balcony suite ($4,800)",
    "Royal suite ($6,000)",
  ],
};
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

/** Book `tier` (1..5) of `action`; the chained destination (vacation) or voyage (cruise) is then pending. */
function book(
  w: World,
  b: readonly PackBundle[],
  action: string,
  tier: number,
) {
  const r = runAction(w, b, action);
  expect(r.world.pending?.storyletId).toBe(action);
  return choose(r.world, b, tier - 1).world;
}

const weightAt = (weight: unknown, tier: number): number =>
  evaluate(
    weight as never,
    makeEnv(
      updatePerson(at(30, 1), PLAYER, (p) => ({
        ...p,
        qualities: { ...p.qualities, vac_tier: tier },
      })),
      idx,
      { subject: PLAYER },
    ),
  ) as number;

describe("tier choices", () => {
  test("each action lists five named tiers priced in the label", () => {
    for (const id of [VAC, CRUISE]) {
      const s = idx.storylets.get(id);
      expect(s?.choices.map((c) => c.label)).toEqual(TIER_LABELS[id]);
      expect(s?.amount).toBeUndefined();
    }
  });

  test("a tier charges its price once, sets vac_tier and chains to the next step", () => {
    // The destination is a menu and stays pending; the voyage has no choices and resolves at once.
    for (const [action, next] of [
      [VAC, DEST],
      [CRUISE, undefined],
    ] as const)
      for (let tier = 1; tier <= 5; tier++) {
        const w = book(at(30, 10_000_000), bundles, action, tier);
        expect(me(w).money, `${action} ${tier}`).toBe(
          10_000_000 - tier * (PRICE[action] as number),
        );
        expect(me(w).qualities.vac_tier).toBe(tier);
        expect(w.pending?.storyletId).toBe(next);
        if (!next) expect(w.pending).toBeNull();
      }
  });

  test("tiers the player cannot afford are listed greyed out, not hidden", () => {
    for (const [action, money, enabled] of [
      [VAC, 130000, [true, true, false, false, false]],
      [VAC, 50000, [true, false, false, false, false]],
      [VAC, 250000, [true, true, true, true, true]],
      [CRUISE, 479999, [true, true, true, false, false]],
      [CRUISE, 600000, [true, true, true, true, true]],
    ] as const) {
      const w = runAction(at(30, money), bundles, action).world;
      const view = describePending(w, bundles);
      expect(view?.choices.map((c) => c.label)).toEqual(TIER_LABELS[action]);
      expect(
        view?.choices.map((c) => c.enabled),
        `${action} ${money}`,
      ).toEqual(enabled);
    }
  });
});

describe("trip gating", () => {
  test("vacation needs age 16 and the cheapest tier", () => {
    expect(row(at(15, 10_000_000), VAC)?.locked).toBe(true);
    expect(row(at(16, 10_000_000), VAC)?.locked).toBe(false);
    expect(row(at(30, 49999), VAC)?.locked).toBe(true);
    expect(row(at(30, 50000), VAC)?.locked).toBe(false);
  });

  test("cruise needs age 18 and the cheapest tier", () => {
    expect(row(at(17, 10_000_000), CRUISE)?.locked).toBe(true);
    expect(row(at(18, 119999), CRUISE)?.locked).toBe(true);
    expect(row(at(18, 120000), CRUISE)?.locked).toBe(false);
  });

  test("both trip actions are repeatable with the core-loop 3/8 curve", () => {
    for (const id of [VAC, CRUISE]) {
      const s = idx.storylets.get(id);
      expect(s?.repeatable).toBe(true);
      expect(s?.choices.every((c) => c.outcomes.length === 1)).toBe(true);
    }
    expect(idx.storylets.get(CRUISE)?.repeat).toEqual({
      full: 3,
      reduced: 8,
      factorBp: 2500,
    });
  });

  test("the chained steps never fire on their own", () => {
    for (const id of [DEST, VOYAGE]) {
      expect(idx.storylets.get(id)?.trigger).toBe("event");
      expect(idx.storylets.get(id)?.chance).toBe(0);
    }
  });

  test("loan arrears do not block a trip", () => {
    const p = updatePerson(at(30, 500000), PLAYER, (x) => ({
      ...x,
      qualities: { ...x.qualities, missed_payments: 3 },
    }));
    expect(row(p, VAC)?.locked).toBe(false);
  });

  test("teens cannot go abroad, adults can; the gate is on the destination, not the tier", () => {
    const abroad = idx.storylets.get(DEST)?.choices[DESTS.indexOf("abroad")];
    for (const [age, enabled] of [
      [17, false],
      [18, true],
    ] as const)
      expect(
        evaluate(
          abroad?.when as never,
          makeEnv(at(age, 1_000_000), idx, {
            subject: PLAYER,
          }),
        ),
      ).toBe(enabled);
    for (const d of ["beach", "city", "mountains", "theme-park"])
      expect(
        idx.storylets.get(DEST)?.choices[DESTS.indexOf(d)]?.when,
      ).toBeUndefined();
    const w = book(at(17, 1_000_000), bundles, VAC, 1);
    expect(describePending(w, bundles)?.choices.map((c) => c.enabled)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe("trip outcomes", () => {
  test("every destination and the voyage sum to 10000 at each tier, ending in one death outcome", () => {
    const groups = [
      ...(idx.storylets.get(DEST)?.choices.map((c) => c.outcomes) ?? []),
      idx.storylets.get(VOYAGE)?.outcomes ?? [],
    ];
    expect(groups).toHaveLength(6);
    for (const outs of groups)
      for (let t = 1; t <= 5; t++) {
        const ws = outs.map((o) => Math.max(0, weightAt(o.weight, t)));
        expect(
          ws.reduce((a, b) => a + b, 0),
          `tier ${t}`,
        ).toBe(10000);
        expect(ws.at(-1)).toBe(1);
        expect(ws.slice(0, -1).every((x) => x > 0)).toBe(true);
      }
  });

  test("great odds rise and bad odds fall with the tier", () => {
    for (const outs of [
      ...(idx.storylets.get(DEST)?.choices.map((c) => c.outcomes) ?? []),
      idx.storylets.get(VOYAGE)?.outcomes ?? [],
    ]) {
      expect(weightAt(outs[0]?.weight, 1)).toBe(2000);
      expect(weightAt(outs[0]?.weight, 5)).toBe(4000);
      for (const bad of outs.slice(3, -1))
        expect(weightAt(bad.weight, 1)).toBe(5 * weightAt(bad.weight, 5));
    }
  });

  // Per destination, by outcome index (great, good, ok, three bad, death), at tier 3:
  // [happiness, health, smarts, looks, extra money lost as `3 * 50000 / divisor`, or 0].
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
    test(`${d}: effects of every non-fatal outcome at tier 3`, () => {
      const choice = DESTS.indexOf(d);
      for (const [i, row_] of rows.entries()) {
        const [hap, hp, sm, lk, div] = row_ as [
          number,
          number,
          number,
          number,
          number,
        ];
        const b = only(DEST, choice, i);
        let w = book(at(30, 1_000_000), b, VAC, 3);
        w = choose(w, b, choice).world;
        expect(me(w).alive).not.toBe(false);
        expect(w.ended).toBeNull();
        const lost = div === 0 ? 0 : Math.min(850000, Math.trunc(150000 / div));
        expect(me(w).money, `${d} ${i}`).toBe(1_000_000 - 150000 - lost);
        expect(stat(w, "happiness")).toBe(50 + hap);
        expect(stat(w, "health")).toBe(50 + hp);
        expect(stat(w, "smarts")).toBe(50 + sm);
        expect(stat(w, "looks")).toBe(50 + lk);
      }
    });

  test("happiness gains follow the tier through the chain", () => {
    for (let tier = 1; tier <= 5; tier++) {
      const b = only(DEST, 0, 0);
      let w = book(at(30, 10_000_000), b, VAC, tier);
      w = choose(w, b, 0).world;
      expect(stat(w, "happiness")).toBe(50 + 6 + 2 * tier);
    }
  });

  test("each destination's last outcome is a fatal travel accident, price already paid", () => {
    for (const [choice, d] of DESTS.entries()) {
      const outs = idx.storylets.get(DEST)?.choices[choice]?.outcomes ?? [];
      const b = only(DEST, choice, outs.length - 1);
      let w = book(at(30, 1_000_000), b, VAC, 1);
      w = choose(w, b, choice).world;
      expect(w.ended?.cause, d).toBe("travel accident");
      expect(me(w).money).toBe(950000);
    }
  });

  test("cruise voyage outcomes at tier 2 (price 240000)", () => {
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
      const b = only(VOYAGE, null, i);
      const w = book(at(30, 1_000_000), b, CRUISE, 2);
      expect(w.pending).toBeNull();
      const lost = div === 0 ? 0 : Math.trunc(240000 / (div as number));
      expect(me(w).money, `outcome ${i}`).toBe(1_000_000 - 240000 - lost);
      expect(stat(w, "happiness")).toBe(50 + (hap as number));
      expect(stat(w, "health")).toBe(50 + (hp as number));
    }
    const last = (idx.storylets.get(VOYAGE)?.outcomes.length ?? 0) - 1;
    const b = only(VOYAGE, null, last);
    const w = book(at(30, 1_000_000), b, CRUISE, 1);
    expect(w.ended?.cause).toBe("travel accident");
    expect(me(w).money).toBe(880000);
  });

  test("cruise great and good gains grow with the tier", () => {
    for (let tier = 1; tier <= 5; tier++) {
      let b = only(VOYAGE, null, 0);
      let w = book(at(30, 10_000_000), b, CRUISE, tier);
      expect(stat(w, "happiness")).toBe(50 + 8 + 3 * tier);
      b = only(VOYAGE, null, 1);
      w = book(at(30, 10_000_000), b, CRUISE, tier);
      expect(stat(w, "happiness")).toBe(50 + 4 + tier);
    }
  });

  test("a money loss never drives cash below zero", () => {
    const b = only(DEST, 1, 3);
    let w = book(at(30, 50000), b, VAC, 1);
    w = choose(w, b, 1).world;
    expect(me(w).money).toBe(0);
  });

  test("repeats keep the cost and bad events, but shrink gains through the chain (3/8 curve)", () => {
    const b = only(DEST, 0, 0); // beach, great: +12 at tier 3
    let w = at(30, 100_000_000);
    const gains: number[] = [];
    for (let n = 1; n <= 21; n++) {
      w = updatePerson(w, w.playerId, (p) => ({
        ...p,
        stats: { ...p.stats, happiness: 20 },
      }));
      const before = me(w).money;
      w = book(w, b, VAC, 3);
      w = choose(w, b, 0).world;
      expect(me(w).money).toBe(before - 150000);
      gains.push(stat(w, "happiness") - 20);
    }
    expect(gains.slice(0, 3)).toEqual(Array(3).fill(12));
    expect(gains.slice(3, 8)).toEqual(Array(5).fill(3));
    expect(gains[8]).toBe(0);
    expect(gains[20]).toBe(0);
    // A bad outcome stays full at use 22.
    const bad = only(DEST, 0, 3);
    const w2 = book(w, bad, VAC, 3);
    const hp = stat(w2, "health");
    const w3 = choose(w2, bad, 0).world;
    expect(stat(w3, "health")).toBe(hp - 4);
  });

  test("cruise repeats shrink the voyage's gains too", () => {
    const b = only(VOYAGE, null, 0); // great at tier 1: +11
    let w = at(30, 100_000_000);
    const gains: number[] = [];
    for (let n = 1; n <= 9; n++) {
      w = updatePerson(w, w.playerId, (p) => ({
        ...p,
        stats: { ...p.stats, happiness: 20 },
      }));
      w = book(w, b, CRUISE, 1);
      gains.push(stat(w, "happiness") - 20);
    }
    expect(gains.slice(0, 3)).toEqual([11, 11, 11]);
    expect(gains.slice(3, 8)).toEqual(Array(5).fill(2));
    expect(gains[8]).toBe(0);
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

  test("a save with the destination menu pending (vac_tier set) round-trips and finishes the same", () => {
    const w = book(at(30, 1_000_000), bundles, VAC, 4);
    expect(w.pending?.storyletId).toBe(DEST);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
    expect(me(back).qualities.vac_tier).toBe(4);
    const b = only(DEST, 0, 0);
    expect(worldHash(choose(back, b, 0).world)).toBe(
      worldHash(choose(w, b, 0).world),
    );
  });
});
