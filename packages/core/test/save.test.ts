import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  applyPackMigrations,
  applyPackMigrationsToSave,
  checkSaveVersion,
  choose,
  endLife,
  getPerson,
  newLife,
  type Obituary,
  type PackBundle,
  type PackMigration,
  parseSave,
  putAsset,
  SAVE_SCHEMA_VERSION,
  SaveError,
  type SaveFile,
  serializeSave,
  serializeWorld,
  validateImport,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

function play(seed: number, years: number, picks: number[]): World {
  let w = newLife(bundles, seed);
  for (let i = 0; i < years && !w.ended; i++) {
    w = ageUp(w, bundles).world;
    let guard = 0;
    while (w.pending && !w.ended && guard++ < 20)
      w = choose(w, bundles, picks[(i + guard) % picks.length] ?? 0).world;
  }
  return w;
}

function fileOf(...worlds: World[]): SaveFile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    capabilities: bundles.flatMap((b) => b.capabilities).sort(),
    appliedMigrations: bundles
      .flatMap((b) => b.migrations.map((m) => m.id))
      .sort(),
    lives: worlds.map((world, i) => ({
      id: `life-${i}`,
      name: `Life ${i}`,
      updatedAt: 1_700_000_000_000 + i,
      world,
    })),
    graveyard: [],
  };
}

describe("round trip", () => {
  test("1,000 random lives save and load exactly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 12 }),
        fc.array(fc.integer({ min: 0, max: 3 }), {
          minLength: 1,
          maxLength: 5,
        }),
        (seed, years, picks) => {
          const w = play(seed, years, picks);
          const save = fileOf(w);
          const text = serializeSave(save);
          const back = parseSave(text);
          expect(back).toEqual(save);
          expect(worldHash(back.lives.map((l) => l.world)[0] as World)).toBe(
            worldHash(w),
          );
          expect(serializeSave(back)).toBe(text);
        },
      ),
      { numRuns: 1000 },
    );
  });

  test("ended lives and graveyard entries survive", () => {
    const alive = play(4, 6, [0]);
    const dead = endLife(alive, alive.playerId, "illness");
    expect(dead.ended?.cause).toBe("illness");
    const save: SaveFile = {
      ...fileOf(dead),
      graveyard: [
        {
          id: "g1/0",
          lifeId: "g1",
          generation: 0,
          name: "Old",
          obituary: dead.ended as Obituary,
          journal: dead.journal,
          netWorth: [
            { age: 0, value: 0 },
            { age: 1, value: 250 },
          ],
        },
      ],
    };
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  test("a graveyard entry without generation fields is generation 0 of its own life", () => {
    const alive = play(4, 6, [0]);
    const dead = endLife(alive, alive.playerId, "illness");
    const text = serializeSave({
      ...fileOf(dead),
      graveyard: [],
    });
    const raw = JSON.parse(text);
    raw.graveyard = [{ id: "old", name: "Old", obituary: dead.ended }];
    const [g] = parseSave(JSON.stringify(raw)).graveyard;
    expect(g).toMatchObject({
      id: "old",
      lifeId: "old",
      generation: 0,
      journal: [],
      netWorth: [],
    });
  });
});

describe("save schema reset", () => {
  test("a world records capability ids and applied migration ids, sorted", () => {
    const w = newLife(bundles, 3);
    expect(w.capabilities).toEqual(
      bundles.flatMap((b) => b.capabilities).sort(),
    );
    expect(w.capabilities.length).toBeGreaterThan(0);
    expect(w.appliedMigrations).toEqual(
      bundles.flatMap((b) => b.migrations.map((m) => m.id)).sort(),
    );
  });

  test("a save from an older schema is rejected with a clear message", () => {
    for (const v of [0, 1, 5]) {
      const raw = { schemaVersion: v, lives: [], graveyard: [] };
      expect(() => parseSave(JSON.stringify(raw))).toThrow(
        /older, incompatible version.*cannot be upgraded/,
      );
      expect(() => checkSaveVersion(raw)).toThrow(SaveError);
    }
    const old = {
      schemaVersion: 5,
      lives: [],
      graveyard: [],
    };
    const r = validateImport(old, bundles);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/older, incompatible/);
  });

  test("a newer save is refused", () => {
    expect(() => checkSaveVersion({ schemaVersion: 99 })).toThrow(
      /newer version/,
    );
  });
});

describe("pack migrations", () => {
  const base = bundles[0] as PackBundle;
  const mig = (
    id: string,
    renamed: Record<string, string>,
    removed: Record<string, string | null> = {},
  ): PackMigration => ({ id: `life/${id}`, renamed, removed });
  const next = (...m: PackMigration[]): PackBundle => ({
    ...base,
    migrations: m,
  });

  function worldWithContent(): World {
    let w = newLife(bundles, 5);
    w = putAsset({ ...w, nextId: w.nextId + 1 }, w.playerId, {
      id: w.nextId,
      kindId: "life/car",
      purchasePrice: 1,
      value: 1,
      qualities: {},
    });
    return {
      ...w,
      storyletLog: {
        "life/old": { count: 2, lastAge: 3 },
        "life/old#7": { count: 1, lastAge: 4 },
        "life/new": { count: 1, lastAge: 9 },
        "life/gone": { count: 1, lastAge: 1 },
      },
      pending: { storyletId: "life/old" },
    };
  }

  test("renames rewrite ids, removals fall back or drop", () => {
    const w = worldWithContent();
    const b = next(
      mig(
        "m1",
        { "life/car": "life/auto", "life/old": "life/new" },
        {
          "life/gone": null,
        },
      ),
    );
    const m = applyPackMigrations(w, [b]);
    expect(getPerson(m, m.playerId).assets.map((a) => a.kindId)).toEqual([
      "life/auto",
    ]);
    expect(m.pending?.storyletId).toBe("life/new");
    expect(m.storyletLog).toEqual({
      "life/new": { count: 3, lastAge: 9 },
      "life/new#7": { count: 1, lastAge: 4 },
    });
    expect(m.appliedMigrations).toEqual(
      [...w.appliedMigrations, "life/m1"].sort(),
    );
  });

  test("removal with fallback substitutes; without, drops the asset and pending", () => {
    const w = worldWithContent();
    const fb = applyPackMigrations(w, [
      next(mig("m1", {}, { "life/car": "life/bike" })),
    ]);
    expect(getPerson(fb, fb.playerId).assets[0]?.kindId).toBe("life/bike");
    const dropped = applyPackMigrations(w, [
      next(mig("m1", {}, { "life/car": null, "life/old": null })),
    ]);
    expect(getPerson(dropped, dropped.playerId).assets).toEqual([]);
    expect(dropped.pending).toBeNull();
  });

  test("a migration id applies once: recorded ids are skipped, and re-applying is a no-op", () => {
    const w0 = worldWithContent();
    const m1 = mig("m1", { "life/car": "life/auto" });
    const b = next(m1);
    // The world already recorded m1: its rename must not run again.
    const w: World = {
      ...w0,
      appliedMigrations: [...w0.appliedMigrations, m1.id].sort(),
    };
    expect(serializeWorld(applyPackMigrations(w, [b]))).toBe(serializeWorld(w));
    // A world that has not seen m1 gets it applied, once.
    const once = applyPackMigrations(w0, [b]);
    expect(getPerson(once, once.playerId).assets[0]?.kindId).toBe("life/auto");
    expect(once.appliedMigrations).toContain(m1.id);
    expect(serializeWorld(applyPackMigrations(once, [b]))).toBe(
      serializeWorld(once),
    );
    // Only the new migration runs when an older one was already applied.
    const m2 = mig("m2", { "life/auto": "life/vehicle" });
    const twice = applyPackMigrations(once, [next(m1, m2)]);
    expect(getPerson(twice, twice.playerId).assets[0]?.kindId).toBe(
      "life/vehicle",
    );
    expect(twice.appliedMigrations).toEqual(
      [...once.appliedMigrations, m2.id].sort(),
    );
  });

  test("applies across a whole save, graveyard included", () => {
    const w = worldWithContent();
    const save: SaveFile = {
      ...fileOf(w),
      graveyard: [
        {
          id: "g/0",
          lifeId: "g",
          generation: 0,
          name: "G",
          journal: [],
          netWorth: [],
          obituary: {
            personId: 1,
            givenName: "A",
            familyName: "B",
            age: 70,
            cause: "age",
            netWorth: 0,
            career: [
              { kindId: "life/job", startedAge: 20, endedAge: 60, years: 40 },
            ],
            education: [],
          },
        },
      ],
    };
    const m = applyPackMigrationsToSave(save, [
      next(mig("m1", { "life/job": "life/work" })),
    ]);
    expect(m.graveyard[0]?.obituary.career[0]?.kindId).toBe("life/work");
    expect(m.appliedMigrations).toContain("life/m1");
  });
});

describe("import validation", () => {
  const good = () => JSON.parse(serializeSave(fileOf(play(2, 3, [0]))));
  const err = (input: unknown, b?: readonly PackBundle[]) => {
    const r = validateImport(input, b);
    expect(r.ok).toBe(false);
    return r.ok ? "" : r.error;
  };

  test("accepts a good file as text or JSON", () => {
    expect(validateImport(JSON.stringify(good()), bundles).ok).toBe(true);
    expect(validateImport(good()).ok).toBe(true);
  });

  test("rejects non-JSON, non-saves and damaged saves with a reason", () => {
    expect(err("{nope")).toMatch(/not valid JSON/);
    expect(err("[1,2]")).toMatch(/not a save/);
    expect(err({ hello: 1 })).toMatch(/no valid save version/);
    const noLives = good();
    delete noLives.lives;
    expect(err(noLives)).toMatch(/lives should be a list/);
    const floaty = good();
    floaty.lives[0].world.persons[0].money = 1.5;
    expect(err(floaty)).toMatch(/lives\[0\]\.world.*money/);
    const dup = good();
    dup.lives.push(dup.lives[0]);
    expect(err(dup)).toMatch(/share the id/);
  });

  test("rejects a newer save and a save needing a capability this build lacks", () => {
    const newer = good();
    newer.schemaVersion = SAVE_SCHEMA_VERSION + 1;
    expect(err(newer)).toMatch(/newer version of the game/);
    const lacking = good();
    lacking.lives[0].world.capabilities = [
      ...lacking.lives[0].world.capabilities,
      "zzz/unknown",
    ];
    expect(err(lacking, bundles)).toMatch(
      /needs the capability "zzz\/unknown"/,
    );
    const fileLevel = good();
    fileLevel.capabilities = ["zzz/other"];
    expect(err(fileLevel, bundles)).toMatch(
      /needs the capability "zzz\/other"/,
    );
    expect(validateImport(lacking).ok).toBe(true);
  });
});
