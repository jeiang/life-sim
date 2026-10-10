import { afterEach, describe, expect, test } from "vitest";
import {
  startStorylet,
  updatePerson,
  type World,
} from "../../../packages/core/src/index.ts";
import {
  bundles,
  closeness,
  eligible,
  forcePick,
  life,
  me,
  q,
  qn,
  R,
  rows,
  story,
  unforce,
} from "./helpers.ts";

afterEach(unforce);

const DOMESTIC = R("child-move-domestic");
const ABROAD = R("child-move-abroad");
const kid = (
  age: number,
  city: string,
  extra: Record<string, number | boolean> = {},
): World =>
  life({ age, city, withParents: true, seed: 11, q: extra, smarts: 50 });
const open = (w: World, id: string) => startStorylet(w, bundles, id).world;
const US = [
  "dustwater",
  "harborview",
  "maple-falls",
  "riverton",
  "lakeshore",
  "goldcrest",
].map((c) => `core-loop/${c}`);

describe("gating", () => {
  test.each([
    [DOMESTIC, "domestic"],
    [ABROAD, "abroad"],
  ])("%s opens for 5 to 17 living with parents only", (id) => {
    const city = "core-loop/riverton";
    const ten = kid(10, city);
    expect(open(ten, id)).not.toBe(ten);
    const same = (w: World) => open(w, id) === w;
    expect(same(kid(4, city))).toBe(true);
    expect(same(kid(18, city))).toBe(true);
    expect(same(life({ age: 10, city, withParents: false }))).toBe(true);
  });

  test("a second move in the same year is blocked", () => {
    const w = kid(10, "core-loop/riverton", { reloc_child_move_age: 10 });
    expect(open(w, DOMESTIC)).toBe(w);
    expect(open(w, ABROAD)).toBe(w);
  });

  test("the abroad move is not offered to a child already abroad", () => {
    const w = kid(10, R("tokyo"), { reloc_abroad: true });
    expect(open(w, ABROAD)).toBe(w);
  });
});

describe("domestic move", () => {
  test("a US child can land in any of the five other cities, at equal weight", () => {
    for (const from of US) {
      const rowsNow = eligible(kid(10, from), "child-move-domestic");
      expect(rowsNow).toHaveLength(5);
      expect(new Set(rowsNow.map((r) => r.weight))).toEqual(new Set([1]));
    }
  });

  test("effects: new city, -3 happiness, -1 smarts, the move age", () => {
    const w0 = kid(10, "core-loop/riverton");
    const first = story(DOMESTIC).outcomes.find((o) =>
      String(o.text).startsWith("The moving truck"),
    );
    forcePick(DOMESTIC, first?.text as string);
    const w = open(w0, DOMESTIC);
    expect(me(w).cityId).toBe("core-loop/dustwater");
    expect(me(w).stats.happiness).toBe(me(w0).stats.happiness - 3);
    expect(me(w).stats.smarts).toBe(me(w0).stats.smarts - 1);
    expect(qn(w, "reloc_child_move_age")).toBe(10);
    expect(q(w, "reloc_abroad")).toBe(false);
  });

  test("a child abroad moves only to the partner city of the same country, with a floor", () => {
    const pairs: [string, string, string | null][] = [
      ["montreal", "toronto", null],
      ["toronto", "montreal", "french"],
      ["manchester", "london", null],
      ["london", "manchester", null],
      ["osaka", "tokyo", "japanese"],
      ["tokyo", "osaka", "japanese"],
      ["guadalajara", "mexico-city", "spanish"],
      ["mexico-city", "guadalajara", "spanish"],
    ];
    for (const [from, to, lang] of pairs) {
      const w0 = kid(12, R(from), { reloc_abroad: true });
      expect(eligible(w0, "child-move-domestic")).toHaveLength(1);
      const w = open(w0, DOMESTIC);
      expect(me(w).cityId).toBe(R(to));
      expect(q(w, "reloc_abroad")).toBe(true);
      if (lang) expect(qn(w, `reloc_lang_${lang}`)).toBe(40);
    }
  });
});

describe("abroad move", () => {
  const dests: [string, string | null][] = [
    ["toronto", null],
    ["montreal", "french"],
    ["london", null],
    ["manchester", null],
    ["tokyo", "japanese"],
    ["osaka", "japanese"],
    ["mexico-city", "spanish"],
    ["guadalajara", "spanish"],
  ];
  test("eight equal outcomes", () => {
    const rowsNow = eligible(kid(10, "core-loop/lakeshore"), "child-move-abroad");
    expect(rowsNow).toHaveLength(8);
    expect(new Set(rowsNow.map((r) => r.weight))).toEqual(new Set([1]));
  });

  test.each(dests.map((d, i) => [i, ...d] as const))(
    "outcome %i lands in %s with floor %s",
    (i, city, lang) => {
      const w0 = kid(10, "core-loop/lakeshore");
      forcePick(ABROAD, i);
      const w = open(w0, ABROAD);
      unforce();
      expect(me(w).cityId).toBe(R(city));
      expect(q(w, "reloc_abroad")).toBe(true);
      expect(me(w).stats.happiness).toBe(me(w0).stats.happiness - 5);
      expect(me(w).stats.smarts).toBe(me(w0).stats.smarts - 2);
      expect(qn(w, "reloc_child_move_age")).toBe(10);
      expect(qn(w, "reloc_home_city")).toBe(5);
      expect(qn(w, "reloc_home_country")).toBe(1);
      if (lang) expect(qn(w, `reloc_lang_${lang}`)).toBe(40);
      else expect(qn(w, "reloc_lang_french")).toBe(0);
    },
  );
});

describe("friends lose touch", () => {
  const ID = R("childhood-friends-lose-touch");
  /** Make the first sibling a friend aged `age`. */
  function withFriend(w: World, age: number): { w: World; id: string } {
    const r = rows(w, "sibling")[0];
    if (!r) throw new Error("no sibling");
    const w2 = {
      ...w,
      relationships: w.relationships.map((x) =>
        x.from === w.playerId && x.to === r.to
          ? { ...x, role: "core-loop/friend", closeness: 50 }
          : x,
      ),
    };
    return {
      w: updatePerson(w2, r.to, (p) => ({ ...p, age })),
      id: r.to,
    };
  }

  test("the year of the move, a child friend drifts by 3", () => {
    const { w, id } = withFriend(
      kid(10, "core-loop/riverton", { reloc_child_move_age: 10 }),
      10,
    );
    expect(closeness(startStorylet(w, bundles, ID, id).world, id)).toBe(47);
  });

  test("not in other years, and not for an adult friend", () => {
    const quiet = withFriend(
      kid(10, "core-loop/riverton", { reloc_child_move_age: 9 }),
      10,
    );
    expect(startStorylet(quiet.w, bundles, ID, quiet.id).world).toBe(quiet.w);
    const adult = withFriend(
      kid(10, "core-loop/riverton", { reloc_child_move_age: 10 }),
      30,
    );
    expect(startStorylet(adult.w, bundles, ID, adult.id).world).toBe(adult.w);
  });
});
