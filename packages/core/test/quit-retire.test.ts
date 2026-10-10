import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  getPerson,
  indexBundles,
  listActions,
  newLife,
  runAction,
  updatePerson,
  type World,
} from "../src/index.ts";
import { startOccupation } from "../src/sim/ops.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");

/** core-loop plus an `extra` Pack whose occupations core-loop does not list. */
const EXTRA: Record<string, string> = {
  "extra/pack.yaml": "id: extra\n",
  "extra/capabilities/jobs.yaml":
    "requires:\n  - core-loop/careers\nprovides:\n  occupations:\n    - lab-tech\n    - stocker\n",
  "extra/occupations/jobs.yaml": [
    "- id: lab-tech",
    "  label: Lab tech",
    "  icon: 🔬",
    "  group: full-time",
    "  ladder: lab",
    "  pay: 4000000",
    "- id: stocker",
    "  label: Stocker",
    "  icon: 📦",
    "  group: part-time",
    "  ladder: stock",
    "  pay: 1000000",
    "",
  ].join("\n"),
};

const dir = mkdtempSync(join(tmpdir(), "quit-retire-"));
const out = (() => {
  try {
    for (const p of ["core-loop", "karma"])
      cpSync(join(PACKS, p), join(dir, p), { recursive: true });
    for (const [path, text] of Object.entries(EXTRA)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return compilePacks(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles = out.bundles;
const idx = indexBundles(bundles);

const player = (w: World) => getPerson(w, w.playerId);
const kinds = (xs: readonly { kindId: string }[]) => xs.map((o) => o.kindId);
const holding = (age: number, kind: string): World => {
  const w = newLife(bundles, 3);
  const aged = updatePerson(w, w.playerId, (p) => ({ ...p, age }));
  return startOccupation(aged, idx, aged.playerId, kind);
};
const has = (w: World, id: string) =>
  listActions(w, bundles, "occupation").some(
    (r) => r.id === `core-loop/${id}` && !r.locked,
  );

describe("quit and retire cover occupations core-loop does not list", () => {
  test("quit ends a full-time pack occupation", () => {
    let w = holding(30, "extra/lab-tech");
    expect(has(w, "quit-job")).toBe(true);
    w = runAction(w, bundles, "core-loop/quit-job").world;
    expect(player(w).occupations).toHaveLength(0);
    expect(kinds(player(w).occupationHistory)).toEqual(["extra/lab-tech"]);
  });

  test("quit ends a part-time pack occupation", () => {
    let w = holding(20, "extra/stocker");
    expect(has(w, "quit-job")).toBe(true);
    w = runAction(w, bundles, "core-loop/quit-job").world;
    expect(player(w).occupations).toHaveLength(0);
  });

  test("retire replaces a full-time pack occupation", () => {
    let w = holding(62, "extra/lab-tech");
    w = runAction(w, bundles, "core-loop/retire").world;
    expect(kinds(player(w).occupations)).toEqual(["core-loop/retired"]);
    expect(kinds(player(w).occupationHistory)).toEqual(["extra/lab-tech"]);
  });

  test("retire ends a part-time pack occupation", () => {
    let w = holding(62, "extra/stocker");
    w = runAction(w, bundles, "core-loop/retire").world;
    expect(kinds(player(w).occupations)).toEqual(["core-loop/retired"]);
    expect(kinds(player(w).occupationHistory)).toEqual(["extra/stocker"]);
  });

  test("a retiree cannot quit", () => {
    const w = runAction(
      holding(62, "extra/lab-tech"),
      bundles,
      "core-loop/retire",
    ).world;
    expect(has(w, "quit-job")).toBe(false);
  });
});
