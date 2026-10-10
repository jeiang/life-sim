import { afterEach, describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  listActions,
  runAction,
  type World,
} from "../../../packages/core/src/index.ts";
import {
  bundles,
  eligible,
  forcePick,
  forcePicks,
  hire,
  life,
  me,
  q,
  qn,
  R,
  stat,
  unforce,
} from "./helpers.ts";

afterEach(unforce);

const APPLY = R("emigrate-apply");
const locked = (w: World, id = APPLY) =>
  listActions(w, bundles, "assets/housing").find((r) => r.id === id)?.locked;
const jobs = (w: World) => me(w).occupations.map((o) => o.kindId);

/** Apply for the choice at `dest` (0 Toronto .. 7 Guadalajara), forcing the approval roll. */
function apply(w: World, dest: number, approved: boolean): World {
  forcePick(R("emigrate-decision"), approved ? 0 : 1);
  const open = runAction(w, bundles, APPLY).world;
  return choose(open, bundles, dest).world;
}

describe("gating", () => {
  test("open to an adult with the $3,000 fee, free of school and prison", () => {
    expect(locked(life())).toBe(false);
    expect(locked(life({ age: 17 }))).toBe(true);
    expect(locked(life({ money: 299999 }))).toBe(true);
    expect(locked(life({ money: 300000 }))).toBe(false);
  });

  test("blocked while enrolled", () => {
    expect(
      locked(
        hire(
          life({ age: 18, q: { graduated_high_school: true } }),
          "core-loop/university-business",
        ),
      ),
    ).toBe(true);
  });

  test("blocked while already abroad or between a move and its job decision", () => {
    expect(locked(life({ q: { reloc_abroad: true } }))).toBe(true);
    expect(locked(life({ q: { reloc_job_fork: true } }))).toBe(true);
  });
});

describe("the approval roll", () => {
  const weights = (w: World) => {
    const rows = eligible(w, "emigrate-decision");
    return { yes: rows[0]?.weight as number, no: rows[1]?.weight as number };
  };

  test("approve and deny weights are complementary and clamped to 5..95", () => {
    const poor = weights(life({ money: 0, smarts: 0 }));
    expect(poor.yes).toBe(40);
    expect(poor.yes + poor.no).toBe(100);
    const star = weights(
      life({
        money: 90000000,
        smarts: 100,
        q: {
          has_degree_engineering: true,
          years_worked: 30,
        },
      }),
    );
    expect(star.yes).toBe(95);
    expect(star.yes + star.no).toBe(100);
  });

  test("smarts, degree, work history and money each raise approval; denials lower it", () => {
    const base = weights(life({ smarts: 50, money: 1000000 })).yes;
    expect(weights(life({ smarts: 100, money: 1000000 })).yes).toBeGreaterThan(
      base,
    );
    expect(
      weights(life({ q: { has_degree_arts: true }, money: 1000000 })).yes,
    ).toBe(base + 10);
    expect(weights(life({ q: { years_worked: 8 } })).yes).toBe(base + 8);
    expect(weights(life({ q: { years_worked: 50 } })).yes).toBe(base + 15);
    expect(weights(life({ money: 11000000 })).yes).toBe(base + 10 - 1);
    expect(weights(life({ q: { reloc_denials: 2 } })).yes).toBe(base - 10);
    expect(weights(life({ q: { reloc_denials: 9 } })).yes).toBe(base - 15);
  });
});

describe("denial", () => {
  test("costs the fee, changes nothing else, and the retry opens next year", () => {
    const w0 = life();
    const w = apply(w0, 4, false);
    expect(me(w).money).toBe(me(w0).money - 300000);
    expect(qn(w, "reloc_applications")).toBe(1);
    expect(qn(w, "reloc_denials")).toBe(1);
    expect(q(w, "reloc_pending")).toBe(false);
    expect(q(w, "reloc_abroad")).toBe(false);
    expect(me(w).cityId).toBe(me(w0).cityId);
    expect(stat(w, "happiness")).toBe(stat(w0, "happiness") - 4);
    expect(locked(w)).toBe(true);
  });

  test("the retry is offered again at the next age-up", () => {
    const w = apply(life({ age: 30 }), 4, false);
    expect(locked(w)).toBe(true);
    let n = ageUp(w, bundles);
    let guard = 0;
    while (n.world.pending && guard++ < 20) n = choose(n.world, bundles, 0);
    expect(locked(n.world)).toBe(false);
  });
});

describe("approval and arrival", () => {
  const cities = [
    ["toronto", "english"],
    ["montreal", "french"],
    ["london", "english"],
    ["manchester", "english"],
    ["tokyo", "japanese"],
    ["osaka", "japanese"],
    ["mexico-city", "spanish"],
    ["guadalajara", "spanish"],
  ] as const;

  test.each(cities.map((c, i) => [i, ...c] as const))(
    "destination %i lands in %s with the %s floor",
    (i, city, lang) => {
      const w0 = life({ city: "core-loop/riverton" });
      const w = apply(w0, i, true);
      expect(me(w).cityId).toBe(R(city));
      expect(q(w, "reloc_abroad")).toBe(true);
      expect(qn(w, "reloc_dest")).toBe(i);
      expect(q(w, "reloc_pending")).toBe(false);
      expect(qn(w, "reloc_pending_dest")).toBe(0);
      expect(qn(w, "reloc_emigrations")).toBe(1);
      expect(qn(w, "reloc_applications")).toBe(1);
      expect(qn(w, "reloc_denials")).toBe(0);
      expect(me(w).money).toBe(me(w0).money - 300000);
      expect(qn(w, `reloc_lang_${lang}`)).toBe(lang === "english" ? 100 : 20);
      expect(qn(w, "reloc_home_city")).toBe(4);
      expect(qn(w, "reloc_home_country")).toBe(1);
    },
  );

  test("the language floor never lowers a skill above 20", () => {
    const w = apply(life({ q: { reloc_lang_japanese: 55 } }), 4, true);
    expect(qn(w, "reloc_lang_japanese")).toBe(55);
  });

  test("home city index follows the core-loop order", () => {
    const order = [
      "dustwater",
      "harborview",
      "maple-falls",
      "riverton",
      "lakeshore",
      "goldcrest",
    ];
    order.forEach((c, i) => {
      const w = apply(life({ city: `core-loop/${c}` }), 0, true);
      expect(qn(w, "reloc_home_city")).toBe(i + 1);
    });
  });
});

describe("the job fork", () => {
  test("no job: nothing to lose", () => {
    const w = apply(life(), 0, true);
    expect(jobs(w)).toEqual([]);
    expect(q(w, "reloc_job_fork")).toBe(false);
  });

  test("an office job ends with the move", () => {
    const w = apply(hire(life(), "core-loop/server"), 0, true);
    expect(jobs(w)).toEqual([]);
    expect(me(w).occupationHistory.at(-1)?.kindId).toBe("core-loop/server");
  });

  test("a part-time job ends with the move", () => {
    const w = apply(hire(life(), "core-loop/cashier"), 0, true);
    expect(jobs(w)).toEqual([]);
  });

  test("retirement pay continues", () => {
    const w = apply(hire(life({ age: 66 }), "core-loop/retired"), 0, true);
    expect(jobs(w)).toEqual(["core-loop/retired"]);
  });

  const remote = () =>
    hire(
      life({ q: { has_degree_business: true } }),
      "core-loop/junior-analyst",
    );

  test("a remote job survives when the boss agrees", () => {
    forcePicks({
      [R("emigrate-decision")]: 0,
      [R("emigrate-job-fork")]:
        "Your boss agrees you can keep working remotely from wherever you land.",
    });
    const w = choose(
      runAction(remote(), bundles, APPLY).world,
      bundles,
      0,
    ).world;
    expect(jobs(w)).toEqual(["core-loop/junior-analyst"]);
    expect(q(w, "reloc_abroad")).toBe(true);
    expect(q(w, "reloc_job_fork")).toBe(false);
  });

  test("a remote job ends when the boss wants the office", () => {
    forcePicks({
      [R("emigrate-decision")]: 0,
      [R("emigrate-job-fork")]:
        "Your boss wants you in the office, so the job goes with the move.",
    });
    const w = choose(
      runAction(remote(), bundles, APPLY).world,
      bundles,
      0,
    ).world;
    expect(jobs(w)).toEqual([]);
    expect(q(w, "reloc_abroad")).toBe(true);
  });
});

describe("the boss roll", () => {
  test("weights follow smarts, effort and years worked and add to 100", () => {
    const w = hire(
      life({
        smarts: 50,
        q: { work_effort: 3, years_worked: 4, has_degree_business: true },
      }),
      "core-loop/junior-analyst",
    );
    const rows = eligible(w, "emigrate-job-fork");
    expect(rows.map((r) => r.weight)).toEqual([
      40 + 10 + 18 + 4,
      100 - (40 + 10 + 18 + 4),
    ]);
  });
});
