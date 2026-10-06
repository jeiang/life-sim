import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  type DecisionDraw,
  endLife,
  getPerson,
  indexBundles,
  makeEnv,
  migrateSave,
  newLife,
  type PackBundle,
  parseSave,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type ScheduleTick,
  serializeSave,
  serializeWorld,
  setDecisionSink,
  setQuality,
  setScheduleSink,
  spawnPerson,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "unlocks"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = compiled.bundles;
const idx = indexBundles(bundles);

/** A life of the given age with `friends` friends and `rivals` rivals. */
function life(seed: number, age = 10, friends = 0, rivals = 0): World {
  let w = updatePerson(newLife(bundles, seed), 0, (p) => ({ ...p, age }));
  for (const [role, n] of [
    ["life/friend", friends],
    ["life/rival", rivals],
  ] as const)
    for (let i = 0; i < n; i++)
      w = spawnPerson(w, idx, w.playerId, role, "life/local")[0];
  return w;
}

const me = (w: World) => getPerson(w, w.playerId);
const act = (w: World, id: string, target?: number) =>
  runAction(w, bundles, id, target).world;
const fired = (w: World, id: string) =>
  Object.entries(w.storyletLog)
    .filter(([k]) => k === id || k.startsWith(`${id}#`))
    .reduce((n, [, r]) => n + r.count, 0);
const flag = (w: World, name: string) =>
  makeEnv(w, idx, { subject: w.playerId }).get(name);

/** Age up and answer every open storylet with the first choice. */
function year(w: World): World {
  let cur = ageUp(w, bundles).world;
  while (cur.pending) cur = choose(cur, bundles, 0).world;
  return cur;
}

describe("person decisions in slots", () => {
  test("the storylet is drawn by weight first, then one eligible person at random", () => {
    // 1 rival vs 3 friends, equal weights: per-person candidates would give the rival 25%.
    const N = 2000;
    const byStorylet = new Map<string, number>();
    const byPerson = new Map<number, number>();
    let friendsPicked = 0;
    for (let seed = 1; seed <= N; seed++) {
      // Only the first queued decision: one draw, three equal-weight storylets in the pool.
      const p = ageUp(life(seed, 10, 3, 1), bundles).world.pending;
      if (!p) continue;
      byStorylet.set(p.storyletId, (byStorylet.get(p.storyletId) ?? 0) + 1);
      if (p.scope && p.storyletId === "life/ask-friend") {
        friendsPicked++;
        byPerson.set(p.scope.id, (byPerson.get(p.scope.id) ?? 0) + 1);
      }
    }
    const rival = byStorylet.get("life/ask-rival") ?? 0;
    const friend = byStorylet.get("life/ask-friend") ?? 0;
    const plain = byStorylet.get("life/plain-decision") ?? 0;
    // Three equal-weight decisions compete: ~1/3 each, however many people could be bound.
    for (const n of [rival, friend]) {
      expect(n / (rival + friend)).toBeGreaterThan(0.42);
      expect(n / (rival + friend)).toBeLessThan(0.58);
    }
    expect(plain).toBeGreaterThan(0);
    // The three friends are picked about evenly.
    expect(byPerson.size).toBe(3);
    for (const n of byPerson.values()) {
      expect(n / friendsPicked).toBeGreaterThan(0.27);
      expect(n / friendsPicked).toBeLessThan(0.4);
    }
  });

  test("the NPC pass no longer resolves them", () => {
    // Below the minimum age no decision slot rolls, and nothing fires on its own.
    for (let seed = 1; seed <= 100; seed++) {
      const w = ageUp(life(seed, 3, 3, 1), bundles).world;
      expect(w.pending).toBeNull();
      expect(fired(w, "life/ask-friend")).toBe(0);
      expect(fired(w, "life/ask-rival")).toBe(0);
    }
  });

  test("the player decides: the open storylet is bound to the person and its effects land on them", () => {
    let seen = 0;
    for (let seed = 1; seed <= 200 && seen < 5; seed++) {
      let w = ageUp(life(seed, 10, 1, 0), bundles).world;
      while (w.pending && w.pending.storyletId !== "life/ask-friend") {
        w = choose(w, bundles, 0).world;
      }
      if (!w.pending?.scope) continue;
      seen++;
      const pid = w.pending.scope.id;
      const refuse = choose(w, bundles, 1).world;
      expect(getPerson(refuse, pid).qualities.sulking).toBe(true);
      const help = choose(w, bundles, 0).world;
      expect(getPerson(help, pid).qualities.mood).toBe(1);
      expect(me(help).qualities.mood ?? 0).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("a person who cannot be asked is not drawn", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let w = life(seed, 10, 2, 0);
      for (const p of w.persons.values())
        if (p.id !== w.playerId) w = setQuality(w, p.id, "sulking", true);
      w = ageUp(w, bundles).world;
      while (w.pending) {
        expect(w.pending.storyletId).not.toBe("life/ask-friend");
        w = choose(w, bundles, 0).world;
      }
    }
  });

  test("slot rates stay at 90 / 50 / 30 with person decisions and due consequences", () => {
    const N = 4000;
    const atLeast = [0, 0, 0];
    let dues = 0;
    let got: DecisionDraw | null = null;
    setDecisionSink((d) => {
      got = d;
    });
    try {
      for (let seed = 1; seed <= N; seed++) {
        const base = life(seed, 10, 3, 1);
        const w = ageUp(
          {
            ...base,
            scheduled: [
              {
                storyletId: "life/later-choice",
                wait: 0,
                left: 1,
                lineage: false,
              },
            ],
          },
          bundles,
        ).world;
        if (fired(w, "life/later-choice") > 0) dues++;
        const d = got as unknown as DecisionDraw;
        for (let k = 0; k < 3; k++)
          if (d.queued > k) atLeast[k] = (atLeast[k] ?? 0) + 1;
      }
    } finally {
      setDecisionSink(null);
    }
    expect(dues).toBe(N);
    const [a, b, c] = atLeast.map((n) => (n * 100) / N) as [
      number,
      number,
      number,
    ];
    expect(Math.abs(a - 90)).toBeLessThan(3);
    expect(Math.abs(b - 50)).toBeLessThan(3);
    expect(Math.abs(c - 30)).toBeLessThan(3);
  });
});

describe("schedule", () => {
  test("fires once inside the window, evenly across it, never outside", () => {
    const at = new Map<number, number>();
    const N = 1500;
    for (let seed = 1; seed <= N; seed++) {
      let w = act(life(seed, 20), "life/plan");
      expect(w.scheduled).toHaveLength(1);
      let firedAt = 0;
      for (let y = 1; y <= 6; y++) {
        const before = fired(w, "life/later");
        w = year(w);
        if (fired(w, "life/later") > before) {
          expect(firedAt).toBe(0);
          firedAt = y;
        }
      }
      at.set(firedAt, (at.get(firedAt) ?? 0) + 1);
      expect(w.scheduled).toHaveLength(0);
    }
    expect([...at.keys()].sort()).toEqual([2, 3, 4]);
    for (const n of at.values()) {
      expect(n / N).toBeGreaterThan(0.29);
      expect(n / N).toBeLessThan(0.37);
    }
  });

  test("the chance rises through the window (1/3, 1/2, certain)", () => {
    // Replay the rolls: of the lives still waiting, the hit share rises.
    const hit = [0, 0, 0];
    const seen = [0, 0, 0];
    for (let seed = 1; seed <= 2000; seed++) {
      let w = act(life(seed, 20), "life/plan");
      w = year(w);
      expect(fired(w, "life/later")).toBe(0);
      for (let k = 0; k < 3; k++) {
        const before = fired(w, "life/later");
        if (before > 0) break;
        w = year(w);
        seen[k] = (seen[k] ?? 0) + 1;
        if (fired(w, "life/later") > 0) hit[k] = (hit[k] ?? 0) + 1;
      }
    }
    expect((hit[0] as number) / (seen[0] as number)).toBeGreaterThan(0.29);
    expect((hit[0] as number) / (seen[0] as number)).toBeLessThan(0.37);
    expect((hit[1] as number) / (seen[1] as number)).toBeGreaterThan(0.45);
    expect((hit[1] as number) / (seen[1] as number)).toBeLessThan(0.55);
    expect(hit[2]).toBe(seen[2]);
  });

  test("its `when` is re-checked: false waits, true later fires, window end drops", () => {
    for (let seed = 1; seed <= 50; seed++) {
      // Gate never opens: nothing fires and the entry is dropped after the window.
      let w = act(life(seed, 20), "life/plan-gated");
      w = year(w);
      expect(fired(w, "life/later-gated")).toBe(0);
      expect(w.scheduled).toHaveLength(1);
      w = year(w);
      expect(fired(w, "life/later-gated")).toBe(0);
      expect(w.scheduled).toHaveLength(0);
      w = year(w);
      expect(fired(w, "life/later-gated")).toBe(0);

      // Gate opens in the last year of the window: it fires then, with certainty.
      let v = act(life(seed, 20), "life/plan-gated");
      v = year(v);
      expect(fired(v, "life/later-gated")).toBe(0);
      v = act(v, "life/open-gate");
      v = year(v);
      expect(fired(v, "life/later-gated")).toBe(1);
      expect(v.scheduled).toHaveLength(0);
    }
  });

  test("waits while the gate is shut and fires as soon as it opens inside the window", () => {
    let early = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let w = act(act(life(seed, 20), "life/plan-gated"), "life/open-gate");
      w = year(w);
      if (fired(w, "life/later-gated") === 1) early++;
      else {
        expect(w.scheduled).toHaveLength(1);
        w = year(w);
        expect(fired(w, "life/later-gated")).toBe(1);
      }
    }
    expect(early).toBeGreaterThan(60);
    expect(early).toBeLessThan(140);
  });

  test("unschedule cancels it", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let w = act(life(seed, 20), "life/plan");
      w = act(w, "life/cancel");
      expect(w.scheduled).toHaveLength(0);
      for (let y = 0; y < 5; y++) w = year(w);
      expect(fired(w, "life/later")).toBe(0);
    }
  });

  test("scheduling it twice keeps the first", () => {
    const w = act(act(life(1, 20), "life/plan"), "life/plan");
    expect(w.scheduled).toHaveLength(1);
  });

  test("a due consequence with choices pends like any decision and is counted outside the slots", () => {
    const w = ageUp(act(life(3, 3), "life/plan-choice"), bundles).world;
    // age 4 is below the decision slots' minimum age, yet the consequence opens.
    expect(w.pending?.storyletId).toBe("life/later-choice");
  });

  test("lineage is stored, and only lineage entries outlive the person", () => {
    const keep = act(life(1, 20), "life/plan-lineage");
    expect(keep.scheduled[0]?.lineage).toBe(true);
    const plain = act(life(1, 20), "life/plan");
    expect(plain.scheduled[0]?.lineage).toBe(false);
    const both: World = {
      ...keep,
      scheduled: [...keep.scheduled, ...plain.scheduled].map((e, i) => ({
        ...e,
        storyletId: i === 0 ? "life/later" : "life/later-gated",
      })),
    };
    const dead = endLife(both, both.playerId, "test");
    expect(dead.scheduled.map((e) => e.storyletId)).toEqual(["life/later"]);
  });

  test("a person-bound consequence opens for that person and drops if they die", () => {
    let w = life(1, 20, 2, 0);
    const [a, b] = [...w.persons.keys()].filter((k) => k !== w.playerId) as [
      number,
      number,
    ];
    w = act(act(w, "life/plan-person", a), "life/plan-person", b);
    expect(w.scheduled.map((e) => e.scope?.id)).toEqual([a, b]);
    w = updatePerson(w, b, (p) => ({ ...p, alive: false }));
    w = year(w);
    expect(fired(w, `life/later-person`)).toBe(1);
    expect(w.storyletLog[`life/later-person#${a}`]?.count).toBe(1);
    expect(w.scheduled).toHaveLength(0);
  });

  test("the harness tick counts fired, dropped and pending", () => {
    const ticks: ScheduleTick[] = [];
    setScheduleSink((t) => ticks.push(t));
    try {
      let w = act(life(1, 20), "life/plan-gated");
      w = year(w);
      w = year(w);
    } finally {
      setScheduleSink(null);
    }
    expect(ticks).toEqual([
      { fired: 0, dropped: 0, pending: 1 },
      { fired: 0, dropped: 1, pending: 0 },
    ]);
  });
});

describe("milestones", () => {
  test("a milestone sets a readable flag", () => {
    const w = life(1, 20);
    expect(flag(w, "milestone.first_job")).toBe(false);
    expect(flag(act(w, "core-loop/take-job"), "milestone.first_job")).toBe(
      true,
    );
  });

  test("the storylet opens right after the action that reached it, once", () => {
    let w = act(life(1, 20), "core-loop/take-job");
    expect(fired(w, "core-loop/on-first-job")).toBe(1);
    expect(me(w).qualities.asked).toBe(1);
    w = act(w, "core-loop/take-job2");
    w = year(w);
    expect(fired(w, "core-loop/on-first-job")).toBe(1);
    expect(w.milestoneQueue).toEqual([]);
  });

  test("a school occupation completed by its duration emits graduated, and its storylet pends", () => {
    let w = act(life(1, 20), "core-loop/start-class");
    expect(flag(w, "milestone.graduated")).toBe(false);
    expect(flag(w, "milestone.first_job")).toBe(false);
    w = year(w);
    expect(flag(w, "milestone.graduated")).toBe(false);
    w = ageUp(w, bundles).world;
    const seen: string[] = [];
    while (w.pending) {
      seen.push(w.pending.storyletId);
      w = choose(w, bundles, 0).world;
    }
    expect(seen).toContain("core-loop/on-graduated");
    expect(flag(w, "milestone.graduated")).toBe(true);
    expect(fired(w, "core-loop/on-graduated")).toBe(1);
    expect(flag(w, "milestone.first_job")).toBe(false);
  });

  test("married, first_child and retired come from Core's own events", () => {
    let w = life(1, 30, 1, 0);
    const friend = [...w.persons.keys()].find(
      (k) => k !== w.playerId,
    ) as number;
    w = act(w, "core-loop/marry", friend);
    expect(flag(w, "milestone.married")).toBe(true);
    expect(fired(w, "core-loop/on-married")).toBe(1);
    w = act(w, "core-loop/have-child");
    expect(flag(w, "milestone.first_child")).toBe(true);
    w = act(w, "core-loop/have-child");
    expect(fired(w, "core-loop/on-first-child")).toBe(1);
    w = act(w, "core-loop/retire");
    expect(flag(w, "milestone.retired")).toBe(true);
    expect(flag(w, "milestone.first_job")).toBe(false);
    expect(fired(w, "core-loop/on-retired")).toBe(1);
  });

  test("a Pack milestone is emitted by milestone(id)", () => {
    let w = act(life(1, 20), "core-loop/score");
    expect(flag(w, "milestone.met_goal")).toBe(true);
    expect(fired(w, "core-loop/on-met-goal")).toBe(1);
    w = act(w, "core-loop/score");
    expect(fired(w, "core-loop/on-met-goal")).toBe(1);
    // Milestone flags read in `when`, together.
    w = act(w, "core-loop/take-job");
    w = act(w, "core-loop/goal-reader");
    expect(me(w).qualities.asked).toBe(11);
  });
});

describe("saves and replay", () => {
  test("a life with a schedule, milestones and person qualities survives save and load", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = act(
        act(life(seed, 12, 2, 1), "life/plan"),
        "core-loop/take-job",
      );
      const file = {
        schemaVersion: SAVE_SCHEMA_VERSION,
        packVersions: [],
        lives: [{ id: "a", name: "A", world: w }],
        graveyard: [],
      };
      const back = parseSave(serializeSave(file)).lives[0]?.world as World;
      expect(serializeWorld(back)).toBe(serializeWorld(w));
      expect(back.scheduled).toHaveLength(1);
      expect(me(back).milestones).toEqual(["first_job"]);
    }
  });

  test("an old (v5) save loads with an empty schedule and no milestones", () => {
    const w = life(1, 12);
    const file = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      packVersions: [],
      lives: [{ id: "a", name: "A", world: w }],
      graveyard: [],
    };
    const raw = JSON.parse(serializeSave(file)) as {
      schemaVersion: number;
      lives: { world: Record<string, unknown> }[];
    };
    raw.schemaVersion = 5;
    for (const l of raw.lives) {
      l.world.schemaVersion = 5;
      l.world.scheduled = undefined;
      l.world.milestoneQueue = undefined;
    }
    const back = parseSave(JSON.stringify(migrateSave(raw))).lives[0]
      ?.world as World;
    expect(back.scheduled).toEqual([]);
    expect(back.milestoneQueue).toEqual([]);
    expect(worldHash(back)).toBe(worldHash(w));
  });

  test("replaying the choice log reproduces the world hash", () => {
    for (let seed = 1; seed <= 10; seed++) {
      let w = act(
        act(newLife(bundles, seed), "life/plan"),
        "core-loop/take-job",
      );
      for (let y = 0; y < 12; y++) w = year(w);
      expect(worldHash(replay(seed, bundles, w.choiceLog))).toBe(worldHash(w));
    }
  });
});
