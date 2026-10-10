import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  deserializeWorld,
  type Gender,
  getPerson,
  indexBundles,
  newLife,
  type PackBundle,
  renderText,
  replay,
  runAction,
  serializeWorld,
  setQuality,
  spawnPerson,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "spawn");

/** Compile a copy of the fixture with `files` (relative path -> text) written over it. */
function inDir<T>(files: Record<string, string>, use: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "spawn-fixture-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function build(files: Record<string, string> = {}): PackBundle[] {
  return inDir(files, (dir) => {
    const out = compilePacks(dir);
    if (!out.ok)
      throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
    return [...out.bundles];
  });
}

function failures(files: Record<string, string>): string {
  return inDir(files, (dir) => {
    const out = compilePacks(dir);
    expect(out.ok).toBe(false);
    return out.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n");
  });
}

const bundles = build();
const idx = indexBundles(bundles);
const spawn = (w: World, gen: string, role = "base/neighbour") =>
  spawnPerson(w, idx, w.playerId, role, `base/${gen}`);
const q = (w: World, id: number, name: string) =>
  getPerson(w, id).qualities[name];

describe("spawn-time person qualities", () => {
  test("a generator's fixed and ranged qualities land on the spawned person", () => {
    const seen = new Set<unknown>();
    for (let seed = 0; seed < 40; seed++) {
      const [w, id] = spawn(newLife(bundles, seed), "citizen");
      const culture = q(w, id, "culture") as number;
      expect(culture).toBeGreaterThanOrEqual(3);
      expect(culture).toBeLessThanOrEqual(5);
      seen.add(culture);
      expect(q(w, id, "pocket")).toBe(1234);
    }
    expect(seen).toEqual(new Set([3, 4, 5]));
    const [w, id] = spawn(newLife(bundles, 1), "elder");
    expect(q(w, id, "culture")).toBe(7);
  });

  test("the player's generator sets the player's qualities too", () => {
    const w = newLife(bundles, 5);
    const culture = q(w, w.playerId, "culture") as number;
    expect(culture).toBeGreaterThanOrEqual(3);
    expect(culture).toBeLessThanOrEqual(5);
    expect(q(w, w.playerId, "pocket")).toBe(1234);
    expect(q(w, w.playerId, "plain")).toBe(0);
  });

  test("a generator adds draws only for what it declares: other qualities and names do not move", () => {
    const without = build({
      "base/people/people.yaml": (
        [
          "- { kind: role, id: neighbour, label: Neighbour }",
          "- { kind: role, id: pet, label: Pet, animal: true }",
          "- kind: generator",
          "  id: citizen",
          "  first_names: { male: [Al], female: [Bea] }",
          "  last_names: [Ng]",
          "  age: [20, 30]",
          "- kind: generator",
          "  id: elder",
          "  first_names: { male: [Gus], female: [Hal] }",
          "  last_names: [Ito]",
          "  gender: female",
          "  age: [60, 80]",
          "- kind: generator",
          "  id: nb",
          "  first_names: { male: [Sky], female: [Rae] }",
          "  last_names: [Cho]",
          "  gender: nonbinary",
          "  age: [20, 30]",
          "- kind: generator",
          "  id: pup",
          "  first_names: [Rex]",
          "  age: [1, 3]",
          "",
        ] as string[]
      ).join("\n"),
    });
    const idx2 = indexBundles(without);
    for (let seed = 0; seed < 10; seed++) {
      const a = spawnPerson(
        newLife(bundles, seed),
        idx,
        0,
        "base/neighbour",
        "base/citizen",
      );
      const b = spawnPerson(
        newLife(without, seed),
        idx2,
        0,
        "base/neighbour",
        "base/citizen",
      );
      const pa = getPerson(a[0], a[1]);
      const pb = getPerson(b[0], b[1]);
      expect([pa.givenName, pa.gender, pa.age, pa.stats]).toEqual([
        pb.givenName,
        pb.gender,
        pb.age,
        pb.stats,
      ]);
    }
  });

  test("spawn_qualities by gender runs for generated people, not animals or the player", () => {
    const mood = { male: 1, female: 2, nonbinary: 3 } as const;
    const genders = new Set<Gender | undefined>();
    for (let seed = 0; seed < 30; seed++) {
      const [w, id] = spawn(newLife(bundles, seed), "citizen");
      const p = getPerson(w, id);
      genders.add(p.gender);
      expect(q(w, id, "mood")).toBe(mood[p.gender as Gender]);
      expect(q(w, id, "tagged")).toBe(true);
    }
    expect(genders).toEqual(new Set(["male", "female"]));
    const [w, nb] = spawn(newLife(bundles, 3), "nb");
    expect(q(w, nb, "mood")).toBe(3);
    const player = newLife(bundles, 3);
    expect(q(player, player.playerId, "mood")).toBe(0);
    expect(q(player, player.playerId, "tagged")).toBe(false);
    const [w2, pup] = spawn(newLife(bundles, 3), "pup", "base/pet");
    expect(q(w2, pup, "mood")).toBeUndefined();
    expect(q(w2, pup, "tagged")).toBeUndefined();
  });

  test("family spawned at birth carries the rolls", () => {
    const w = newLife(bundles, 9);
    const others = [...w.persons.values()].filter((p) => p.id !== w.playerId);
    for (const p of others) expect(p.qualities.tagged).toBe(true);
  });

  test("entries roll under their own streams: the person's other draws do not move", () => {
    const extra = build({
      "base/pack.yaml": `${
        // an extra entry changes nothing else about who is spawned
        [
          "id: base",
          "currency:",
          '  symbol: "$"',
          "  digits: 2",
          "stats:",
          "  - { id: happiness, label: Happiness, start: [50, 100] }",
          "spawn_qualities:",
          "  - outcomes:",
          "      - { weight: 1, qualities: { mood: 9 } }",
          "      - { weight: 3, qualities: { mood: 4 } }",
          "",
        ].join("\n")
      }`,
    });
    const idx2 = indexBundles(extra);
    for (let seed = 0; seed < 10; seed++) {
      const a = spawnPerson(
        newLife(bundles, seed),
        idx,
        0,
        "base/neighbour",
        "base/citizen",
      );
      const b = spawnPerson(
        newLife(extra, seed),
        idx2,
        0,
        "base/neighbour",
        "base/citizen",
      );
      const pa = getPerson(a[0], a[1]);
      const pb = getPerson(b[0], b[1]);
      expect([pa.givenName, pa.gender, pa.age]).toEqual([
        pb.givenName,
        pb.gender,
        pb.age,
      ]);
    }
  });

  test("a spawned life survives a save round trip and replays", () => {
    let w = newLife(bundles, 21);
    w = runAction(w, bundles, "base/make-over").world;
    expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
  });
});

describe("can_carry", () => {
  test("is stored at spawn from the gender, and the generator can fix it", () => {
    let female = 0;
    for (let seed = 0; seed < 30; seed++) {
      const [w, id] = spawn(newLife(bundles, seed), "citizen");
      const p = getPerson(w, id);
      expect(p.canCarry).toBe(p.gender === "female");
      if (p.gender === "female") female++;
    }
    expect(female).toBeGreaterThan(0);
    const [w, id] = spawn(newLife(bundles, 1), "elder");
    expect(getPerson(w, id).gender).toBe("female");
    expect(getPerson(w, id).canCarry).toBe(false);
  });

  test("a nonbinary person draws the flag", () => {
    const seen = new Set<boolean | undefined>();
    for (let seed = 0; seed < 40; seed++) {
      const [w, id] = spawn(newLife(bundles, seed), "nb");
      seen.add(getPerson(w, id).canCarry);
    }
    expect(seen).toEqual(new Set([true, false]));
  });

  test("the expression name reads the stored flag, not the gender", () => {
    const w0 = newLife(bundles, 4);
    const [w, id] = spawn(w0, "elder");
    const read = (src: string, world: World) =>
      renderText(src, world, idx, { subject: world.playerId, person: id });
    expect(read("{person.gender} {person.can_carry}", w)).toBe("female false");
    const player = getPerson(w, w.playerId);
    expect(read("{player.can_carry}", w)).toBe(String(player.canCarry));
  });

  test("set_gender leaves can_carry alone, and it round-trips a save", () => {
    const [w, id] = spawn(newLife(bundles, 8), "elder");
    const r = runAction(w, bundles, "base/neighbour-transition", id).world;
    const before = getPerson(w, id);
    const after = getPerson(r, id);
    expect(after.gender).toBe("female");
    expect(after.canCarry).toBe(before.canCarry);
    const saved = deserializeWorld(serializeWorld(r));
    expect(getPerson(saved, id).canCarry).toBe(false);
  });
});

describe("set_gender and rename", () => {
  test("act on the player: gender changes, the new name comes from the pool, the surname stays", () => {
    const w0 = newLife(bundles, 12);
    const before = getPerson(w0, w0.playerId);
    const w = runAction(w0, bundles, "base/transition").world;
    const after = getPerson(w, w.playerId);
    expect(after.gender).toBe("nonbinary");
    expect(["Sky", "Rae"]).toContain(after.givenName);
    expect(after.familyName).toBe(before.familyName);
    expect(after.canCarry).toBe(before.canCarry);
  });

  test("act on a bound person and on the scoped person", () => {
    const w0 = newLife(bundles, 13);
    const w = runAction(w0, bundles, "base/make-over").world;
    const pal = [...w.persons.values()].at(-1);
    expect(pal?.gender).toBe("nonbinary");
    expect(["Sky", "Rae"]).toContain(pal?.givenName);
    const r = runAction(w, bundles, "base/neighbour-transition", pal?.id).world;
    const done = getPerson(r, pal?.id as number);
    expect(done.gender).toBe("female");
    expect(["Al", "Bea"]).toContain(done.givenName);
  });

  test("replay and a save round trip reproduce the world", () => {
    let w = newLife(bundles, 14);
    w = runAction(w, bundles, "base/transition").world;
    w = runAction(w, bundles, "base/make-over").world;
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
  });

  test("the renamed player's name draw is the same on every run", () => {
    const run = () =>
      getPerson(
        runAction(newLife(bundles, 15), bundles, "base/transition").world,
        0,
      ).givenName;
    expect(run()).toBe(run());
  });

  test("the build rejects a bad gender, target and generator", () => {
    const store = (effect: string) => ({
      "base/storylets/actions.yaml": [
        "- id: x",
        "  trigger: action",
        "  menu: relationships",
        "  outcomes:",
        "    - effects:",
        `        - ${effect}`,
        "",
      ].join("\n"),
    });
    expect(failures(store("set_gender(player, robot)"))).toContain(
      "expected a gender",
    );
    expect(failures(store("set_gender(stranger, male)"))).toContain(
      "expected 'player' or a person name",
    );
    expect(failures(store("rename(player, base/nowhere)"))).toContain(
      "nowhere",
    );
  });
});

describe("money-formatted qualities", () => {
  test("{quality.x} of a format: money quality prints as currency", () => {
    let w = newLife(bundles, 2);
    w = setQuality(w, w.playerId, "pocket", 123456);
    const scope = { subject: w.playerId };
    expect(renderText("{quality.pocket}", w, idx, scope)).toBe("$1,234.56");
    expect(renderText("{quality.culture}", w, idx, scope)).toMatch(/^[3-5]$/);
    const [w2, id] = spawn(w, "citizen");
    expect(
      renderText("{person.quality.pocket}", w2, idx, { ...scope, person: id }),
    ).toBe("$12.34");
  });

  test("a flag or a plain int cannot take the format", () => {
    const text = failures({
      "base/qualities/q.yaml":
        "- { id: tagged, type: flag, default: false, format: money }\n",
    });
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("spawn-time build errors", () => {
  const gen = (qualities: string) => ({
    "base/people/people.yaml": [
      "- { kind: role, id: neighbour, label: Neighbour }",
      "- kind: generator",
      "  id: citizen",
      "  first_names: [Al]",
      "  last_names: [Ng]",
      "  age: [20, 30]",
      `  qualities: ${qualities}`,
      "",
    ].join("\n"),
  });

  test("an undeclared, non-person or wrongly typed quality is rejected", () => {
    expect(failures(gen("{ nope: 1 }"))).toContain("not a person-scoped");
    expect(failures(gen("{ plain: 1 }"))).toContain("not a person-scoped");
    expect(failures(gen("{ culture: true }"))).toContain("is an int quality");
    expect(failures(gen("{ tagged: 3 }"))).toContain("is a flag");
    expect(failures(gen("{ culture: [5, 3] }"))).toContain(
      "range minimum exceeds maximum",
    );
  });

  test("spawn_qualities rejects the same mistakes", () => {
    const spawnQ = (qualities: string) => ({
      "base/pack.yaml": [
        "id: base",
        "currency:",
        '  symbol: "$"',
        "  digits: 2",
        "stats:",
        "  - { id: happiness, label: Happiness, start: [50, 100] }",
        "spawn_qualities:",
        "  - outcomes:",
        `      - { weight: 1, qualities: ${qualities} }`,
        "",
      ].join("\n"),
    });
    expect(failures(spawnQ("{ plain: 1 }"))).toContain("not a person-scoped");
    expect(failures(spawnQ("{ tagged: 1 }"))).toContain("is a flag");
  });
});

describe("generated people keep their own values", () => {
  test("a person's quality is untouched by a later player write", () => {
    const [w, id] = spawn(newLife(bundles, 6), "elder");
    const r = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, culture: 1 },
    }));
    expect(q(r, id, "culture")).toBe(7);
  });
});
