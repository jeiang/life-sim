import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  indexBundles,
  makeEnv,
  newLife,
  type PackBundle,
  replay,
  runAction,
  serializeWorld,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "effect-macros");

/** Compile a copy of the fixture with `files` (relative path -> text) written over it. */
function inDir<T>(files: Record<string, string>, use: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "macros-fixture-"));
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
    return out.diagnostics.map((d) => d.message).join("\n");
  });
}

const read = (w: World, b: readonly PackBundle[], name: string) =>
  makeEnv(w, indexBundles(b), { subject: w.playerId }).get(name);

describe("effect macros: expansion", () => {
  const b = build();

  test("a macro call in a storylet outcome substitutes its parameters", () => {
    const w0 = newLife(b, 11);
    const smarts = read(w0, b, "stat.smarts") as number;
    const money = read(w0, b, "money") as number;
    const w = runAction(w0, b, "base/use_boost").world;
    expect(read(w, b, "stat.smarts")).toBe(smarts + 3);
    expect(read(w, b, "money")).toBe(money + 200);
  });

  test("an argument expression is substituted whole, and macros nest", () => {
    const w0 = newLife(b, 11);
    const smarts = read(w0, b, "stat.smarts") as number;
    const money = read(w0, b, "money") as number;
    const w = runAction(w0, b, "base/use_twice").world;
    expect(read(w, b, "stat.smarts")).toBe(smarts + 2 + 1);
    expect(read(w, b, "money")).toBe(money + (2 + 1) * 2 + 0);
  });

  test("a macro in another Pack, called through a required capability and from a macro", () => {
    const w0 = newLife(b, 11);
    const smarts = read(w0, b, "stat.smarts") as number;
    const happy = read(w0, b, "stat.happiness") as number;
    const w = runAction(w0, b, "ext/use_combo").world;
    expect(read(w, b, "stat.smarts")).toBe(smarts + 4 + 1);
    expect(read(w, b, "stat.happiness")).toBe(happy + 1);
  });

  test("each call spawns its own person; names bound in a macro stay in it", () => {
    const w0 = newLife(b, 11);
    const w = runAction(w0, b, "base/use_friend").world;
    // Two macro calls and one spawn of the caller's own.
    expect(w.persons.size).toBe(w0.persons.size + 3);
    const bundle = b.find((x) => x.id === "base");
    const outcome = bundle?.storylets.find((s) => s.id === "base/use_friend")
      ?.outcomes?.[0];
    const spawned = (outcome?.effects ?? [])
      .filter((e) => e[0] === "spawn")
      .map((e) => e[3]);
    expect(spawned).toHaveLength(3);
    expect(new Set(spawned).size).toBe(3);
    expect(spawned).toContain("n");
  });

  test("the compiled bundle holds only closed primitives", () => {
    const bundle = b.find((x) => x.id === "base");
    const effects = bundle?.storylets.flatMap((s) =>
      (s.outcomes ?? []).flatMap((o) => o.effects),
    );
    for (const e of effects ?? []) {
      expect(["set", "add", "sub", "do", "spawn"]).toContain(e[0]);
      if (e[0] === "do") expect(e[1]).not.toContain(".");
    }
  });
});

/** The same storylet ids with every macro call written out by hand. */
const INLINE_BASE = `
- id: use_boost
  trigger: action
  menu: relationships
  outcomes:
    - effects:
        - stat.smarts += 3
        - money += 100 * 2

- id: use_twice
  trigger: action
  menu: relationships
  outcomes:
    - effects:
        - stat.smarts += 2
        - money += (2 + 1) * 2
        - stat.smarts += 1
        - money += 0 * 2

- id: use_friend
  trigger: action
  menu: relationships
  outcomes:
    - effects:
        - spawn_person(neighbour, local) as pal
        - pal.quality.grudge += 2
        - relationship(pal).closeness += 2
        - journal("Made a friend.")
        - spawn_person(neighbour, local) as pal2
        - pal2.quality.grudge += 3
        - relationship(pal2).closeness += 3
        - journal("Made a friend.")
        - spawn_person(neighbour, local) as n
        - n.quality.grudge += 1
        - stat.happiness += 1
`;
const INLINE_EXT = `
- id: use_combo
  trigger: action
  menu: relationships
  outcomes:
    - effects:
        - stat.smarts += 4
        - money += 10 * 2
        - stat.happiness += 1
        - stat.smarts += 1
        - money += 5 * 2
`;

describe("effect macros: replay equality with the inlined equivalent", () => {
  const macro = build();
  const inline = build({
    "base/storylets/actions.yaml": INLINE_BASE,
    "ext/storylets/actions.yaml": INLINE_EXT,
  });
  const script = (b: readonly PackBundle[], seed: number): World => {
    let w = newLife(b, seed);
    for (const id of [
      "base/use_boost",
      "base/use_friend",
      "base/use_twice",
      "ext/use_combo",
      "base/use_friend",
    ])
      w = runAction(w, b, id).world;
    return w;
  };

  test("the world, its save text and its hash are identical", () => {
    for (const seed of [1, 2, 3, 99]) {
      const a = script(macro, seed);
      const c = script(inline, seed);
      expect(serializeWorld(a)).toBe(serializeWorld(c));
      expect(worldHash(a)).toBe(worldHash(c));
    }
  });

  test("replaying the choice log of a macro life reproduces it, and the inlined one", () => {
    const w = script(macro, 7);
    expect(w.choiceLog.length).toBeGreaterThan(0);
    expect(worldHash(replay(w.seed, macro, w.choiceLog))).toBe(worldHash(w));
    expect(worldHash(replay(w.seed, inline, w.choiceLog))).toBe(worldHash(w));
  });
});

describe("effect macros: errors", () => {
  test("a cycle is an error naming the loop", () => {
    const text = failures({
      "base/effects/cycle.yaml": [
        "- { id: a, effects: [base.b()] }",
        "- { id: b, effects: [base.a()] }",
        "- { id: me, effects: [base.me()] }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("effect macros form a cycle: a -> b -> a");
    expect(text).toContain("effect macros form a cycle: me -> me");
  });

  test("an unknown primitive is an error", () => {
    const text = failures({
      "base/effects/bad.yaml": [
        "- { id: bad, effects: [teleport(1), stat.nope += 1, money = 3] }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("unknown effect 'teleport'");
    expect(text).toContain("unknown name 'stat.nope'");
  });

  test("arity and argument types are checked at the call", () => {
    const text = failures({
      "base/storylets/bad.yaml": [
        "- id: bad",
        "  trigger: action",
        "  menu: relationships",
        "  outcomes:",
        "    - effects:",
        "        - base.boost(1)",
        "        - base.boost(1, 2, 3)",
        "        - base.boost(true, 2)",
        "        - base.nothing(1)",
        "",
      ].join("\n"),
    });
    expect(text).toContain("macro 'base.boost' takes 2 argument(s), got 1");
    expect(text).toContain("macro 'base.boost' takes 2 argument(s), got 3");
    expect(text).toContain("expected an integer");
    expect(text).toContain("unknown effect macro 'base.nothing'");
  });

  test("a macro is not callable unless a required capability provides it", () => {
    const call = [
      "- id: sneak",
      "  trigger: action",
      "  menu: relationships",
      "  outcomes:",
      "    - effects:",
      "        - base.boost(1, 2)",
      "",
    ].join("\n");
    const none = failures({
      "rogue/pack.yaml": "id: rogue\n",
      "rogue/storylets/a.yaml": call,
    });
    expect(none).toContain("unknown effect macro 'base.boost'");
    const narrow = failures({
      "rogue/pack.yaml": "id: rogue\n",
      "rogue/capabilities/x.yaml": "requires:\n  - base/narrow\n",
      "rogue/storylets/a.yaml": call,
    });
    expect(narrow).toContain("unknown effect macro 'base.boost'");
  });

  test("a parameter may not take a declared or reserved name", () => {
    const text = failures({
      "base/effects/bad.yaml": [
        "- { id: p1, params: [money], effects: [stat.smarts += 1] }",
        "- { id: p2, params: [happiness], effects: [stat.smarts += 1] }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("'money' is a reserved name");
    expect(text).not.toContain("'happiness' is already");
  });

  test("a body may only use names its own Pack can see; an unknown parameter is an error", () => {
    const text = failures({
      "base/effects/bad.yaml":
        "- { id: p, params: [a], effects: [stat.smarts += b] }\n",
    });
    expect(text).toContain("unknown name 'b'");
  });

  test("nesting deeper than the limit is an error", () => {
    const lines = ["- { id: m0, effects: [stat.smarts += 1] }"];
    for (let i = 1; i <= 9; i++)
      lines.push(`- { id: m${i}, effects: [base.m${i - 1}()] }`);
    const text = failures({
      "base/effects/deep.yaml": `${lines.join("\n")}\n`,
    });
    expect(text).toContain("macro 'm8' nests macros 9 deep; the limit is 8");
    expect(text).not.toContain("macro 'm7' nests");
  });

  test("a name bound inside a macro is not visible to the caller", () => {
    const text = failures({
      "base/storylets/bad.yaml": [
        "- id: bad",
        "  trigger: action",
        "  menu: relationships",
        "  outcomes:",
        "    - effects:",
        "        - base.befriend(1)",
        "      text: Met {pal.first_name}.",
        "",
      ].join("\n"),
    });
    expect(text).toContain("pal.first_name");
  });

  test("providing a macro the Pack does not declare is an error", () => {
    const text = failures({
      "base/capabilities/macros.yaml":
        "provides:\n  effects:\n    - ghost\n  stats:\n    - happiness\n    - smarts\n",
    });
    expect(text).toContain("provides effects 'ghost'");
  });

  test("two macros with one id are an error", () => {
    const text = failures({
      "base/effects/dup.yaml": "- { id: boost, effects: [stat.smarts += 1] }\n",
    });
    expect(text).toContain("duplicate effect macro 'boost'");
  });
});
