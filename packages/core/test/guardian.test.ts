import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  choose,
  getPerson,
  guardianOf,
  indexBundles,
  killPerson,
  livesWithoutGuardian,
  livingCost,
  moveOut,
  newLife,
  noGuardianBp,
  type PersonId,
  putRelationship,
  replay,
  ScriptedRng,
  setStreamOverride,
  settleLiving,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const packsDir = join(HERE, "..", "..", "..", "packs");

function compile(patch?: (yaml: string) => string) {
  const tmp = mkdtempSync(join(tmpdir(), "guardian-"));
  cpSync(packsDir, tmp, { recursive: true });
  if (patch) {
    const f = join(tmp, "core-loop", "storylets", "housing.yaml");
    writeFileSync(f, patch(readFileSync(f, "utf8")));
  }
  const out = compilePacks(tmp, { only: ["core-loop"] });
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return out.bundles;
}

const bundles = compile();
const idx = indexBundles(bundles);
const me = (w: World) => getPerson(w, w.playerId);

afterEach(() => setStreamOverride(null));

interface Family {
  w: World;
  parents: PersonId[];
  grandparent: PersonId;
  aunt: PersonId;
  sibling: PersonId;
  cousin: PersonId;
  minorSibling: PersonId;
}

/** A 17-year-old with living parents, a grandparent, an aunt, an adult sibling and cousin, and a minor sibling. */
function family(age = 17): Family {
  let w = newLife(bundles, 11, { cityId: "core-loop/riverton" });
  w = updatePerson(w, w.playerId, (p) => ({
    ...p,
    age,
    qualities: { ...p.qualities, karma_score: 50 },
    stats: { ...p.stats, smarts: 50 },
  }));
  const parents = w.relationships
    .filter((r) => r.from === w.playerId && r.role === "core-loop/parent")
    .map((r) => r.to);
  const parent = parents[0] as PersonId;
  /** Add a relative aged `age` as a child of `under` (and of every other parent in `also`). */
  const add = (
    givenName: string,
    age: number,
    under: readonly PersonId[],
  ): PersonId => {
    const [w2, id] = addPerson(w, { givenName, familyName: "X", age });
    w = under.reduce((x, par) => addParentLink(x, id, par), w2);
    return id;
  };
  const grandparent = add("Gran", 70, []);
  w = addParentLink(w, parent, grandparent);
  const aunt = add("Aunt", 40, [grandparent]);
  const sibling = add("Sib", 25, parents);
  const cousin = add("Cuz", 22, [aunt]);
  const minorSibling = add("Kid", 10, parents);
  return { w, parents, grandparent, aunt, sibling, cousin, minorSibling };
}

const orphaned = (w: World, parents: readonly PersonId[]): World =>
  parents.reduce((x, id) => killPerson(x, id, "test"), w);

describe("guardian choice", () => {
  test("order: grandparent, aunt/uncle, adult sibling, adult cousin", () => {
    const f = family();
    let w = f.w;
    for (const id of [f.grandparent, f.aunt, f.sibling, f.cousin]) {
      expect(guardianOf(w, idx, me(w))?.id).toBe(id);
      w = killPerson(w, id, "test");
    }
    expect(guardianOf(w, idx, me(w))).toBeUndefined();
  });

  test("never a minor", () => {
    const f = family();
    let w = f.w;
    for (const id of [f.grandparent, f.aunt, f.sibling, f.cousin])
      w = killPerson(w, id, "test");
    // Only the 10-year-old sibling is left alive.
    expect(getPerson(w, f.minorSibling).alive).toBe(true);
    expect(guardianOf(w, idx, me(w))).toBeUndefined();
    w = updatePerson(w, f.cousin, (p) => ({ ...p, alive: true, age: 17 }));
    expect(guardianOf(w, idx, me(w))).toBeUndefined();
  });

  test("within a kinship id the highest closeness goes first", () => {
    const f = family();
    let w = f.w;
    const [w2, other] = addPerson(w, {
      givenName: "Sib",
      familyName: "Y",
      age: 30,
    });
    w = f.parents.reduce((x, par) => addParentLink(x, other, par), w2);
    for (const id of [f.grandparent, f.aunt]) w = killPerson(w, id, "test");
    w = putRelationship(w, {
      from: w.playerId,
      to: f.sibling,
      role: "core-loop/sibling",
      closeness: 40,
    });
    w = putRelationship(w, {
      from: w.playerId,
      to: other,
      role: "core-loop/sibling",
      closeness: 80,
    });
    expect(guardianOf(w, idx, me(w))?.id).toBe(other);
  });

  test("an orphan goes to the named relative, or an unnamed guardian", () => {
    const f = family();
    const named = moveOut(orphaned(f.w, f.parents), idx, f.w.playerId);
    expect(me(named).withGuardian).toBe(true);
    expect(named.journal.at(-1)?.lines.join(" ")).toContain(
      "becomes your guardian",
    );
    let bare = orphaned(f.w, f.parents);
    for (const id of [f.grandparent, f.aunt, f.sibling, f.cousin])
      bare = killPerson(bare, id, "test");
    bare = moveOut(bare, idx, bare.playerId);
    expect(me(bare).withGuardian).toBe(true);
    expect(bare.journal.at(-1)?.lines.join(" ")).toContain(
      "a guardian takes you in",
    );
  });
});

describe("no guardian", () => {
  const withScores = (w: World, karma: number, smarts: number): World =>
    updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, karma_score: karma },
      stats: { ...p.stats, smarts },
    }));

  test("the chance falls with karma and smarts: about 5% worst case, 0 at the best", () => {
    const { w } = family();
    const bp = (k: number, s: number) =>
      noGuardianBp(withScores(w, k, s), idx, me(withScores(w, k, s)));
    expect(bp(0, 0)).toBe(500);
    expect(bp(100, 100)).toBe(0);
    expect(bp(50, 50)).toBe(250);
    expect(bp(0, 100)).toBeLessThan(bp(0, 0));
    expect(bp(100, 0)).toBeLessThan(bp(0, 0));
    expect(bp(20, 30)).toBeGreaterThan(bp(60, 70));
  });

  test("only 16 and 17 with a living parent roll; under 16 and orphans never do", () => {
    const rolls: string[] = [];
    setStreamOverride((_age, key) => {
      if (key.startsWith("guardian/none")) rolls.push(key);
      return new ScriptedRng({ chance: true });
    });
    for (const age of [0, 10, 15]) {
      const w = moveOut(family(age).w, idx, 0);
      expect(me(w).withGuardian).toBe(true);
    }
    expect(rolls).toEqual([]);
    const f = family(17);
    expect(me(moveOut(orphaned(f.w, f.parents), idx, 0)).withGuardian).toBe(
      true,
    );
    expect(rolls).toEqual([]);
    for (const age of [16, 17]) {
      const w = moveOut(family(age).w, idx, 0);
      expect(livesWithoutGuardian(me(w))).toBe(true);
    }
    expect(rolls).toHaveLength(2);
  });

  test("a miss goes to the guardian, a hit lives on their own with costs and a standard", () => {
    setStreamOverride((_a, key) =>
      key.startsWith("guardian/none")
        ? new ScriptedRng({ chance: false })
        : undefined,
    );
    const missed = moveOut(withScores(family().w, 0, 0), idx, 0);
    expect(me(missed).withGuardian).toBe(true);
    expect(livingCost(missed, idx, me(missed))).toBe(0);

    setStreamOverride((_a, key) =>
      key.startsWith("guardian/none")
        ? new ScriptedRng({ chance: true })
        : undefined,
    );
    const hit = moveOut(
      updatePerson(withScores(family().w, 0, 0), 0, (p) => ({
        ...p,
        money: 9e9,
      })),
      idx,
      0,
    );
    const p = me(hit);
    expect(p.withGuardian).toBeUndefined();
    expect(livesWithoutGuardian(p)).toBe(true);
    expect(p.standardId).toBe("core-loop/average");
    expect(livingCost(hit, idx, p)).toBeGreaterThan(0);
    expect(me(settleLiving(hit, idx)).money).toBeLessThan(9e9);
    expect(hit.journal.at(-1)?.lines.join(" ")).toContain("no guardian");
  });

  test("a player with no money starts homeless-or-cheapest rather than in trust", () => {
    setStreamOverride((_a, key) =>
      key.startsWith("guardian/none")
        ? new ScriptedRng({ chance: true })
        : undefined,
    );
    const w = moveOut(withScores(family().w, 0, 0), idx, 0);
    expect(me(w).withGuardian).toBeUndefined();
    expect(me(settleLiving(w, idx)).money).toBeGreaterThanOrEqual(0);
  });
});

describe("replay", () => {
  test("a life where every 16-17 year old is put out replays to the same world", () => {
    const hot = compile((s) =>
      s.replace(/(id: parents-put-you-out[\s\S]*?chance: )[^\n]+/, "$110000"),
    );
    for (const seed of [1, 2, 3]) {
      let w = newLife(hot, seed);
      for (let i = 0; i < 18 && !w.ended; i++) {
        w = ageUp(w, hot).world;
        while (w.pending && !w.ended) w = choose(w, hot, 0).world;
      }
      const again = replay(w.seed, hot, w.choiceLog);
      expect(worldHash(again)).toBe(worldHash(w));
      expect(
        w.journal.some((j) =>
          j.lines.some((l) => /guardian|put you out/.test(l)),
        ),
      ).toBe(true);
    }
  });
});
