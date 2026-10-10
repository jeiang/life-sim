import { describe, expect, test } from "vitest";
import {
  listActions,
  startStorylet,
  type World,
} from "../../../packages/core/src/index.ts";
import { bundles, eligible, life, me, qn, R, story } from "./helpers.ts";

const GROW = R("abroad-language-growth");
const BARRIER = R("abroad-language-barrier");
const at = (city: string, extra: Record<string, number | boolean> = {}) =>
  life({ age: 35, city: R(city), q: { reloc_abroad: true, ...extra } });
const opens = (w: World, id: string) =>
  startStorylet(w, bundles, id).world !== w;

const LANG: Record<string, string> = {
  tokyo: "japanese",
  osaka: "japanese",
  "mexico-city": "spanish",
  guadalajara: "spanish",
  montreal: "french",
};

describe("growth", () => {
  test.each(Object.entries(LANG))("%s grows %s by 3 a year", (city, lang) => {
    const w0 = at(city, { [`reloc_lang_${lang}`]: 30 });
    expect(opens(w0, GROW)).toBe(true);
    const outs = eligible(w0, "abroad-language-growth");
    expect(outs).toHaveLength(2);
    const w = startStorylet(w0, bundles, GROW).world;
    expect(qn(w, `reloc_lang_${lang}`)).toBe(33);
  });

  test("English cities, the homeland and a mastered language stay closed", () => {
    for (const c of ["toronto", "london", "manchester"])
      expect(opens(at(c), GROW)).toBe(false);
    expect(opens(life({ age: 35, city: R("tokyo") }), GROW)).toBe(false);
    expect(opens(at("tokyo", { reloc_lang_japanese: 100 }), GROW)).toBe(false);
  });

  test("only the destination's language grows", () => {
    const w = startStorylet(at("tokyo"), bundles, GROW).world;
    expect(qn(w, "reloc_lang_spanish")).toBe(0);
    expect(qn(w, "reloc_lang_french")).toBe(0);
  });
});

describe("barrier", () => {
  test("below 40 skill each year costs 1 happiness", () => {
    for (const [city, lang] of Object.entries(LANG)) {
      const w0 = at(city, { [`reloc_lang_${lang}`]: 39 });
      const w = startStorylet(w0, bundles, BARRIER).world;
      expect(me(w).stats.happiness).toBe(me(w0).stats.happiness - 1);
    }
  });

  test("from 40 skill, or in English, or at home, it does not open", () => {
    expect(opens(at("tokyo", { reloc_lang_japanese: 40 }), BARRIER)).toBe(
      false,
    );
    expect(opens(at("london"), BARRIER)).toBe(false);
    expect(opens(life({ age: 35, city: R("tokyo") }), BARRIER)).toBe(false);
    expect(story(BARRIER).outcomes).toHaveLength(2);
  });
});

describe("job friction", () => {
  const blocked = (w: World) =>
    listActions(w, bundles, "activities/job-board").find(
      (r) => r.id === "core-loop/apply-junior-analyst",
    );

  test("under 20 skill abroad blocks professional applications; 20 does not", () => {
    const degree = { has_degree_business: true };
    expect(
      blocked(at("tokyo", { ...degree, reloc_lang_japanese: 19 }))?.locked,
    ).toBe(true);
    expect(
      blocked(at("tokyo", { ...degree, reloc_lang_japanese: 20 }))?.locked,
    ).toBe(false);
    expect(
      blocked(at("mexico-city", { ...degree, reloc_lang_spanish: 0 }))?.locked,
    ).toBe(true);
    expect(
      blocked(at("montreal", { ...degree, reloc_lang_french: 19 }))?.locked,
    ).toBe(true);
  });

  test("English cities never block, and neither does home", () => {
    const degree = { has_degree_business: true };
    expect(blocked(at("london", degree))?.locked).toBe(false);
    expect(blocked(life({ age: 35, q: degree }))?.locked).toBe(false);
  });
});
