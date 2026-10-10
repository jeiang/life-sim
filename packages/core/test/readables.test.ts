import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  PACK_BUNDLE_FORMAT,
  type PackBundle,
  type Person,
  runAction,
  serializeWorld,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "readables");

function build(only?: string[], dir = FIXTURE): PackBundle[] {
  const out = compilePacks(dir, only ? { only } : {});
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return [...out.bundles];
}

/** Compile a copy of the fixture with `files` (relative path -> text) added; returns the messages. */
function failures(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "readables-fixture-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    for (const [path, text] of Object.entries(files))
      writeFileSync(join(dir, path), text);
    const out = compilePacks(dir);
    expect(out.ok).toBe(false);
    return out.diagnostics.map((d) => d.message).join("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const read = (w: World, b: readonly PackBundle[], name: string) =>
  makeEnv(w, indexBundles(b), { subject: w.playerId }).get(name);

const ids = (b: readonly PackBundle[], pack: string) =>
  b.find((x) => x.id === pack)?.readables.map((r) => r.id);

/** Does the `relationships` menu list `id` unlocked? */
function open(w: World, b: readonly PackBundle[], id: string): boolean {
  const row = listActions(w, b, "relationships").find((r) => r.id === id);
  expect(row).toBeDefined();
  return !row?.locked;
}

describe("readables: compile", () => {
  test("bundles carry sorted readables and the contribution list, format 6", () => {
    expect(PACK_BUNDLE_FORMAT).toBe(6);
    const b = build();
    expect(b.find((x) => x.id === "base")?.format).toBe(6);
    expect(ids(b, "base")).toEqual([
      "echo",
      "favour_kinds",
      "favour_low",
      "favour_top",
      "favour_total",
      "food_owed",
      "grudge_total",
      "hiring_blocked",
      "pay_bonus",
      "perk_cap",
      "sulky_count",
      "well_liked",
    ]);
    expect(b.find((x) => x.id === "base")?.contributions).toEqual([]);
    expect(
      b.find((x) => x.id === "ext")?.contributions.map((c) => c.slot),
    ).toEqual(["hiring_blocked", "pay_bonus", "perk_cap"]);
    const idx = indexBundles(b);
    expect(idx.readables.get("hiring_blocked")?.terms).toHaveLength(2);
    expect(idx.readables.get("favour_total")?.terms).toEqual([]);
    // A slot's compiled form: type, combination and default.
    expect(idx.readables.get("perk_cap")?.decl).toEqual({
      kind: "slot",
      id: "perk_cap",
      type: "int",
      combine: "max",
      default: 2,
    });
  });

  test("an unknown name in a readable is an error", () => {
    const text = failures({
      "base/readables/bad.yaml":
        "- { kind: readable, id: bad, type: int, expr: nope + quality.nothing }\n",
    });
    expect(text).toContain("unknown name 'nope'");
    expect(text).toContain("unknown name 'quality.nothing'");
  });

  test("an unknown aggregator source, a flag sum and a wrong arity are errors", () => {
    const text = failures({
      "base/readables/bad.yaml": [
        "- { kind: readable, id: a, type: int, expr: sum(table.nope) }",
        "- { kind: readable, id: b, type: int, expr: sum(people.quality.sulky) }",
        '- { kind: readable, id: c, type: int, expr: "sum(table.favours, 1)" }',
        "- { kind: readable, id: d, type: int, expr: max(quality.heat) }",
        "- { kind: readable, id: f, type: int, expr: max(table.nope) }",
        '- { kind: readable, id: e, type: int, expr: "max(table.favours, 3)" }',
        "",
      ].join("\n"),
    });
    expect(text).toContain("'sum' needs a container");
    expect(text).toContain("'sum' needs integer values");
    expect(text).toContain("'sum' takes one container, got 2");
    // `max(a, b)` stays the pure function; `max` of a container path is an aggregator.
    expect(text).toContain("'max' takes 2 argument(s), got 1");
    expect(text).toContain("'max' needs a container");
    // Two arguments: the pure `max`, so the source is read as a name.
    expect(text).toContain("unknown name 'table.favours'");
  });

  test("the declared type must match the expression", () => {
    const text = failures({
      "base/readables/bad.yaml":
        "- { kind: readable, id: bad, type: bool, expr: sum(table.favours) }\n",
    });
    expect(text).toContain("expected a boolean, got an integer");
  });

  test("a direct cycle between readables is an error naming it", () => {
    const text = failures({
      "base/readables/loop.yaml": [
        "- { kind: readable, id: loop_a, type: int, expr: loop_b + 1 }",
        "- { kind: readable, id: loop_b, type: int, expr: loop_a + 1 }",
        "",
      ].join("\n"),
    });
    expect(text).toContain(
      "readables form a cycle: loop_a -> loop_b -> loop_a",
    );
  });

  test("a cycle through another Pack's slot contribution is an error", () => {
    // `echo` reads `hiring_blocked`; a term of `hiring_blocked` reading `echo` closes the loop.
    const text = failures({
      "ext/readables/loop.yaml":
        "- { kind: contribute, slot: hiring_blocked, expr: echo }\n",
    });
    expect(text).toContain("readables form a cycle");
    expect(text).toContain("hiring_blocked");
    expect(text).toContain("echo");
  });

  test("a slot term of the wrong type, an unknown slot and a non-slot are errors", () => {
    const text = failures({
      "ext/readables/bad.yaml": [
        "- { kind: contribute, slot: hiring_blocked, expr: 3 }",
        "- { kind: contribute, slot: nope, expr: 1 }",
        "- { kind: contribute, slot: favour_total, expr: 1 }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("expected a boolean, got an integer");
    expect(text).toContain("unknown slot 'nope'");
    expect(text).toContain("unknown slot 'favour_total'");
  });

  test("a readable is visible only through a required capability that provides it", () => {
    const hidden = failures({
      "base/capabilities/ledger.yaml": [
        "provides:",
        "  qualities:",
        "    - grudge",
        "  state:",
        "    - visits",
        "  readables:",
        "    - hiring_blocked",
        "    - pay_bonus",
        "    - perk_cap",
        "    - echo",
        "    - favour_kinds",
        "",
      ].join("\n"),
      "ext/storylets/peek.yaml": [
        "- id: peek",
        "  trigger: action",
        "  menu: relationships",
        "  when: favour_total > 0",
        "  outcomes:",
        "    - effects:",
        "        - quality.heat += 1",
        "",
      ].join("\n"),
    });
    expect(hidden).toContain("unknown name 'favour_total'");
  });

  test("a readable id duplicated across Packs, or reserved, is an error", () => {
    const text = failures({
      "ext/readables/dup.yaml": [
        "- { kind: readable, id: favour_total, type: int, expr: 1 }",
        "- { kind: readable, id: age, type: int, expr: 1 }",
        "",
      ].join("\n"),
    });
    expect(text).toContain("readable 'favour_total' is declared by both Pack");
    expect(text).toContain("'age' is a reserved name");
  });

  test("`provides: readables` must name a declared readable", () => {
    const text = failures({
      "ext/capabilities/heat.yaml": [
        "provides:",
        "  qualities:",
        "    - heat",
        "  readables:",
        "    - ghost",
        "requires:",
        "  - base/ledger",
        "",
      ].join("\n"),
    });
    expect(text).toContain("provides readables 'ghost'");
  });
});

describe("readables: runtime", () => {
  const all = build();

  test("an aggregator reads declared containers, per kind and per person", () => {
    let w = newLife(all, 3);
    expect(read(w, all, "favour_total")).toBe(0);
    expect(read(w, all, "favour_kinds")).toBe(0);
    expect(read(w, all, "well_liked")).toBe(false);
    w = runAction(w, all, "base/meet").world;
    w = runAction(w, all, "base/visit").world;
    w = runAction(w, all, "base/visit").world;
    // Player table: help 8, food 14, gossip 0. The neighbour holds food 2 and grudge 3.
    expect(read(w, all, "favour_total")).toBe(22);
    expect(read(w, all, "favour_top")).toBe(14);
    expect(read(w, all, "favour_low")).toBe(0);
    expect(read(w, all, "favour_kinds")).toBe(2);
    expect(read(w, all, "food_owed")).toBe(16);
    expect(read(w, all, "grudge_total")).toBe(3);
    expect(read(w, all, "sulky_count")).toBe(1);
    expect(read(w, all, "well_liked")).toBe(true);
  });

  test("a dead person no longer counts in a per-person aggregate", () => {
    let w = newLife(all, 3);
    w = runAction(w, all, "base/meet").world;
    const n = [...w.persons.values()].find((p) => p.id !== w.playerId) as {
      id: number;
    };
    const dead = new Map(w.persons);
    dead.set(n.id, { ...(dead.get(n.id) as Person), alive: false });
    expect(read({ ...w, persons: dead } as World, all, "grudge_total")).toBe(0);
  });

  test("a readable is never stored: the save text is unchanged by reading it", () => {
    const w = runAction(newLife(all, 5), all, "base/visit").world;
    const before = serializeWorld(w);
    read(w, all, "favour_total");
    read(w, all, "hiring_blocked");
    expect(serializeWorld(w)).toBe(before);
    expect(before).not.toContain("favour_total");
  });

  test("a readable used in a `when` gates an action", () => {
    let w = newLife(all, 4);
    expect(open(w, all, "base/invite")).toBe(false);
    w = runAction(w, all, "base/visit").world;
    expect(open(w, all, "base/invite")).toBe(true);
  });
});

describe("slot readables", () => {
  test("no contributor: the default", () => {
    const b = build(["base"]);
    const w = newLife(b, 6);
    expect(read(w, b, "hiring_blocked")).toBe(false);
    expect(read(w, b, "pay_bonus")).toBe(5);
    expect(read(w, b, "perk_cap")).toBe(2);
    expect(open(w, b, "base/apply")).toBe(true);
    expect(open(w, b, "base/boast")).toBe(false);
  });

  test("one contributor: its terms combine with the default", () => {
    const b = build(["ext"]);
    expect(b.map((x) => x.id).sort()).toEqual(["base", "ext"]);
    let w = newLife(b, 6);
    expect(read(w, b, "hiring_blocked")).toBe(false);
    expect(read(w, b, "pay_bonus")).toBe(8); // 5 + 3
    expect(read(w, b, "perk_cap")).toBe(7); // max(2, 7)
    expect(open(w, b, "base/apply")).toBe(true);
    expect(open(w, b, "base/boast")).toBe(true);
    // The gate in `base` follows the term `ext` contributed, though `base` never requires `ext`.
    w = runAction(w, b, "ext/offend").world;
    expect(read(w, b, "hiring_blocked")).toBe(true);
    expect(read(w, b, "echo")).toBe(true);
    expect(open(w, b, "base/apply")).toBe(false);
  });

  test("two contributors: summed, maxed and any-true", () => {
    const b = build();
    expect(indexBundles(b).readables.get("pay_bonus")?.terms).toHaveLength(2);
    let w = newLife(b, 6);
    // pay_bonus = 5 + 3 + (4 + favour_kinds 0); perk_cap = max(2, 7, 4).
    expect(read(w, b, "pay_bonus")).toBe(12);
    expect(read(w, b, "perk_cap")).toBe(7);
    expect(read(w, b, "hiring_blocked")).toBe(false);
    w = runAction(w, b, "base/visit").world;
    expect(read(w, b, "pay_bonus")).toBe(14); // favour_kinds is now 2
    expect(read(w, b, "hiring_blocked")).toBe(false);
    w = runAction(w, b, "base/visit").world;
    // Only ext2's term (`world.visits >= 2`) is true.
    expect(read(w, b, "hiring_blocked")).toBe(true);
    expect(open(w, b, "base/apply")).toBe(false);
  });

  test("a bundle set with a bad slot is rejected at load", () => {
    const b = build();
    const ext = b.find((x) => x.id === "ext") as PackBundle;
    const broken = b.map((x) =>
      x.id === "ext"
        ? { ...ext, contributions: [{ slot: "favour_total", expr: 1 }] }
        : x,
    );
    expect(() => indexBundles(broken)).toThrow(/not a declared slot/);
    const dup = b.map((x) =>
      x.id === "ext" ? { ...ext, readables: b[0]?.readables ?? [] } : x,
    );
    expect(() => indexBundles(dup)).toThrow(/declared by both Pack/);
  });
});
