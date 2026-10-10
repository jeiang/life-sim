import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  ageUp,
  getPerson,
  indexBundles,
  newLife,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["dating"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles = out.bundles;
const idx = indexBundles(bundles);

test("dating compiles with core-loop and declares the attraction qualities", () => {
  expect(out.diagnostics).toEqual([]);
  expect(bundles.map((b) => b.id)).toEqual(["karma", "core-loop", "dating"]);
  for (const g of ["men", "women", "nonbinary"])
    expect(idx.qualities.get(`dating_attracted_${g}`)?.default).toBe(0);
});

test("core-loop alone has no attraction ids", () => {
  const alone = compilePacks(PACKS, { only: ["core-loop"] });
  if (!alone.ok) throw new Error("core-loop failed to compile");
  const ids = indexBundles(alone.bundles).qualities;
  for (const g of ["men", "women", "nonbinary"])
    expect(ids.has(`dating_attracted_${g}`)).toBe(false);
});

test("attraction values lean towards the opposite gender for most and vary by gender", () => {
  const seeds = Array.from({ length: 1500 }, (_, i) => i + 1);
  let straightMen = 0;
  let men = 0;
  let anyHigh = 0;
  for (const s of seeds) {
    const r = ageUp(newLife(bundles, s), bundles);
    const p = getPerson(r.world, r.world.playerId);
    const a = ["men", "women", "nonbinary"].map(
      (g) => p.qualities[`dating_attracted_${g}`],
    ) as number[];
    if (Math.max(...a) >= 60) anyHigh++;
    if (p.gender === "male") {
      men++;
      if ((a[1] as number) >= 60 && (a[0] as number) < 20) straightMen++;
    }
  }
  expect(straightMen / men).toBeGreaterThan(0.65);
  expect(anyHigh / seeds.length).toBeGreaterThan(0.9);
});
