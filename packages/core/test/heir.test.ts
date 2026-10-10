import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  checkWorldState,
  choose,
  deserializeWorld,
  endLife,
  getPerson,
  heirsOf,
  indexBundles,
  listShop,
  newLife,
  type PackBundle,
  type PersonId,
  putRelationship,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  serializeSave,
  serializeWorld,
  succeed,
  updatePerson,
  validateImport,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");
const FIXTURE = join(HERE, "fixtures", "succession");

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function build(): PackBundle[] {
  const dir = mkdtempSync(join(tmpdir(), "heir-"));
  dirs.push(dir);
  for (const p of ["core-loop", "karma"])
    cpSync(join(PACKS, p), join(dir, p), { recursive: true });
  mkdirSync(join(dir, "succ"), { recursive: true });
  cpSync(join(FIXTURE, "succ"), join(dir, "succ"), { recursive: true });
  const out = compilePacks(dir);
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return [...out.bundles];
}

const bundles = build();
const idx = indexBundles(bundles);
const act = (w: World, id: string) => runAction(w, bundles, `succ/${id}`).world;
const lines = (w: World): string[] => w.journal.flatMap((e) => e.lines);
const stat = (w: World, id: PersonId, s: string): number =>
  getPerson(w, id).stats[s] as number;

function year(w: World): World {
  let r = ageUp(w, bundles).world;
  while (r.pending) r = choose(r, bundles, 0).world;
  return r;
}

interface Setup {
  readonly w: World;
  readonly dead: PersonId;
  readonly kid: PersonId;
  readonly other: PersonId | undefined;
}

/**
 * A dead 50-year-old with one child of `kidAge`, whose other parent is a living `other` when
 * `withOther`. Parents and child carry the given stats; the child's own happiness is 77.
 */
function lineage(opts: {
  seed: number;
  kidAge: number;
  parentStat: number;
  withOther?: boolean;
  cash?: number;
}): Setup {
  let w = newLife(bundles, opts.seed);
  const dead = w.playerId;
  const set = (id: PersonId, v: number) =>
    updatePerson(w, id, (p) => ({
      ...p,
      stats: { ...p.stats, smarts: v, looks: v, health: v },
    }));
  w = updatePerson(set(dead, opts.parentStat), dead, (p) => ({
    ...p,
    age: 50,
    money: opts.cash ?? 100000,
  }));
  let other: PersonId | undefined;
  if (opts.withOther) {
    [w, other] = addPerson(w, {
      givenName: "Pat",
      familyName: "Other",
      age: 48,
    });
    w = set(other, opts.parentStat);
  }
  let kid: PersonId;
  [w, kid] = addPerson(w, {
    givenName: "Kid",
    familyName: "X",
    age: opts.kidAge,
  });
  w = updatePerson(w, kid, (p) => ({
    ...p,
    stats: { ...p.stats, happiness: 77, smarts: 50, looks: 50, health: 90 },
  }));
  w = addParentLink(w, kid, dead);
  w = putRelationship(w, {
    from: dead,
    to: kid,
    role: "core-loop/child",
    closeness: 60,
  });
  if (other !== undefined) {
    w = addParentLink(w, kid, other);
    w = putRelationship(w, {
      from: dead,
      to: other,
      role: "core-loop/spouse",
      closeness: 80,
    });
  }
  return { w, dead, kid, other };
}

const heirOf = (s: Setup): World =>
  succeed(endLife(s.w, s.dead, "illness"), bundles, s.kid).world;

describe("minor heir: trust", () => {
  const minor = () =>
    lineage({ seed: 5, kidAge: 15, parentStat: 50, cash: 400000 });

  test("a minor heir with no living parent goes to a guardian at once, assets in trust", () => {
    const s = minor();
    const w = heirOf(s);
    expect(getPerson(w, s.kid).withGuardian).toBe(true);
    expect(
      lines(w).some((l) => l.includes("held in trust until you are 18")),
    ).toBe(true);
    const phone = listShop(w, bundles, "stuff").find(
      (r) => r.id === "core-loop/phone",
    );
    expect(getPerson(w, s.kid).money).toBeGreaterThan(60000);
    expect(phone?.canCash).toBe(false);
    expect(phone?.reason).toBe(
      "Your assets are held in trust until you are 18",
    );
  });

  test("the trust is released at 18: on their own, assets usable", () => {
    let w = heirOf(minor());
    const id = w.playerId;
    w = year(year(w));
    expect(getPerson(w, id).age).toBe(17);
    expect(getPerson(w, id).withGuardian).toBe(true);
    w = year(w);
    const p = getPerson(w, id);
    expect(p.age).toBe(18);
    expect(p.withGuardian).toBeUndefined();
    expect(p.withParents).toBe(false);
    expect(lines(w).some((l) => l.includes("hands over your assets"))).toBe(
      true,
    );
    const phone = listShop(w, bundles, "stuff").find(
      (r) => r.id === "core-loop/phone",
    );
    expect(phone?.canCash).toBe(true);
  });

  test("a minor heir with a living parent stays with them; an adult heir needs no guardian", () => {
    const withParent = lineage({
      seed: 5,
      kidAge: 15,
      parentStat: 50,
      withOther: true,
    });
    const a = heirOf(withParent);
    expect(getPerson(a, withParent.kid).withGuardian).toBeUndefined();
    expect(lines(a).some((l) => l.includes("trust"))).toBe(false);
    const adult = lineage({ seed: 5, kidAge: 30, parentStat: 50 });
    const b = heirOf(adult);
    expect(getPerson(b, adult.kid).withGuardian).toBeUndefined();
  });
});

describe("heir genetics", () => {
  const draws = (parentStat: number, n = 120) => {
    const out: Record<string, number[]> = {
      smarts: [],
      looks: [],
      health: [],
    };
    for (let seed = 1; seed <= n; seed++) {
      const s = lineage({ seed, kidAge: 30, parentStat });
      const w = heirOf(s);
      for (const k of Object.keys(out))
        (out[k] as number[]).push(stat(w, s.kid, k));
    }
    return out;
  };
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

  test("an heir of gifted parents leans gifted, within the declared share", () => {
    const hi = draws(100);
    // smarts and looks: 60% parents (100) + 40% fresh draw from 0-100.
    for (const k of ["smarts", "looks"]) {
      const v = hi[k] as number[];
      expect(Math.min(...v)).toBeGreaterThanOrEqual(60);
      expect(Math.max(...v)).toBeLessThanOrEqual(100);
      expect(mean(v)).toBeGreaterThan(72);
      expect(mean(v)).toBeLessThan(88);
      expect(new Set(v).size).toBeGreaterThan(10);
    }
    // health: 40% parents (100) + 60% fresh draw from 80-100.
    const h = hi.health as number[];
    expect(Math.min(...h)).toBeGreaterThanOrEqual(88);
  });

  test("an heir of weak parents leans weak", () => {
    const lo = draws(0);
    for (const k of ["smarts", "looks"]) {
      const v = lo[k] as number[];
      expect(Math.max(...v)).toBeLessThanOrEqual(40);
      expect(mean(v)).toBeLessThan(28);
    }
  });

  test("the draw leans toward both parents, not only the dead player", () => {
    const seeds = Array.from({ length: 80 }, (_, i) => i + 1);
    const outs = seeds.map((seed) => {
      let s = lineage({ seed, kidAge: 30, parentStat: 0, withOther: true });
      // The other parent is brilliant; the dead player is not.
      s = {
        ...s,
        w: updatePerson(s.w, s.other as PersonId, (p) => ({
          ...p,
          stats: { ...p.stats, smarts: 100 },
        })),
      };
      return stat(heirOf(s), s.kid, "smarts");
    });
    // Blend of 0 and 100 at 60% plus 40% fresh: spread across the range, mean near 50% of 60 + 20.
    expect(mean(outs)).toBeGreaterThan(40);
    expect(mean(outs)).toBeLessThan(60);
    expect(Math.max(...outs)).toBeGreaterThan(70);
    expect(Math.min(...outs)).toBeLessThan(30);
  });

  test("stats without `inherit` keep the heir's own value, and the draw is reproducible", () => {
    const s = lineage({ seed: 9, kidAge: 30, parentStat: 100 });
    const a = heirOf(s);
    expect(stat(a, s.kid, "happiness")).toBe(77);
    expect(stat(heirOf(s), s.kid, "smarts")).toBe(stat(a, s.kid, "smarts"));
    expect(
      idx.stats.filter((x) => x.inheritBp !== undefined).map((x) => x.id),
    ).toEqual(["health", "smarts", "looks"]);
  });
});

describe("three generations with minor heirs", () => {
  function line(seed: number): World {
    let w = newLife(bundles, seed);
    for (let g = 0; g < 3; g++) {
      // Children at age 0-18, so most heirs are minors with no parent left.
      w = act(act(w, "have-child"), "have-child");
      w = year(year(w));
      w = act(w, "pass-away");
      expect(w.ended, `seed ${seed} generation ${g}`).not.toBeNull();
      const heirs = heirsOf(w);
      expect(heirs.length).toBeGreaterThan(0);
      w = succeed(w, bundles, heirs[0] as PersonId).world;
    }
    return year(year(w));
  }

  test("replays to the same world, survives a save and is checkable", () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = line(seed);
      expect(w.generation).toBe(3);
      const r = replay(w.seed, bundles, w.choiceLog);
      expect(worldHash(r)).toBe(worldHash(w));
      expect(serializeWorld(r)).toBe(serializeWorld(w));
      expect(deserializeWorld(serializeWorld(w))).toEqual(w);
      expect(checkWorldState(w, idx.state)).toEqual([]);
      const file = {
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

  test("a lineage is a pure function of its seed", () => {
    const a = line(2);
    const b = line(2);
    expect(worldHash(a)).toBe(worldHash(b));
    const c = line(3);
    expect(stat(a, a.playerId, "smarts")).toBeGreaterThanOrEqual(0);
    expect(worldHash(c)).not.toBe(worldHash(a));
  });
});
