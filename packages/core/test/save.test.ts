import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  applyPackMigrations,
  applyPackMigrationsToSave,
  choose,
  endLife,
  getPerson,
  type Migration,
  migrateSave,
  newLife,
  type Obituary,
  type PackBundle,
  parseSave,
  putAsset,
  SAVE_SCHEMA_VERSION,
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
    packVersions: [{ id: "life", version: "1" }],
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
      graveyard: [{ id: "g1", name: "Old", obituary: dead.ended as Obituary }],
    };
    expect(parseSave(serializeSave(save))).toEqual(save);
  });
});

describe("schema migrations", () => {
  const v0 = () => {
    const w = play(3, 4, [0]);
    const j = JSON.parse(serializeWorld(w));
    delete j.pending;
    delete j.ended;
    delete j.storyletLog;
    delete j.choiceLog;
    j.schemaVersion = 0;
    return {
      w,
      raw: { schemaVersion: 0, lives: [{ id: "a", name: "A", world: j }] },
    };
  };

  test("a synthetic v0 save migrates to the current schema", () => {
    const { w, raw } = v0();
    const save = parseSave(JSON.stringify(raw));
    expect(save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(save.graveyard).toEqual([]);
    expect(save.packVersions).toEqual([
      { id: "core-loop", version: "1" },
      { id: "life", version: "1" },
    ]);
    const mig = save.lives.map((l) => l.world)[0] as World;
    expect(mig.pending).toBeNull();
    expect(mig.ended).toBeNull();
    expect(mig.storyletLog).toEqual({});
    expect(mig.choiceLog).toEqual([]);
    expect(mig.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(mig.seed).toBe(w.seed);
    expect(getPerson(mig, mig.playerId).age).toBe(getPerson(w, w.playerId).age);
  });

  test("a v1 save without use counters loads with none", () => {
    const w = play(3, 4, [0]);
    const j = JSON.parse(serializeWorld(w));
    delete j.uses;
    j.schemaVersion = 1;
    const raw = {
      schemaVersion: 1,
      lives: [{ id: "a", name: "A", world: j }],
      graveyard: [],
      packVersions: [],
    };
    const mig = parseSave(JSON.stringify(raw)).lives[0]?.world as World;
    expect(mig.uses).toEqual({});
    expect(mig.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  test("steps run in order up to the target", () => {
    const calls: number[] = [];
    const step =
      (n: number): Migration =>
      (raw) => {
        calls.push(n);
        return { ...raw, [`s${n}`]: true };
      };
    const out = migrateSave(
      { schemaVersion: 1 },
      { 1: step(1), 2: step(2) },
      3,
    );
    expect(calls).toEqual([1, 2]);
    expect(out).toMatchObject({ schemaVersion: 3, s1: true, s2: true });
  });

  test("a gap in the chain and a newer save are refused", () => {
    expect(() => migrateSave({ schemaVersion: 0 }, {}, 1)).toThrow(/too old/);
    expect(() => migrateSave({ schemaVersion: 9 })).toThrow(/newer version/);
  });
});

describe("pack migrations", () => {
  const base = bundles[0] as PackBundle;
  const next = (m: PackBundle["migrations"]): PackBundle => ({
    ...base,
    version: base.version + 1,
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
    const b = next({
      renamed: { "life/car": "life/auto", "life/old": "life/new" },
      removed: { "life/gone": null },
    });
    const m = applyPackMigrations(w, [b]);
    expect(getPerson(m, m.playerId).assets.map((a) => a.kindId)).toEqual([
      "life/auto",
    ]);
    expect(m.pending?.storyletId).toBe("life/new");
    expect(m.storyletLog).toEqual({
      "life/new": { count: 3, lastAge: 9 },
      "life/new#7": { count: 1, lastAge: 4 },
    });
    expect(m.packVersions).toEqual([
      { id: "core-loop", version: "1" },
      { id: "life", version: String(b.version) },
    ]);
  });

  test("removal with fallback substitutes; without, drops the asset and pending", () => {
    const w = worldWithContent();
    const fb = applyPackMigrations(w, [
      next({ renamed: {}, removed: { "life/car": "life/bike" } }),
    ]);
    expect(getPerson(fb, fb.playerId).assets[0]?.kindId).toBe("life/bike");
    const dropped = applyPackMigrations(w, [
      next({ renamed: {}, removed: { "life/car": null, "life/old": null } }),
    ]);
    expect(getPerson(dropped, dropped.playerId).assets).toEqual([]);
    expect(dropped.pending).toBeNull();
  });

  test("up-to-date saves are untouched and migration is idempotent", () => {
    const w = worldWithContent();
    const same = {
      ...base,
      migrations: { renamed: { "life/car": "life/auto" }, removed: {} },
    };
    expect(serializeWorld(applyPackMigrations(w, [same]))).toBe(
      serializeWorld(w),
    );
    const b = next({ renamed: { "life/car": "life/auto" }, removed: {} });
    const once = applyPackMigrations(w, [b]);
    expect(serializeWorld(applyPackMigrations(once, [b]))).toBe(
      serializeWorld(once),
    );
  });

  test("applies across a whole save, graveyard included", () => {
    const w = worldWithContent();
    const save: SaveFile = {
      ...fileOf(w),
      graveyard: [
        {
          id: "g",
          name: "G",
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
      next({ renamed: { "life/job": "life/work" }, removed: {} }),
    ]);
    expect(m.graveyard[0]?.obituary.career[0]?.kindId).toBe("life/work");
    expect(m.packVersions.find((v) => v.id === "life")?.version).toBe(
      String(base.version + 1),
    );
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

  test("rejects incompatible versions and unknown packs", () => {
    const newer = good();
    newer.schemaVersion = SAVE_SCHEMA_VERSION + 1;
    expect(err(newer)).toMatch(/newer version of the game/);
    const newPack = good();
    newPack.lives[0].world.packVersions = [{ id: "life", version: "99" }];
    expect(err(newPack, bundles)).toMatch(/newer "life" content pack/);
    const other = good();
    other.lives[0].world.packVersions = [{ id: "zzz", version: "1" }];
    expect(err(other, bundles)).toMatch(/needs the content pack "zzz"/);
  });
});
