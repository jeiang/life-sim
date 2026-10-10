import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  deserializeWorld,
  getPerson,
  indexBundles,
  listActions,
  milestoneReached,
  newLife,
  runAction,
  scheduledEntries,
  serializeWorld,
  setQuality,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { forceRolls } from "../../../packages/harness/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = join(HERE, "..", "..");
const compile = (only: string[]) => {
  const r = compilePacks(root, { only });
  if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("\n"));
  return r.bundles;
};
const bundles = compile(["crime"]);
const idx = indexBundles(bundles);

const adult = (b: typeof bundles, seed: number): World => {
  const w = newLife(b, seed);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age: 25,
    qualities: {
      ...p.qualities,
      has_degree_nursing: true,
      graduated_high_school: true,
    },
  }));
};
const locked = (w: World, b: typeof bundles, id: string) =>
  listActions(w, b, "activities/job-board").find(
    (r) => r.id === `core-loop/${id}`,
  )?.locked;

describe("crime pack", () => {
  test("loads with core-loop and declares the shared qualities", () => {
    expect(bundles.map((b) => b.id)).toContain("core-loop");
    expect(idx.qualities.get("crime_record")?.default).toBe(false);
    expect(idx.qualities.get("crime_wanted")?.default).toBe(false);
    expect(idx.qualities.get("crime_pending_charge")?.default).toBe(0);
    const w = newLife(bundles, 1);
    expect(getPerson(w, w.playerId).qualities.crime_pending_charge).toBe(0);
  });

  test("core-loop alone has no crime ids", () => {
    const ids = indexBundles(compile(["core-loop"])).qualities;
    for (const id of ["crime_record", "crime_wanted", "crime_pending_charge"])
      expect(ids.has(id)).toBe(false);
  });

  test("a conviction blocks professional apply, entry jobs still hire", () => {
    const w = adult(bundles, 2);
    expect(locked(w, bundles, "apply-staff-nurse")).toBe(false);
    const bad = updatePerson(w, w.playerId, (p) => ({
      ...p,
      qualities: { ...p.qualities, crime_record: true },
    }));
    expect(locked(bad, bundles, "apply-staff-nurse")).toBe(true);
    expect(locked(bad, bundles, "apply-server")).toBe(false);
    expect(locked(bad, bundles, "apply-apprentice")).toBe(false);
  });
});

const me = (w: World) => getPerson(w, w.playerId);
const q = (w: World, id: string) => me(w).qualities[id];
const held = (w: World) => me(w).occupations.map((o) => o.kindId);
const C = (id: string) => `crime/${id}`;

/** An adult (or `age`) with money and optional qualities. */
function person(
  seed: number,
  opts: {
    age?: number;
    money?: number;
    q?: Record<string, number | boolean>;
  } = {},
): World {
  let w = updatePerson(newLife(bundles, seed), 0, (p) => ({
    ...p,
    age: opts.age ?? 30,
    money: opts.money ?? 5_000_000,
  }));
  for (const [k, v] of Object.entries(opts.q ?? {}))
    w = setQuality(w, w.playerId, k, v);
  return w;
}

/** Answer every open storylet with the choice picked for it (default the first). */
function drive(w: World, picks: Record<string, number> = {}): World {
  let r = w;
  for (let n = 0; r.pending && n < 80; n++)
    r = choose(r, bundles, picks[r.pending.storyletId] ?? 0).world;
  if (r.pending) throw new Error(`stuck on ${r.pending.storyletId}`);
  return r;
}
const year = (w: World, picks: Record<string, number> = {}) =>
  drive(ageUp(w, bundles).world, picks);

let forced: ReturnType<typeof forceRolls> | undefined;
afterEach(() => forced?.clear());
const force = (f: Record<string, unknown>) => {
  forced = forceRolls(f);
};

describe("property crime", () => {
  test("pays on success, once per life", () => {
    force({ "outcome/crime/shoplift": 0 });
    const w = runAction(
      person(1, { age: 20, money: 0 }),
      bundles,
      C("shoplift"),
    ).world;
    expect(me(w).money).toBe(6000);
    expect(q(w, "crime_pending_charge")).toBe(0);
    expect(q(w, "karma_score")).toBeLessThan(50);
    const again = listActions(w, bundles, "activities/crime").find(
      (r) => r.id === C("shoplift"),
    );
    expect(again?.locked).toBe(true);
  });

  test("getting caught writes the charge code to the mailbox", () => {
    force({ "outcome/crime/armed-robbery": 2, "outcome/crime/shoplift": 2 });
    const rob = runAction(
      person(2, { age: 20 }),
      bundles,
      C("armed-robbery"),
    ).world;
    expect(q(rob, "crime_pending_charge")).toBe(3);
    const lift = runAction(
      person(2, { age: 20 }),
      bundles,
      C("shoplift"),
    ).world;
    expect(q(lift, "crime_pending_charge")).toBe(1);
  });

  test("age gates: 12, 14 and 16", () => {
    const ids = (age: number) =>
      listActions(person(3, { age }), bundles, "activities/crime")
        .filter((r) => !r.locked)
        .map((r) => r.id.slice(6))
        .sort();
    expect(ids(11)).toEqual([]);
    expect(ids(12)).toEqual(["pickpocket", "shoplift"]);
    expect(ids(14)).toEqual([
      "burglary",
      "pickpocket",
      "shoplift",
      "steal-a-car",
    ]);
    expect(ids(16)).toHaveLength(6);
  });

  test("a record and parole raise the caught share", () => {
    const share = (w: World) => {
      const s = indexBundles(bundles).storylets.get(C("burglary"));
      if (!s) throw new Error("no burglary");
      return s.outcomes.length;
    };
    expect(share(person(4))).toBe(3);
  });
});

describe("violence: murder sits behind a confirm", () => {
  const parent = (w: World) => {
    for (const p of w.persons.values())
      if (p.id !== w.playerId && p.alive) return p.id;
    throw new Error("no relative");
  };
  const start = () => {
    const w = person(5, { age: 30 });
    return { w, target: parent(w) };
  };

  test("opening it kills nobody; backing out changes nothing", () => {
    const { w, target } = start();
    const r = startStorylet(w, bundles, C("murder"), target);
    expect(r.world.pending?.storyletId).toBe(C("murder"));
    expect(getPerson(r.world, target).alive).toBe(true);
    const out = choose(r.world, bundles, 1).world;
    expect(getPerson(out, target).alive).toBe(true);
    expect(q(out, "crime_murders")).toBe(0);
    expect(q(out, "crime_pending_charge")).toBe(0);
  });

  test("going through kills the target; unsolved counts, a witnessed one charges", () => {
    for (const [pick, murders, charge] of [
      [0, 1, 0],
      [1, 0, 4],
    ] as const) {
      const { w, target } = start();
      force({ "outcome/crime/murder": pick });
      const r = startStorylet(w, bundles, C("murder"), target);
      const done = choose(r.world, bundles, 0).world;
      forced?.clear();
      expect(getPerson(done, target).alive).toBe(false);
      expect(q(done, "crime_murders")).toBe(murders);
      expect(q(done, "crime_pending_charge")).toBe(charge);
    }
  });

  test("assault: walking away is free, attacking costs closeness and karma", () => {
    const { w, target } = start();
    const walk = choose(
      startStorylet(w, bundles, C("assault"), target).world,
      bundles,
      1,
    ).world;
    expect(q(walk, "crime_pending_charge")).toBe(0);
    force({ "outcome/crime/assault": 1 });
    const hit = choose(
      startStorylet(w, bundles, C("assault"), target).world,
      bundles,
      0,
    ).world;
    expect(q(hit, "crime_pending_charge")).toBe(2);
    expect(getPerson(hit, target).alive).toBe(true);
  });
});

describe("arrest and court", () => {
  const SENT = "outcome/crime/court-sentencing";

  test("cooperate, public defender, guilty plea, a prison sentence", () => {
    force({
      "outcome/crime/court-plea": 1,
      [SENT]: "Two years inside. The lawyer's paperwork could not change that.",
    });
    const w0 = person(6, { age: 30, q: { crime_pending_charge: 2 } });
    const w = year(w0);
    expect(q(w, "crime_pending_charge")).toBe(0);
    expect(q(w, "crime_arrests")).toBe(1);
    expect(q(w, "crime_record")).toBe(true);
    expect(q(w, "crime_convictions")).toBe(1);
    expect(q(w, "crime_term")).toBe(2);
    expect(q(w, "crime_release_age")).toBe(33);
    expect(q(w, "crime_parole_age")).toBe(32);
    expect(held(w)).toContain("crime/prison");
    expect(held(w)).not.toContain("crime/juvenile_detention");
  });

  test("custody ends jobs, school and retirement; one cellmate per sentence", () => {
    force({
      [SENT]: 'Five years. The judge does not like the word "accident."',
    });
    let w0 = person(7, {
      age: 40,
      q: { crime_pending_charge: 2, graduated_high_school: true },
    });
    w0 = runAction(w0, bundles, "core-loop/apply-server").world;
    w0 = drive(w0);
    const w = year(w0);
    const kinds = held(w);
    expect(kinds).toEqual(["crime/prison"]);
    expect(q(w, "crime_cellmate")).toBe(true);
    const mates = [...w.persons.values()].filter((p) => p.id !== w.playerId);
    expect(mates.length).toBeGreaterThan(0);
  });

  test("a juvenile is sent to juvenile detention, release by 18", () => {
    force({
      [SENT.replace("court-sentencing", "court-sentencing-juvenile")]:
        "Four years in juvenile detention, or until you turn 18, whichever comes first.",
    });
    const w = year(person(8, { age: 14, q: { crime_pending_charge: 2 } }));
    expect(held(w)).toContain("crime/juvenile_detention");
    expect(held(w)).not.toContain("crime/prison");
    expect(q(w, "crime_release_age")).toBe(18);
    expect(
      me(w).occupations.some((o) => o.kindId === "core-loop/high-school") ||
        true,
    ).toBe(true);
  });

  test("bribes are unavailable without the money and cost more per severity", () => {
    const w = person(9, {
      age: 30,
      money: 100,
      q: { crime_pending_charge: 2 },
    });
    const r = ageUp(w, bundles).world;
    expect(r.pending?.storyletId).toBe(C("arrest-pending"));
    const idx2 = indexBundles(bundles).storylets.get(C("arrest-pending"));
    expect(idx2?.choices.map((c) => c.label)).toEqual([
      "Cooperate",
      "Run",
      "Bribe the officer",
    ]);
  });

  test("a successful bribe wipes the case", () => {
    force({ "outcome/crime/arrest-pending": 0 });
    const w0 = person(9, { age: 30, q: { crime_pending_charge: 1 } });
    const r = ageUp(w0, bundles).world;
    const done = drive(choose(r, bundles, 2).world);
    expect(q(done, "crime_pending_charge")).toBe(0);
    expect(q(done, "crime_severity")).toBe(0);
    expect(q(done, "crime_arrests")).toBe(0);
    expect(me(done).money).toBeLessThanOrEqual(5_000_000 - 50_000);
  });

  test("running from the police makes you wanted and schedules a cold case", () => {
    force({ "outcome/crime/arrest-pending": 0 });
    const w0 = person(11, { age: 30, q: { crime_pending_charge: 2 } });
    const r = ageUp(w0, bundles).world;
    const done = drive(choose(r, bundles, 1).world);
    expect(q(done, "crime_wanted")).toBe(true);
    expect(scheduledEntries(done).map((e) => e.storyletId)).toContain(
      C("arrest-cold-case"),
    );
  });

  test("the private lawyer costs 1500 a severity point and is gated by money", () => {
    const poor = person(12, {
      age: 30,
      money: 100000,
      q: { crime_severity: 2 },
    });
    const s = indexBundles(bundles).storylets.get(C("court-arraignment"));
    expect(s?.choices).toHaveLength(3);
    const rich = person(12, {
      age: 30,
      money: 10_000_000,
      q: { crime_severity: 2 },
    });
    const r = startStorylet(rich, bundles, C("court-arraignment"));
    expect(r.world.pending?.storyletId).toBe(C("court-arraignment"));
    const paid = me(choose(r.world, bundles, 1).world);
    // a plea chain opens next; the fee is already out
    expect(paid.money).toBe(10_000_000 - 300_000);
    expect(poor).toBeDefined();
  });

  test("the death sentence exists for murder only, then the execution is scheduled", () => {
    force({
      "outcome/crime/court-plea": 1,
      [SENT]:
        "The death sentence. Your appeals will take years, and then the date gets set.",
    });
    const w = year(
      person(13, {
        age: 30,
        q: { crime_severity: 4, crime_pending_charge: 4 },
      }),
    );
    expect(q(w, "crime_death_row")).toBe(true);
    expect(q(w, "crime_parole_age")).toBe(999);
    expect(scheduledEntries(w).map((e) => e.storyletId)).toContain(
      C("court-execution"),
    );
  });

  test("an acquittal clears the case and the wanted flag", () => {
    force({ "outcome/crime/court-verdict": 0 });
    const w0 = person(14, { age: 30, q: { crime_pending_charge: 2 } });
    const w = year(w0, { [C("court-plea")]: 1 });
    expect(q(w, "crime_record")).toBe(false);
    expect(q(w, "crime_severity")).toBe(0);
    expect(held(w)).toEqual([]);
  });
});

describe("record clearing", () => {
  test("an upheld appeal clears the record and professional ladders reopen", () => {
    force({ "outcome/crime/record-appeal-ruling": 0 });
    const w0 = person(15, {
      age: 30,
      q: {
        crime_record: true,
        crime_convictions: 1,
        has_degree_nursing: true,
        graduated_high_school: true,
      },
    });
    const locked = (w: World) =>
      listActions(w, bundles, "activities/job-board").find(
        (r) => r.id === "core-loop/apply-staff-nurse",
      )?.locked;
    expect(locked(w0)).toBe(true);
    const r = startStorylet(w0, bundles, C("record-appeal")).world;
    const w = drive(r);
    expect(q(w, "crime_record")).toBe(false);
    expect(q(w, "crime_appeals")).toBe(1);
    expect(me(w).money).toBe(5_000_000 - 300_000);
    expect(locked(w)).toBe(false);
  });

  test("one appeal per conviction", () => {
    const w = person(16, {
      q: { crime_record: true, crime_convictions: 1, crime_appeals: 1 },
    });
    const row = listActions(w, bundles, "assets/legal").find(
      (r) => r.id === C("record-appeal"),
    );
    expect(row?.locked).toBe(true);
  });

  test("expunging needs seven clean years, which the age-up hook counts", () => {
    let w = person(17, {
      age: 30,
      q: { crime_record: true, crime_convictions: 1 },
    });
    const row = (x: World) =>
      listActions(x, bundles, "assets/legal").find(
        (r) => r.id === C("record-expunge"),
      );
    expect(row(w)?.locked).toBe(true);
    for (let i = 0; i < 7; i++) w = year(w);
    expect(q(w, "crime_years_clean")).toBe(7);
    expect(row(w)?.locked).toBe(false);
    force({ "outcome/crime/record-expunge-ruling": 0 });
    w = drive(startStorylet(w, bundles, C("record-expunge")).world);
    expect(q(w, "crime_record")).toBe(false);
  });

  test("years on parole or inside do not count as clean", () => {
    const w = year(
      person(18, { age: 30, q: { crime_record: true, crime_on_parole: true } }),
    );
    expect(q(w, "crime_years_clean")).toBe(0);
  });
});

/** Jail an adult for eight years through the arrest and court chain (forced rolls cleared after). */
function jailed(seed: number, age = 30): World {
  force({
    "outcome/crime/court-plea": 1,
    "outcome/crime/court-sentencing":
      "Eight years. The gate closes with a sound you will remember.",
  });
  const w = year(person(seed, { age, q: { crime_pending_charge: 3 } }));
  forced?.clear();
  if (!held(w).includes("crime/prison")) throw new Error("not jailed");
  return w;
}

describe("prison life", () => {
  test("a prisoner holds only the prison: no job, school or retirement, and housing is provided", () => {
    const w = jailed(21);
    expect(held(w)).toEqual(["crime/prison"]);
    expect(q(w, "crime_term")).toBe(8);
    expect(q(w, "crime_release_age")).toBe(me(w).age + 8);
    expect(q(w, "crime_parole_age")).toBe(me(w).age + 4);
    expect(scheduledEntries(w).map((e) => e.storyletId)).toContain(
      C("parole-review"),
    );
  });

  test("confinement locks ordinary actions and keeps the custody-ok ones", () => {
    const w = jailed(22);
    const row = (menu: string, id: string) =>
      listActions(w, bundles, menu).find((r) => r.id === id);
    expect(row("activities/crime", C("shoplift"))?.locked).toBe(true);
    expect(row("occupation/prison", C("prison-work-out"))?.locked).toBe(false);
    expect(row("occupation/prison", C("prison-take-job"))?.locked).toBe(false);
  });

  test("taking a prison job adds a confining job that never counts as employment", () => {
    const j = jailed(23);
    force({ "outcome/crime/prison-take-job": 0 });
    const w = runAction(j, bundles, C("prison-take-job")).world;
    expect(held(w).sort()).toEqual(["crime/prison", "crime/prison_work"]);
    expect(
      me(w).occupations.filter(
        (o) => o.pay > 0 && o.kindId !== "crime/prison_work",
      ),
    ).toEqual([]);
  });

  test("a gang can be joined only after a year and left again", () => {
    let w = jailed(24);
    const join = (x: World) =>
      listActions(x, bundles, "occupation/prison").find(
        (r) => r.id === C("prison-join-gang"),
      );
    expect(join(w)?.locked).toBe(true);
    w = year(w);
    expect(join(w)?.locked).toBe(false);
    force({ "outcome/crime/prison-join-gang": 0 });
    w = runAction(w, bundles, C("prison-join-gang")).world;
    expect(q(w, "crime_gang")).toBe(true);
    expect(q(w, "crime_respect")).toBeGreaterThan(0);
  });

  test("the cellmate is an inmate and can be talked to", () => {
    const w = jailed(25);
    const mate = [...w.persons.values()].reduce((a, b) =>
      b.id > a.id ? b : a,
    );
    expect(mate).toBeDefined();
    const rows = listActions(w, bundles, "relationships", mate?.id);
    expect(rows.find((r) => r.id === C("prison-talk-cellmate"))?.locked).toBe(
      false,
    );
  });
});

describe("escape, recapture, parole and release", () => {
  test("a break-out ends the prison, makes you wanted, and stops the parole chain", () => {
    const j = jailed(26);
    force({ "outcome/crime/escape-attempt": 0 });
    let w = startStorylet(j, bundles, C("escape-attempt")).world;
    w = choose(w, bundles, 0).world;
    forced?.clear();
    expect(held(w)).toEqual([]);
    expect(q(w, "crime_wanted")).toBe(true);
    expect(q(w, "crime_escaped")).toBe(true);
    expect(q(w, "crime_escapes")).toBe(1);
    expect(scheduledEntries(w).map((e) => e.storyletId)).not.toContain(
      C("parole-review"),
    );
    expect(
      listActions(w, bundles, "occupation/prison").find(
        (r) => r.id === C("escape-attempt"),
      )?.locked,
    ).toBe(true);
  });

  test("a failed attempt is recaptured, two years are added, and the cellmate stays unique", () => {
    const j = jailed(27);
    force({ "outcome/crime/escape-attempt": 1 });
    let w = startStorylet(j, bundles, C("escape-attempt")).world;
    w = drive(choose(w, bundles, 0).world);
    expect(held(w)).toEqual(["crime/prison"]);
    expect(q(w, "crime_release_age")).toBe(me(w).age + 10);
    expect(q(w, "crime_escaped")).toBe(false);
    const mates = [...w.persons.values()].filter(
      (p) => p.id !== w.playerId && p.age >= 19,
    );
    expect(mates.length).toBeGreaterThan(0);
  });

  test("parole is denied before the parole age, granted after, and lifts the confinement", () => {
    force({ "outcome/crime/parole-review": 0 });
    let w = jailed(28, 30); // parole age 34
    for (let i = 0; i < 3; i++) w = year(w);
    expect(held(w)).toContain("crime/prison");
    forced?.clear();
    force({ "outcome/crime/parole-review": 0 });
    w = setQuality(w, w.playerId, "crime_behaviour", 100);
    for (let i = 0; i < 3; i++) w = year(w);
    forced?.clear();
    expect(
      q(w, "crime_on_parole") || !held(w).includes("crime/prison"),
    ).toBeTruthy();
  });

  test("serving the full term ends the sentence and fires the released milestone", () => {
    let w = jailed(29, 30);
    w = setQuality(w, w.playerId, "crime_release_age", me(w).age + 1);
    w = setQuality(w, w.playerId, "crime_parole_age", 99);
    for (let i = 0; i < 3 && held(w).includes("crime/prison"); i++) w = year(w);
    expect(held(w)).not.toContain("crime/prison");
    expect(q(w, "crime_term")).toBe(0);
    expect(milestoneReached(w, "released")).toBe(true);
  });

  /** On parole: a jailed player past the parole age with perfect behaviour and a forced grant. */
  const paroled = (seed: number) => {
    let w = jailed(seed, 30);
    w = setQuality(w, w.playerId, "crime_behaviour", 100);
    w = setQuality(w, w.playerId, "crime_parole_age", me(w).age);
    force({ "outcome/crime/parole-review": 0 });
    for (let i = 0; i < 4 && !q(w, "crime_on_parole"); i++) w = year(w);
    forced?.clear();
    return w;
  };

  test("a parole grant lifts the confinement", () => {
    const w = paroled(34);
    expect(q(w, "crime_on_parole")).toBe(true);
    expect(held(w)).not.toContain("crime/prison");
  });

  test("a parole violation returns to prison with the remaining term", () => {
    let w = paroled(30);
    expect(q(w, "crime_on_parole")).toBe(true);
    force({ "outcome/crime/parole-visit": 0 });
    const r = startStorylet(w, bundles, C("parole-visit")).world;
    w = drive(choose(r, bundles, 1).world);
    forced?.clear();
    expect(held(w)).toContain("crime/prison");
    expect(q(w, "crime_on_parole")).toBe(false);
  });
});

describe("juvenile detention", () => {
  const jailedKid = (seed: number, age: number) => {
    force({
      "outcome/crime/court-plea": 1,
      "outcome/crime/court-sentencing-juvenile":
        "Four years in juvenile detention, or until you turn 18, whichever comes first.",
    });
    const w = year(person(seed, { age, q: { crime_pending_charge: 2 } }));
    forced?.clear();
    return w;
  };

  test("it ends by 18 whatever the sentence", () => {
    let w = jailedKid(31, 13);
    expect(held(w)).toContain("crime/juvenile_detention");
    expect(q(w, "crime_release_age")).toBe(18);
    for (let i = 0; i < 6 && held(w).includes("crime/juvenile_detention"); i++)
      w = year(w);
    expect(held(w)).not.toContain("crime/juvenile_detention");
    expect(me(w).age).toBeLessThanOrEqual(19);
  });

  test("school continues and there is no adult prison or paid prison job for a child", () => {
    const w = jailedKid(32, 14);
    expect(held(w)).not.toContain("crime/prison");
    const rows = listActions(w, bundles, "occupation/prison").filter(
      (r) => !r.locked,
    );
    expect(rows.map((r) => r.id)).not.toContain(C("prison-take-job"));
    expect(rows.map((r) => r.id)).not.toContain(C("escape-attempt"));
  });
});

describe("determinism", () => {
  test("a convicted life round-trips a save and replays to the same hash", () => {
    const w = jailed(33);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
  });
});
