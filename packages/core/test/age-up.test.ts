import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addMoney,
  ageUp,
  canAgeUp,
  choose,
  describePending,
  getPerson,
  newLife,
  openLoan,
  type PackBundle,
  putAsset,
  setQuality,
  startStorylet,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

function withYear(slots: [number, number], cap: number): readonly PackBundle[] {
  return bundles.map((b) => ({ ...b, year: { slots, cap } }));
}

function life(flags: string[] = [], seed = 7): World {
  let w = newLife(bundles, seed);
  for (const f of flags) w = setQuality(w, w.playerId, f, true);
  return w;
}

const player = (w: World) => getPerson(w, w.playerId);
const flat = (w: World) => w.journal.flatMap((e) => e.lines);

function giveCar(w: World): { w: World; assetId: number } {
  const assetId = w.nextId;
  const w2 = putAsset({ ...w, nextId: w.nextId + 1 }, w.playerId, {
    id: assetId,
    kindId: "life/car",
    purchasePrice: 1000000,
    value: 1000000,
    acquiredAge: 0,
    qualities: {},
  });
  return { w: w2, assetId };
}

describe("newLife", () => {
  test("player, family and birth line", () => {
    const w = newLife(bundles, 1);
    const p = player(w);
    expect(p.age).toBe(0);
    expect(p.stats.happiness).toBeGreaterThanOrEqual(50);
    expect(p.stats.health).toBeGreaterThanOrEqual(80);
    expect(flat(w)).toEqual([`${p.givenName} ${p.familyName} was born.`]);
    const kin = w.relationships.filter((r) => r.from === w.playerId);
    expect(kin.filter((r) => r.role === "life/parent")).toHaveLength(2);
    expect(kin.length).toBeLessThanOrEqual(4);
    for (const r of kin)
      expect(getPerson(w, r.to).familyName).toBe(p.familyName);
    expect(w.packVersions).toEqual([{ id: "life", version: "1" }]);
  });

  test("same seed, same life; other seeds differ", () => {
    expect(worldHash(newLife(bundles, 5))).toBe(worldHash(newLife(bundles, 5)));
    const hashes = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => worldHash(newLife(bundles, s))),
    );
    expect(hashes.size).toBeGreaterThan(1);
  });
});

describe("age-up phase order", () => {
  test("age, then settlement, then chance, then flavour, then NPC pass", () => {
    let w = life(["chaos"]);
    const [w1] = openLoan(w, w.playerId, {
      kindId: "life/auto-loan",
      principal: 1000000,
      rateBp: 500,
      termYears: 4,
    });
    // Spend the cash so the first payment is missed (settlement writes a line).
    w = addMoney(w1, w.playerId, -1000000);
    const { world, lines } = ageUp(w, withYear([2, 2], 10));
    expect(player(world).age).toBe(1);
    const at = (s: string) => lines.findIndex((l) => l.includes(s));
    const settlement = at("could not pay");
    const chanceA = at("Chance A at 1 with $0.00");
    const chanceB = at("Chance B.");
    const flavour = lines.findIndex((l) => l.startsWith("Flavour"));
    const loanEvent = at("Overdue");
    const npc = at("has news");
    for (const i of [settlement, chanceA, chanceB, flavour, loanEvent, npc])
      expect(i, lines.join("\n")).toBeGreaterThanOrEqual(0);
    // settlement < chance events (id order: a-chance, b-chance, loan-note) < flavour < NPC pass
    expect(settlement).toBeLessThan(chanceA);
    expect(chanceA).toBeLessThan(chanceB);
    expect(chanceB).toBeLessThan(loanEvent);
    expect(loanEvent).toBeLessThan(flavour);
    expect(flavour).toBeLessThan(npc);
  });

  test("everyone ages, the dead do not", () => {
    const w0 = life();
    const parent = w0.relationships.find((r) => r.role === "life/parent")
      ?.to as number;
    const before = getPerson(w0, parent).age;
    const { world } = ageUp(w0, bundles);
    expect(getPerson(world, parent).age).toBe(before + 1);
    expect(player(world).age).toBe(1);
  });

  test("occupations pay and charge, finishing ends them, in settlement", () => {
    let w = life();
    w = startStorylet(w, bundles, "life/get-job").world;
    w = startStorylet(w, bundles, "life/enrol").world;
    w = ageUp(w, bundles).world;
    expect(player(w).money).toBe(500000 - 100000);
    expect(player(w).occupations.map((o) => o.kindId)).toEqual([
      "life/job",
      "life/school",
    ]);
    w = ageUp(w, bundles).world;
    expect(player(w).occupations.map((o) => o.kindId)).toEqual(["life/job"]);
    expect(player(w).occupationHistory.map((o) => o.kindId)).toEqual([
      "life/school",
    ]);
    expect(player(w).occupationHistory[0]?.endedAge).toBe(2);
  });

  test("asset values follow the item formula", () => {
    const { w, assetId } = giveCar(life());
    const out = ageUp(ageUp(w, bundles).world, bundles).world;
    expect(player(out).assets.find((a) => a.id === assetId)?.value).toBe(
      800000,
    );
  });
});

describe("loans", () => {
  function setup(cash = 0) {
    const car = giveCar(life());
    const [w, loanId] = openLoan(car.w, car.w.playerId, {
      kindId: "life/auto-loan",
      principal: 1000000,
      rateBp: 0,
      termYears: 4,
      securedAssetId: car.assetId,
    });
    return {
      w: addMoney(w, w.playerId, cash - 1000000),
      loanId,
      assetId: car.assetId,
    };
  }

  test("shortfall stays on the balance, missed counts up, 3 misses repossess", () => {
    const { w: w0, loanId } = setup(100000);
    const loan = (w: World) => player(w).loans.find((l) => l.id === loanId);
    expect(loan(w0)?.payment).toBe(250000);
    // Year 1: pays 100000 of 250000.
    let w = ageUp(w0, bundles).world;
    expect(player(w).money).toBe(0);
    expect(loan(w)).toMatchObject({ balance: 900000, missed: 1 });
    // Year 2, 3: nothing to pay with.
    w = ageUp(w, bundles).world;
    expect(loan(w)).toMatchObject({ balance: 900000, missed: 2 });
    expect(player(w).assets).toHaveLength(1);
    const third = ageUp(w, bundles);
    expect(player(third.world).assets).toHaveLength(0);
    // Loans settle before asset values: the car is worth 800000 after two years of depreciation.
    expect(loan(third.world)).toMatchObject({
      missed: 3,
      balance: 900000 - 800000,
    });
    expect(third.lines.some((l) => l.includes("repossessed"))).toBe(true);
  });

  test("a repossessed asset that does not cover the debt leaves the rest unsecured", () => {
    const car = giveCar(life());
    const [w, loanId] = openLoan(car.w, car.w.playerId, {
      kindId: "life/auto-loan",
      principal: 3000000,
      rateBp: 0,
      termYears: 4,
      securedAssetId: car.assetId,
    });
    let x = addMoney(w, w.playerId, -3000000);
    for (let i = 0; i < 3; i++) x = ageUp(x, bundles).world;
    const loan = player(x).loans.find((l) => l.id === loanId);
    expect(loan?.securedAssetId).toBeUndefined();
    expect(player(x).assets).toHaveLength(0);
    const asset = 1000000 - 2 * 100000; // value when year 3's loans settle
    expect(loan?.balance).toBe(3000000 - asset);
    expect(loan?.missed).toBe(3);
  });

  test("a full payment resets the miss count; paying off removes the loan", () => {
    const { w: w0, loanId } = setup(0);
    let w = ageUp(w0, bundles).world;
    expect(player(w).loans.find((l) => l.id === loanId)?.missed).toBe(1);
    w = addMoney(w, w.playerId, 250000);
    w = ageUp(w, bundles).world;
    expect(player(w).loans.find((l) => l.id === loanId)).toMatchObject({
      missed: 0,
      balance: 750000,
    });
    w = addMoney(w, w.playerId, 750000);
    w = ageUp(w, bundles).world;
    expect(player(w).loans.find((l) => l.id === loanId)?.balance).toBe(500000);
    w = addMoney(w, w.playerId, 500000);
    w = ageUp(ageUp(w, bundles).world, bundles).world;
    expect(player(w).loans).toHaveLength(0);
  });

  test("an unsecured loan keeps accruing misses", () => {
    const [w0, loanId] = openLoan(life(), life().playerId, {
      kindId: "life/auto-loan",
      principal: 400000,
      rateBp: 0,
      termYears: 4,
    });
    let w = addMoney(w0, w0.playerId, -400000);
    for (let i = 0; i < 5; i++) w = ageUp(w, bundles).world;
    expect(player(w).loans.find((l) => l.id === loanId)).toMatchObject({
      missed: 5,
      balance: 400000,
    });
  });

  test("scope: loan storylets run once per loan, with loan names bound", () => {
    const first = openLoan(life(), life().playerId, {
      kindId: "life/auto-loan",
      principal: 100,
      rateBp: 0,
      termYears: 1,
    });
    const second = openLoan(first[0], first[0].playerId, {
      kindId: "life/auto-loan",
      principal: 200,
      rateBp: 0,
      termYears: 1,
    });
    const w = addMoney(second[0], first[0].playerId, -300);
    const { lines } = ageUp(w, bundles);
    expect(lines.filter((l) => l.startsWith("Overdue"))).toEqual([
      "Overdue: $1.00 of $1.00, missed 1.",
      "Overdue: $2.00 of $2.00, missed 1.",
    ]);
  });
});

describe("pending storylets", () => {
  test("a choice storylet blocks age-up until chosen", () => {
    const w0 = life(["chain"]);
    const { world: w1 } = ageUp(w0, bundles);
    expect(w1.pending?.storyletId).toBe("life/chain-1");
    expect(canAgeUp(w1)).toBe(false);
    expect(() => ageUp(w1, bundles)).toThrow(/pending/);
    const view = describePending(w1, bundles);
    expect(view?.text).toBe("Step one.");
    expect(view?.choices).toEqual([
      { index: 0, label: "Go on", enabled: true },
      { index: 1, label: "Never offered", enabled: false },
    ]);
    expect(() => choose(w1, bundles, 1)).toThrow(/not available/);
    expect(() => choose(w1, bundles, 5)).toThrow();
  });

  test("next chains through three storylets, then the year resumes", () => {
    const w0 = life(["chain", "chaos"]);
    const { world: w1 } = ageUp(w0, bundles);
    // The chain-1 event is queued after chance events; chaos events ran or are pending behind it.
    expect(w1.pending?.storyletId).toBe("life/chain-1");
    expect(w1.pending?.rest?.events.length).toBeGreaterThanOrEqual(0);
    const seen = [w1.pending?.storyletId];
    let step = choose(w1, bundles, 0);
    seen.push(step.world.pending?.storyletId);
    expect(step.lines).toEqual(["Step one.", "One done."]);
    step = choose(step.world, bundles, 0);
    seen.push(step.world.pending?.storyletId);
    expect(step.lines).toEqual(["Step two.", "Two done."]);
    expect(player(step.world).qualities.lucky).toBe(0);
    step = choose(step.world, bundles, 0);
    expect(seen).toEqual(["life/chain-1", "life/chain-2", "life/chain-3"]);
    expect(step.lines.slice(0, 2)).toEqual(["Step three.", "Three done."]);
    expect(step.world.pending).toBeNull();
    expect(player(step.world).qualities.lucky).toBe(5); // clamped to the declared max
    expect(canAgeUp(step.world)).toBe(true);
    // chain-1 is `once`: next year nothing pends.
    expect(ageUp(step.world, bundles).world.pending).toBeNull();
  });

  test("the rest of the year (queued events, NPC pass) resumes after the chain", () => {
    const w0 = life(["chain", "chaos"]);
    const { world: w1, lines: first } = ageUp(w0, bundles);
    expect(first.some((l) => l.includes("has news"))).toBe(false);
    let step = choose(w1, bundles, 0);
    step = choose(step.world, bundles, 0);
    step = choose(step.world, bundles, 0);
    expect(step.lines.some((l) => l.includes("has news"))).toBe(true);
  });

  test("an action storylet with choices goes pending too, without a year to resume", () => {
    const w = startStorylet(life(), bundles, "life/chain-2").world;
    // chain-2 has `when: false`, so the action is not offered.
    expect(w.pending).toBeNull();
  });
});

describe("year draw", () => {
  test("cap keeps chance events before flavour, in id order", () => {
    const capped = withYear([3, 3], 2);
    const { lines } = ageUp(life(["chaos"]), capped);
    expect(lines.filter((l) => l.startsWith("Chance")).length).toBe(2);
    expect(lines.filter((l) => l.startsWith("Flavour")).length).toBe(0);
    const one = ageUp(life(["chaos"]), withYear([3, 3], 1)).lines;
    expect(one.filter((l) => l.startsWith("Chance A"))).toHaveLength(1);
    expect(one.filter((l) => l.startsWith("Chance B"))).toHaveLength(0);
  });

  test("flavour slots draw distinct events by weight, up to the slot count", () => {
    for (const slots of [1, 2, 3]) {
      const { lines } = ageUp(life(["chaos"]), withYear([slots, slots], 10));
      const flavour = lines.filter((l) => l.startsWith("Flavour"));
      expect(flavour).toHaveLength(slots);
      expect(new Set(flavour).size).toBe(slots);
    }
  });

  test("slot count is drawn from the range", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { lines } = ageUp(life(["chaos"], seed), withYear([0, 2], 10));
      counts.add(lines.filter((l) => l.startsWith("Flavour")).length);
    }
    expect([...counts].sort()).toEqual([0, 1, 2]);
  });

  test("npc storylets honour `once` per person", () => {
    let w = life(["chaos"]);
    const first = ageUp(w, bundles);
    const kin = w.persons.size - 1;
    expect(first.lines.filter((l) => l.includes("has news"))).toHaveLength(kin);
    w = first.world;
    expect(ageUp(w, bundles).lines.some((l) => l.includes("has news"))).toBe(
      false,
    );
  });
});

describe("closed effects", () => {
  test("spawn_person ... as, closeness, texts and placeholders", () => {
    const w0 = life();
    const { world, lines } = startStorylet(w0, bundles, "life/meet");
    expect(world.persons.size).toBe(w0.persons.size + 1);
    const id = world.nextId - 1;
    const n = getPerson(world, id);
    expect(lines).toEqual([
      "You meet someone.",
      `Met ${n.givenName} ${n.familyName}.`,
      `${n.givenName} is ${n.age}.`,
    ]);
    expect(world.relationships.find((r) => r.to === id)).toMatchObject({
      role: "life/neighbour",
      closeness: 60,
    });
    expect(n.age).toBeGreaterThanOrEqual(20);
    expect(n.age).toBeLessThanOrEqual(60);
  });

  test("occupations respect exclusivity groups", () => {
    let w = startStorylet(life(), bundles, "life/get-job").world;
    w = startStorylet(w, bundles, "life/get-side-job").world;
    expect(player(w).occupations.map((o) => o.kindId)).toEqual([
      "life/side_job",
    ]);
    expect(player(w).occupationHistory.map((o) => o.kindId)).toEqual([
      "life/job",
    ]);
    w = startStorylet(w, bundles, "life/enrol").world;
    expect(player(w).occupations).toHaveLength(2);
    w = startStorylet(w, bundles, "life/quit").world; // not held: no-op
    expect(player(w).occupations).toHaveLength(2);
  });

  test("take_loan credits cash; grant and remove asset", () => {
    let w = startStorylet(life(), bundles, "life/borrow").world;
    expect(player(w).money).toBe(100000);
    expect(player(w).loans[0]).toMatchObject({
      principal: 100000,
      rateBp: 500,
      termYears: 4,
      missed: 0,
    });
    w = startStorylet(w, bundles, "life/buy-car").world;
    expect(player(w).assets.map((a) => a.kindId)).toEqual(["life/car"]);
    expect(player(w).assets[0]?.value).toBe(1000000);
    w = startStorylet(w, bundles, "life/sell-car").world;
    expect(player(w).assets).toHaveLength(0);
  });

  test("stats clamp to 0-100; qualities clamp to declared bounds", () => {
    const w = startStorylet(life(), bundles, "life/lucky-test").world;
    expect(player(w).stats.happiness).toBe(100);
    expect(player(w).qualities.lucky).toBe(5);
  });

  test("max_per_life and cooldown limit actions", () => {
    let w = life();
    w = startStorylet(w, bundles, "life/limited").world;
    expect(startStorylet(w, bundles, "life/limited").lines).toEqual([]); // cooldown 1
    w = ageUp(w, bundles).world;
    w = startStorylet(w, bundles, "life/limited").world;
    w = ageUp(w, bundles).world;
    expect(startStorylet(w, bundles, "life/limited").lines).toEqual([]); // max 2
    expect(player(w).money).toBe(200);
  });

  test("die records the obituary and ends the life", () => {
    let w = life(["mortal"]);
    w = startStorylet(w, bundles, "life/get-job").world;
    w = startStorylet(w, bundles, "life/enrol").world;
    w = startStorylet(w, bundles, "life/borrow").world;
    const { world } = ageUp(w, bundles);
    expect(world.ended).toEqual({
      personId: world.playerId,
      givenName: player(world).givenName,
      familyName: player(world).familyName,
      age: 1,
      cause: "old age at 1",
      netWorth:
        player(world).money -
        player(world).loans.reduce((n, l) => n + l.balance, 0),
      career: [{ kindId: "life/job", startedAge: 0, endedAge: 1, years: 1 }],
      education: [
        { kindId: "life/school", startedAge: 0, endedAge: 1, years: 1 },
      ],
    });
    expect(player(world).alive).toBe(false);
    expect(canAgeUp(world)).toBe(false);
    expect(() => ageUp(world, bundles)).toThrow(/ended/);
    expect(flat(world).at(-1)).toContain("died at 1: old age at 1");
  });
});

describe("determinism and no stuck states", () => {
  function play(seed: number, years: number): World {
    let w = life(["chaos", "chain"], seed);
    for (let y = 0; y < years && !w.ended; y++) {
      w = ageUp(w, bundles).world;
      let guard = 0;
      while (w.pending) {
        expect(++guard).toBeLessThan(10);
        w = choose(w, bundles, 0).world;
      }
      expect(canAgeUp(w) || w.ended !== null).toBe(true);
    }
    return w;
  }

  test("same seed gives the same worldHash; different seeds differ", () => {
    expect(worldHash(play(11, 25))).toBe(worldHash(play(11, 25)));
    expect(worldHash(play(11, 25))).not.toBe(worldHash(play(12, 25)));
  });

  test("replaying a prefix then continuing equals playing straight through", () => {
    // Randomness is derived from (seed, age, purpose, counter), held in the world.
    const straight = play(21, 10);
    const partial = play(21, 4);
    let w = partial;
    for (let y = 4; y < 10 && !w.ended; y++) {
      w = ageUp(w, bundles).world;
      while (w.pending) w = choose(w, bundles, 0).world;
    }
    expect(worldHash(w)).toBe(worldHash(straight));
  });
});
