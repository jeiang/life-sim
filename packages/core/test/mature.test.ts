import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  indexBundles,
  makeEnv,
  newLife,
  renderText,
  setMature,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const idx = indexBundles(compiled.bundles);
const world = newLife(compiled.bundles, 1);
const scope = { subject: world.playerId };

afterEach(() => setMature(false));

describe("mature (18+ mode) name", () => {
  test("reads false by default and follows the switch", () => {
    const env = () => makeEnv(world, idx, scope);
    expect(env().get("mature")).toBe(false);
    setMature(true);
    expect(env().get("mature")).toBe(true);
    setMature(false);
    expect(env().get("mature")).toBe(false);
  });

  test("a {mature} placeholder renders the switch", () => {
    expect(renderText("on: {mature}", world, idx, scope)).toBe("on: false");
    setMature(true);
    expect(renderText("on: {mature}", world, idx, scope)).toBe("on: true");
  });
});
