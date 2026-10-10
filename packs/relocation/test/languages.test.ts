import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  choose,
  describePending,
  getPerson,
  indexBundles,
  listActions,
  newLife,
  runAction,
  updatePerson,
  type World,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["relocation"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles = out.bundles;
const idx = indexBundles(bundles);
const ID = "relocation/study-a-language";

const adultOf = (seed: number, age: number): World => {
  const w = newLife(bundles, seed);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age }));
};
const quality = (w: World, id: string) =>
  getPerson(w, w.playerId).qualities[id];

test("relocation compiles with the core-loop capabilities it requires", () => {
  expect(out.diagnostics).toEqual([]);
  expect(bundles.map((b) => b.id)).toEqual([
    "karma",
    "core-loop",
    "relocation",
  ]);
});

test("language qualities: English 100, the rest 0", () => {
  expect(idx.qualities.get("reloc_lang_english")?.default).toBe(100);
  expect(idx.qualities.get("reloc_lang_japanese")?.default).toBe(0);
});

describe("study a language", () => {
  test("seven languages, no English: it starts at 100 and never falls", () => {
    expect(idx.storylets.get(ID)?.choices.map((c) => c.label)).toEqual([
      "Spanish",
      "French",
      "German",
      "Italian",
      "Japanese",
      "Mandarin",
      "Korean",
    ]);
  });

  test("skill grows, tapering with skill, and the gain follows 3 / 8 uses a year", () => {
    let w = adultOf(9, 20);
    const gains: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = quality(w, "reloc_lang_spanish") as number;
      w = choose(runAction(w, bundles, ID).world, bundles, 0).world;
      gains.push((quality(w, "reloc_lang_spanish") as number) - before);
    }
    // Uses 1-3: (100 - skill) / 12 (half that on a slow session), at least 1.
    expect(gains[0]).toBeGreaterThanOrEqual(4);
    expect(gains[0]).toBeLessThanOrEqual(8);
    // Uses 4-8: one point a use at most for a low skill (the floor), none from 9.
    for (const g of gains.slice(3, 8)) expect(g).toBe(1);
    expect(gains.slice(8).every((g) => g === 0)).toBe(true);
  });

  test("a language at 100 is not offered; productive study adds smarts", () => {
    const w = adultOf(9, 20);
    const full = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, reloc_lang_korean: 100 },
    }));
    const open = runAction(full, bundles, ID).world;
    const choices = describePending(open, bundles)?.choices ?? [];
    expect(choices.find((c) => c.label === "Korean")?.enabled).toBe(false);
    expect(choices.find((c) => c.label === "Spanish")?.enabled).toBe(true);
  });

  test("offered from age 6, not under", () => {
    const locked = (w: World) =>
      listActions(w, bundles, "activities/languages").find((r) => r.id === ID)
        ?.locked;
    expect(locked(adultOf(9, 20))).toBe(false);
    expect(locked(adultOf(9, 4))).toBe(true);
  });
});
