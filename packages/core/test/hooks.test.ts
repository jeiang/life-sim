import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  deserializeWorld,
  fireMilestone,
  getPerson,
  newLife,
  type PackBundle,
  replay,
  serializeWorld,
  startStorylet,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "hooks");

/** Compile a copy of the fixture with `files` (relative path -> text) written over it. */
function inDir<T>(files: Record<string, string>, use: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "hooks-fixture-"));
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
    return out.diagnostics
      .map((d) => `${d.file} ${d.path}: ${d.message}`)
      .join("\n");
  });
}

const DIGIT: Record<string, string> = { alpha: "1", mid: "2", zeta: "3" };
const bundles = build();
/** The digits the hooks append, in bundle order (dependencies first, then id). */
const ORDER = bundles
  .map((b) => DIGIT[b.id])
  .filter((d): d is string => d !== undefined)
  .join("");

const q = (w: World, id: string) => getPerson(w, w.playerId).qualities[id];

describe("lifecycle hooks: phases", () => {
  test("bundle order puts a required Pack before its dependant", () => {
    expect(ORDER).toHaveLength(3);
    expect(ORDER.indexOf("3")).toBeLessThan(ORDER.indexOf("1"));
  });

  test("on_birth runs once at the end of newLife, in Pack order, macros allowed", () => {
    const w = newLife(bundles, 7);
    expect(String(q(w, "birth_trail"))).toBe(ORDER);
    expect(q(w, "lucky")).toBe(5);
  });

  test("on_age_up_pre and on_age_up_post run once per age-up", () => {
    let w = newLife(bundles, 7);
    w = ageUp(w, bundles).world;
    expect(String(q(w, "pre_trail"))).toBe(ORDER);
    expect(String(q(w, "post_trail"))).toBe(ORDER);
    w = ageUp(w, bundles).world;
    expect(String(q(w, "pre_trail"))).toBe(ORDER + ORDER);
    expect(String(q(w, "post_trail"))).toBe(ORDER + ORDER);
    expect(String(q(w, "birth_trail"))).toBe(ORDER);
  });

  test("on_death runs once when the player dies, after the obituary", () => {
    const w = startStorylet(newLife(bundles, 7), bundles, "base/doom").world;
    expect(w.ended?.cause).toBe("fate");
    expect(String(q(w, "death_trail"))).toBe(ORDER);
    expect(w.ended).not.toBeNull();
  });

  test("on_milestone fires once per call for its own milestone id only", () => {
    let w = newLife(bundles, 7);
    w = fireMilestone(w, bundles, "other");
    expect(q(w, "wed_trail")).toBe(0);
    w = fireMilestone(w, bundles, "wed");
    expect(String(q(w, "wed_trail"))).toBe(ORDER);
  });

  test("nothing else fires a hook it was not asked to", () => {
    const w = newLife(bundles, 7);
    expect(q(w, "pre_trail")).toBe(0);
    expect(q(w, "post_trail")).toBe(0);
    expect(q(w, "death_trail")).toBe(0);
    expect(q(w, "wed_trail")).toBe(0);
  });
});

describe("lifecycle hooks: RNG isolation", () => {
  const spawning = {
    "mid/pack.yaml": [
      "id: mid",
      "hooks:",
      "  on_birth:",
      "    - spawn_person(base/neighbour, base/local) as pal",
      "    - spawn_person(base/neighbour, base/local) as pal2",
      "  on_age_up_post:",
      "    - spawn_person(base/neighbour, base/local) as pal",
      "",
    ].join("\n"),
  };
  const withHook = build(spawning);
  const without = build({
    "mid/pack.yaml": "id: mid\n",
  });

  test("a subscriber's rolls use its own purpose keys and move no other counter", () => {
    const a = newLife(without, 7);
    const b = newLife(withHook, 7);
    for (const [k, n] of Object.entries(a.rngCounters))
      expect(b.rngCounters[k]).toBe(n);
    const extra = Object.keys(b.rngCounters).filter(
      (k) => !(k in a.rngCounters),
    );
    expect(extra.sort()).toEqual([
      "0/pack/mid/on_birth/0",
      "0/pack/mid/on_birth/1",
    ]);
  });

  test("an unrelated storylet's outcome and the age-up streams are unchanged", () => {
    const run = (b: readonly PackBundle[]) => {
      let w = newLife(b, 11);
      w = ageUp(w, b).world;
      return startStorylet(w, b, "base/gamble").world;
    };
    const a = run(without);
    const b = run(withHook);
    expect(q(b, "lucky")).toBe(q(a, "lucky"));
    for (const [k, n] of Object.entries(a.rngCounters))
      expect(b.rngCounters[k]).toBe(n);
    expect(
      Object.keys(b.rngCounters).filter((k) => k.includes("pack/mid/")).length,
    ).toBeGreaterThan(0);
  });

  test("a hook that spawns people is deterministic", () => {
    const run = () => ageUp(newLife(withHook, 5), withHook).world;
    expect(worldHash(run())).toBe(worldHash(run()));
  });
});

describe("lifecycle hooks: replay and saves", () => {
  function play(b: readonly PackBundle[], seed: number): World {
    let w = newLife(b, seed);
    w = ageUp(w, b).world;
    w = startStorylet(w, b, "base/gamble").world;
    return ageUp(w, b).world;
  }

  test("replaying the choice log reproduces a hooked life", () => {
    const w = play(bundles, 9);
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
  });

  test("a hooked life survives a save round trip", () => {
    const w = play(bundles, 9);
    expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
  });

  test("a life that died in a hook-bearing build replays and round-trips", () => {
    const w = startStorylet(play(bundles, 3), bundles, "base/doom").world;
    expect(w.ended).not.toBeNull();
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
  });
});

describe("lifecycle hooks: build errors", () => {
  test("an unknown name in a hook points at the manifest", () => {
    const text = failures({
      "mid/pack.yaml":
        "id: mid\nhooks:\n  on_birth:\n    - quality.nope += 1\n",
    });
    expect(text).toMatch(/nope/);
    expect(text).toMatch(/mid\/pack\.yaml hooks\.on_birth/);
  });

  test("die is rejected in on_death", () => {
    const text = failures({
      "mid/pack.yaml": 'id: mid\nhooks:\n  on_death:\n    - die("again")\n',
    });
    expect(text).toMatch(/die.*on_death/);
  });

  test("a macro of a Pack the hook does not require is unknown", () => {
    const text = failures({
      "mid/capabilities/feat.yaml": "provides: {}\n",
      "mid/pack.yaml": "id: mid\nhooks:\n  on_birth:\n    - base.stamp(1)\n",
    });
    expect(text).toMatch(/stamp/);
  });

  test("an unknown phase is rejected by the schema", () => {
    const text = failures({
      "mid/pack.yaml":
        "id: mid\nhooks:\n  on_dance:\n    - quality.lucky += 1\n",
    });
    expect(text).toMatch(/on_dance/);
  });
});
