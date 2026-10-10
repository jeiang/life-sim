import { describe, expect, test } from "vitest";
import { newLife } from "../../../packages/core/src/index.ts";
import { bundles, idx, me } from "./helpers.ts";

const ABROAD = [
  "toronto",
  "montreal",
  "london",
  "manchester",
  "tokyo",
  "osaka",
  "mexico-city",
  "guadalajara",
];

describe("cities and countries", () => {
  test("eight cities abroad, none drawn at birth", () => {
    for (const c of ABROAD)
      expect(idx.cities.get(`relocation/${c}`)?.weight).toBe(0);
    for (let seed = 1; seed <= 300; seed++) {
      const city = me(newLife(bundles, seed)).cityId as string;
      expect(city.startsWith("core-loop/")).toBe(true);
    }
  });

  test("cost and wage indexes are game-made and differ by city", () => {
    const wages = ABROAD.map(
      (c) => idx.cities.get(`relocation/${c}`)?.wageIndexBp,
    );
    expect(new Set(wages).size).toBeGreaterThan(4);
    expect(idx.cities.get("relocation/guadalajara")?.costIndexBp).toBeLessThan(
      idx.cities.get("relocation/london")?.costIndexBp as number,
    );
  });

  test("five countries with codes 1 to 5", () => {
    const countries = [...(idx.kinds.get("reloc_country")?.entries ?? [])];
    expect(countries.map(([id]) => id).sort()).toEqual(
      ["canada", "japan", "mexico", "uk", "us"].map((c) => `relocation/${c}`),
    );
    expect(
      countries.map(([, e]) => e.values.code as number).sort(),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  test("every city, six at home and eight abroad, maps to a country", () => {
    const rows = [...(idx.kinds.get("reloc_city_country")?.entries ?? [])].map(
      ([, e]) => [e.values.city, e.values.country],
    );
    expect(rows).toHaveLength(14);
    const country = new Map(rows as [string, string][]);
    for (const c of idx.cities.keys()) expect(country.has(c)).toBe(true);
    expect(country.get("core-loop/goldcrest")).toBe("relocation/us");
    expect(country.get("relocation/osaka")).toBe("relocation/japan");
  });
});
