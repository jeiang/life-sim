import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  getPerson,
  indexBundles,
  newLife,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const alone = compilePacks(PACKS, { only: ["karma"] });
if (!alone.ok)
  throw new Error(alone.diagnostics.map((d) => d.message).join("\n"));

test("karma is a leaf: it loads alone, with no other Pack", () => {
  expect(alone.bundles.map((b) => b.id)).toEqual(["karma"]);
  const idx = indexBundles(alone.bundles);
  expect(idx.qualities.get("karma_score")?.default).toBe(50);
});

test("core-loop requires karma/score and reads karma_value in a weight", () => {
  const out = compilePacks(PACKS, { only: ["core-loop"] });
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  expect(out.bundles.map((b) => b.id)).toEqual(["karma", "core-loop"]);
  const idx = indexBundles(out.bundles);
  expect(idx.readables.get("karma_value")?.decl.type).toBe("int");
  const w = newLife(out.bundles, 1);
  expect(getPerson(w, w.playerId).qualities.karma_score).toBe(50);
});
