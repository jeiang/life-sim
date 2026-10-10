import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  getPerson,
  indexBundles,
  listActions,
  newLife,
  updatePerson,
  type World,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = join(HERE, "..", "..");
const compile = (only: string[]) => {
  const r = compilePacks(root, { only });
  if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("\n"));
  return r.bundles;
};
const bundles = compile(["crime"]);
const idx = indexBundles(bundles);

const adult = (b: typeof bundles, seed: number): World => {
  const w = newLife(b, seed);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age: 25,
    qualities: {
      ...p.qualities,
      has_degree_nursing: true,
      graduated_high_school: true,
    },
  }));
};
const locked = (w: World, b: typeof bundles, id: string) =>
  listActions(w, b, "activities/job-board").find(
    (r) => r.id === `core-loop/${id}`,
  )?.locked;

describe("crime pack", () => {
  test("loads with core-loop and declares the shared qualities", () => {
    expect(bundles.map((b) => b.id)).toContain("core-loop");
    expect(idx.qualities.get("criminal_record")?.default).toBe(false);
    expect(idx.qualities.get("wanted")?.default).toBe(false);
    expect(idx.qualities.get("pending_charge")?.default).toBe(0);
    const w = newLife(bundles, 1);
    expect(getPerson(w, w.playerId).qualities.pending_charge).toBe(0);
  });

  test("core-loop alone has no crime ids", () => {
    const ids = indexBundles(compile(["core-loop"])).qualities;
    for (const id of ["criminal_record", "wanted", "pending_charge"])
      expect(ids.has(id)).toBe(false);
  });

  test("a conviction blocks professional apply, entry jobs still hire", () => {
    const w = adult(bundles, 2);
    expect(locked(w, bundles, "apply-staff-nurse")).toBe(false);
    const bad = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, criminal_record: true },
    }));
    expect(locked(bad, bundles, "apply-staff-nurse")).toBe(true);
    expect(locked(bad, bundles, "apply-server")).toBe(false);
    expect(locked(bad, bundles, "apply-apprentice")).toBe(false);
  });
});
