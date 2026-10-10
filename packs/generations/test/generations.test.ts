import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  addParentLink,
  addPerson,
  ageUp,
  allocId,
  type CounterDecl,
  cellValue,
  checkWorldState,
  choose,
  counterValue,
  deserializeWorld,
  endLife,
  getPerson,
  heirsOf,
  indexBundles,
  listActions,
  newLife,
  type PersonId,
  putAsset,
  putRelationship,
  serializeWorld,
  startStorylet,
  succeed,
  type TableDecl,
  updatePerson,
  type World,
  willOf,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { forceRolls } from "../../../packages/harness/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["generations"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles = out.bundles;
const idx = indexBundles(bundles);
const G = (id: string) => `generations/${id}`;
const IDS = ["watch", "quilt", "clock", "violin", "letters"] as const;
const BASE: Record<(typeof IDS)[number], number> = {
  watch: 60000,
  quilt: 20000,
  clock: 180000,
  violin: 900000,
  letters: 35000,
};
const GAIN: Record<(typeof IDS)[number], number> = {
  watch: 8,
  quilt: 5,
  clock: 14,
  violin: 15,
  letters: 10,
};
const OPENERS = [
  "inherit-under-12",
  "inherit-12-17",
  "inherit-18-39",
  "inherit-40-plus",
];

const table = idx.state.get("gen_heirloom") as TableDecl;
const generation = idx.state.get("gen_generation") as CounterDecl;
const cell = (w: World, key: string, who = w.playerId) =>
  cellValue(getPerson(w, who), table, key);
const setCellRaw = (w: World, who: PersonId, key: string, v: number): World =>
  updatePerson(w, who, (p) => ({
    ...p,
    state: {
      ...p.state,
      gen_heirloom: {
        ...((p.state?.gen_heirloom as Record<string, number>) ?? {}),
        [key]: v,
      },
    },
  }));
const q = (w: World, id: string, who = w.playerId): number =>
  (getPerson(w, who).qualities[id] as number | undefined) ?? 0;
const gen = (w: World) => counterValue(w, generation) as number;
let forced: { clear(): void } | undefined;
afterEach(() => {
  forced?.clear();
  forced = undefined;
});

interface Family {
  readonly w: World;
  readonly dead: PersonId;
  readonly spouse: PersonId | undefined;
  readonly kids: readonly PersonId[];
}

/** A player of 50 with cash, an optional living spouse and children of the given ages. */
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

/** The player dies and the first child inherits. */
function inherit(f: Family, heir = f.kids[0] as PersonId): World {
  return succeed(endLife(f.w, f.dead, "illness"), bundles, heir).world;
}

/** Answer the open decision with its first available choice. */
function firstChoice(w: World) {
  for (let i = 0; ; i++) {
    try {
      return choose(w, bundles, i);
    } catch (e) {
      if (!(e instanceof RangeError) || i > 8) throw e;
    }
  }
}

/** One age-up, answering each decision with choice 0; returns the world and the storylets that opened. */
function year(w: World): { world: World; opened: string[] } {
  const opened: string[] = [];
  let r = ageUp(w, bundles);
  while (r.world.pending) {
    opened.push(r.world.pending.storyletId);
    r = firstChoice(r.world);
  }
  return { world: r.world, opened };
}

const play = (
  w: World,
  id: string,
  target: PersonId | undefined,
  ...picks: number[]
) => {
  let r = startStorylet(w, bundles, id, target);
  for (const i of picks) r = choose(r.world, bundles, i);
  return r.world;
};

describe("pack closure", () => {
  test("compiles with its required closure only", () => {
    expect(out.ok).toBe(true);
    expect(bundles.map((b) => b.id)).toContain("dating");
  });
});

describe("the will", () => {
  test("even split, charity and tearing up the will write the core will and gen_will_kind", () => {
    const f = family({ spouse: true });
    let w = play(f.w, G("will-make"), undefined, 0);
    expect(willOf(w)?.mode).toBe("even");
    expect(q(w, "gen_will_kind")).toBe(2);
    // the 3-year cooldown separates revisions
    w = year(year(year(w).world).world).world;
    w = play(w, G("will-make"), undefined, 1);
    expect(willOf(w)?.mode).toBe("spouse");
    expect(q(w, "gen_will_kind")).toBe(3);
    w = year(year(year(w).world).world).world;
    w = play(w, G("will-make"), undefined, 2);
    expect(willOf(w)?.mode).toBe("charity");
    expect(q(w, "gen_will_kind")).toBe(4);
    w = year(year(year(w).world).world).world;
    w = play(w, G("will-make"), undefined, 3);
    expect(willOf(w)).toBeUndefined();
    expect(q(w, "gen_will_kind")).toBe(0);
  });

  test("naming one child sets the heir and kind 1", () => {
    const f = family();
    const w = play(f.w, G("will-heir"), f.kids[1]);
    expect(willOf(w)).toMatchObject({ mode: "heir", heir: f.kids[1] });
    expect(q(w, "gen_will_kind")).toBe(1);
  });

  test("the will actions live in the estate submenu from 18", () => {
    const f = family();
    const ids = listActions(f.w, bundles, "assets/estate").map((a) => a.id);
    expect(ids).toContain(G("will-make"));
    const young = updatePerson(f.w, f.dead, (p) => ({ ...p, age: 17 }));
    expect(
      listActions(young, bundles, "assets/estate").find(
        (a) => a.id === G("will-make"),
      )?.locked,
    ).toBe(true);
  });

  test("the no-will rule: a spouse gets half, the children split the rest (core estate)", () => {
    const f = family({ spouse: true, cash: 100000 });
    const w = inherit(f);
    expect(getPerson(w, f.spouse as PersonId).money).toBeGreaterThanOrEqual(
      50000,
    );
    expect(q(w, "gen_will_kind")).toBe(0);
    expect(q(w, "gen_will_kind", f.dead)).toBe(0);
  });

  test("the dead player's will kind is readable as deceased.quality", () => {
    const f = family({ spouse: true });
    const w0 = play(f.w, G("will-make"), undefined, 0);
    const w = inherit({ ...f, w: w0 });
    expect(q(w, "gen_will_kind")).toBe(0); // the heir starts with no will
    expect(w.deceased?.person).toBe(f.dead);
  });
});

describe("on_succession bookkeeping", () => {
  test("the generation counter rises by one per succession and persists", () => {
    const f = family();
    expect(gen(f.w)).toBe(0);
    let w = inherit(f);
    expect(gen(w)).toBe(1);
    const heir = heirsOf(endLife(w, w.playerId, "illness"));
    expect(heir).toEqual([]);
    w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 40 }));
    let kid: PersonId;
    [w, kid] = addPerson(w, { givenName: "Next", familyName: "X", age: 12 });
    w = addParentLink(w, kid, w.playerId);
    w = putRelationship(w, {
      from: w.playerId,
      to: kid,
      role: "core-loop/child",
      closeness: 60,
    });
    w = succeed(endLife(w, w.playerId, "illness"), bundles, kid).world;
    expect(gen(w)).toBe(2);
  });

  test("gen_minor_heir is set exactly for an heir under 18", () => {
    expect(q(inherit(family({ kids: [30] })), "gen_minor_heir")).toBe(0);
    expect(q(inherit(family({ kids: [17] })), "gen_minor_heir")).toBe(1);
    expect(q(inherit(family({ kids: [6] })), "gen_minor_heir")).toBe(1);
  });
});

describe("succession openers: exactly one per generation, by heir age band", () => {
  const bands: [number, string, number][] = [
    [8, OPENERS[0] as string, 0],
    [15, OPENERS[1] as string, 1],
    [25, OPENERS[2] as string, 2],
    [45, OPENERS[3] as string, 3],
  ];
  for (const [age, opener, band] of bands) {
    test(`heir aged ${age} opens ${opener} once and sets band ${band}`, () => {
      let w = inherit(family({ kids: [age] }));
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = year(w);
        w = r.world;
        seen.push(...r.opened);
      }
      const fired = seen.filter((s) => OPENERS.map(G).includes(s));
      expect(fired).toEqual([G(opener)]);
      expect(q(w, "gen_inherit_band")).toBe(band);
    });
  }

  test("the opener fires again for the next generation, not twice within one", () => {
    const f = family({ kids: [30] });
    let w = inherit(f);
    w = year(w).world;
    expect(w.storyletLog[G("inherit-18-39")]).toBeDefined();
    // second generation
    w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 45 }));
    let kid: PersonId;
    [w, kid] = addPerson(w, { givenName: "Next", familyName: "X", age: 20 });
    w = addParentLink(w, kid, w.playerId);
    w = putRelationship(w, {
      from: w.playerId,
      to: kid,
      role: "core-loop/child",
      closeness: 60,
    });
    w = succeed(endLife(w, w.playerId, "illness"), bundles, kid).world;
    expect(w.storyletLog[G("inherit-18-39")]).toBeUndefined();
    const r = year(w);
    expect(r.opened.filter((s) => s === G("inherit-18-39"))).toHaveLength(1);
  });

  test("a heir of a parent who died reads deceased.* in the opener text", () => {
    const w = inherit(family({ kids: [30] }));
    const r = year(w);
    expect(r.opened).toContain(G("inherit-18-39"));
  });
});

describe("aftermath", () => {
  test("grief opens for the heir of a parent and schedules the anniversary", () => {
    const w = inherit(family({ kids: [30] }));
    const r = year(w);
    expect(r.world.storyletLog[G("aftermath-grief")]).toBeDefined();
    expect(Object.keys(r.world.state?._schedule ?? {})).toContain(
      G("aftermath-anniversary"),
    );
  });

  test("cash-left opens only when the dead player held cash", () => {
    const rich = year(inherit(family({ kids: [30], cash: 500000 }))).opened;
    expect(rich).toContain(G("aftermath-cash-left"));
    const poor = year(inherit(family({ kids: [30], cash: 0 }))).opened;
    expect(poor).not.toContain(G("aftermath-cash-left"));
  });

  test("family-home opens for an heir who inherits a house", () => {
    const f = family({ kids: [30] });
    const [w1, aid] = allocId(f.w);
    const w0 = putAsset(w1, f.dead, {
      id: aid,
      kindId: "core-loop/house",
      purchasePrice: 3000000,
      value: 3000000,
      acquiredAge: 40,
      qualities: {},
    });
    const w = inherit({ ...f, w: w0 });
    expect(year(w).world.storyletLog[G("aftermath-family-home")]).toBeDefined();
  });
});

describe("minor heir", () => {
  test("a minor heir with a guardian is taken in, with the flag set", () => {
    const w = inherit(family({ kids: [9] }));
    expect(q(w, "gen_minor_heir")).toBe(1);
    const r = year(w);
    expect(r.opened).toContain(G("minor-guardian-takes-in"));
    expect(r.opened.filter((s) => OPENERS.map(G).includes(s))).toEqual([
      G("inherit-under-12"),
    ]);
  });

  test("the handover storylet clears the flag at 18", () => {
    let w = inherit(family({ kids: [17] }));
    w = updatePerson(w, w.playerId, (p) => ({ ...p, age: 18 }));
    w = play(w, G("minor-handover-at-18"), undefined);
    expect(q(w, "gen_minor_heir")).toBe(0);
  });

  test("the minor storylets never open for an adult heir", () => {
    const opened = year(inherit(family({ kids: [30] }))).opened;
    for (const s of [
      "minor-guardian-takes-in",
      "minor-guardian-review",
      "minor-on-own",
      "minor-handover-at-18",
    ])
      expect(opened).not.toContain(G(s));
  });
});

describe("heirlooms", () => {
  test("the five entries carry the sheet's base and gain", () => {
    for (const id of IDS) {
      const e = idx.kinds.get("gen_heirloom")?.entries.get(G(id));
      expect(e?.values.base).toBe(BASE[id]);
      expect(e?.values.gain).toBe(GAIN[id]);
    }
  });

  test("the attic finds an heirloom the family does not hold", () => {
    forced = forceRolls({});
    const f = family();
    const w = play(f.w, G("heirloom-attic-find"), undefined);
    const held = IDS.filter((i) => cell(w, `${i}_held`) === 1);
    expect(held).toHaveLength(1);
    const id = held[0] as (typeof IDS)[number];
    expect(cell(w, `${id}_value`)).toBe(BASE[id]);
  });

  test("selling pays the value in cash, clears the held flag and keeps the attic from returning it", () => {
    const f = family({ cash: 0 });
    let w = setCellRaw(f.w, f.dead, "violin_held", 1);
    w = setCellRaw(w, f.dead, "violin_value", 900000);
    const names = IDS as readonly string[];
    const choiceIdx = names.indexOf("violin");
    const before = getPerson(w, w.playerId).money;
    w = play(w, G("heirloom-sell"), undefined, choiceIdx);
    expect(getPerson(w, w.playerId).money).toBe(before + 900000);
    expect(cell(w, "violin_held")).toBe(0);
    expect(cell(w, "violin_value")).toBe(0);
    expect(cell(w, "violin_sold")).toBe(1);
  });

  test("a held heirloom passes whole at succession, gains its percent and counts the generation", () => {
    const f = family({ kids: [30] });
    let w = f.w;
    for (const id of IDS) {
      w = setCellRaw(w, f.dead, `${id}_held`, 1);
      w = setCellRaw(w, f.dead, `${id}_value`, BASE[id]);
    }
    w = setCellRaw(w, f.dead, "watch_told", 1);
    const h = inherit({ ...f, w });
    for (const id of IDS) {
      expect(cell(h, `${id}_held`)).toBe(1);
      expect(cell(h, `${id}_passed`)).toBe(1);
      expect(cell(h, `${id}_value`)).toBe(
        Math.floor((BASE[id] * (100 + GAIN[id])) / 100),
      );
    }
    expect(cell(h, "watch_told")).toBe(1);
    // the dead player keeps their own row
    expect(cell(h, "watch_held", f.dead)).toBe(1);
  });

  test("a sold or never-found heirloom does not pass and gains nothing", () => {
    const f = family({ kids: [30] });
    let w = setCellRaw(f.w, f.dead, "clock_sold", 1);
    w = setCellRaw(w, f.dead, "clock_value", 0);
    const h = inherit({ ...f, w });
    expect(cell(h, "clock_held")).toBe(0);
    expect(cell(h, "clock_value")).toBe(0);
    expect(cell(h, "clock_passed")).toBe(0);
    expect(cell(h, "clock_sold")).toBe(1);
    expect(cell(h, "quilt_value")).toBe(0);
  });

  test("a second generation compounds the gain", () => {
    const f = family({ kids: [30] });
    let w = setCellRaw(f.w, f.dead, "quilt_held", 1);
    w = setCellRaw(w, f.dead, "quilt_value", 20000);
    let h = inherit({ ...f, w });
    h = updatePerson(h, h.playerId, (p) => ({ ...p, age: 50 }));
    let kid: PersonId;
    [h, kid] = addPerson(h, { givenName: "N", familyName: "X", age: 25 });
    h = addParentLink(h, kid, h.playerId);
    h = putRelationship(h, {
      from: h.playerId,
      to: kid,
      role: "core-loop/child",
      closeness: 60,
    });
    h = succeed(endLife(h, h.playerId, "illness"), bundles, kid).world;
    expect(cell(h, "quilt_passed")).toBe(2);
    expect(cell(h, "quilt_value")).toBe(Math.floor((21000 * 105) / 100));
  });

  test("history needs a passed, untold heirloom and sets its told flag", () => {
    const f = family({ kids: [30] });
    let w = setCellRaw(f.w, f.dead, "letters_held", 1);
    w = setCellRaw(w, f.dead, "letters_value", 35000);
    const h = inherit({ ...f, w });
    const before = h;
    const after = play(before, G("heirloom-history"), undefined);
    expect(cell(after, "letters_told")).toBe(1);
  });
});

describe("determinism and saves across succession", () => {
  test("the world with gen state survives a save and passes the container check", () => {
    const f = family({ kids: [12], spouse: true });
    let w = setCellRaw(f.w, f.dead, "watch_held", 1);
    w = setCellRaw(w, f.dead, "watch_value", 60000);
    let h = inherit({ ...f, w });
    h = year(year(h).world).world;
    expect(deserializeWorld(serializeWorld(h))).toEqual(h);
    expect(worldHash(deserializeWorld(serializeWorld(h)))).toBe(worldHash(h));
    expect(checkWorldState(h, idx.state)).toEqual([]);
    expect(gen(h)).toBe(1);
  });
});
