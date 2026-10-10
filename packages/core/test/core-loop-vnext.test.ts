import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  evaluate,
  getPerson,
  indexBundles,
  listActions,
  makeEnv,
  newLife,
  runAction,
  spawnPerson,
  updatePerson,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);
const CL = "core-loop";

const player = (w: World) => getPerson(w, w.playerId);
const quality = (w: World, id: string) => player(w).qualities[id];
const withQ = (w: World, q: Record<string, number | boolean>): World =>
  updatePerson(w, w.playerId, (p) => ({
    ...p,
    qualities: { ...p.qualities, ...q },
  }));
const adultOf = (seed: number, age: number): World => {
  const w = newLife(bundles, seed);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age }));
};
const locked = (w: World, menu: string, id: string) =>
  listActions(w, bundles, menu).find((r) => r.id === `${CL}/${id}`)?.locked;
/** Evaluate a storylet's `when` for the player (person-less). */
const eligible = (w: World, id: string): boolean => {
  const s = idx.storylets.get(`${CL}/${id}`);
  if (!s?.when) return true;
  return Boolean(evaluate(s.when, makeEnv(w, idx, { subject: w.playerId })));
};
/** Age up, then answer every decision of the year with its first available choice. */
const year = (w: World) => {
  let r = ageUp(w, bundles);
  const lines = [...r.lines];
  while (r.world.pending) {
    const n =
      idx.storylets.get(r.world.pending.storyletId)?.choices.length ?? 0;
    let next: typeof r | undefined;
    for (let i = 0; i < n && !next; i++) {
      try {
        next = choose(r.world, bundles, i);
      } catch {}
    }
    if (!next) throw new Error("no choice available");
    lines.push(...next.lines);
    r = next;
  }
  return { world: r.world, lines };
};
const withPerson = (w: World, role: string, gen: string, age: number) => {
  const [w2, pid] = spawnPerson(
    w,
    idx,
    w.playerId,
    `${CL}/${role}`,
    `${CL}/${gen}`,
  );
  return [updatePerson(w2, pid, (p) => ({ ...p, age })), pid] as const;
};

describe("roles, qualities and defaults", () => {
  test("partner, spouse and child roles exist", () => {
    for (const r of ["partner", "spouse", "child"])
      expect(idx.roles.has(`${CL}/${r}`)).toBe(true);
  });

  test("shared qualities start at their defaults", () => {
    const w = newLife(bundles, 1);
    expect(idx.qualities.has("criminal_record")).toBe(false);
    expect(idx.qualities.has("wanted")).toBe(false);
    expect(idx.qualities.has("pending_charge")).toBe(false);
    expect(quality(w, "karma")).toBe(50);
    expect(idx.qualities.get("karma")?.default).toBe(50);
    expect(idx.qualities.get("lang_english")?.default).toBe(100);
    expect(idx.qualities.get("lang_japanese")?.default).toBe(0);
  });
});

describe("hidden birth rolls", () => {
  const seeds = Array.from({ length: 1500 }, (_, i) => i + 1);
  const rolled = seeds.map((s) => ageUp(newLife(bundles, s), bundles));

  test("family wealth follows its weights and is not journaled", () => {
    const tally = [0, 0, 0, 0, 0, 0];
    for (const r of rolled) {
      const v = quality(r.world, "family_wealth") as number;
      tally[v] = (tally[v] ?? 0) + 1;
      expect(r.lines.some((l) => l.toLowerCase().includes("wealth"))).toBe(
        false,
      );
    }
    const expected = [0, 15, 25, 30, 20, 10];
    for (let t = 1; t <= 5; t++)
      expect(
        Math.abs((tally[t] ?? 0) / seeds.length - (expected[t] ?? 0) / 100),
      ).toBeLessThan(0.04);
  });

  test("attraction values lean towards the opposite gender for most and vary by gender", () => {
    let straightMen = 0;
    let men = 0;
    let anyHigh = 0;
    for (const r of rolled) {
      const p = player(r.world);
      const a = [
        quality(r.world, "attracted_men"),
        quality(r.world, "attracted_women"),
        quality(r.world, "attracted_nonbinary"),
      ] as number[];
      if (Math.max(...a) >= 60) anyHigh++;
      if (p.gender === "male") {
        men++;
        if ((a[1] as number) >= 60 && (a[0] as number) < 20) straightMen++;
      }
    }
    expect(straightMen / men).toBeGreaterThan(0.65);
    expect(anyHigh / seeds.length).toBeGreaterThan(0.9);
  });
});

describe("guards", () => {
  test("dating and heartbreak events do not fire for people with a partner or spouse", () => {
    let w = adultOf(5, 30);
    expect(eligible(w, "dating-app")).toBe(true);
    [w] = withPerson(w, "partner", "coworker-gen", 30);
    expect(eligible(w, "dating-app")).toBe(false);
    let v = adultOf(5, 20);
    expect(eligible(v, "heartbreak")).toBe(true);
    [v] = withPerson(v, "spouse", "coworker-gen", 30);
    expect(eligible(v, "heartbreak")).toBe(false);
  });

  test("grandchild events wait until a child could have grown up", () => {
    let w = adultOf(5, 58);
    expect(eligible(w, "grandchild-babysit")).toBe(true);
    [w] = withPerson(w, "child", "sibling-gen", 5);
    expect(eligible(w, "grandchild-babysit")).toBe(false);
    expect(
      eligible(
        updatePerson(w, w.playerId, (p) => ({ ...p, age: 66 })),
        "grandchild-babysit",
      ),
    ).toBe(true);
    let v = adultOf(5, 72);
    [v] = withPerson(v, "child", "sibling-gen", 5);
    expect(eligible(v, "tell-old-stories")).toBe(false);
    expect(
      eligible(
        updatePerson(v, v.playerId, (p) => ({ ...p, age: 76 })),
        "tell-old-stories",
      ),
    ).toBe(true);
  });

  test("the dating age guard compares the player's and the person's side of 18", () => {
    const ok = (a: number, b: number): boolean => {
      let w = adultOf(1, a);
      const [w2, pid] = withPerson(w, "friend", "classmate-gen", b);
      w = w2;
      // The guard `(age < 18) == (person.age < 18)` as its compiled AST.
      const ast = [
        "==",
        ["<", ["v", "age"], 18],
        ["<", ["v", "person.age"], 18],
      ] as const;
      return Boolean(
        evaluate(ast, makeEnv(w, idx, { subject: w.playerId, person: pid })),
      );
    };
    expect(ok(16, 15)).toBe(true);
    expect(ok(16, 19)).toBe(false);
    expect(ok(30, 22)).toBe(true);
    expect(ok(30, 17)).toBe(false);
  });
});

describe("person targets and mortality", () => {
  test("sibling and person storylets are role-targeted", () => {
    for (const [id, s] of idx.storylets) {
      if (s.scope !== "person" || !id.startsWith(`${CL}/`)) continue;
      if (id.includes("/sibling-")) expect(s.target).toEqual([`${CL}/sibling`]);
      if (id.includes("/person-")) expect(s.target?.length).toBeGreaterThan(0);
    }
  });

  test("generic mortality covers human roles and excludes parents", () => {
    const s = idx.storylets.get(`${CL}/person-mortality`);
    expect(s?.target).not.toContain(`${CL}/parent`);
    expect(s?.target).toEqual(
      expect.arrayContaining(
        [
          "sibling",
          "classmate",
          "coworker",
          "friend",
          "partner",
          "spouse",
          "child",
        ].map((r) => `${CL}/${r}`),
      ),
    );
  });

  test("an ancient friend dies through it and the death is journaled", () => {
    let w = adultOf(8, 30);
    const [w1, friend] = withPerson(w, "friend", "coworker-gen", 108);
    w = updatePerson(w1, friend, (p) => ({
      ...p,
      stats: { ...p.stats, health: 0 },
    }));
    const r = year(w);
    expect(getPerson(r.world, friend).alive).toBe(false);
    expect(r.lines.some((l) => l.includes("died at age"))).toBe(true);
  });
});

describe("custody-ok tags", () => {
  test("mortality, illness, loan, graduation and NPC events keep running in custody", () => {
    for (const [id, s] of idx.storylets) {
      if (!id.startsWith(`${CL}/`)) continue;
      const kind =
        ["mortality", "illness", "loan", "npc"].some((t) =>
          s.tags.includes(t),
        ) || id.startsWith(`${CL}/graduate-`);
      if (kind) expect(s.tags, id).toContain("custody-ok");
    }
    expect(idx.storylets.get(`${CL}/person-mortality`)?.tags).toContain(
      "custody-ok",
    );
  });
});

describe("job verbs use group checks", () => {
  const degree = (w: World) =>
    withQ(w, { has_degree_nursing: true, graduated_high_school: true });

  test("professional apply reads the hiring_blocked slot (default open)", () => {
    const w = degree(adultOf(2, 25));
    expect(locked(w, "activities/job-board", "apply-staff-nurse")).toBe(false);
    expect(idx.readables.get("hiring_blocked")?.terms).toHaveLength(0);
  });

  test("any full-time job (even another Pack's) blocks apply-*; work and raise follow the groups", () => {
    let w = degree(adultOf(2, 25));
    expect(locked(w, "occupation", "work-harder")).toBe(true);
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      occupations: [
        ...p.occupations,
        {
          id: 99,
          kindId: `${CL}/server`,
          group: "full-time",
          startedAge: 20,
          years: 1,
          performance: 50,
          pay: 1,
        },
      ],
    }));
    expect(locked(w, "activities/job-board", "apply-staff-nurse")).toBe(true);
    expect(locked(w, "occupation", "work-harder")).toBe(false);
    expect(locked(w, "occupation", "ask-for-raise")).toBe(false);
  });

  test("retire pays a pension from the years in both job groups and ends the full-time job", () => {
    let w = adultOf(4, 62);
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      occupations: [
        {
          id: 90,
          kindId: `${CL}/server`,
          group: "full-time",
          startedAge: 40,
          years: 10,
          performance: 50,
          pay: 1,
        },
      ],
      occupationHistory: [
        {
          id: 91,
          kindId: `${CL}/cashier`,
          group: "part-time",
          startedAge: 16,
          years: 3,
          performance: 50,
          pay: 1,
          endedAge: 19,
        },
      ],
    }));
    w = runAction(w, bundles, `${CL}/retire`).world;
    expect(quality(w, "years_worked")).toBe(13);
    expect(player(w).occupations.map((o) => o.kindId)).toEqual([
      `${CL}/retired`,
    ]);
  });

  test("enrolment is closed while in any school-group occupation", () => {
    let w = withQ(adultOf(6, 18), { graduated_high_school: true });
    expect(locked(w, "occupation/education", "enrol-business")).toBe(false);
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      occupations: [
        {
          id: 80,
          kindId: "other/grad-school",
          group: "school",
          startedAge: 18,
          years: 0,
          performance: 50,
          pay: 0,
        },
      ],
    }));
    expect(locked(w, "occupation/education", "enrol-business")).toBe(true);
    expect(locked(w, "occupation", "study-harder")).toBe(false);
  });
});

describe("graduation", () => {
  test("graduating ends school and the player is out of the school group", () => {
    let w = withQ(adultOf(7, 21), { graduated_high_school: true });
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      occupations: [
        {
          id: 70,
          kindId: `${CL}/university-arts`,
          group: "school",
          startedAge: 18,
          years: 3,
          performance: 50,
          pay: 0,
        },
      ],
    }));
    w = ageUp(w, bundles).world;
    expect(quality(w, "has_degree_arts")).toBe(true);
    expect(player(w).occupations.some((o) => o.group === "school")).toBe(false);
  });
});

describe("remote occupations", () => {
  test("the analyst, engineer and designer ladders are remote-capable; service and trades are not", () => {
    for (const id of ["junior-analyst", "senior-engineer", "designer"])
      expect(idx.occupations.get(`${CL}/${id}`)?.remote, id).toBe(true);
    for (const id of ["cashier", "server", "electrician", "staff-nurse"])
      expect(idx.occupations.get(`${CL}/${id}`)?.remote, id).toBeUndefined();
  });

  test("has_remote_job reads the held occupations", () => {
    const call = (w: World) =>
      makeEnv(w, idx, { subject: w.playerId }).call("has_remote_job", []);
    const w = adultOf(1, 30);
    expect(call(w)).toBe(false);
    const held = (kind: string) =>
      updatePerson(w, w.playerId, (p) => ({
        ...p,
        occupations: [
          {
            id: 5,
            kindId: `${CL}/${kind}`,
            group: "full-time",
            startedAge: 25,
            years: 1,
            performance: 50,
            pay: 1,
          },
        ],
      }));
    expect(call(held("server"))).toBe(false);
    expect(call(held("analyst"))).toBe(true);
  });
});

describe("languages", () => {
  const study = (w: World, lang: number): World => {
    const r = runAction(w, bundles, `${CL}/study-a-language`).world;
    return choose(r, bundles, lang).world;
  };

  test("skill grows with study and the gain shrinks at 11 and 21 uses in a year", () => {
    const SPANISH = 1;
    let w = adultOf(9, 20);
    const gains: number[] = [];
    for (let i = 0; i < 22; i++) {
      const before = quality(w, "lang_spanish") as number;
      w = study(w, SPANISH);
      gains.push((quality(w, "lang_spanish") as number) - before);
    }
    expect(gains.slice(0, 10).every((g) => g === 6 || g === 3)).toBe(true);
    expect(gains.slice(10, 20).every((g) => g === 2 || g === 1)).toBe(true);
    expect(gains.slice(20).every((g) => g === 0)).toBe(true);
  });

  test("a mastered language is not offered; any age 6+ can study anywhere", () => {
    const w = withQ(adultOf(9, 20), { lang_english: 100 });
    expect(locked(w, "activities/languages", "study-a-language")).toBe(false);
    expect(
      locked(adultOf(9, 4), "activities/languages", "study-a-language"),
    ).toBe(true);
  });
});

describe("lottery", () => {
  test("the corner-shop ticket has negative expected value", () => {
    const s = idx.storylets.get(`${CL}/lottery-ticket`);
    const outcomes = s?.choices[0]?.outcomes ?? [];
    const w = adultOf(1, 30);
    const env = makeEnv(w, idx, { subject: w.playerId });
    let total = 0;
    let ev = 0;
    for (const o of outcomes) {
      const wt = Number(evaluate(o.weight ?? 1, env));
      let delta = 0;
      for (const e of o.effects) {
        if (e[0] !== "add" && e[0] !== "sub") continue;
        if (e[1] !== "money") continue;
        delta += (e[0] === "sub" ? -1 : 1) * Number(evaluate(e[2], env));
      }
      total += wt;
      ev += wt * delta;
    }
    expect(ev / total).toBeLessThan(0);
  });
});
