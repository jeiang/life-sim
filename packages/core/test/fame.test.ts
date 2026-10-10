import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  evaluate,
  getPerson,
  indexBundles,
  makeEnv,
  newLife,
  type PackBundle,
  runAction,
  ScriptedRng,
  setStreamOverride,
  updatePerson,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");

/** core-loop plus a throwaway Pack that calls `core_loop.add_fame` through the capability. */
function withFameActions(): PackBundle[] {
  const dir = mkdtempSync(join(tmpdir(), "fame-"));
  try {
    for (const p of ["core-loop", "karma"])
      cpSync(join(PACKS, p), join(dir, p), { recursive: true });
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    put("ext/pack.yaml", "id: ext\n");
    put("ext/capabilities/use.yaml", "requires:\n  - core-loop/fame\n");
    put(
      "ext/storylets/actions.yaml",
      [
        "- id: star",
        "  trigger: action",
        "  menu: activities",
        "  outcomes:",
        "    - effects:",
        "        - core_loop.add_fame(60)",
        "- id: flop",
        "  trigger: action",
        "  menu: activities",
        "  outcomes:",
        "    - effects:",
        "        - core_loop.add_fame(0 - 30)",
        "",
      ].join("\n"),
    );
    const out = compilePacks(dir);
    if (!out.ok)
      throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
    return [...out.bundles];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const real = compilePacks(PACKS, { only: ["core-loop"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));

const at = (w: World, age: number): World =>
  updatePerson(w, w.playerId, (p) => ({ ...p, age }));

describe("fame: lazy decay readable and macro", () => {
  const b = withFameActions();
  const idx = indexBundles(b);
  const read = (w: World, name: string) =>
    makeEnv(w, idx, { subject: w.playerId }).get(name);

  test("a new life has no fame", () => {
    expect(read(newLife(b, 3), "fame_value")).toBe(0);
  });

  test("add_fame stores the value and the age; reading decays 5 a year", () => {
    let w = at(newLife(b, 3), 20);
    w = runAction(w, b, "ext/star").world;
    const p = getPerson(w, w.playerId);
    expect(p.qualities.fame).toBe(60);
    expect(p.qualities.fame_age).toBe(20);
    expect(read(w, "fame_value")).toBe(60);
    expect(read(at(w, 24), "fame_value")).toBe(40);
    // Every reader applies the same decay; nothing is stored back.
    expect(getPerson(at(w, 24), w.playerId).qualities.fame).toBe(60);
    expect(read(at(w, 40), "fame_value")).toBe(0);
    expect(read(at(w, 90), "fame_value")).toBe(0);
  });

  test("a second grant starts from the decayed value and restarts the clock", () => {
    let w = at(newLife(b, 3), 20);
    w = runAction(w, b, "ext/star").world;
    w = at(w, 24); // decayed to 40
    w = runAction(w, b, "ext/star").world; // 40 + 60 caps at 100
    const p = getPerson(w, w.playerId);
    expect(p.qualities.fame).toBe(100);
    expect(p.qualities.fame_age).toBe(24);
    expect(read(at(w, 26), "fame_value")).toBe(90);
  });

  test("a negative grant takes fame down from the decayed value, never below 0", () => {
    let w = at(newLife(b, 3), 20);
    w = runAction(w, b, "ext/star").world;
    w = runAction(at(w, 22), b, "ext/flop").world; // 50 - 30
    expect(getPerson(w, w.playerId).qualities.fame).toBe(20);
    w = runAction(at(w, 30), b, "ext/flop").world; // decayed to 0, stays 0
    expect(getPerson(w, w.playerId).qualities.fame).toBe(0);
  });
});

describe("looks-decline event", () => {
  const idx = indexBundles(real.bundles);
  const s = idx.storylets.get("core-loop/looks-decline");
  const gate = (age: number, looks: number) => {
    let w = at(newLife(real.bundles, 5), age);
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      stats: { ...p.stats, looks },
    }));
    return Boolean(
      s?.when && evaluate(s.when, makeEnv(w, idx, { subject: w.playerId })),
    );
  };

  test("is a 40% yearly event from 40, only while there is looks to lose", () => {
    expect(s?.trigger).toBe("event");
    expect(gate(39, 50)).toBe(false);
    expect(gate(40, 50)).toBe(true);
    expect(gate(70, 50)).toBe(true);
    expect(gate(70, 0)).toBe(false);
  });

  /** Looks lost over the year that ends at `age`, with the event forced to hit versus forced to miss. */
  const lost = (age: number, looks: number, seed = 5) => {
    const start = at(newLife(real.bundles, seed), age - 1);
    const w0 = updatePerson(start, start.playerId, (p) => ({
      ...p,
      stats: { ...p.stats, looks },
    }));
    const year = (hit: boolean) => {
      setStreamOverride((_a, key) =>
        key === "core-loop/looks-decline"
          ? new ScriptedRng({ chance: hit })
          : undefined,
      );
      try {
        const w = ageUp(w0, real.bundles).world;
        return getPerson(w, w.playerId).stats.looks as number;
      } finally {
        setStreamOverride(null);
      }
    };
    return year(false) - year(true);
  };

  test("takes 1 a year at 40-64, 2 at 65-89 and 3 from 90", () => {
    expect(lost(40, 50)).toBe(1);
    expect(lost(64, 50)).toBe(1);
    expect(lost(65, 50)).toBe(2);
    expect(lost(90, 50)).toBe(3);
  });

  test("the loss does not depend on the seed", () => {
    expect(lost(45, 50, 9)).toBe(1);
  });
});
