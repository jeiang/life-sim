import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("vacations compiles with the core-loop capabilities it requires", () => {
  const out = compilePacks(PACKS, { only: ["vacations"] });
  expect(out.diagnostics).toEqual([]);
  expect(out.bundles.map((b) => b.id)).toEqual(["core-loop", "vacations"]);
});
