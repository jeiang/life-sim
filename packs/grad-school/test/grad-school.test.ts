import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  deserializeWorld,
  getPerson,
  indexBundles,
  listActions,
  milestoneReached,
  newLife,
  type PackBundle,
  replay,
  runAction,
  serializeWorld,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), { only: ["grad-school"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);

const G = (id: string) => `grad-school/${id}`;
const me = (w: World) => getPerson(w, w.playerId);
const q = (w: World, id: string) => me(w).qualities[id] as number | boolean;
const stat = (w: World, id: string) => me(w).stats[id] as number;
const held = (w: World, kind: string) =>
  me(w).occupations.some((o) => o.kindId === kind);

/** A life at `age` with `money` and the given qualities; stats at 50 unless `smarts` is given. */
function at(
  age: number,
  quals: Record<string, number | boolean> = {},
  opts: { money?: number; smarts?: number; seed?: number } = {},
): World {
  const w = newLife(bundles, opts.seed ?? 5);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age,
    money: opts.money ?? 100_000_000,
    occupations: [],
    qualities: { ...p.qualities, ...quals },
    stats: {
      ...p.stats,
      happiness: 50,
      health: 50,
      smarts: opts.smarts ?? 50,
      looks: 50,
    },
  }));
}

const row = (w: World, menu: string, id: string) =>
  listActions(w, bundles, menu).find((r) => r.id === id);

/** Copy of the bundles where one storylet's outcomes (optionally in one choice) keep only weight on `pick`. */
function only(
  storyletId: string,
  choice: number | null,
  pick: number,
): PackBundle[] {
  const copy = structuredClone(bundles) as PackBundle[];
  for (const b of copy)
    for (const s of b.storylets) {
      if (s.id !== storyletId) continue;
      const outs = choice === null ? s.outcomes : s.choices[choice]?.outcomes;
      outs?.forEach((o, i) => {
        (o as { weight: unknown }).weight = i === pick ? 1 : 0;
      });
    }
  return copy;
}

/** Open an event storylet now and answer any open choice with `pick`. */
function fire(w: World, id: string, b: PackBundle[] = bundles, pick = 0) {
  let r = startStorylet(w, b, id).world;
  while (r.pending) r = choose(r, b, pick).world;
  return r;
}

/** Age up one year, answering any open choice with the first option. */
function year(w: World, b: PackBundle[] = bundles): World {
  let r = ageUp(w, b).world;
  while (r.pending) r = choose(r, b, 0).world;
  return r;
}

const BACH = {
  has_degree_business: true,
  has_degree_engineering: true,
  has_degree_nursing: true,
  has_degree_arts: true,
  graduated_high_school: true,
};

const ENROLLED = (program: number, tuition: number) => ({
  ...BACH,
  grad_program: program,
  grad_tuition: tuition,
  grad_gpa: 60,
});

describe("pack shape", () => {
  test("compiles with only its required closure", () => {
    expect(real.diagnostics).toEqual([]);
    expect(real.bundles.map((b) => b.id)).toContain("grad-school");
  });

  test("the graduate loan is 6.5% over 20 years", () => {
    const l = idx.loans.get(G("grad-loan"));
    expect(l?.rateBp).toBe(650);
    expect(l?.termYears).toBe(20);
  });

  test("school stages run 4, 3, 2 and 5 years", () => {
    const years = [
      "medical-school",
      "law-school",
      "mba-program",
      "phd-program",
    ].map((s) => idx.occupations.get(G(`grad-${s}`))?.durationYears);
    expect(years).toEqual([4, 3, 2, 5]);
  });

  test("no grad occupation is given to NPCs", () => {
    for (const [id, k] of idx.occupations)
      if (id.startsWith("grad-school/")) expect(k.npc, id).toBe(false);
  });

  test("ladders promote as the outline says", () => {
    const rung = (id: string) => idx.occupations.get(G(id));
    expect([
      rung("resident-doctor")?.promotesTo,
      rung("resident-doctor")?.promotionYears,
    ]).toEqual([G("attending-doctor"), 3]);
    expect(rung("attending-doctor")?.promotionYears).toBe(6);
    expect(rung("chief-of-medicine")?.promotesTo).toBeUndefined();
    expect(rung("associate-lawyer")?.promotionYears).toBe(4);
    expect(rung("partner-lawyer")?.promotesTo).toBeUndefined();
    expect(rung("business-manager")?.promotionYears).toBe(5);
    expect(rung("postdoc")?.promotionYears).toBe(2);
    expect(rung("assistant-professor")?.promotionYears).toBe(4);
    expect(rung("associate-professor")?.promotionYears).toBe(5);
    expect(rung("full-professor")?.promotesTo).toBeUndefined();
  });
});

describe("admission gating", () => {
  const apply: [
    string,
    string,
    Record<string, boolean>,
    Record<string, boolean>,
  ][] = [
    [
      "apply-medical-school",
      "medical",
      { has_degree_nursing: true },
      { has_degree_business: true },
    ],
    [
      "apply-law-school",
      "law",
      { has_degree_arts: true },
      { has_degree_nursing: true },
    ],
    [
      "apply-mba",
      "mba",
      { has_degree_engineering: true },
      { has_degree_arts: true },
    ],
    ["apply-phd", "phd", { has_degree_arts: true }, {}],
  ];
  for (const [id, degree, yes, no] of apply)
    test(`${id} needs the prerequisite degree, age 22, no school and no degree yet`, () => {
      const r = (w: World) => row(w, "occupation/education", G(id));
      expect(r(at(30, yes))?.locked).toBe(false);
      expect(r(at(30, no))?.locked).toBe(true);
      expect(r(at(21, yes))?.locked).toBe(true);
      expect(
        r(at(30, { ...yes, [`grad_degree_${degree}`]: true }))?.locked,
      ).toBe(true);
      expect(r(at(30, { ...yes, grad_program: 2 }))?.locked).toBe(true);
    });

  test("a rejection can be retried only after a year (cooldown 1)", () => {
    const b = only(G("apply-medical-school"), null, 1);
    let w = at(30, { has_degree_nursing: true }, { smarts: 10 });
    w = runAction(w, b, G("apply-medical-school")).world;
    expect(q(w, "grad_program")).toBe(0);
    expect(stat(w, "happiness")).toBe(48);
    expect(
      row(w, "occupation/education", G("apply-medical-school"))?.locked,
    ).toBe(true);
    w = year(w, b);
    expect(
      row(w, "occupation/education", G("apply-medical-school"))?.locked,
    ).toBe(false);
  });

  test("admission chance rises with the smarts band", () => {
    const outs = idx.storylets.get(G("apply-medical-school"))?.outcomes ?? [];
    expect(outs.length).toBe(6);
    // admit weights per band (low, mid, high) out of 100
    expect(outs.map((o) => o.next ?? null)).toEqual([
      G("admit-medical-school"),
      null,
      G("admit-medical-school"),
      null,
      G("admit-medical-school"),
      null,
    ]);
  });
});

describe("enrolment", () => {
  for (const [admit, apply, program, tuition, occ, id] of [
    [
      "admit-medical-school",
      "apply-medical-school",
      1,
      3_000_000,
      "grad-medical-school",
      "has_degree_nursing",
    ],
    [
      "admit-law-school",
      "apply-law-school",
      2,
      2_400_000,
      "grad-law-school",
      "has_degree_arts",
    ],
    [
      "admit-mba",
      "apply-mba",
      3,
      2_000_000,
      "grad-mba-program",
      "has_degree_business",
    ],
    ["admit-phd", "apply-phd", 4, 0, "grad-phd-program", "has_degree_arts"],
  ] as const)
    test(`${admit} enrols into ${occ}`, () => {
      const b = only(G(apply), null, 0);
      // weights 0 everywhere except outcome 0; force the low-smarts admit
      let w = at(30, { [id]: true }, { smarts: 10 });
      w = runAction(w, b, G(apply)).world;
      while (w.pending) w = choose(w, b, 0).world;
      expect(q(w, "grad_program")).toBe(program);
      expect(q(w, "grad_tuition")).toBe(tuition);
      expect(held(w, G(occ))).toBe(true);
      expect(q(w, "grad_gpa")).toBe(40 + Math.trunc(10 / 3));
    });
});

describe("tuition and funding", () => {
  test("cash pays the stage's pay every year", () => {
    const w = at(
      30,
      { ...ENROLLED(1, 3_000_000), grad_degree_medical: false },
      { money: 20_000_000 },
    );
    const started = updatePerson(
      startStorylet(w, bundles, G("admit-medical-school")).world,
      w.playerId,
      (p) => p,
    );
    expect(held(started, G("grad-medical-school"))).toBe(true);
    const before = me(started).money;
    const after = year(started);
    expect(before - me(after).money).toBeGreaterThanOrEqual(3_000_000);
  });

  test("tuition due is cut by the scholarship then the parents' share", () => {
    const base = fire(
      at(30, { ...BACH }, { money: 50_000_000 }),
      G("admit-medical-school"),
    );
    const set = (quals: Record<string, number>) =>
      updatePerson(base, base.playerId, (p) => ({
        ...p,
        qualities: { ...p.qualities, ...quals },
      }));
    const free = me(year(set({ grad_tuition: 0 }))).money;
    const paid = (quals: Record<string, number>) =>
      free - me(year(set(quals))).money;
    expect(paid({})).toBe(3_000_000);
    expect(paid({ grad_scholarship: 50 })).toBe(1_500_000);
    expect(paid({ grad_scholarship: 100 })).toBe(0);
    expect(paid({ grad_parents: 100 })).toBe(0);
    expect(paid({ grad_scholarship: 50, grad_parents: 50 })).toBe(750_000);
  });

  test("borrowing adds the tuition due to grad_debt each year and saves the cash", () => {
    const base = fire(
      at(30, { ...BACH }, { money: 50_000_000 }),
      G("admit-law-school"),
    );
    const loan = updatePerson(base, base.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, grad_loan: true },
    }));
    const a = year(base);
    const b = year(loan);
    expect(q(a, "grad_debt")).toBe(0);
    expect(q(b, "grad_debt")).toBe(2_400_000);
    expect(me(b).money - me(a).money).toBe(2_400_000);
    expect(q(year(b), "grad_debt")).toBe(4_800_000);
  });

  test("a player who cannot cover the year in cash is moved onto the loan", () => {
    let w = fire(at(30, { ...BACH }, { money: 100 }), G("admit-law-school"));
    w = year(w);
    expect(q(w, "grad_loan")).toBe(true);
    expect(q(w, "grad_debt")).toBe(2_400_000);
  });

  test("the PhD pays a stipend and has no tuition", () => {
    let w = fire(at(30, { ...BACH }, { money: 1_000_000 }), G("admit-phd"));
    expect(q(w, "grad_tuition")).toBe(0);
    const cash = me(w).money;
    w = year(w);
    expect(me(w).money).toBeGreaterThan(cash);
    expect(q(w, "grad_debt")).toBe(0);
    expect(row(w, "occupation/education", G("take-grad-loan"))?.locked).toBe(
      true,
    );
  });

  test("cash and loan actions switch the mix", () => {
    let w = fire(at(30, { ...BACH }), G("admit-mba"));
    expect(row(w, "occupation/education", G("take-grad-loan"))?.locked).toBe(
      false,
    );
    w = runAction(w, bundles, G("take-grad-loan")).world;
    expect(q(w, "grad_loan")).toBe(true);
    expect(row(w, "occupation/education", G("pay-tuition-cash"))?.locked).toBe(
      false,
    );
    w = year(w);
    w = runAction(w, bundles, G("pay-tuition-cash")).world;
    expect(q(w, "grad_loan")).toBe(false);
  });

  test("parents' answer follows closeness times family wealth", () => {
    const outs = idx.storylets.get(G("ask-parents-tuition"))?.outcomes ?? [];
    expect(outs.length).toBe(3);
    const yes = only(G("ask-parents-tuition"), null, 0);
    let w = fire(at(30, { ...BACH }), G("admit-mba"));
    w = runAction(w, yes, G("ask-parents-tuition")).world;
    expect(q(w, "grad_parents")).toBe(100);
    expect(
      row(w, "occupation/education", G("ask-parents-tuition"))?.locked,
    ).toBe(true);
    const half = only(G("ask-parents-tuition"), null, 1);
    let v = fire(at(30, { ...BACH }), G("admit-mba"));
    v = runAction(v, half, G("ask-parents-tuition")).world;
    expect(q(v, "grad_parents")).toBe(50);
    const no = only(G("ask-parents-tuition"), null, 2);
    let u = fire(at(30, { ...BACH }), G("admit-mba"));
    u = runAction(u, no, G("ask-parents-tuition")).world;
    expect(q(u, "grad_parents")).toBe(0);
  });
});

describe("scholarship", () => {
  const enrolled = (schol: number, gpa: number) =>
    updatePerson(fire(at(30, { ...BACH }), G("admit-mba")), 1, (p) => p) &&
    (() => {
      const w = fire(at(30, { ...BACH }), G("admit-mba"));
      return updatePerson(w, w.playerId, (p) => ({
        ...p,
        qualities: { ...p.qualities, grad_scholarship: schol, grad_gpa: gpa },
      }));
    })();

  test("offers: any step needs smarts; weights follow the formula", () => {
    const outs = idx.storylets.get(G("grad-scholarship-offer"))?.outcomes ?? [];
    expect(outs.length).toBe(5);
    const lowest = fire(at(30, { ...BACH }, { smarts: 0 }), G("admit-mba"));
    // smarts 0: partial and full weights are 0, only form letters remain
    expect(q(lowest, "grad_scholarship")).toBe(0);
  });

  test("full offer, partial offer and none are all reachable", () => {
    for (const [pick, expected] of [
      [0, 0],
      [1, 0],
      [2, 50],
      [3, 50],
      [4, 100],
    ] as const) {
      const b = only(G("grad-scholarship-offer"), null, pick);
      const w = fire(at(30, { ...BACH }, { smarts: 100 }), G("admit-mba"), b);
      expect(q(w, "grad_scholarship"), `outcome ${pick}`).toBe(expected);
    }
  });

  test("grades 70+ keep a full and a partial scholarship", () => {
    for (const s of [100, 50]) {
      const w = fire(enrolled(s, 80), G("grad-scholarship-review"));
      expect(q(w, "grad_scholarship")).toBe(s);
    }
  });

  test("grades 50-69: full -> partial, partial stays", () => {
    expect(
      q(
        fire(enrolled(100, 60), G("grad-scholarship-review")),
        "grad_scholarship",
      ),
    ).toBe(50);
    expect(
      q(
        fire(enrolled(50, 60), G("grad-scholarship-review")),
        "grad_scholarship",
      ),
    ).toBe(50);
  });

  test("grades under 50: full -> partial, partial -> none", () => {
    expect(
      q(
        fire(enrolled(100, 40), G("grad-scholarship-review")),
        "grad_scholarship",
      ),
    ).toBe(50);
    const w0 = enrolled(50, 40);
    const none = fire(w0, G("grad-scholarship-review"));
    expect(q(none, "grad_scholarship")).toBe(0);
    expect(stat(none, "happiness")).toBe(stat(w0, "happiness") - 2);
  });

  test("a step-down opens the funding gap and the lost amount falls to the other options", () => {
    const w0 = enrolled(100, 40);
    const r = startStorylet(w0, bundles, G("grad-scholarship-review"));
    expect(r.world.pending?.storyletId).toBe(G("grad-funding-gap"));
    // the tuition due went from 0 to half of 2,000,000
    const readable = (w: World) => startStorylet && me(w);
    expect(readable(r.world)).toBeTruthy();
    // borrow the extra
    const names =
      idx.storylets.get(G("grad-funding-gap"))?.choices.map((c) => c.label) ??
      [];
    expect(names).toContain("Borrow the extra");
    const borrow = choose(
      r.world,
      bundles,
      names.indexOf("Borrow the extra"),
    ).world;
    expect(q(borrow, "grad_loan")).toBe(true);
    const after = year(borrow);
    expect(q(after, "grad_debt")).toBe(1_000_000);
    // ask the parents (forced yes)
    const yes = only(
      G("grad-funding-gap"),
      names.indexOf("Ask your parents to cover more"),
      0,
    );
    const r2 = startStorylet(w0, yes, G("grad-scholarship-review"));
    const w2 = choose(
      r2.world,
      yes,
      names.indexOf("Ask your parents to cover more"),
    ).world;
    expect(q(w2, "grad_parents")).toBe(100);
    // keep paying: cash covers it
    const keep = choose(
      startStorylet(w0, bundles, G("grad-scholarship-review")).world,
      bundles,
      0,
    ).world;
    const free = updatePerson(keep, keep.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, grad_tuition: 0 },
    }));
    expect(me(year(free)).money - me(year(keep)).money).toBe(1_000_000);
  });

  test("a suspended or dishonest player loses the scholarship straight to none", () => {
    const w = updatePerson(enrolled(100, 90), 1, (p) => p);
    const cheat = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, grad_cheated: true },
    }));
    const caught = only(G("grad-dishonesty-case"), null, 0);
    const r = startStorylet(cheat, caught, G("grad-dishonesty-case")).world;
    expect(q(r, "grad_scholarship")).toBe(0);
    expect(q(r, "grad_cheated")).toBe(false);
    expect(r.pending?.storyletId).toBe(G("grad-funding-gap"));
    const escaped = fire(
      cheat,
      G("grad-dishonesty-case"),
      only(G("grad-dishonesty-case"), null, 2),
    );
    expect(q(escaped, "grad_scholarship")).toBe(100);
    expect(q(escaped, "grad_cheated")).toBe(false);
  });

  test("a review of a player without a scholarship is dropped", () => {
    const r = startStorylet(
      enrolled(0, 90),
      bundles,
      G("grad-scholarship-review"),
    );
    expect(r.world.pending).toBeNull();
    expect(q(r.world, "grad_scholarship")).toBe(0);
  });
});

describe("programs end", () => {
  test("a medical degree in four years converts the debt into a graduate loan", () => {
    let w = fire(
      at(30, { ...BACH }, { money: 5_000_000 }),
      G("admit-medical-school"),
      bundles,
    );
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, grad_loan: true },
    }));
    for (let i = 0; i < 4; i++) w = year(w);
    expect(held(w, G("grad-medical-school"))).toBe(false);
    expect(q(w, "grad_degree_medical")).toBe(true);
    expect(q(w, "grad_program")).toBe(0);
    expect(q(w, "grad_debt")).toBe(0);
    expect(q(w, "grad_loan")).toBe(false);
    expect(me(w).loans.some((l) => l.kindId === G("grad-loan"))).toBe(true);
    expect(milestoneReached(w, "grad_medical_graduated")).toBe(true);
    expect(
      row(w, "occupation/education", G("apply-medical-school"))?.locked,
    ).toBe(true);
  });

  for (const [admit, occ, years, degree] of [
    ["admit-law-school", "grad-law-school", 3, "grad_degree_law"],
    ["admit-mba", "grad-mba-program", 2, "grad_degree_mba"],
    ["admit-phd", "grad-phd-program", 5, "grad_degree_phd"],
  ] as const)
    test(`${occ} graduates after ${years} years and sets ${degree}`, () => {
      let w = fire(at(30, { ...BACH }, { money: 99_000_000 }), G(admit));
      for (let i = 0; i < years - 1; i++) {
        w = year(w);
        expect(held(w, G(occ))).toBe(true);
        expect(q(w, degree)).toBe(false);
      }
      w = year(w);
      expect(held(w, G(occ))).toBe(false);
      expect(q(w, degree)).toBe(true);
      expect(q(w, "grad_program")).toBe(0);
    });

  test("dropping out ends the stage without a degree and still converts the debt", () => {
    let w = fire(at(30, { ...BACH }, { money: 99_000_000 }), G("admit-mba"));
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, grad_loan: true },
    }));
    w = year(w);
    expect(q(w, "grad_debt")).toBe(2_000_000);
    w = runAction(w, bundles, G("drop-out-grad")).world;
    expect(held(w, G("grad-mba-program"))).toBe(false);
    expect(q(w, "grad_degree_mba")).toBe(false);
    expect(q(w, "grad_program")).toBe(0);
    expect(q(w, "grad_debt")).toBe(0);
    expect(me(w).loans.some((l) => l.kindId === G("grad-loan"))).toBe(true);
    // the scheduled graduation never fires, and the school can be applied to again
    for (let i = 0; i < 4; i++) w = year(w);
    expect(q(w, "grad_degree_mba")).toBe(false);
    expect(row(w, "occupation/education", G("apply-mba"))?.locked).toBe(false);
  });

  test("studying raises grades", () => {
    let w = fire(at(30, { ...BACH }), G("admit-mba"));
    const g = q(w, "grad_gpa") as number;
    w = runAction(w, only(G("study-grad"), null, 0), G("study-grad")).world;
    expect(q(w, "grad_gpa")).toBe(g + 4);
  });

  test("the year review moves grades", () => {
    const w = fire(at(30, { ...BACH }), G("admit-mba"));
    const g = q(w, "grad_gpa") as number;
    for (const [i, d] of [
      [0, 5],
      [1, 1],
      [2, -4],
    ] as const) {
      const r = fire(
        w,
        G("grad-year-review"),
        only(G("grad-year-review"), null, i),
      );
      expect(q(r, "grad_gpa")).toBe(g + d);
    }
  });
});

describe("licensing exams", () => {
  const med = { ...BACH, grad_degree_medical: true };
  const law = { ...BACH, grad_degree_law: true };

  test("exams are offered only after the degree and never during school", () => {
    const sit = (w: World, id: string) => row(w, "activities/career", G(id));
    expect(sit(at(30, med), "sit-medical-boards")?.locked).toBe(false);
    expect(sit(at(30, BACH), "sit-medical-boards")?.locked).toBe(true);
    expect(sit(at(30, law), "sit-bar-exam")?.locked).toBe(false);
    expect(
      sit(at(30, { ...med, grad_licensed_medical: true }), "sit-medical-boards")
        ?.locked,
    ).toBe(true);
    const inSchool = fire(at(30, { ...BACH }), G("admit-mba"));
    expect(sit(inSchool, "sit-bar-exam")?.locked).toBe(true);
  });

  test("a sitting is yearly (cooldown 1)", () => {
    const b = only(G("sit-medical-boards"), 0, 1);
    let w = runAction(at(30, med), b, G("sit-medical-boards")).world;
    w = choose(w, b, 0).world;
    expect(q(w, "grad_licensed_medical")).toBe(false);
    expect(row(w, "activities/career", G("sit-medical-boards"))?.locked).toBe(
      true,
    );
    w = year(w, b);
    expect(row(w, "activities/career", G("sit-medical-boards"))?.locked).toBe(
      false,
    );
  });

  test("passing licenses; failing does not; both spend the prep", () => {
    for (const [exam, flag, base] of [
      ["sit-medical-boards", "grad_licensed_medical", med],
      ["sit-bar-exam", "grad_licensed_law", law],
    ] as const) {
      for (const [pick, pass] of [
        [0, true],
        [1, false],
      ] as const) {
        const b = only(G(exam), 0, pick);
        let w = runAction(at(30, { ...base, grad_prep: 3 }), b, G(exam)).world;
        w = choose(w, b, 0).world;
        expect(q(w, flag)).toBe(pass);
        expect(q(w, "grad_prep")).toBe(0);
        expect(stat(w, "happiness")).toBe(pass ? 54 : 46);
      }
    }
  });

  test("pass weight grows with smarts and preparation", () => {
    const outs =
      idx.storylets.get(G("sit-medical-boards"))?.choices[0]?.outcomes ?? [];
    expect(outs.length).toBe(2);
  });

  test("cheating sets the flag, schedules the case and can be caught", () => {
    for (const [pick, licensed] of [
      [0, true],
      [1, false],
    ] as const) {
      const b = only(G("sit-bar-exam"), 1, pick);
      let w = runAction(at(30, law), b, G("sit-bar-exam")).world;
      w = choose(w, b, 1).world;
      expect(q(w, "grad_cheated")).toBe(true);
      expect(q(w, "grad_licensed_law")).toBe(licensed);
    }
  });

  test("exam prep is repeatable, capped at 5, and raises prep and smarts", () => {
    let w = at(30, med);
    for (let i = 0; i < 5; i++)
      w = runAction(w, bundles, G("grad-exam-prep")).world;
    expect(q(w, "grad_prep")).toBe(5);
    expect(row(w, "activities/career", G("grad-exam-prep"))?.locked).toBe(true);
    expect(
      row(at(30, BACH), "activities/career", G("grad-exam-prep"))?.locked,
    ).toBe(true);
  });
});

describe("careers", () => {
  const apply = (
    id: string,
    quals: Record<string, number | boolean>,
    pick = 0,
  ) => {
    const b = only(G(id), null, pick);
    return { b, w: runAction(at(40, { ...BACH, ...quals }), b, G(id)).world };
  };

  test("residency needs degree, boards, no job; hires and spawns a coworker", () => {
    const need = { grad_degree_medical: true, grad_licensed_medical: true };
    expect(
      row(
        at(40, { ...BACH, grad_degree_medical: true }),
        "activities/job-board",
        G("apply-residency"),
      )?.locked,
    ).toBe(true);
    expect(
      row(
        at(40, { ...BACH, ...need }),
        "activities/job-board",
        G("apply-residency"),
      )?.locked,
    ).toBe(false);
    const { w } = apply("apply-residency", need);
    expect(held(w, G("resident-doctor"))).toBe(true);
  });

  test("associate, manager and postdoc hire paths", () => {
    expect(
      held(
        apply("apply-associate-lawyer", {
          grad_degree_law: true,
          grad_licensed_law: true,
        }).w,
        G("associate-lawyer"),
      ),
    ).toBe(true);
    const mgr = apply("apply-business-manager", { grad_degree_mba: true });
    let w = mgr.w;
    while (w.pending) w = choose(w, bundles, 0).world;
    expect(
      row(
        at(40, { ...BACH, grad_degree_mba: true }),
        "activities/job-board",
        G("apply-business-manager"),
      )?.locked,
    ).toBe(false);
    expect(
      row(
        at(40, { ...BACH }),
        "activities/job-board",
        G("apply-business-manager"),
      )?.locked,
    ).toBe(true);
    expect(
      row(
        at(40, { ...BACH, grad_degree_phd: true }),
        "activities/job-board",
        G("apply-postdoc"),
      )?.locked,
    ).toBe(false);
  });

  test("a grad job blocks a second application (full-time group)", () => {
    const w = fire(
      at(40, { ...BACH, grad_degree_phd: true }),
      G("postdoc-interview"),
      only(G("postdoc-interview"), null, 0),
    );
    expect(held(w, G("postdoc"))).toBe(true);
    expect(row(w, "activities/job-board", G("apply-postdoc"))?.locked).toBe(
      true,
    );
  });

  test("promotion events move the ladders", () => {
    const start = (kind: string, quals: Record<string, number | boolean>) => {
      const w = at(45, { ...BACH, ...quals });
      return updatePerson(w, w.playerId, (p) => ({
        ...p,
        occupations: [
          {
            id: 900,
            kindId: G(kind),
            group: "full-time",
            startedAge: 30,
            years: 8,
            performance: 50,
            pay: 0,
          },
        ],
      }));
    };
    const med = { grad_degree_medical: true, grad_licensed_medical: true };
    expect(
      held(
        fire(start("resident-doctor", med), G("promote-attending")),
        G("attending-doctor"),
      ),
    ).toBe(true);
    expect(
      held(
        fire(start("attending-doctor", med), G("promote-chief")),
        G("chief-of-medicine"),
      ),
    ).toBe(true);
    const law = { grad_degree_law: true, grad_licensed_law: true };
    expect(
      held(
        fire(start("associate-lawyer", law), G("partner-track")),
        G("partner-lawyer"),
      ),
    ).toBe(true);
    expect(
      held(
        fire(
          start("business-manager", { grad_degree_mba: true }),
          G("ceo-offer"),
        ),
        G("ceo"),
      ),
    ).toBe(true);
    const phd = { grad_degree_phd: true };
    expect(
      held(
        fire(start("postdoc", phd), G("promote-assistant-professor")),
        G("assistant-professor"),
      ),
    ).toBe(true);
    expect(
      held(
        fire(
          start("assistant-professor", phd),
          G("promote-associate-professor"),
        ),
        G("associate-professor"),
      ),
    ).toBe(true);
    expect(
      held(
        fire(
          start("associate-professor", phd),
          G("tenure-review"),
          bundles.length ? only(G("tenure-review"), null, 0) : bundles,
        ),
        G("full-professor"),
      ),
    ).toBe(true);
  });

  test("the judge offer is made at most once", () => {
    const w0 = at(50, {
      ...BACH,
      grad_degree_law: true,
      grad_licensed_law: true,
    });
    const w = updatePerson(w0, w0.playerId, (p) => ({
      ...p,
      occupations: [
        {
          id: 901,
          kindId: G("partner-lawyer"),
          group: "full-time",
          startedAge: 40,
          years: 8,
          performance: 50,
          pay: 0,
        },
      ],
    }));
    const passed = fire(w, G("judge-offer"), only(G("judge-offer"), null, 1));
    expect(q(passed, "grad_judge_offered")).toBe(true);
    expect(held(passed, G("judge"))).toBe(false);
    const again = startStorylet(passed, bundles, G("judge-offer"));
    expect(again.world.pending).toBeNull();
    const judge = fire(w, G("judge-offer"), only(G("judge-offer"), null, 0));
    expect(held(judge, G("judge"))).toBe(true);
  });

  test("chief of medicine and the judge are the top rungs", () => {
    const pay = (id: string) => idx.occupations.get(G(id));
    expect(pay("chief-of-medicine")?.promotesTo).toBeUndefined();
    expect(pay("judge")?.promotesTo).toBeUndefined();
    expect(pay("ceo")?.promotesTo).toBeUndefined();
    expect(pay("full-professor")?.promotesTo).toBeUndefined();
  });
});

describe("determinism", () => {
  test("a grad life replays from its choice log and round-trips a save", () => {
    // A seeded life played to the end with the first option everywhere, enrolling when allowed.
    let w = newLife(bundles, 11);
    for (let guard = 0; guard < 120 && !w.ended; guard++) {
      for (const id of [
        "apply-phd",
        "apply-mba",
        "apply-law-school",
        "apply-medical-school",
      ]) {
        const r = row(w, "occupation/education", G(id));
        if (r && !r.locked && !w.pending)
          w = runAction(w, bundles, G(id)).world;
        while (w.pending) w = choose(w, bundles, 0).world;
      }
      w = year(w);
    }
    const again = replay(11, bundles, w.choiceLog);
    expect(worldHash(again)).toBe(worldHash(w));
    expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
  });
});
