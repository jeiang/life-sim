import { afterEach, describe, expect, test } from "vitest";
import {
  choose,
  listActions,
  runAction,
  updatePerson,
  type World,
} from "../../../packages/core/src/index.ts";
import {
  bundles,
  forcePicks,
  hire,
  life,
  me,
  q,
  qn,
  R,
  story,
  unforce,
} from "./helpers.ts";

afterEach(unforce);

const HOME = R("move-back-home");
const ABROAD = R("move-city-abroad");
const labels = (id: string) => story(id).choices.map((c) => c.label);
const row = (w: World, id: string) =>
  listActions(w, bundles, "assets/housing").find((r) => r.id === id);

const away = (extra: Record<string, number | boolean> = {}, city = "tokyo") =>
  life({
    city: R(city),
    age: 35,
    q: { reloc_abroad: true, reloc_home_city: 4, reloc_dest: 4, ...extra },
  });

describe("move back home", () => {
  test("needs to be abroad with a known home city, $1,500 and no school", () => {
    expect(row(away(), HOME)?.locked).toBe(false);
    expect(row(life(), HOME)?.locked).toBe(true);
    expect(row(away({ reloc_home_city: 0 }), HOME)?.locked).toBe(true);
    expect(
      row(
        life({
          ...{},
          money: 149999,
          city: R("tokyo"),
          q: { reloc_abroad: true, reloc_home_city: 4 },
        }),
        HOME,
      )?.locked,
    ).toBe(true);
    expect(
      row(
        life({
          money: 150000,
          city: R("tokyo"),
          q: { reloc_abroad: true, reloc_home_city: 4 },
        }),
        HOME,
      )?.locked,
    ).toBe(false);
    expect(row(away(), HOME)?.locked).toBe(false);
  });

  test("shows only the choice for the city left", () => {
    const cities = [
      "dustwater",
      "harborview",
      "maple-falls",
      "riverton",
      "lakeshore",
      "goldcrest",
    ];
    expect(labels(HOME)).toHaveLength(6);
    cities.forEach((c, i) => {
      const w = away({ reloc_home_city: i + 1 });
      const open = runAction(w, bundles, HOME).world;
      const shown = story(HOME).choices.filter((_, k) => k === i);
      expect(shown).toHaveLength(1);
      const done = choose(open, bundles, i).world;
      expect(me(done).cityId).toBe(`core-loop/${c}`);
    });
  });

  test("costs $1,500, clears abroad, counts the return and records the age", () => {
    const w0 = away();
    const w = choose(runAction(w0, bundles, HOME).world, bundles, 3).world;
    expect(me(w).money).toBe(me(w0).money - 150000);
    expect(q(w, "reloc_abroad")).toBe(false);
    expect(qn(w, "reloc_returns")).toBe(1);
    expect(qn(w, "reloc_return_age")).toBe(35);
    expect(q(w, "reloc_job_fork")).toBe(false);
  });

  test("an office job ends, a remote job survives when the boss agrees, retirement stays", () => {
    const office = choose(
      runAction(hire(away(), "core-loop/server"), bundles, HOME).world,
      bundles,
      3,
    ).world;
    expect(me(office).occupations).toEqual([]);
    const remote = away({ has_degree_business: true });
    forcePicks({
      [R("emigrate-job-fork")]:
        "Your boss agrees you can keep working remotely from wherever you land.",
    });
    const kept = choose(
      runAction(hire(remote, "core-loop/junior-analyst"), bundles, HOME).world,
      bundles,
      3,
    ).world;
    expect(me(kept).occupations.map((o) => o.kindId)).toEqual([
      "core-loop/junior-analyst",
    ]);
    unforce();
    const old = updatePerson(away(), away().playerId, (p) => ({
      ...p,
      age: 66,
    }));
    const retired = choose(
      runAction(hire(old, "core-loop/retired"), bundles, HOME).world,
      bundles,
      3,
    ).world;
    expect(me(retired).occupations.map((o) => o.kindId)).toEqual([
      "core-loop/retired",
    ]);
  });
});

describe("move to another city abroad", () => {
  const order = [
    "toronto",
    "montreal",
    "london",
    "manchester",
    "tokyo",
    "osaka",
    "mexico-city",
    "guadalajara",
  ];

  test("needs to be abroad, an adult not at home with parents, with $2,500", () => {
    expect(row(away(), ABROAD)?.locked).toBe(false);
    expect(row(life(), ABROAD)?.locked).toBe(true);
    expect(row(away({}, "tokyo"), ABROAD)?.locked).toBe(false);
    expect(
      row(
        life({ city: R("tokyo"), money: 249999, q: { reloc_abroad: true } }),
        ABROAD,
      )?.locked,
    ).toBe(true);
  });

  test.each(order.map((c, i) => [i, c] as const))(
    "destination %i (%s) costs 2500 dollars and updates the destination",
    (i, city) => {
      // Start from a city that is not the target.
      const from = city === "tokyo" ? "osaka" : "tokyo";
      const w0 = away({}, from);
      const w = choose(runAction(w0, bundles, ABROAD).world, bundles, i).world;
      expect(me(w).cityId).toBe(R(city));
      expect(qn(w, "reloc_dest")).toBe(i);
      expect(me(w).money).toBe(me(w0).money - 250000);
      expect(q(w, "reloc_abroad")).toBe(true);
      expect(qn(w, "reloc_returns")).toBe(0);
    },
  );

  test("the current city is not a choice", () => {
    const w = away({}, "tokyo");
    const open = runAction(w, bundles, ABROAD).world;
    expect(open.pending).not.toBeNull();
    expect(() => choose(open, bundles, 4)).toThrow();
  });

  test("language floors: 20 for a new language, existing skill kept; once a year", () => {
    const w0 = away({ reloc_lang_spanish: 60 }, "tokyo");
    const w = choose(runAction(w0, bundles, ABROAD).world, bundles, 6).world;
    expect(qn(w, "reloc_lang_spanish")).toBe(60);
    const w2 = choose(
      runAction(away(), bundles, ABROAD).world,
      bundles,
      1,
    ).world;
    expect(qn(w2, "reloc_lang_french")).toBe(20);
    expect(row(w2, ABROAD)?.locked).toBe(true);
  });
});
