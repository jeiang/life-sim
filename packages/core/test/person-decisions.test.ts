import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  type DecisionDraw,
  getPerson,
  indexBundles,
  newLife,
  type PackBundle,
  replay,
  setDecisionSink,
  setQuality,
  spawnPerson,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "person-decisions"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = compiled.bundles;
const idx = indexBundles(bundles);

/** A life of the given age with `friends` friends and `rivals` rivals. */
function life(seed: number, age = 10, friends = 0, rivals = 0): World {
  let w = updatePerson(newLife(bundles, seed), 0, (p) => ({ ...p, age }));
  for (const [role, n] of [
    ["pd/friend", friends],
    ["pd/rival", rivals],
  ] as const)
    for (let i = 0; i < n; i++)
      w = spawnPerson(w, idx, w.playerId, role, "pd/local")[0];
  return w;
}

const fired = (w: World, id: string) =>
  Object.entries(w.storyletLog)
    .filter(([k]) => k === id || k.startsWith(`${id}#`))
    .reduce((n, [, r]) => n + r.count, 0);

describe("person decisions in the slot pool", () => {
  test("the storylet is drawn by weight first, then one eligible person at random", () => {
    // 1 rival vs 3 friends, equal weights: per-person candidates would give the rival 25%.
    const N = 2000;
    const byStorylet = new Map<string, number>();
    const byPerson = new Map<number, number>();
    let friendsPicked = 0;
    for (let seed = 1; seed <= N; seed++) {
      const p = ageUp(life(seed, 10, 3, 1), bundles).world.pending;
      if (!p) continue;
      byStorylet.set(p.storyletId, (byStorylet.get(p.storyletId) ?? 0) + 1);
      if (p.scope && p.storyletId === "pd/ask-friend") {
        friendsPicked++;
        byPerson.set(p.scope.id, (byPerson.get(p.scope.id) ?? 0) + 1);
      }
    }
    const rival = byStorylet.get("pd/ask-rival") ?? 0;
    const friend = byStorylet.get("pd/ask-friend") ?? 0;
    expect(byStorylet.get("pd/plain-decision") ?? 0).toBeGreaterThan(0);
    // Equal weights: each storylet ~1/3 of first picks, however many people it could bind.
    for (const n of [rival, friend]) {
      expect(n / (rival + friend)).toBeGreaterThan(0.42);
      expect(n / (rival + friend)).toBeLessThan(0.58);
    }
    // The three friends are picked about evenly.
    expect(byPerson.size).toBe(3);
    for (const n of byPerson.values()) {
      expect(n / friendsPicked).toBeGreaterThan(0.27);
      expect(n / friendsPicked).toBeLessThan(0.4);
    }
  });

  test("the NPC pass no longer draws them", () => {
    // Below the minimum age no decision slot rolls, and nothing fires on its own.
    for (let seed = 1; seed <= 100; seed++) {
      const w = ageUp(life(seed, 3, 3, 1), bundles).world;
      expect(w.pending).toBeNull();
      expect(fired(w, "pd/ask-friend")).toBe(0);
      expect(fired(w, "pd/ask-rival")).toBe(0);
      // Non-choice person events still run there, once per friend.
      expect(fired(w, "pd/friend-reaction")).toBe(3);
    }
  });

  test("the open storylet is bound to the picked person and its effects land on them", () => {
    let seen = 0;
    for (let seed = 1; seed <= 200 && seen < 5; seed++) {
      let w = ageUp(life(seed, 10, 1, 0), bundles).world;
      while (w.pending && w.pending.storyletId !== "pd/ask-friend")
        w = choose(w, bundles, 0).world;
      if (!w.pending?.scope) continue;
      seen++;
      const pid = w.pending.scope.id;
      expect(getPerson(w, pid).alive).toBe(true);
      const refuse = choose(w, bundles, 1).world;
      expect(getPerson(refuse, pid).qualities.sulking).toBe(true);
      const help = choose(w, bundles, 0).world;
      expect(getPerson(help, pid).qualities.mood).toBe(1);
      expect(getPerson(help, w.playerId).qualities.mood ?? 0).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("a person who cannot be asked is not picked", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let w = life(seed, 10, 2, 0);
      for (const p of w.persons.values())
        if (p.id !== w.playerId) w = setQuality(w, p.id, "sulking", true);
      w = ageUp(w, bundles).world;
      while (w.pending) {
        expect(w.pending.storyletId).not.toBe("pd/ask-friend");
        w = choose(w, bundles, 0).world;
      }
    }
  });

  test("a chance person decision rolls per person and queues one event each", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let w = life(seed, 10, 2, 0);
      w = setQuality(w, w.playerId, "gate", true);
      w = ageUp(w, bundles).world;
      const ids: (number | undefined)[] = [];
      while (w.pending) {
        if (w.pending.storyletId === "pd/friend-chance")
          ids.push(w.pending.scope?.id);
        w = choose(w, bundles, 0).world;
      }
      expect(ids.length).toBe(2);
      expect(new Set(ids).size).toBe(2);
    }
  });

  test("slot rates stay within 3 points of 90 / 50 / 30 with person decisions in the pool", () => {
    const N = 10000;
    const atLeast = [0, 0, 0];
    let got: DecisionDraw | null = null;
    setDecisionSink((d) => {
      got = d;
    });
    try {
      for (let seed = 1; seed <= N; seed++) {
        ageUp(life(seed, 10, 3, 1), bundles);
        const d = got as unknown as DecisionDraw;
        for (let k = 0; k < 3; k++)
          if (d.queued > k) atLeast[k] = (atLeast[k] ?? 0) + 1;
      }
    } finally {
      setDecisionSink(null);
    }
    const [a, b, c] = atLeast.map((n) => (n * 100) / N) as [
      number,
      number,
      number,
    ];
    expect(Math.abs(a - 90)).toBeLessThan(3);
    expect(Math.abs(b - 50)).toBeLessThan(3);
    expect(Math.abs(c - 30)).toBeLessThan(3);
  });

  test("the same life is deterministic, and its choice log replays to the same hash", () => {
    const run = (start: World): World => {
      let w = start;
      for (let i = 0; i < 6; i++) {
        w = ageUp(w, bundles).world;
        while (w.pending) w = choose(w, bundles, 0).world;
      }
      return w;
    };
    const a = run(life(7, 10, 3, 1));
    expect(worldHash(run(life(7, 10, 3, 1)))).toBe(worldHash(a));
    const plain = run(newLife(bundles, 9));
    expect(worldHash(replay(9, bundles, plain.choiceLog))).toBe(
      worldHash(plain),
    );
  });
});
