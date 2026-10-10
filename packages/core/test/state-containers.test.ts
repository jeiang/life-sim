import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  applyPackMigrations,
  checkWorldState,
  deserializeWorld,
  getPerson,
  indexBundles,
  makeEnv,
  newLife,
  PACK_BUNDLE_FORMAT,
  type Person,
  parseSave,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  serializeSave,
  serializeWorld,
  validateImport,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "state");
const compiled = compilePacks(FIXTURE);
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;
const idx = indexBundles(bundles);

const MEET = "stt/meet";
const VISIT = "stt/visit";
const BONUS = "stt/bonus";
const FORGIVE = "stt/forgive";

/** A life that met a neighbour and visited twice. */
function played(seed = 7): World {
  let w = newLife(bundles, seed);
  w = runAction(w, bundles, MEET).world;
  w = runAction(w, bundles, VISIT).world;
  w = runAction(w, bundles, VISIT).world;
  return w;
}

const neighbour = (w: World): Person =>
  [...w.persons.values()].find((p) => p.id !== w.playerId) as Person;

const file = (w: World) =>
  ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    capabilities: bundles.flatMap((b) => b.capabilities),
    appliedMigrations: [],
    lives: [{ id: "a", name: "A", world: w }],
    graveyard: [],
  }) as SaveFile;

const env = (w: World) => makeEnv(w, idx, { subject: w.playerId });

describe("state containers: compile", () => {
  test("bundles carry the declarations, format 6", () => {
    expect(PACK_BUNDLE_FORMAT).toBe(6);
    const b = bundles.find((x) => x.id === "stt");
    expect(b?.format).toBe(6);
    expect(b?.state.map((s) => `${s.kind}:${s.id}`)).toEqual([
      "table:favours",
      "counter:festival",
      "counter:visits",
    ]);
    expect(idx.state.get("favours")).toMatchObject({
      kind: "table",
      keys: ["food", "help", "gossip"],
    });
    expect(b?.qualities.find((q) => q.id === "grudge")?.scope).toBe("person");
  });

  test("an unknown container id, key or scope is a compile error", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-fixture-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      writeFileSync(
        join(dir, "stt", "storylets", "bad.yaml"),
        [
          "- id: bad",
          "  trigger: action",
          "  menu: relationships",
          "  outcomes:",
          "    - effects:",
          "        - world.nope += 1",
          "        - table.favours.nope += 1",
          "        - table.nope.food += 1",
          "        - quality.grudge += 1",
          "        - person.quality.grudge += 1",
          "",
        ].join("\n"),
      );
      const out = compilePacks(dir);
      expect(out.ok).toBe(false);
      const text = out.diagnostics.map((d) => d.message).join("\n");
      expect(text).toContain("unknown name 'world.nope'");
      expect(text).toContain("unknown name 'table.favours.nope'");
      expect(text).toContain("unknown name 'table.nope.food'");
      // `person.*` needs `scope: person`; `quality.grudge` is fine on the player.
      expect(text).toContain("unknown name 'person.quality.grudge'");
      expect(text).not.toContain("unknown name 'quality.grudge'");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a quality without `scope: person` is not addressable on a person", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-fixture-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      writeFileSync(
        join(dir, "stt", "storylets", "bad.yaml"),
        [
          "- id: bad",
          "  trigger: action",
          "  menu: relationships",
          "  scope: person",
          "  outcomes:",
          "    - effects:",
          "        - person.quality.plain += 1",
          "",
        ].join("\n"),
      );
      const out = compilePacks(dir);
      expect(out.ok).toBe(false);
      expect(out.diagnostics.map((d) => d.message).join("\n")).toContain(
        "unknown name 'person.quality.plain'",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a table default outside min/max and a duplicate id are errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-fixture-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      writeFileSync(
        join(dir, "stt", "state", "extra.yaml"),
        [
          "- { id: visits, kind: counter, type: int, default: 0 }",
          "- { id: low, kind: table, keys: [a], min: 5, default: 0 }",
          "",
        ].join("\n"),
      );
      const out = compilePacks(dir);
      expect(out.ok).toBe(false);
      const text = out.diagnostics.map((d) => d.message).join("\n");
      expect(text).toContain("duplicate state container 'visits'");
      expect(text).toContain("default is outside min/max");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("state containers: runtime", () => {
  test("reads default to the declaration until written", () => {
    const w = newLife(bundles, 1);
    expect(w.state).toBeUndefined();
    expect(env(w).get("world.visits")).toBe(0);
    expect(env(w).get("world.festival")).toBe(false);
    expect(env(w).get("table.favours.help")).toBe(0);
  });

  test("effects set counters, tables and person qualities; `when` reads them", () => {
    let w = newLife(bundles, 2);
    w = runAction(w, bundles, MEET).world;
    const n = neighbour(w);
    expect(n.qualities).toMatchObject({ grudge: 3, sulky: true });
    expect(n.state).toEqual({ favours: { food: 2, gossip: 7 } });
    // The player's own table and counters are untouched.
    expect(getPerson(w, w.playerId).state).toBeUndefined();
    expect(w.state).toBeUndefined();

    const locked = runAction(w, bundles, BONUS);
    expect(getPerson(locked.world, w.playerId).stats.happiness).toBe(
      getPerson(w, w.playerId).stats.happiness,
    );
    w = runAction(w, bundles, VISIT).world;
    w = runAction(w, bundles, VISIT).world;
    expect(w.state).toEqual({ festival: true, visits: 2 });
    expect(getPerson(w, w.playerId).state).toEqual({ favours: { help: 8 } });
    const before = getPerson(w, w.playerId).stats.happiness ?? 0;
    w = runAction(w, bundles, BONUS).world;
    expect(getPerson(w, w.playerId).stats.happiness).toBe(
      Math.min(100, before + 5),
    );
  });

  test("a bound person is assignable from a scope: person action; ranges clamp", () => {
    let w = played();
    const id = neighbour(w).id;
    w = runAction(w, bundles, FORGIVE, id).world;
    const n = getPerson(w, id);
    expect(n.qualities.grudge).toBe(10); // 3 + 10, clamped to max 10
    expect(n.qualities.sulky).toBe(false);
    expect(n.state).toEqual({ favours: { food: 1, gossip: 7 } });
    expect(w.state?.visits).toBe(1);
    // Counters clamp to their declared range too.
    for (let i = 0; i < 9; i++) w = runAction(w, bundles, VISIT).world;
    expect(w.state?.visits).toBe(5);
    expect(getPerson(w, w.playerId).state).toEqual({ favours: { help: 44 } });
  });

  test("an unknown table key at runtime throws", () => {
    const w = played();
    const decl = idx.state.get("favours");
    expect(decl?.kind).toBe("table");
    expect(() => env(w).get("table.favours.nope")).toThrow(RangeError);
  });
});

describe("state containers: persistence", () => {
  test("round-trips through canonical world text and a save file", () => {
    const w = played();
    const text = serializeWorld(w);
    const back = deserializeWorld(text);
    expect(serializeWorld(back)).toBe(text);
    expect(worldHash(back)).toBe(worldHash(w));
    expect(back.state).toEqual(w.state);
    expect(neighbour(back).state).toEqual(neighbour(w).state);

    const saved = parseSave(serializeSave(file(w)));
    const life = saved.lives[0]?.world as World;
    expect(worldHash(life)).toBe(worldHash(w));
    expect(validateImport(serializeSave(file(w)), bundles).ok).toBe(true);
  });

  test("the hash covers every container", () => {
    const w = played();
    const h = worldHash(w);
    expect(worldHash({ ...w, state: { ...w.state, visits: 3 } })).not.toBe(h);
    const id = neighbour(w).id;
    const moved = {
      ...w,
      persons: new Map(w.persons).set(id, {
        ...neighbour(w),
        state: { favours: { food: 3, gossip: 7 } },
      }),
    };
    expect(worldHash(moved)).not.toBe(h);
  });

  test("replay reproduces the same hash, and ageing keeps the state", () => {
    const w = played(11);
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    const older = ageUp(w, bundles).world;
    expect(older.state).toEqual(w.state);
    expect(neighbour(older).state?.favours).toEqual({ food: 2, gossip: 7 });
    expect(worldHash(replay(older.seed, bundles, older.choiceLog))).toBe(
      worldHash(older),
    );
  });

  test("same seed and choices give the same world, run twice", () => {
    expect(serializeWorld(played(21))).toBe(serializeWorld(played(21)));
  });

  test("a malformed container in a save is rejected at load", () => {
    expect(() =>
      deserializeWorld(
        serializeWorld({
          ...played(),
          state: { visits: 1.5 as unknown as number },
        }),
      ),
    ).toThrow(TypeError);
  });

  test("import rejects state no loaded Pack declares, and wrong shapes", () => {
    const w = played();
    const stray = { ...w, state: { ...w.state, ghost: 1 } };
    const r = validateImport(serializeSave(file(stray)), bundles);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain("ghost");
    const wrong = { ...w, state: { festival: 3 } };
    expect(validateImport(serializeSave(file(wrong)), bundles).ok).toBe(false);
    const badKey = {
      ...w,
      persons: new Map(w.persons).set(neighbour(w).id, {
        ...neighbour(w),
        state: { favours: { nope: 1 } },
      }),
    };
    expect(validateImport(serializeSave(file(badKey)), bundles).ok).toBe(false);
    expect(checkWorldState(w, idx.state)).toEqual([]);
  });

  test("pack migrations rename and remove container ids", () => {
    const w = played();
    const migrated = applyPackMigrations(w, [
      {
        ...(bundles.find((b) => b.id === "stt") as (typeof bundles)[number]),
        migrations: [
          {
            id: "stt/rename-visits",
            renamed: { "state.visits": "state.festival_count" },
            removed: { "state.festival": null },
          },
        ],
      },
    ]);
    expect(migrated.state).toEqual({ festival_count: 2 });
  });
});

describe("state containers: a second container needs no core type edits", () => {
  test("a counter and a table declared next to the first round-trip too", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-fixture-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      writeFileSync(
        join(dir, "stt", "state", "more.yaml"),
        [
          "- { id: rumours, kind: counter, type: int, default: 100 }",
          "- { id: moods, kind: table, keys: [calm, angry], default: 1 }",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "stt", "storylets", "more.yaml"),
        [
          "- id: gossip",
          "  trigger: action",
          "  menu: relationships",
          "  outcomes:",
          "    - effects:",
          "        - world.rumours -= 30",
          "        - table.moods.angry = 9",
          "",
        ].join("\n"),
      );
      const out = compilePacks(dir);
      expect(out.ok, out.diagnostics.map((d) => d.message).join("\n")).toBe(
        true,
      );
      const b2 = out.bundles;
      let w = newLife(b2, 5);
      w = runAction(w, b2, "stt/gossip").world;
      w = runAction(w, b2, MEET).world;
      expect(w.state).toEqual({ rumours: 70 });
      expect(getPerson(w, w.playerId).state).toEqual({ moods: { angry: 9 } });
      const back = deserializeWorld(serializeWorld(w));
      expect(worldHash(back)).toBe(worldHash(w));
      expect(worldHash(replay(w.seed, b2, w.choiceLog))).toBe(worldHash(w));
      expect(validateImport(serializeSave(file(w)), b2).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
