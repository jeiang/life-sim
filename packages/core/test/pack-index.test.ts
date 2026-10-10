import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import { indexBundles, type PackBundle } from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const base = compiled.bundles[0] as PackBundle;

const withQuality = (id: string, quality: string): PackBundle => ({
  ...base,
  id,
  storylets: [],
  occupations: [],
  items: [],
  loans: [],
  cities: [],
  people: [],
  stats: [],
  qualities: [{ id: quality, type: "flag", default: false }] as never,
});

describe("indexBundles duplicate ids", () => {
  test("the same quality in two Packs errors naming both", () => {
    expect(() =>
      indexBundles([
        withQuality("a", "criminal_record"),
        withQuality("b", "criminal_record"),
      ]),
    ).toThrow(
      "quality 'criminal_record' is declared by both Pack 'a' and Pack 'b'",
    );
  });

  test("distinct ids load", () => {
    const idx = indexBundles([
      withQuality("a", "a_x"),
      withQuality("b", "b_x"),
    ]);
    expect([...idx.qualities.keys()]).toEqual(["a_x", "b_x"]);
  });
});
