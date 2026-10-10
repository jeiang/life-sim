import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  allocId,
  canSucceed,
  checkWorldState,
  choose,
  clearWill,
  deserializeWorld,
  endLife,
  getPerson,
  heirsOf,
  indexBundles,
  kinshipOf,
  markMilestone,
  milestoneReached,
  newLife,
  type PackBundle,
  type PersonId,
  parentLinks,
  putAsset,
  putHolding,
  putLoan,
  putRelationship,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  scheduledEntries,
  serializeSave,
  serializeWorld,
  setScheduled,
  setWill,
  succeed,
  updatePerson,
  validateImport,
  type World,
  willOf,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");
const FIXTURE = join(HERE, "fixtures", "succession");

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The real core-loop and karma Packs, the fixture Pack `succ`, and `files` written over them. */
function tree(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "succession-"));
  dirs.push(dir);
  for (const p of ["core-loop", "karma"])
    cpSync(join(PACKS, p), join(dir, p), { recursive: true });
  cpSync(join(FIXTURE, "succ"), join(dir, "succ"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function build(): PackBundle[] {
  const out = compilePacks(tree());
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return [...out.bundles];
}

function failures(files: Record<string, string>): string {
  const out = compilePacks(tree(files));
  expect(out.ok).toBe(false);
  return out.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n");
}

const bundles = build();
const idx = indexBundles(bundles);

const money = (w: World, id: PersonId): number => getPerson(w, id).money;
const q = (w: World, id: string, who = w.playerId): number =>
  (getPerson(w, who).qualities[id] as number | undefined) ?? 0;
const act = (w: World, id: string, target?: number) =>
  runAction(w, bundles, `succ/${id}`, target).world;
const lines = (w: World): string[] => w.journal.flatMap((e) => e.lines);

/** One age-up, answering any decision that opens with its first choice. */
function year(w: World): World {
  let r = ageUp(w, bundles).world;
  while (r.pending) r = choose(r, bundles, 0).world;
  return r;
}

interface Family {
  readonly w: World;
  readonly dead: PersonId;
  readonly spouse: PersonId | undefined;
  readonly kids: readonly PersonId[];
}

/** A 50-year-old player with `cash`, an optional spouse and children of the given ages (spouse is their other parent). */
function family(
  opts: {
    cash?: number;
    spouse?: boolean;
    kids?: readonly number[];
    seed?: number;
  } = {},
): Family {
  let w = newLife(bundles, opts.seed ?? 1);
  const dead = w.playerId;
  w = updatePerson(w, dead, (p) => ({
    ...p,
    age: 50,
    money: opts.cash ?? 100000,
    gender: "male",
  }));
  let spouse: PersonId | undefined;
  if (opts.spouse) {
    [w, spouse] = addPerson(w, {
      givenName: "Sam",
      familyName: "Spouse",
      age: 48,
    });
    w = putRelationship(w, {
      from: dead,
      to: spouse,
      role: "core-loop/spouse",
      closeness: 80,
    });
  }
  const kids: PersonId[] = [];
  for (const age of opts.kids ?? [25, 22]) {
    let id: PersonId;
    [w, id] = addPerson(w, { givenName: `Kid${age}`, familyName: "X", age });
    w = addParentLink(w, id, dead);
    if (spouse !== undefined) w = addParentLink(w, id, spouse);
    w = putRelationship(w, {
      from: dead,
      to: id,
      role: "core-loop/child",
      closeness: 60,
    });
    kids.push(id);
  }
  return { w, dead, spouse, kids };
}

const die = (f: Family): World => endLife(f.w, f.dead, "illness");
const heir = (w: World, id: PersonId): World => succeed(w, bundles, id).world;

function loan(
  w: World,
  balance: number,
  securedAssetId?: number,
): [World, number] {
  const [w2, id] = allocId(w);
  return [
    putLoan(w2, w.playerId, {
      id,
      kindId: "core-loop/auto-loan",
      principal: balance,
      balance,
      rateBp: 500,
      termYears: 5,
      payment: 1000,
      missed: 0,
      ...(securedAssetId === undefined ? {} : { securedAssetId }),
    }),
    id,
  ];
}

function house(w: World, value: number): [World, number] {
  const [w2, id] = allocId(w);
  return [
    putAsset(w2, w.playerId, {
      id,
      kindId: "core-loop/house",
      purchasePrice: value,
      value,
      acquiredAge: 40,
      qualities: {},
    }),
    id,
  ];
}

describe("succession: who can inherit", () => {
  test("heirs are the living children, adopted and step included, in id order", () => {
    let f = family({ kids: [25, 22, 3] });
    let w = f.w;
    // A step-child: their parent is the spouse's, linked as step to the player.
    let step: PersonId;
    [w, step] = addPerson(w, { givenName: "Stef", familyName: "Y", age: 9 });
    w = addParentLink(w, step, f.dead, "step");
    // An adopted child.
    let adopted: PersonId;
    [w, adopted] = addPerson(w, { givenName: "Addy", familyName: "Z", age: 4 });
    w = addParentLink(w, adopted, f.dead, "adopted");
    // A dead child and a sibling of the player are not heirs.
    w = updatePerson(w, f.kids[2] as number, (p) => ({ ...p, alive: false }));
    f = { ...f, w };
    expect(heirsOf(w)).toEqual([f.kids[0], f.kids[1], step, adopted]);
    expect(canSucceed(w)).toBe(false);
    expect(canSucceed(endLife(w, f.dead, "x"))).toBe(true);
  });

  test("no living child ends the lineage", () => {
    const f = family({ kids: [] });
    const w = die(f);
    expect(heirsOf(w)).toEqual([]);
    expect(canSucceed(w)).toBe(false);
    expect(() => succeed(w, bundles, f.dead)).toThrow(RangeError);
  });

  test("rejects a living player, a non-child, the dead and the player", () => {
    const f = family({ kids: [25, 22] });
    expect(() => succeed(f.w, bundles, f.kids[0] as number)).toThrow(
      "has not ended",
    );
    const w = die(f);
    const sibling = [...w.persons.values()].find(
      (p) => p.id !== f.dead && !f.kids.includes(p.id),
    );
    expect(() => succeed(w, bundles, sibling?.id as number)).toThrow(
      "not a living child",
    );
    expect(() => succeed(w, bundles, f.dead)).toThrow("already the player");
    const gone = updatePerson(w, f.kids[0] as number, (p) => ({
      ...p,
      alive: false,
    }));
    expect(() => succeed(gone, bundles, f.kids[0] as number)).toThrow(
      "not alive",
    );
  });
});

describe("succession: the estate with a will", () => {
  test("one named heir takes all the cash, even when another child succeeds", () => {
    const f = family({ spouse: true });
    const w = heir(
      setWill(die(f), { mode: "heir", heir: f.kids[1] as number }),
      f.kids[0] as number,
    );
    expect(money(w, f.kids[1] as number)).toBe(100000);
    expect(money(w, f.kids[0] as number)).toBe(0);
    expect(money(w, f.spouse as number)).toBe(0);
    expect(money(w, f.dead)).toBe(0);
  });

  test("an even split among the children; the remainder goes to the succeeding heir", () => {
    const f = family({ cash: 100001, spouse: true });
    const w = heir(setWill(die(f), { mode: "even" }), f.kids[1] as number);
    expect(money(w, f.kids[0] as number)).toBe(50000);
    expect(money(w, f.kids[1] as number)).toBe(50001);
    expect(money(w, f.spouse as number)).toBe(0);
    expect(lines(w)).toContain("You inherit $500.01.");
  });

  test("all to the spouse", () => {
    const f = family({ spouse: true });
    const w = heir(setWill(die(f), { mode: "spouse" }), f.kids[0] as number);
    expect(money(w, f.spouse as number)).toBe(100000);
    expect(f.kids.map((k) => money(w, k))).toEqual([0, 0]);
  });

  test("charity: nobody gets the cash", () => {
    const f = family({ spouse: true });
    const w = heir(setWill(die(f), { mode: "charity" }), f.kids[0] as number);
    expect(money(w, f.spouse as number)).toBe(0);
    expect(f.kids.map((k) => money(w, k))).toEqual([0, 0]);
    expect(lines(w)).toContain("$1,000.00 goes to charity.");
  });

  test("a will that cannot be carried out falls back to the no-will rule", () => {
    const f = family({ spouse: true });
    const gone = updatePerson(die(f), f.kids[1] as number, (p) => ({
      ...p,
      alive: false,
    }));
    // The named heir is dead: the spouse takes half, the one living child the rest.
    const a = heir(
      setWill(gone, { mode: "heir", heir: f.kids[1] as number }),
      f.kids[0] as number,
    );
    expect(money(a, f.spouse as number)).toBe(50000);
    expect(money(a, f.kids[0] as number)).toBe(50000);
    // Leave all to the spouse, with no spouse: the children split it.
    const none = family({ spouse: false });
    const b = heir(
      setWill(die(none), { mode: "spouse" }),
      none.kids[0] as number,
    );
    expect(none.kids.map((k) => money(b, k))).toEqual([50000, 50000]);
  });

  test("the will is cleared for the heir", () => {
    const f = family();
    const w = heir(setWill(die(f), { mode: "even" }), f.kids[0] as number);
    expect(willOf(w)).toBeUndefined();
    expect(w.state?._will).toBeUndefined();
  });
});

describe("succession: the estate with no will", () => {
  test("a living spouse gets half and the children split the rest", () => {
    const f = family({ cash: 100001, spouse: true });
    const w = heir(die(f), f.kids[0] as number);
    expect(money(w, f.spouse as number)).toBe(50000);
    // 50001 between two: 25000 each, the odd unit to the succeeding heir.
    expect(money(w, f.kids[0] as number)).toBe(25001);
    expect(money(w, f.kids[1] as number)).toBe(25000);
    expect(lines(w)).toContain("You inherit $250.01.");
    expect(lines(w)).toContain("Sam inherits $500.00.");
  });

  test("without a spouse the children split it all", () => {
    const f = family({ cash: 90001 });
    const w = heir(die(f), f.kids[1] as number);
    expect(money(w, f.kids[0] as number)).toBe(45000);
    expect(money(w, f.kids[1] as number)).toBe(45001);
  });

  test("a dead spouse inherits nothing", () => {
    const f = family({ spouse: true });
    const w = heir(
      updatePerson(die(f), f.spouse as number, (p) => ({ ...p, alive: false })),
      f.kids[0] as number,
    );
    expect(f.kids.map((k) => money(w, k))).toEqual([50000, 50000]);
    expect(money(w, f.spouse as number)).toBe(0);
  });

  test("a sole heir with nothing to split gets nothing; no estate tax", () => {
    const f = family({ cash: 0, kids: [30] });
    const w = heir(die(f), f.kids[0] as number);
    expect(money(w, f.kids[0] as number)).toBe(0);
    const g = family({ cash: 777, kids: [30] });
    expect(money(heir(die(g), g.kids[0] as number), g.kids[0] as number)).toBe(
      777,
    );
  });
});

describe("succession: debts, secured loans, holdings", () => {
  test("unsecured debts are paid from cash first", () => {
    const f = family({ kids: [30] });
    const [w, id] = loan(f.w, 30000);
    const r = heir(endLife(w, f.dead, "x"), f.kids[0] as number);
    expect(money(r, f.kids[0] as number)).toBe(70000);
    expect(getPerson(r, f.kids[0] as number).loans).toEqual([]);
    expect(getPerson(r, f.dead).loans).toEqual([]);
    expect(id).toBeGreaterThan(0);
    expect(lines(r)).toContain("Debts of $300.00 were paid from the estate.");
  });

  test("a shortfall is written off, not passed to the heir", () => {
    const f = family({ kids: [30], cash: 100000 });
    const [w] = loan(f.w, 150000);
    const r = heir(endLife(w, f.dead, "x"), f.kids[0] as number);
    expect(money(r, f.kids[0] as number)).toBe(0);
    expect(getPerson(r, f.kids[0] as number).loans).toEqual([]);
    expect(lines(r)).toContain("$500.00 of debt was written off.");
  });

  test("a secured loan travels with its asset to an adult heir", () => {
    const f = family({ kids: [25] });
    const [w1, asset] = house(f.w, 500000);
    const [w2, mortgage] = loan(w1, 400000, asset);
    const r = heir(endLife(w2, f.dead, "x"), f.kids[0] as number);
    const h = getPerson(r, f.kids[0] as number);
    expect(h.assets.map((a) => a.id)).toEqual([asset]);
    expect(h.loans.map((l) => [l.id, l.balance, l.securedAssetId])).toEqual([
      [mortgage, 400000, asset],
    ]);
    // The cash is untouched by the secured debt; the dead keep nothing.
    expect(h.money).toBe(100000);
    expect(getPerson(r, f.dead).assets).toEqual([]);
    expect(getPerson(r, f.dead).loans).toEqual([]);
    // The asset is as old to the heir as it was to the dead player: 10 years.
    expect(h.age - (h.assets[0]?.acquiredAge ?? h.age)).toBe(10);
  });

  test("for a minor heir the secured asset is sold, the loan repaid and any surplus joins the cash", () => {
    const f = family({ kids: [10], cash: 0 });
    const [w1, asset] = house(f.w, 500000);
    const [w2] = loan(w1, 400000, asset);
    const r = heir(endLife(w2, f.dead, "x"), f.kids[0] as number);
    const h = getPerson(r, f.kids[0] as number);
    expect(h.assets).toEqual([]);
    expect(h.loans).toEqual([]);
    expect(h.money).toBe(100000);
  });

  test("a minor heir's secured shortfall is written off", () => {
    const f = family({ kids: [10], cash: 5000 });
    const [w1, asset] = house(f.w, 300000);
    const [w2] = loan(w1, 400000, asset);
    const r = heir(endLife(w2, f.dead, "x"), f.kids[0] as number);
    const h = getPerson(r, f.kids[0] as number);
    expect(h.loans).toEqual([]);
    expect(h.money).toBe(5000);
    expect(lines(r)).toContain("$1,000.00 of debt was written off.");
  });

  test("other assets pass whole to the heir whatever the will says", () => {
    const f = family({ kids: [25, 22] });
    const [w] = house(f.w, 500000);
    const r = heir(
      setWill(endLife(w, f.dead, "x"), { mode: "charity" }),
      f.kids[1] as number,
    );
    expect(getPerson(r, f.kids[1] as number).assets).toHaveLength(1);
    expect(getPerson(r, f.kids[0] as number).assets).toHaveLength(0);
  });

  test("investment holdings pass whole and merge with the heir's own", () => {
    const f = family({ kids: [25] });
    const kind = "core-loop/index";
    let w = putHolding(f.w, f.dead, {
      kindId: kind,
      units: 30000,
      basis: 5000,
      firstAge: 30,
      maturesYear: 12,
    });
    w = putHolding(w, f.kids[0] as number, {
      kindId: kind,
      units: 10000,
      basis: 2000,
      firstAge: 20,
      maturesYear: 9,
    });
    w = putHolding(w, f.dead, {
      kindId: "core-loop/other",
      units: 5000,
      basis: 100,
      firstAge: 45,
    });
    const r = heir(endLife(w, f.dead, "x"), f.kids[0] as number);
    const h = getPerson(r, f.kids[0] as number);
    expect(h.holdings).toEqual([
      {
        kindId: kind,
        units: 40000,
        basis: 7000,
        // Opened 20 years before death: the heir (25) sees it opened at 5, which is older than their own 20.
        firstAge: 5,
        maturesYear: 9,
      },
      { kindId: "core-loop/other", units: 5000, basis: 100, firstAge: 20 },
    ]);
    expect(getPerson(r, f.dead).holdings).toEqual([]);
  });
});

describe("succession: the heir's life", () => {
  test("the heir is the player; kinship is derived from their position", () => {
    const f = family({ spouse: true });
    const parents = parentLinks(f.w, f.dead).map((l) => l.id);
    expect(parents.length).toBeGreaterThan(0);
    const r = heir(die(f), f.kids[0] as number);
    expect(r.playerId).toBe(f.kids[0]);
    expect(r.ended).toBeNull();
    expect(r.pending).toBeNull();
    expect(r.generation).toBe(1);
    const h = r.playerId;
    expect(kinshipOf(r, h, f.dead)).toBe("parent");
    expect(kinshipOf(r, h, f.spouse as number)).toBe("parent");
    expect(kinshipOf(r, h, f.kids[1] as number)).toBe("sibling");
    for (const p of parents) expect(kinshipOf(r, h, p)).toBe("grandparent");
    // Seated in the family with roles, so living-with-parents and guardians keep working.
    const rows = r.relationships
      .filter((x) => x.from === h)
      .map((x) => [x.to, x.role]);
    expect(rows).toContainEqual([f.dead, "core-loop/parent"]);
    expect(rows).toContainEqual([f.spouse, "core-loop/parent"]);
    expect(rows).toContainEqual([f.kids[1], "core-loop/sibling"]);
  });

  test("per-life state starts empty; lineage schedule entries are handed off", () => {
    const f = family();
    let w = die(f);
    w = {
      ...w,
      storyletLog: { "a/b": { count: 2, lastAge: 5 } },
      uses: { "a/b": 3 },
      rngCounters: { "50/x": 4 },
      journal: [{ age: 50, lines: ["old"] }],
    };
    w = markMilestone(w, "graduated");
    w = setScheduled(w, [
      {
        storyletId: "succ/lineage-a",
        wait: 2,
        left: 3,
        lineage: true,
        seq: 0,
      },
      {
        storyletId: "succ/mortal",
        wait: 1,
        left: 2,
        lineage: false,
        seq: 1,
      },
      {
        storyletId: "succ/lineage-dead",
        person: f.dead,
        wait: 1,
        left: 2,
        lineage: true,
        seq: 2,
      },
    ]);
    const r = heir(w, f.kids[0] as number);
    expect(r).toMatchObject({ storyletLog: {}, uses: {}, rngCounters: {} });
    expect(milestoneReached(r, "graduated")).toBe(false);
    expect(r.journal.flatMap((e) => e.lines).join("\n")).not.toContain("old");
    expect(r.worldYear).toBe(w.worldYear);
    expect(r.choiceLog.at(-1)).toEqual({ t: "succeed", heir: f.kids[0] });
    expect(scheduledEntries(r).map((e) => e.storyletId)).toEqual([
      "succ/lineage-a",
      "succ/blocked",
      "succ/inherit",
      "succ/mourn",
    ]);
  });

  test("the on_succession hook runs for the heir, after the estate", () => {
    const f = family();
    const r = heir(die(f), f.kids[0] as number);
    expect(q(r, "hook_ran")).toBe(1);
    expect(q(r, "hook_ran", f.dead)).toBe(0);
  });
});

describe("succession: trigger and deceased.*", () => {
  test("a succession storylet opens at the next age-up with deceased.* bound", () => {
    const f = family({ spouse: true });
    let w = updatePerson(f.w, f.dead, (p) => ({
      ...p,
      stats: { ...p.stats, smarts: 77 },
      qualities: { ...p.qualities, hook_ran: 7 },
    }));
    w = heir(endLife(w, f.dead, "illness"), f.kids[0] as number);
    // Queued, not opened: nothing has aged yet.
    expect(q(w, "opened")).toBe(0);
    expect(w.deceased).toEqual({
      person: f.dead,
      cause: "illness",
      money: 100000,
    });
    w = year(w);
    expect(q(w, "opened")).toBe(1);
    expect(q(w, "seen_age")).toBe(50);
    expect(q(w, "seen_smarts")).toBe(77);
    expect(q(w, "seen_hook_ran")).toBe(7);
    expect(lines(w)).toContain(
      "Estate note: Pat died at 50 of illness, holding $1,000.00. He was your father.".replace(
        "Pat",
        getPerson(w, f.dead).givenName,
      ),
    );
    // The dropped one: its when failed, so it never fired and is gone.
    expect(q(w, "blocked_fired")).toBe(0);
    expect(scheduledEntries(w)).toEqual([]);
  });

  test("once storylets fire once per generation", () => {
    const f = family({ kids: [25] });
    let w = heir(die(f), f.kids[0] as number);
    w = year(w);
    expect(w.storyletLog["succ/mourn"]?.count).toBe(1);
    expect(q(w, "mourned")).toBe(1);
    w = year(w);
    expect(w.storyletLog["succ/mourn"]?.count).toBe(1);
    // The heir has a child and dies: the next generation mourns again.
    const h = w.playerId;
    let kid: PersonId;
    [w, kid] = addPerson(w, { givenName: "Next", familyName: "X", age: 1 });
    w = addParentLink(w, kid, h);
    w = putRelationship(w, {
      from: h,
      to: kid,
      role: "core-loop/child",
      closeness: 50,
    });
    w = heir(endLife(w, h, "x"), kid);
    w = year(w);
    expect(w.generation).toBe(2);
    expect(w.storyletLog["succ/mourn"]?.count).toBe(1);
    expect(q(w, "mourned")).toBe(1);
    expect(w.deceased?.person).toBe(h);
  });

  test("deceased.* reads neutral for a founder", () => {
    const w = newLife(bundles, 3);
    expect(w.deceased).toBeUndefined();
    const out = compilePacks(
      tree({
        "succ/storylets/neutral.yaml":
          '- id: neutral\n  trigger: action\n  menu: activities\n  when: deceased.age == 0 and deceased.money == 0 and deceased.quality.hook_ran == 0\n  outcomes:\n    - effects:\n        - journal("n[{deceased.first_name}][{deceased.cause}]")\n',
      }),
    );
    expect(out.ok).toBe(true);
    const bs = out.ok ? [...out.bundles] : [];
    const r = runAction(newLife(bs, 3), bs, "succ/neutral").world;
    expect(lines(r)).toContain("n[][]");
  });
});

describe("succession: will effects", () => {
  test("set_will, will_heir and has_will", () => {
    let w = newLife(bundles, 4);
    expect(willOf(w)).toBeUndefined();
    w = act(w, "will-check");
    expect(q(w, "will_seen")).toBe(0);
    w = act(w, "will-even");
    expect(willOf(w)).toEqual({ mode: "even" });
    w = act(w, "will-check");
    expect(q(w, "will_seen")).toBe(1);
    w = act(w, "will-charity");
    expect(willOf(w)).toEqual({ mode: "charity" });
    w = act(w, "will-spouse");
    expect(willOf(w)).toEqual({ mode: "spouse" });
    const someone = [...w.persons.keys()].find((id) => id !== w.playerId);
    w = act(w, "will-to", someone);
    expect(willOf(w)).toEqual({ mode: "heir", heir: someone });
    w = act(w, "will-none");
    expect(willOf(w)).toBeUndefined();
    expect(clearWill(w)).toBe(w);
  });
});

describe("succession: determinism, replay and saves", () => {
  function lineage(seed: number): World {
    let w = newLife(bundles, seed);
    for (let g = 0; g < 3; g++) {
      w = act(act(act(w, "have-child"), "have-child"), "will-even");
      if (g === 0) w = act(w, "marry");
      w = year(year(w));
      w = act(w, "pass-away");
      expect(w.ended, `seed ${seed} generation ${g}`).not.toBeNull();
      const heirId = heirsOf(w)[0];
      expect(heirId, `seed ${seed} generation ${g} heir`).toBeDefined();
      w = heir(w, heirId as number);
    }
    return year(year(w));
  }

  test("three generations replay to the same world and survive a save", () => {
    for (const seed of [1, 2, 3]) {
      const w = lineage(seed);
      expect(w.generation).toBe(3);
      expect(w.choiceLog.filter((c) => c.t === "succeed")).toHaveLength(3);
      const r = replay(w.seed, bundles, w.choiceLog);
      expect(worldHash(r)).toBe(worldHash(w));
      expect(serializeWorld(r)).toBe(serializeWorld(w));
      expect(deserializeWorld(serializeWorld(w))).toEqual(w);
      expect(checkWorldState(w, idx.state)).toEqual([]);
      const file: SaveFile = {
        schemaVersion: SAVE_SCHEMA_VERSION,
        capabilities: bundles.flatMap((b) => b.capabilities),
        appliedMigrations: [],
        lives: [{ id: "a", name: "A", world: w }],
        graveyard: [],
      } as SaveFile;
      const out = validateImport(serializeSave(file), bundles);
      expect(out.ok, out.ok ? "" : out.error).toBe(true);
    }
  });

  test("the same choices give the same world; the hash covers the deceased and the will", () => {
    const a = lineage(1);
    expect(worldHash(lineage(1))).toBe(worldHash(a));
    const { deceased: _gone, ...without } = a;
    expect(worldHash(without)).not.toBe(worldHash(a));
    const w = newLife(bundles, 2);
    expect(worldHash(setWill(w, { mode: "even" }))).not.toBe(worldHash(w));
  });

  test("a malformed will rejects the save", () => {
    const w = newLife(bundles, 6);
    const file = (x: World) =>
      ({
        schemaVersion: SAVE_SCHEMA_VERSION,
        capabilities: bundles.flatMap((b) => b.capabilities),
        appliedMigrations: [],
        lives: [{ id: "a", name: "A", world: x }],
        graveyard: [],
      }) as SaveFile;
    for (const bad of [{ mode: 9 }, { mode: 1 }, { mode: 2, heir: 0 }, 3])
      expect(
        validateImport(
          serializeSave(file({ ...w, state: { _will: bad } } as World)),
          bundles,
        ).ok,
        JSON.stringify(bad),
      ).toBe(false);
    expect(
      validateImport(
        serializeSave(
          file({ ...w, state: { _will: { mode: 1, heir: 1 } } } as World),
        ),
        bundles,
      ).ok,
    ).toBe(true);
  });
});

describe("succession: build-time checks", () => {
  test("a succession storylet takes no event, action or scope fields", () => {
    const f = failures({
      "succ/storylets/more.yaml": [
        "- id: a",
        "  trigger: succession",
        "  chance: 5%",
        "  outcomes: [{ text: x }]",
        "- id: b",
        "  trigger: succession",
        "  scope: person",
        "  outcomes: [{ text: x }]",
        "",
      ].join("\n"),
    });
    expect(f).toContain("'chance' is not valid on succession storylets");
    expect(f).toContain("'scope' is not valid on succession storylets");
  });

  test("deceased.* is read-only", () => {
    const f = failures({
      "succ/storylets/more.yaml":
        "- id: bad\n  trigger: action\n  menu: activities\n  outcomes:\n    - effects:\n        - deceased.money += 1\n",
    });
    expect(f).toContain("deceased.money");
  });

  test("set_will names a mode, will_heir a person in scope", () => {
    const f = failures({
      "succ/storylets/more.yaml": [
        "- id: a",
        "  trigger: action",
        "  menu: activities",
        "  outcomes:",
        "    - effects:",
        "        - set_will(banana)",
        "- id: b",
        "  trigger: action",
        "  menu: activities",
        "  outcomes:",
        "    - effects:",
        "        - will_heir(person)",
        "",
      ].join("\n"),
    });
    expect(f).toContain("expected a will mode");
    expect(f).toContain("expected a person name");
  });

  test("an unknown effect in on_succession is rejected", () => {
    const f = failures({
      "succ/pack.yaml": "id: succ\nhooks:\n  on_succession:\n    - nope(1)\n",
    });
    expect(f).toContain("on_succession");
  });
});
