import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  canAgeUp,
  choose,
  type DecisionDraw,
  describePending,
  getPerson,
  newLife,
  parseSave,
  SAVE_SCHEMA_VERSION,
  serializeSave,
  setDecisionSink,
  setQuality,
  updatePerson,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "decisions"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

/** A life one year short of `age`. */
function lifeAt(age: number, seed: number): World {
  let w = newLife(bundles, seed);
  w = updatePerson(w, w.playerId, (p) => ({ ...p, age: age - 1 }));
  return w;
}

function draw(w: World): { world: World; draw: DecisionDraw } {
  let got: DecisionDraw | null = null;
  setDecisionSink((d) => {
    got = d;
  });
  try {
    const world = ageUp(w, bundles).world;
    return { world, draw: got as unknown as DecisionDraw };
  } finally {
    setDecisionSink(null);
  }
}

function resolveAll(w: World): { world: World; ids: string[] } {
  const ids: string[] = [];
  let cur = w;
  while (cur.pending) {
    ids.push(cur.pending.storyletId);
    cur = choose(cur, bundles, 0).world;
  }
  return { world: cur, ids };
}

describe("decision slots", () => {
  test("'at least' rates converge to 90 / 50 / 30 percent from the minimum age", () => {
    const N = 6000;
    const atLeast = [0, 0, 0];
    for (let seed = 1; seed <= N; seed++) {
      const { world, draw: d } = draw(lifeAt(5, seed));
      for (let k = 0; k < 3; k++)
        if (d.queued > k) atLeast[k] = (atLeast[k] ?? 0) + 1;
      expect(d.empty).toBe(0);
      expect(resolveAll(world).ids.length).toBe(d.queued);
    }
    const [a, b, c] = atLeast.map((n) => n / N) as [number, number, number];
    expect(a).toBeGreaterThan(0.88);
    expect(a).toBeLessThan(0.92);
    expect(b).toBeGreaterThan(0.48);
    expect(b).toBeLessThan(0.52);
    expect(c).toBeGreaterThan(0.28);
    expect(c).toBeLessThan(0.32);
  });

  test("no slots roll below the minimum age", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { world, draw: d } = draw(lifeAt(4, seed));
      expect(d.fired).toBe(0);
      expect(world.pending).toBeNull();
    }
  });

  test("a fired slot with nothing eligible is counted and the year goes on", () => {
    let empties = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const dry = setQuality(
        lifeAt(5, seed),
        newLife(bundles, 1).playerId,
        "dry",
        true,
      );
      const { world, draw: d } = draw(dry);
      empties += d.empty;
      expect(d.queued).toBe(0);
      expect(world.pending).toBeNull();
      expect(canAgeUp(world)).toBe(true);
    }
    expect(empties).toBeGreaterThan(300 * 1.5);
  });

  test("queued decisions resolve in order, one after another, with age-up blocked until empty", () => {
    let found = 0;
    for (let seed = 1; seed <= 200 && found < 5; seed++) {
      const { world: w0, draw: d } = draw(lifeAt(5, seed));
      if (d.queued < 2) continue;
      found++;
      const first = w0.pending?.storyletId as string;
      const queued = w0.pending?.rest?.events.map((e) => e.storyletId) ?? [];
      expect(queued.length).toBe(d.queued - 1);
      expect(new Set([first, ...queued]).size).toBe(d.queued);
      expect(() => ageUp(w0, bundles)).toThrow(/pending/);
      let cur = w0;
      const seen: string[] = [];
      while (cur.pending) {
        seen.push(cur.pending.storyletId);
        expect(canAgeUp(cur)).toBe(false);
        expect(describePending(cur, bundles)?.storyletId).toBe(seen.at(-1));
        cur = choose(cur, bundles, 0).world;
      }
      expect(seen).toEqual([first, ...queued]);
      expect(canAgeUp(cur)).toBe(true);
    }
    expect(found).toBe(5);
  });

  test("a mid-year queue survives a save round trip and keeps its order", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { world: w0, draw: d } = draw(lifeAt(5, seed));
      if (d.queued < 3) continue;
      const file = {
        schemaVersion: SAVE_SCHEMA_VERSION,
        capabilities: [],
        appliedMigrations: [],
        lives: [{ id: "a", name: "A", updatedAt: 1, world: w0 }],
        graveyard: [],
      };
      const back = parseSave(serializeSave(file as never));
      const w1 = (back as never as { lives: { world: World }[] }).lives[0]
        ?.world as World;
      expect(resolveAll(w1).ids).toEqual(resolveAll(w0).ids);
      return;
    }
    throw new Error("no 3-decision year found");
  });

  test("a pre-queue save with a single pending (no queue) loads and resolves", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { world: w0 } = draw(lifeAt(5, seed));
      if (!w0.pending) continue;
      const legacy: World = {
        ...w0,
        pending: { storyletId: w0.pending.storyletId },
      };
      const text = serializeSave({
        schemaVersion: SAVE_SCHEMA_VERSION,
        capabilities: [],
        appliedMigrations: [],
        lives: [{ id: "a", name: "A", updatedAt: 1, world: legacy }],
        graveyard: [],
      } as never);
      const parsed = parseSave(text) as never as { lives: { world: World }[] };
      const w1 = parsed.lives[0]?.world as World;
      expect(w1.pending?.rest).toBeUndefined();
      const done = choose(w1, bundles, 0).world;
      expect(done.pending).toBeNull();
      expect(getPerson(done, done.playerId).age).toBe(5);
      return;
    }
    throw new Error("no pending year found");
  });
});
