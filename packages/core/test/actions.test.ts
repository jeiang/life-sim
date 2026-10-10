import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  describePending,
  getPerson,
  listActions,
  listShop,
  listSubmenus,
  newLife,
  personsInIdOrder,
  purchase,
  replay,
  runAction,
  sell,
  setQuality,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";
import { putRelationship } from "../src/state/world.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));

const player = (w: World) => getPerson(w, w.playerId);
const grownUp = (age = 20, money = 0): World => {
  const w = newLife(bundles, 3);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age, money }));
};
const people = (w: World) =>
  personsInIdOrder(w).filter((p) => p.id !== w.playerId);
const closeness = (w: World, id: number) =>
  w.relationships.find((r) => r.from === w.playerId && r.to === id)
    ?.closeness as number;

describe("action menus", () => {
  test("a locked action says why in plain words", () => {
    const rows = listActions(grownUp(12), bundles, "activities/track");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "life/race",
      locked: true,
      reason: "Age 18+",
    });
    expect(
      listActions(grownUp(70), bundles, "activities/track")[0]?.reason,
    ).toBe("Under age 65");
    expect(
      listActions(grownUp(30), bundles, "activities/track")[0]?.locked,
    ).toBe(false);
  });

  test("menu paths match exactly and submenus are discoverable", () => {
    const w = grownUp();
    const ids = listActions(w, bundles, "activities").map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toEqual(expect.arrayContaining(["life/loner", "life/stroll"]));
    expect(ids).not.toContain("life/race");
    expect(listSubmenus(bundles, "activities")).toEqual(["activities/track"]);
  });

  test("once-only actions lock after use; actions lock while a choice is pending or life ended", () => {
    let w = runAction(grownUp(), bundles, "life/loner").world;
    const row = listActions(w, bundles, "activities").find(
      (r) => r.id === "life/loner",
    );
    expect(row).toMatchObject({ locked: true, reason: "Already done" });
    expect(runAction(w, bundles, "life/loner").lines).toEqual([]);
    w = { ...w, pending: { storyletId: "life/loner" } };
    expect(listActions(w, bundles, "activities").every((r) => r.locked)).toBe(
      true,
    );
  });

  test("an unknown action id is rejected", () => {
    expect(() => runAction(grownUp(), bundles, "life/nope")).toThrow(
      /unknown action/,
    );
    expect(() => runAction(grownUp(), bundles, "life/stroll-event")).toThrow();
  });
});

describe("person-targeted actions", () => {
  test("role filter decides which people are offered an action", () => {
    const w = grownUp();
    const [parent, sibling] = [
      people(w).find((p) =>
        w.relationships.some((r) => r.to === p.id && r.role === "life/parent"),
      ),
      people(w).find((p) =>
        w.relationships.some((r) => r.to === p.id && r.role === "life/sibling"),
      ),
    ];
    expect(parent).toBeDefined();
    const ids = (t: number) =>
      listActions(w, bundles, "relationships", t).map((r) => r.id);
    expect(ids(parent?.id as number)).toContain("life/ask-parent");
    if (sibling) expect(ids(sibling.id)).not.toContain("life/ask-parent");
    // no target: person actions are not listed
    expect(
      listActions(w, bundles, "relationships").map((r) => r.id),
    ).not.toContain("life/chat");
  });

  test("closeness changes for the chosen person only, and the action pays out", () => {
    const w = grownUp(20, 0);
    const [a, b] = people(w);
    const before = [
      closeness(w, a?.id as number),
      closeness(w, b?.id as number),
    ] as [number, number];
    const after = runAction(w, bundles, "life/chat", a?.id).world;
    expect(closeness(after, a?.id as number)).toBe(before[0] + 10);
    expect(closeness(after, b?.id as number)).toBe(before[1]);
    expect(after.choiceLog).toEqual([
      { t: "action", id: "life/chat", target: a?.id },
    ]);
  });

  test("a role-filtered action is refused for the wrong person", () => {
    const met = runAction(grownUp(20, 0), bundles, "life/meet").world;
    const other = people(met).at(-1);
    expect(met.relationships.find((r) => r.to === other?.id)?.role).toBe(
      "life/neighbour",
    );
    const w = met;
    if (!other) throw new Error("no neighbour");
    const out = runAction(w, bundles, "life/ask-parent", other.id);
    expect(out.world).toBe(w);
    expect(out.lines).toEqual([]);
  });

  test("expressions read person.role, person.alive and person.age; die kills the bound parent only", () => {
    const w = grownUp(20, 0);
    const parent = people(w).find((p) =>
      w.relationships.some((r) => r.to === p.id && r.role === "life/parent"),
    );
    const id = parent?.id as number;
    expect(
      listActions(w, bundles, "relationships", id).find(
        (r) => r.id === "life/parent-only-check",
      )?.locked,
    ).toBe(false);
    const dead = runAction(w, bundles, "life/farewell", id).world;
    expect(getPerson(dead, id).alive).toBe(false);
    expect(dead.ended).toBeNull();
    expect(player(dead).alive).toBe(true);
    // a dead person is no longer a valid target
    expect(
      listActions(dead, bundles, "relationships", id).every((r) => r.locked),
    ).toBe(true);
  });

  test("the real pack: parents die via die(), ask-for-money is parents only, closeness moves", () => {
    const rb = real.bundles;
    let w = newLife(rb, 11, {
      family: {
        parent: { role: "parent", generator: "parent-gen", count: 2 },
        sibling: { role: "sibling", generator: "sibling-gen", count: [1, 1] },
      },
    });
    w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 10 }));
    const parent = people(w).find((p) =>
      w.relationships.some(
        (r) => r.to === p.id && r.role === "core-loop/parent",
      ),
    );
    const sibling = people(w).find((p) =>
      w.relationships.some(
        (r) => r.to === p.id && r.role === "core-loop/sibling",
      ),
    );
    const ids = (t: number) =>
      listActions(w, rb, "relationships", t).map((r) => r.id);
    expect(ids(parent?.id as number)).toContain(
      "core-loop/ask-parents-for-money",
    );
    if (sibling)
      expect(ids(sibling.id)).not.toContain("core-loop/ask-parents-for-money");
    expect(ids(parent?.id as number)).toContain(
      "core-loop/spend-time-with-loved-ones",
    );
    const out = runAction(
      w,
      rb,
      "core-loop/spend-time-with-loved-ones",
      parent?.id,
    );
    expect(out.lines.length).toBeGreaterThan(0);
    expect(closeness(out.world, parent?.id as number)).not.toBe(
      closeness(w, parent?.id as number),
    );
  });
});

describe("shop and purchases", () => {
  test("requires gates an item and the reason is readable", () => {
    const rich = grownUp(20, 99_000_000);
    const row = listShop(rich, bundles, "vehicles").find(
      (r) => r.id === "life/truck",
    );
    expect(row).toMatchObject({ locked: true });
    const young = grownUp(14, 99_000_000);
    expect(
      listShop(young, bundles).find((r) => r.id === "life/truck")?.reason,
    ).toBe("Age 16+");
    expect(() => purchase(rich, bundles, "life/truck", "cash")).toThrow();
    const licensed = setQuality(rich, rich.playerId, "licensed", true);
    expect(
      listShop(licensed, bundles).find((r) => r.id === "life/truck")?.locked,
    ).toBe(false);
    expect(
      purchase(licensed, bundles, "life/truck", "cash").world.persons.get(0),
    ).toBeDefined();
  });

  test("unaffordable purchases are rejected and change nothing", () => {
    const broke = grownUp(30, 4999);
    expect(listShop(broke, bundles, "shopping")[0]).toMatchObject({
      locked: true,
      reason: "Can't afford it",
    });
    expect(() => purchase(broke, bundles, "life/trinket", "cash")).toThrow(
      /afford/,
    );
    expect(player(broke).assets).toHaveLength(0);
    expect(broke.choiceLog).toEqual([]);
  });

  test("cash purchase charges the price and grants the asset", () => {
    const w = purchase(
      grownUp(30, 5000),
      bundles,
      "life/trinket",
      "cash",
    ).world;
    expect(player(w).money).toBe(0);
    expect(player(w).assets.map((a) => a.kindId)).toEqual(["life/trinket"]);
    expect(w.choiceLog).toEqual([
      { t: "buy", kind: "life/trinket", mode: "cash" },
    ]);
  });

  test("loan purchase pays the kind's down payment and borrows the rest, secured by the asset", () => {
    const w = setQuality(grownUp(30, 200_000), 0, "licensed", true);
    // down payment is 10% of 2,000,000 = 200,000
    expect(() =>
      purchase(
        setQuality(grownUp(30, 199_999), 0, "licensed", true),
        bundles,
        "life/truck",
        "loan",
      ),
    ).toThrow(/down payment/);
    const out = purchase(w, bundles, "life/truck", "loan").world;
    const p = player(out);
    expect(p.money).toBe(0);
    expect(p.loans).toHaveLength(1);
    const loan = p.loans[0];
    expect(loan?.principal).toBe(1_800_000);
    expect(loan?.rateBp).toBe(500);
    expect(loan?.termYears).toBe(4);
    expect(loan?.securedAssetId).toBe(p.assets[0]?.id);
  });

  test("a kind with no loan cannot be bought on credit", () => {
    expect(() =>
      purchase(grownUp(30, 99_999_999), bundles, "life/trinket", "loan"),
    ).toThrow(/loan/);
  });

  test("selling pays off the secured loan first and keeps the rest as cash", () => {
    let w = setQuality(grownUp(30, 200_000), 0, "licensed", true);
    w = purchase(w, bundles, "life/truck", "loan").world;
    const asset = player(w).assets[0];
    const sold = sell(w, bundles, asset?.id as number).world;
    expect(player(sold).assets).toHaveLength(0);
    expect(player(sold).loans).toHaveLength(0);
    expect(player(sold).money).toBe((asset?.value as number) - 1_800_000);
    expect(() => sell(sold, bundles, 9999)).toThrow();
  });
});

describe("choice log and replay", () => {
  test("replaying the log reproduces the world hash", () => {
    let w = newLife(bundles, 21);
    w = runAction(w, bundles, "life/windfall").world;
    w = purchase(w, bundles, "life/trinket", "cash").world;
    w = runAction(w, bundles, "life/stroll").world;
    for (let i = 0; i < 25 && !w.ended; i++) {
      w = ageUp(w, bundles).world;
      while (w.pending && !w.ended) {
        const v = describePending(w, bundles);
        w = choose(
          w,
          bundles,
          v?.choices.find((c) => c.enabled)?.index ?? 0,
        ).world;
      }
      if (i === 3)
        w = sell(w, bundles, player(w).assets[0]?.id as number).world;
    }
    const kinds = new Set(w.choiceLog.map((c) => c.t));
    expect([...kinds].sort()).toEqual(
      expect.arrayContaining(["action", "age", "buy", "sell"]),
    );
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
  });

  test("replay of a log with only ordinary choices needs nothing else", () => {
    let w = newLife(bundles, 5);
    for (let i = 0; i < 6 && !w.ended; i++) {
      w = ageUp(w, bundles).world;
      while (w.pending && !w.ended) w = choose(w, bundles, 0).world;
    }
    expect(worldHash(replay(5, bundles, w.choiceLog))).toBe(worldHash(w));
  });

  test("a different log gives a different hash", () => {
    const a = newLife(bundles, 5);
    const w1 = runAction(a, bundles, "life/stroll").world;
    expect(worldHash(w1)).not.toBe(worldHash(a));
  });
});

describe("the core-loop starting family and labels", () => {
  const rb = real.bundles;
  const toPlayer = (w: World) =>
    w.relationships.filter((r) => r.from === w.playerId);

  test("every life has 2 parents and 0-2 siblings, with relationships", () => {
    const sibs = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = newLife(rb, seed);
      const roles = toPlayer(w).map((r) => r.role);
      const parents = roles.filter((r) => r === "core-loop/parent").length;
      const siblings = roles.filter((r) => r === "core-loop/sibling").length;
      expect(parents).toBe(2);
      expect(siblings).toBeLessThanOrEqual(2);
      expect(people(w)).toHaveLength(parents + siblings);
      sibs.add(siblings);
    }
    expect([...sibs].sort()).toEqual([0, 1, 2]);
  });

  test("every action row has an explicit label", () => {
    const labelled = real.bundles
      .flatMap((b) => b.storylets)
      .filter((s) => s.trigger === "action");
    expect(labelled.length).toBeGreaterThan(0);
    for (const s of labelled) expect(s.label, s.id).toBeTruthy();
  });
});

describe("roles and closeness", () => {
  const rows = (w: World, to: number) =>
    w.relationships
      .filter((r) => r.from === w.playerId && r.to === to)
      .map((r) => [r.role, r.closeness]);
  const locked = (
    w: World,
    menu: "occupation" | "relationships",
    id: string,
    target?: number,
  ) => listActions(w, bundles, menu, target).find((r) => r.id === id)?.locked;

  test("setting a role replaces every row and keeps the highest closeness", () => {
    let w = grownUp(20);
    const id = people(w)[0]?.id as number;
    w = putRelationship(w, {
      from: w.playerId,
      to: id,
      role: "life/neighbour",
      closeness: 90,
    });
    const before = rows(w, id);
    expect(before).toHaveLength(2);
    const after = runAction(w, bundles, "life/court", id).world;
    expect(rows(after, id)).toEqual([["life/partner", 90]]);
    expect(
      runAction(after, bundles, "life/marry", id).world.relationships.filter(
        (r) => r.to === id,
      ),
    ).toEqual([
      { from: w.playerId, to: id, role: "life/spouse", closeness: 90 },
    ]);
  });

  test("a role set on a spawned person keeps its closeness", () => {
    const w = runAction(grownUp(20), bundles, "life/meet-partner").world;
    const n = people(w).at(-1)?.id as number;
    expect(rows(w, n)).toEqual([["life/partner", 70]]);
  });

  test("person.closeness gates an action at its boundary", () => {
    const w = grownUp(20);
    const id = people(w)[0]?.id as number;
    const set = (c: number) =>
      putRelationship(w, {
        from: w.playerId,
        to: id,
        role: "life/parent",
        closeness: c,
      });
    expect(locked(set(59), "relationships", "life/close-only", id)).toBe(true);
    expect(locked(set(60), "relationships", "life/close-only", id)).toBe(false);
  });

  test("count_role counts living people in the closeness range, inclusive", () => {
    let w = grownUp(20);
    const [a, b, c] = people(w).map((p) => p.id) as [number, number, number];
    const partner = (w0: World, to: number, closeness: number) =>
      putRelationship(w0, {
        from: w0.playerId,
        to,
        role: "life/partner",
        closeness,
      });
    expect(locked(w, "occupation", "life/partner-perk")).toBe(true);
    w = partner(w, a, 59);
    w = partner(w, b, 81);
    expect(locked(w, "occupation", "life/partner-perk")).toBe(true);
    w = partner(w, c, 60);
    expect(locked(w, "occupation", "life/partner-perk")).toBe(false);
    w = partner(w, c, 80);
    expect(locked(w, "occupation", "life/partner-perk")).toBe(false);
    // the only in-range partner dies
    w = updatePerson(w, c, (p) => ({ ...p, alive: false }));
    expect(getPerson(w, c).alive).toBe(false);
    expect(locked(w, "occupation", "life/partner-perk")).toBe(true);
  });

  test("replay reproduces role changes", () => {
    let w = newLife(bundles, 5);
    w = runAction(w, bundles, "life/meet-partner").world;
    const n = people(w).at(-1)?.id as number;
    w = runAction(w, bundles, "life/marry", n).world;
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
  });
});
