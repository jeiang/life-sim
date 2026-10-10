import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  applyPackMigrations,
  checkWorldState,
  choose,
  deserializeWorld,
  endLife,
  getPerson,
  indexBundles,
  newLife,
  type PackBundle,
  parseSave,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  type ScheduledEntry,
  scheduledEntries,
  serializeSave,
  serializeWorld,
  spawnPerson,
  succeed,
  updatePerson,
  validateImport,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "schedule");
const compiled = compilePacks(FIXTURE);
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = compiled.bundles;
const idx = indexBundles(bundles);

/** A life of age 10 (so the decision slots roll), with `friends` friends. */
function life(seed: number, friends = 0): World {
  let w = updatePerson(newLife(bundles, seed), 0, (p) => ({ ...p, age: 10 }));
  for (let i = 0; i < friends; i++)
    w = spawnPerson(w, idx, w.playerId, "sc/friend", "sc/local")[0];
  return w;
}

const act = (w: World, id: string, target?: number) =>
  runAction(w, bundles, id, target).world;

/** One age-up, answering any decision that opens. */
function year(w: World): World {
  let r = ageUp(w, bundles).world;
  while (r.pending) r = choose(r, bundles, 0).world;
  return r;
}

const q = (w: World, id: string): number =>
  (getPerson(w, w.playerId).qualities[id] as number | undefined) ?? 0;

/** The age-up (1-based) a quality first rose in, within `max` years; 0 if it never did. */
function firedIn(w0: World, id: string, max: number): number {
  let w = w0;
  const before = q(w, id);
  for (let y = 1; y <= max; y++) {
    w = year(w);
    if (q(w, id) > before) return y;
  }
  return 0;
}

const queue = (w: World): ScheduledEntry[] => scheduledEntries(w);

describe("schedule: window and ramp", () => {
  test("fires once, never before the window, always by its last year, evenly across 2-4", () => {
    const N = 1800;
    const hist = [0, 0, 0, 0, 0, 0];
    for (let seed = 1; seed <= N; seed++) {
      let w = act(life(seed), "sc/plan");
      expect(queue(w)).toHaveLength(1);
      let first = 0;
      for (let y = 1; y <= 7; y++) {
        w = year(w);
        if (q(w, "reunions") > 0 && first === 0) first = y;
      }
      expect(q(w, "reunions")).toBe(1);
      expect(queue(w)).toHaveLength(0);
      hist[first] = (hist[first] ?? 0) + 1;
    }
    expect(hist[0]).toBe(0);
    expect(hist[1]).toBe(0);
    expect(hist[5]).toBe(0);
    // Chance 1/3, then 1/2 of the rest, then certain: a third each.
    for (const y of [2, 3, 4]) {
      expect((hist[y] ?? 0) / N).toBeGreaterThan(0.29);
      expect((hist[y] ?? 0) / N).toBeLessThan(0.38);
    }
  });

  test("a one-year window is certain in that year", () => {
    for (let seed = 1; seed <= 30; seed++)
      expect(firedIn(act(life(seed), "sc/plan-lineage"), "legacies", 3)).toBe(
        1,
      );
  });

  test("a long window waits out its lead before rolling", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const at = firedIn(act(life(seed), "sc/plan-wide"), "reunions", 12);
      expect(at).toBeGreaterThanOrEqual(5);
      expect(at).toBeLessThanOrEqual(9);
    }
  });

  test("it fires on top of the decision slots", () => {
    // A decision opens every year at this age band in some seeds; the consequence is not
    // crowded out of the same year.
    let both = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = ageUp(act(life(seed), "sc/plan-lineage"), bundles).world;
      expect(q(r, "legacies")).toBe(1);
      if (r.pending?.storyletId === "sc/plain-decision") both++;
    }
    expect(both).toBeGreaterThan(20);
  });
});

describe("schedule: re-check and drop", () => {
  test("a false `when` waits, and the end of the window drops the entry", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let w = act(life(seed), "sc/plan-gated");
      w = year(w);
      expect(queue(w)).toHaveLength(1); // still waiting, with one year fewer
      expect(queue(w)[0]?.left).toBe(2);
      w = year(w);
      w = year(w);
      expect(q(w, "gated_fired")).toBe(0);
      expect(queue(w)).toHaveLength(0);
      // The window is gone for good: opening the gate now does nothing.
      w = year(act(w, "sc/open-gate"));
      expect(q(w, "gated_fired")).toBe(0);
    }
  });

  test("a `when` that turns true inside the window fires, by the last year at the latest", () => {
    for (let seed = 1; seed <= 60; seed++) {
      let w = year(act(life(seed), "sc/plan-gated"));
      w = act(w, "sc/open-gate");
      expect(firedIn(w, "gated_fired", 2)).toBeGreaterThan(0);
    }
  });

  test("a bound person who died drops the entry", () => {
    let w = act(life(3, 1), "sc/plan-visit", 1);
    w = act(w, "sc/plan-visit-lineage", 1);
    expect(queue(w)).toHaveLength(1); // same storylet and person: the earlier one stays
    w = updatePerson(w, 1, (p) => ({ ...p, alive: false }));
    w = year(w);
    expect(queue(w)).toHaveLength(0);
  });
});

describe("unschedule", () => {
  test("cancels every queued copy, for any person, and is a no-op without one", () => {
    const empty = life(4, 2);
    expect(act(empty, "sc/cancel").state).toBeUndefined();
    let w = act(act(empty, "sc/plan-visit", 1), "sc/plan-visit", 2);
    expect(queue(w).map((e) => e.person)).toEqual([1, 2]);
    w = act(w, "sc/cancel-visit", 1);
    expect(queue(w)).toHaveLength(0);
    expect(w.state).toBeUndefined();
    w = act(act(life(5), "sc/plan"), "sc/cancel");
    expect(firedIn(w, "reunions", 6)).toBe(0);
    expect(queue(w)).toHaveLength(0);
  });

  test("scheduling the same storylet twice keeps the earlier window", () => {
    let w = act(life(6), "sc/plan");
    w = year(w);
    const before = queue(w);
    w = act(w, "sc/plan");
    expect(queue(w)).toEqual(before);
  });
});

describe("schedule: person binding and lineage", () => {
  test("a person-scoped consequence opens for its person", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let w = act(life(seed, 2), "sc/plan-visit", 2);
      expect(queue(w)).toMatchObject([{ storyletId: "sc/visit", person: 2 }]);
      w = year(w);
      w = year(w);
      w = year(w);
      expect(getPerson(w, 2).qualities.visits).toBe(1);
      expect(getPerson(w, 1).qualities.visits).toBeUndefined();
      expect(queue(w)).toHaveLength(0);
    }
  });

  test("lineage is stored; a life's end drops the rest, and succession does too", () => {
    let w = act(act(life(7, 1), "sc/plan"), "sc/plan-lineage");
    w = act(w, "sc/plan-visit-lineage", 1);
    const entries = queue(w);
    expect(entries.map((e) => [e.storyletId, e.lineage])).toEqual([
      ["sc/reunion", false],
      ["sc/legacy", true],
      ["sc/visit", true],
    ]);
    const dead = endLife(w, w.playerId, "test");
    expect(queue(dead).map((e) => e.storyletId)).toEqual([
      "sc/legacy",
      "sc/visit",
    ]);
    // Succession (without the dynasty flow's hand-off) drops what a hook queued after death.
    const [withKid, kid] = addPerson(dead, {
      givenName: "Kid",
      familyName: "Heir",
      age: 4,
    });
    const heirWorld = succeed(
      addParentLink(withKid, kid, w.playerId),
      bundles,
      kid,
    ).world;
    expect(queue(heirWorld).map((e) => e.storyletId)).toEqual([
      "sc/legacy",
      "sc/visit",
    ]);
  });
});

describe("schedule: effect macros", () => {
  test("a macro's own persons are renamed in the schedule call", () => {
    const w = act(life(8), "sc/plan-macro");
    const entries = queue(w);
    expect(entries.map((e) => e.storyletId)).toEqual([
      "sc/reunion",
      "sc/visit",
      "sc/visit",
    ]);
    const people = entries.flatMap((e) =>
      e.person === undefined ? [] : [e.person],
    );
    expect(new Set(people).size).toBe(2);
    for (const p of people) expect(getPerson(w, p).alive).toBe(true);
  });
});

describe("schedule: replay, saves, determinism", () => {
  // Built only from the seed and logged choices, so replay can reproduce it.
  const played = (seed: number): World => {
    let w = act(act(newLife(bundles, seed), "sc/befriend"), "sc/plan");
    w = act(w, "sc/plan-visit", 1);
    w = act(w, "sc/plan-lineage");
    w = year(w);
    w = act(w, "sc/plan-wide");
    return year(w);
  };
  const file = (w: World) =>
    ({
      schemaVersion: SAVE_SCHEMA_VERSION,
      capabilities: bundles.flatMap((b) => b.capabilities),
      appliedMigrations: [],
      lives: [{ id: "a", name: "A", world: w }],
      graveyard: [],
    }) as SaveFile;

  test("the same seed and choices give the same world, and replay reproduces it", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = played(seed);
      expect(worldHash(played(seed))).toBe(worldHash(w));
      expect(worldHash(replay(seed, bundles, w.choiceLog))).toBe(worldHash(w));
    }
  });

  test("an unqueued schedule leaves the world exactly as a world that never scheduled", () => {
    const w = act(life(9), "sc/plan");
    const gone = act(w, "sc/cancel");
    expect(gone.state).toBeUndefined();
    expect(queue(w)[0]).toMatchObject({ wait: 1, left: 3, lineage: false });
  });

  test("world and save round-trip with a queued schedule", () => {
    const w = year(act(life(10, 1), "sc/plan-visit-lineage", 1));
    expect(queue(w).length).toBeGreaterThan(0);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
    expect(queue(back)).toEqual(queue(w));
    const text = serializeSave(file(w));
    const out = validateImport(text, bundles);
    expect(out.ok, out.ok ? "" : out.error).toBe(true);
    expect(parseSave(text).lives[0]?.world.state).toEqual(w.state);
    expect(checkWorldState(w, idx.state)).toEqual([]);
  });

  test("a malformed queue rejects the save", () => {
    const w = act(life(11), "sc/plan");
    for (const bad of [
      { "sc/reunion": { "-": { seq: 0, wait: -1, left: 1, lineage: false } } },
      { "sc/reunion": { "-": { seq: 0, wait: 0, left: 0, lineage: false } } },
      { "sc/reunion": { x: { seq: 0, wait: 0, left: 1, lineage: false } } },
      { "sc/reunion": { "-": { seq: 0, wait: 0, left: 1, lineage: 1 } } },
      { "sc/reunion": 3 },
    ])
      expect(
        validateImport(
          serializeSave(file({ ...w, state: { _schedule: bad } } as World)),
          bundles,
        ).ok,
        JSON.stringify(bad),
      ).toBe(false);
    expect(
      validateImport(
        serializeSave(
          file({
            ...w,
            persons: new Map(w.persons).set(0, {
              ...getPerson(w, 0),
              state: { _schedule: {} },
            }),
          }),
        ),
        bundles,
      ).ok,
    ).toBe(false);
  });

  test("pack migrations rename and remove queued storylets", () => {
    const w = act(act(life(12), "sc/plan"), "sc/plan-lineage");
    const base = bundles.find((b) => b.id === "sc") as PackBundle;
    const migrated = applyPackMigrations(w, [
      {
        ...base,
        migrations: [
          {
            id: "sc/m1",
            renamed: { "sc/reunion": "sc/reunion2" },
            removed: { "sc/legacy": null },
          },
        ],
      },
    ]);
    expect(queue(migrated).map((e) => e.storyletId)).toEqual(["sc/reunion2"]);
  });
});

describe("schedule: build checks", () => {
  function failure(storylet: string): string {
    const dir = mkdtempSync(join(tmpdir(), "schedule-fixture-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      writeFileSync(join(dir, "sc", "storylets", "bad.yaml"), storylet);
      const out = compilePacks(dir);
      expect(out.ok).toBe(false);
      return out.diagnostics.map((d) => d.message).join("\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const action = (effect: string) =>
    [
      "- id: bad",
      "  trigger: action",
      "  menu: relationships",
      "  outcomes:",
      "    - effects:",
      `        - "${effect}"`,
      "",
    ].join("\n");

  test("bad windows, unknown storylets and unknown people fail the build", () => {
    expect(failure(action("schedule(sc/reunion, after: 0-2 years)"))).toContain(
      "must start at 1 year or more",
    );
    expect(failure(action("schedule(sc/reunion, after: 4-2 years)"))).toContain(
      "end no earlier than it starts",
    );
    expect(failure(action("schedule(sc/nope, after: 1-2 years)"))).toContain(
      "nope",
    );
    expect(
      failure(action("schedule(sc/visit, after: 1-2 years, pal)")),
    ).toContain("unknown person 'pal'");
    expect(failure(action("schedule(sc/reunion, in 2 years)"))).toContain(
      "after",
    );
    expect(failure(action("unschedule(sc/nope)"))).toContain("nope");
  });

  test("a person is named exactly for a scope: person storylet", () => {
    expect(failure(action("schedule(sc/visit, after: 1-2 years)"))).toContain(
      "name the person",
    );
    const withPerson = action("schedule(sc/reunion, after: 1-2 years, person)")
      .replace("  trigger: action", "  trigger: action\n  scope: person")
      .replace(
        "  menu: relationships",
        "  menu: relationships\n  target: [friend]",
      );
    expect(failure(withPerson)).toContain("takes a person only");
  });
});
