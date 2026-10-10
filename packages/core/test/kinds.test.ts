import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  indexBundles,
  listActions,
  makeEnv,
  newLife,
  type PackBundle,
  runAction,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "kinds");

function build(dir = FIXTURE) {
  const out = compilePacks(dir);
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return out;
}

/** Compile a copy of the fixture with `files` (relative path -> text) added; returns the messages. */
function failures(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "kinds-fixture-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const out = compilePacks(dir);
    expect(out.ok).toBe(false);
    return out.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const read = (w: World, b: readonly PackBundle[], name: string) =>
  makeEnv(w, indexBundles(b), { subject: w.playerId }).get(name);

const open = (w: World, b: readonly PackBundle[], id: string): boolean => {
  const row = listActions(w, b, "relationships").find((r) => r.id === id);
  expect(row).toBeDefined();
  return !row?.locked;
};

describe("content kinds: compile", () => {
  test("bundles carry the kind and the entries each Pack wrote", () => {
    const { bundles } = build();
    const world = bundles.find((b) => b.id === "world") as PackBundle;
    const ext = bundles.find((b) => b.id === "ext") as PackBundle;
    expect(world.kinds.map((k) => [k.id, k.label])).toEqual([
      ["countries", "Country"],
    ]);
    expect(world.kinds[0]?.fields.map((f) => [f.name, f.type])).toEqual([
      ["name", "string"],
      ["rank", "int"],
      ["tax", "expr"],
      ["open", "expr"],
      ["capital", "ref"],
      ["friend", "ref"],
    ]);
    expect(world.kindEntries.map((e) => e.id)).toEqual([
      "world/ca",
      "world/us",
    ]);
    expect(world.kindEntries[1]?.values.capital).toBe("world/harbor");
    expect(world.kindEntries[1]?.values.friend).toBe("world/ca");
    expect(ext.kinds).toEqual([]);
    expect(ext.kindEntries.map((e) => [e.kind, e.id])).toEqual([
      ["countries", "ext/mx"],
    ]);
  });

  test("the ids lock lists entries and kinds", () => {
    const { ids } = build();
    expect(ids.get("world")).toEqual(
      expect.arrayContaining(["world/us", "world/ca", "kind.countries"]),
    );
    expect(ids.get("ext")).toContain("ext/mx");
  });

  test("a wrong field type is an error", () => {
    const text = failures({
      "world/countries/bad.yaml": [
        "- { id: bad1, name: X, rank: high, tax: 1, open: true, capital: harbor, friend: us }",
        "- { id: bad2, name: 4, rank: 1, tax: 1, open: true, capital: harbor, friend: us }",
        "- { id: bad3, name: X, rank: 1, tax: 1, open: true, capital: harbor }",
        "- { id: bad4, name: X, rank: 1, tax: 1, open: true, capital: harbor, friend: us, extra: 1 }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("bad1.rank: Expected integer");
    expect(text).toContain("bad2.name: Expected string");
    expect(text).toContain("missing required field 'friend'");
    expect(text).toContain("unknown field 'extra'");
  });

  test("a dangling or wrongly typed id-ref is an error", () => {
    const text = failures({
      "world/countries/bad.yaml": [
        "- { id: a, name: X, rank: 1, tax: 1, open: true, capital: nowhere, friend: us }",
        "- { id: b, name: X, rank: 1, tax: 1, open: true, capital: harbor, friend: nobody }",
        "- { id: c, name: X, rank: 1, tax: 1, open: true, capital: us, friend: us }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("dangling reference 'nowhere'");
    expect(text).toContain("dangling reference 'nobody'");
    expect(text).toContain("'us' is a countries entry, expected city");
  });

  test("an expression field is checked, and may not read readables or kinds", () => {
    const text = failures({
      "world/countries/bad.yaml": [
        "- { id: a, name: X, rank: 1, tax: nope + 1, open: true, capital: harbor, friend: us }",
        "- { id: b, name: X, rank: 1, tax: home_tax, open: true, capital: harbor, friend: us }",
        '- { id: c, name: X, rank: 1, tax: "kind(\\"countries\\", us).rank", open: true, capital: harbor, friend: us }',
        "- { id: d, name: X, rank: 1, tax: 1, open: 3, capital: harbor, friend: us }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("unknown name 'nope'");
    expect(text).toContain("unknown name 'home_tax'");
    expect(text).toContain("unknown function 'kind'");
    expect(text).toContain("expected a boolean");
  });

  test("a read of an unknown kind, field or entry is an error", () => {
    const text = failures({
      "world/storylets/bad.yaml": [
        "- id: k1",
        "  trigger: action",
        "  menu: relationships",
        '  when: kind("nations", us).rank > 0',
        "  outcomes: [{ effects: [stat.happiness += 1] }]",
        "- id: k2",
        "  trigger: action",
        "  menu: relationships",
        '  when: kind("countries", us).gdp > 0',
        "  outcomes: [{ effects: [stat.happiness += 1] }]",
        "- id: k3",
        "  trigger: action",
        "  menu: relationships",
        '  when: kind("countries", atlantis).rank > 0',
        "  outcomes: [{ effects: [stat.happiness += 1] }]",
        "- id: k4",
        "  trigger: action",
        "  menu: relationships",
        '  when: kind("countries", us).name > 0',
        "  outcomes: [{ effects: [stat.happiness += 1] }]",
        "",
      ].join("\n"),
    });
    expect(text).toContain("declared content kind");
    expect(text).toContain("has no field 'gdp'");
    expect(text).toContain("dangling reference 'atlantis'");
    expect(text).toContain("expected an integer, got a string");
  });

  test("a Pack needs the capability to read a kind or write entries", () => {
    const text = failures({
      "ext/capabilities/more.yaml": "requires:\n  - world/singletons\n",
    });
    expect(text).toContain("declared content kind");
  });

  test("a kind id may not name a Pack directory or be declared twice", () => {
    const text = failures({
      "world/kinds/storylets.yaml": "fields:\n  a: { type: int }\n",
      "ext/kinds/countries.yaml": "fields:\n  a: { type: int }\n",
    });
    expect(text).toContain("names a Pack directory");
    expect(text).toContain("kind 'countries' is declared by both Pack");
  });

  test("a bad kind declaration is an error", () => {
    const text = failures({
      "world/kinds/places.yaml": [
        "fields:",
        "  id: { type: int }",
        "  where: { type: ref, to: nothing }",
        "  odd: { type: float }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("Expected 'int'");
  });

  test("a ref to an unknown target is an error", () => {
    const text = failures({
      "world/kinds/places.yaml":
        "fields:\n  where: { type: ref, to: nothing }\n",
    });
    expect(text).toContain("unknown ref target 'nothing'");
  });

  test("removing a locked entry needs a migration", () => {
    const dir = mkdtempSync(join(tmpdir(), "kinds-lock-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      writeFileSync(
        join(dir, "world", "ids.lock.json"),
        JSON.stringify({ pack: "world", ids: ["world/gone", "world/us"] }),
      );
      const out = compilePacks(dir);
      expect(out.ok).toBe(false);
      expect(out.diagnostics.map((d) => d.message).join("\n")).toContain(
        "id 'world/gone' shipped",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("content kinds: runtime", () => {
  const { bundles } = build();

  test("the index lists kinds with every Pack's entries", () => {
    const idx = indexBundles(bundles);
    const k = idx.kinds.get("countries");
    expect(k?.owner).toBe("world");
    expect([...(k?.entries.keys() ?? [])].sort()).toEqual([
      "ext/mx",
      "world/ca",
      "world/us",
    ]);
  });

  test("expression fields are evaluated per read in the player scope", () => {
    const w = newLife(bundles, 3);
    const h = read(w, bundles, "stat.happiness") as number;
    // home_tax = us.tax + rank of us's friend (ca = 2)
    expect(read(w, bundles, "home_tax")).toBe(10 + Math.trunc(h / 10) + 2);
  });

  test("storylets read int, bool and string fields, and another Pack's entries", () => {
    const w = newLife(bundles, 3);
    expect(open(w, bundles, "world/audit")).toBe(true);
    expect(open(w, bundles, "world/shut")).toBe(false); // ca.open is true
    expect(open(w, bundles, "ext/border")).toBe(true); // mx.open is false
    expect(open(w, bundles, "world/named")).toBe(true);
    const after = runAction(w, bundles, "world/named").world;
    expect(read(after, bundles, "quality.where")).toBe(2);
    // mx.tax = 7 + quality.where, read lazily
    const next = runAction(after, bundles, "ext/border").world;
    const before = read(after, bundles, "stat.happiness") as number;
    expect(read(next, bundles, "stat.happiness")).toBe(
      Math.min(100, before + 9),
    );
  });
});
