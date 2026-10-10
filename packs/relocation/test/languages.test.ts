import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  choose,
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
  expect(bundles.map((b) => b.id)).toEqual(["core-loop", "relocation"]);
});

test("language qualities: English 100, the rest 0", () => {
  expect(idx.qualities.get("reloc_lang_english")?.default).toBe(100);
  expect(idx.qualities.get("reloc_lang_japanese")?.default).toBe(0);
});

describe("study a language", () => {
  test("skill grows and the gain shrinks at 11 and 21 uses in a year", () => {
    let w = adultOf(9, 20);
    const gains: number[] = [];
    for (let i = 0; i < 22; i++) {
      const before = quality(w, "reloc_lang_spanish") as number;
      w = choose(runAction(w, bundles, ID).world, bundles, 1).world;
      gains.push((quality(w, "reloc_lang_spanish") as number) - before);
    }
    expect(gains.slice(0, 10).every((g) => g === 6 || g === 3)).toBe(true);
    expect(gains.slice(10, 20).every((g) => g === 2 || g === 1)).toBe(true);
    expect(gains.slice(20).every((g) => g === 0)).toBe(true);
  });

  test("offered from age 6, not under", () => {
    const locked = (w: World) =>
      listActions(w, bundles, "activities/languages").find((r) => r.id === ID)
        ?.locked;
    expect(locked(adultOf(9, 20))).toBe(false);
    expect(locked(adultOf(9, 4))).toBe(true);
  });
});
