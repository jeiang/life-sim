import { expect, type Page, test } from "@playwright/test";
import { playFixedLife } from "../packages/core/src/index.ts";
import { compilePacks } from "../packages/pack-tools/src/index.ts";

/** In-run determinism comparison (docs/spec/harness.md): 20 seeded lives in Node and in each browser. */
const compiled = compilePacks(new URL("../packs", import.meta.url).pathname);
if (!compiled.ok) throw new Error("packs failed to compile");
const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 7919);
const nodeHashes = SEEDS.map((s) => playFixedLife(compiled.bundles, s));

const browserHashes = (page: Page): Promise<string[]> =>
  page.evaluate(
    (seeds) =>
      (
        window as unknown as {
          __life: { playFixedLives(s: number[]): string[] };
        }
      ).__life.playFixedLives(seeds),
    SEEDS,
  );

/** Seeds whose hash differs between the Node run and the browser run. */
const mismatches = (browser: readonly string[]): number[] =>
  SEEDS.filter((_, i) => browser[i] !== nodeHashes[i]);

test("Node and the browser engine agree on 20 seeded lives", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  expect(new Set(nodeHashes).size).toBe(SEEDS.length);
  expect(mismatches(await browserHashes(page))).toEqual([]);
});

test("the comparison fails when an engine-dependent number differs", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Simulates an engine whose Math.trunc rounds differently from Node's.
  await page.addInitScript(() => {
    Math.trunc = (x: number) => Math.floor(x) + 1;
  });
  await page.goto("/");
  expect(mismatches(await browserHashes(page)).length).toBeGreaterThan(0);
});
