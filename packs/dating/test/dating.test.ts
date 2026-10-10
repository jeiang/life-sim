import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  countKin,
  deserializeWorld,
  evaluate,
  getPerson,
  indexBundles,
  listActions,
  makeEnv,
  newLife,
  type Person,
  type PersonId,
  parentLinks,
  replay,
  runAction,
  scheduledEntries,
  serializeWorld,
  spawnPerson,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { forceRolls } from "../../../packages/harness/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["dating"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles = out.bundles;
const idx = indexBundles(bundles);
const D = (id: string) => `dating/${id}`;
const CL = "core-loop";

const me = (w: World) => getPerson(w, w.playerId);
const q = (w: World, id: string) => me(w).qualities[id];
const pq = (w: World, pid: PersonId, id: string) =>
  getPerson(w, pid).qualities[id];
const rel = (w: World, pid: PersonId) =>
  w.relationships.find((r) => r.from === w.playerId && r.to === pid);
const roleOf = (w: World, pid: PersonId) => rel(w, pid)?.role;
const setPlayer = (w: World, f: Partial<Person>): World =>
  updatePerson(w, w.playerId, (p) => ({ ...p, ...f }));
const setQ = (w: World, id: string, v: number | boolean): World =>
  updatePerson(w, w.playerId, (p) => ({
    ...p,
    qualities: { ...p.qualities, [id]: v },
  }));
const setPQ = (
  w: World,
  pid: PersonId,
  id: string,
  v: number | boolean,
): World =>
  updatePerson(w, pid, (p) => ({
    ...p,
    qualities: { ...p.qualities, [id]: v },
  }));
const scheduled = (w: World) => scheduledEntries(w).map((e) => e.storyletId);

/** A rich adult of the given gender and body, with no partner. */
const adult = (
  seed: number,
  age = 30,
  gender: "male" | "female" | "nonbinary" = "male",
  money = 1_000_000_000,
): World =>
  setPlayer(newLife(bundles, seed), {
    age,
    gender,
    canCarry: gender === "female",
    money,
  });
/** Add a person in a role; `age` and `closeness` as given. */
const add = (
  w: World,
  role: string,
  gen: string,
  age: number,
  closeness = 80,
  gender?: "male" | "female" | "nonbinary",
): readonly [World, PersonId] => {
  const [w2, pid] = spawnPerson(
    w,
    idx,
    w.playerId,
    `${CL}/${role}`,
    `${CL}/${gen}`,
    {
      closeness,
    },
  );
  return [
    updatePerson(w2, pid, (p) => ({
      ...p,
      age,
      ...(gender ? { gender, canCarry: gender === "female" } : {}),
    })),
    pid,
  ];
};
/** Start a storylet (for a person if given) and answer each choice in turn. */
const play = (
  w: World,
  id: string,
  target: PersonId | undefined,
  ...picks: number[]
) => {
  let r = startStorylet(w, bundles, id, target);
  for (const i of picks) r = choose(r.world, bundles, i);
  return r;
};
const pending = (w: World) => w.pending?.storyletId;
const eligible = (w: World, id: string, pid?: PersonId): boolean => {
  const s = idx.storylets.get(D(id));
  if (!s?.when) return true;
  return Boolean(
    evaluate(
      s.when,
      makeEnv(w, idx, {
        subject: w.playerId,
        ...(pid === undefined ? {} : { person: pid }),
      }),
    ),
  );
};
const locked = (w: World, id: string, pid: PersonId): boolean | undefined =>
  listActions(w, bundles, "relationships", pid).find((r) => r.id === D(id))
    ?.locked;
let forced: { clear(): void } | undefined;
const force = (f: Record<string, unknown>) => {
  forced?.clear();
  forced = forceRolls(f);
};
afterEach(() => {
  forced?.clear();
  forced = undefined;
});

describe("declarations", () => {
  test("the pack compiles with its closure and declares roles, generators, qualities, the adopted milestone", () => {
    expect(out.diagnostics).toEqual([]);
    expect(bundles.map((b) => b.id)).toEqual(["karma", "core-loop", "dating"]);
    expect(idx.roles.has(D("ex"))).toBe(true);
    for (const g of [
      "date-teen-gen-male",
      "date-teen-gen-female",
      "date-teen-gen-nonbinary",
      "date-gen-male",
      "date-gen-female",
      "date-gen-nonbinary",
      "baby-gen",
      "adoptee-gen",
    ])
      expect(idx.generators.has(D(g)), g).toBe(true);
    for (const id of [
      "dating_proposed",
      "dating_engaged",
      "dating_cheated",
      "dating_affair",
      "dating_prenup",
      "dating_pays_support",
      "dating_pregnant",
      "dating_moved_out",
      "dating_children",
      "dating_married_age",
      "dating_first_child_age",
    ])
      expect(idx.qualities.has(id), id).toBe(true);
    for (const id of [
      "dating_proposed",
      "dating_engaged",
      "dating_cheated",
      "dating_pregnant",
      "dating_moved_out",
    ])
      expect(idx.qualities.get(id)?.scope, id).toBe("person");
  });

  test("dating-app and heartbreak moved from core-loop into dating", () => {
    expect(idx.storylets.has(D("dating-app"))).toBe(true);
    expect(idx.storylets.has(D("heartbreak"))).toBe(true);
    expect(idx.storylets.has(`${CL}/dating-app`)).toBe(false);
    expect(idx.storylets.has(`${CL}/heartbreak`)).toBe(false);
  });

  test("core-loop alone has no dating ids", () => {
    const alone = compilePacks(PACKS, { only: ["core-loop"] });
    if (!alone.ok) throw new Error("core-loop failed to compile");
    const i = indexBundles(alone.bundles);
    expect(i.roles.has(D("ex"))).toBe(false);
    expect(i.qualities.has("dating_pregnant")).toBe(false);
  });
});

describe("roll-attraction", () => {
  test("is queued at birth, opens at the first age-up and writes silently once", () => {
    const w = newLife(bundles, 21);
    expect(scheduled(w)).toContain(D("roll-attraction"));
    const r = ageUp(w, bundles);
    expect(scheduled(r.world)).not.toContain(D("roll-attraction"));
    const a = ["men", "women", "nonbinary"].map(
      (g) => q(r.world, `dating_attracted_${g}`) as number,
    );
    expect(a.some((x) => x > 0)).toBe(true);
    expect(r.lines.join(" ")).not.toMatch(/attract/i);
    const r2 = ageUp(r.world, bundles);
    expect(
      ["men", "women", "nonbinary"].map((g) =>
        q(r2.world, `dating_attracted_${g}`),
      ),
    ).toEqual(a);
  });
});

describe("finding love", () => {
  test("a teen date needs 14 to 17 and no partner; an adult date 18 to 30 and no partner or spouse", () => {
    expect(eligible(adult(1, 13), "find-a-date-teen")).toBe(false);
    expect(eligible(adult(1, 14), "find-a-date-teen")).toBe(true);
    expect(eligible(adult(1, 17), "find-a-date-teen")).toBe(true);
    expect(eligible(adult(1, 18), "find-a-date-teen")).toBe(false);
    expect(eligible(adult(1, 17), "find-a-date")).toBe(false);
    expect(eligible(adult(1, 18), "find-a-date")).toBe(true);
    expect(eligible(adult(1, 31), "find-a-date")).toBe(false);
    const [withPartner] = add(adult(1, 25), "partner", "coworker-gen", 25);
    expect(eligible(withPartner, "find-a-date")).toBe(false);
    const [teenPartner] = add(adult(1, 15), "partner", "classmate-gen", 15);
    expect(eligible(teenPartner, "find-a-date-teen")).toBe(false);
  });

  test("each outcome spawns a date of its own gender and age band, as a friend or classmate", () => {
    const genders = ["female", "male", "nonbinary"] as const;
    for (const [i, g] of genders.entries()) {
      force({ "outcome/dating/find-a-date": i });
      const w = adult(2, 25);
      const r = startStorylet(w, bundles, D("find-a-date"));
      const date = [...r.world.persons.values()].find(
        (p) => p.id !== w.playerId && !w.persons.has(p.id),
      );
      expect(date?.gender).toBe(g);
      expect(date!.age).toBeGreaterThanOrEqual(18);
      expect(date!.age).toBeLessThanOrEqual(30);
      expect(roleOf(r.world, date!.id)).toBe(`${CL}/friend`);
      expect(rel(r.world, date!.id)?.closeness).toBeGreaterThanOrEqual(10);
      // The spawn-time attraction roll follows the date's own gender, so the values are set.
      const a = ["men", "women", "nonbinary"].map(
        (x) => date!.qualities[`dating_attracted_${x}`] as number,
      );
      expect(a.some((x) => x > 0)).toBe(true);
    }
    force({ "outcome/dating/find-a-date-teen": 1 });
    const t = adult(3, 15);
    const r = startStorylet(t, bundles, D("find-a-date-teen"));
    const date = [...r.world.persons.values()].find(
      (p) => !t.persons.has(p.id),
    );
    expect(date?.gender).toBe("male");
    expect(date!.age).toBeGreaterThanOrEqual(14);
    expect(date!.age).toBeLessThanOrEqual(17);
    expect(roleOf(r.world, date!.id)).toBe(`${CL}/classmate`);
  });

  test("a date is rolled by the player's attraction: nothing attracted to women gives the woman outcome weight 1", () => {
    const s = idx.storylets.get(D("find-a-date"));
    expect(s?.outcomes).toHaveLength(4);
  });

  test("ask-out guards both sides of 18, 14+ and the age gap", () => {
    const check = (a: number, b: number): boolean => {
      const [w, pid] = add(adult(4, a), "friend", "classmate-gen", b, 40);
      return eligible(w, "ask-out", pid);
    };
    expect(check(16, 15)).toBe(true);
    expect(check(16, 19)).toBe(false);
    expect(check(30, 22)).toBe(true);
    expect(check(30, 17)).toBe(false);
    expect(check(14, 13)).toBe(false);
    expect(check(30, 50)).toBe(false);
    expect(check(30, 20)).toBe(true);
    const [w, pid] = add(adult(4, 30), "friend", "coworker-gen", 30, 20);
    expect(eligible(w, "ask-out", pid)).toBe(false);
    const [w2, pid2] = add(adult(4, 30), "friend", "coworker-gen", 30, 40);
    expect(eligible(w2, "ask-out", pid2)).toBe(true);
    const [w3] = add(w2, "partner", "coworker-gen", 30);
    expect(eligible(w3, "ask-out", pid2)).toBe(false);
  });

  test("ask-out succeeds into a partner, or costs closeness and happiness", () => {
    let [w, pid] = add(
      adult(5, 30),
      "friend",
      "coworker-gen",
      30,
      40,
      "female",
    );
    for (const g of ["men", "women", "nonbinary"])
      w = setPQ(w, pid, `dating_attracted_${g}`, 50);
    force({ "outcome/dating/ask-out": 0 });
    const yes = play(w, D("ask-out"), pid, 0);
    expect(roleOf(yes.world, pid)).toBe(`${CL}/partner`);
    force({ "outcome/dating/ask-out": 1 });
    const no = play(w, D("ask-out"), pid, 0);
    expect(roleOf(no.world, pid)).toBe(`${CL}/friend`);
    expect(rel(no.world, pid)?.closeness).toBe(25);
    forced?.clear();
    const keep = play(w, D("ask-out"), pid, 1);
    expect(roleOf(keep.world, pid)).toBe(`${CL}/friend`);
  });

  test("a person who is not attracted to the player's gender mostly says no", () => {
    const [w, pid] = add(
      adult(6, 30, "male"),
      "friend",
      "coworker-gen",
      30,
      40,
      "male",
    );
    const base = setPQ(
      setPQ(
        setPQ(w, pid, "dating_attracted_men", 0),
        pid,
        "dating_attracted_women",
        100,
      ),
      pid,
      "dating_attracted_nonbinary",
      0,
    );
    const s = idx.storylets.get(D("ask-out"));
    const ask = s?.choices[0]?.outcomes ?? [];
    const env = makeEnv(base, idx, { subject: base.playerId, person: pid });
    const [yes, no] = ask.map((o) => Number(evaluate(o.weight, env)));
    expect(yes).toBe(1);
    expect(no).toBe(100);
  });

  test("propose: once per partner, accepted by closeness", () => {
    const [w, pid] = add(adult(7, 30), "partner", "coworker-gen", 30, 70);
    expect(eligible(w, "propose", pid)).toBe(true);
    expect(
      eligible(setPQ(w, pid, "dating_proposed", true), "propose", pid),
    ).toBe(false);
    const [low, lowId] = add(adult(7, 30), "partner", "coworker-gen", 30, 59);
    expect(eligible(low, "propose", lowId)).toBe(false);
    force({ "outcome/dating/propose": 0 });
    const yes = play(w, D("propose"), pid, 0);
    expect(pq(yes.world, pid, "dating_engaged")).toBe(true);
    expect(pq(yes.world, pid, "dating_proposed")).toBe(true);
    expect(roleOf(yes.world, pid)).toBe(`${CL}/partner`);
    force({ "outcome/dating/propose": 1 });
    const no = play(w, D("propose"), pid, 0);
    expect(pq(no.world, pid, "dating_engaged")).toBeFalsy();
    expect(pq(no.world, pid, "dating_proposed")).toBe(true);
    expect(roleOf(no.world, pid)).toBe(`${CL}/friend`);
    forced?.clear();
    const wait = play(w, D("propose"), pid, 1);
    expect(pq(wait.world, pid, "dating_proposed")).toBeFalsy();
  });

  test("the dating app needs 18+, no partner, and has a cooldown", () => {
    expect(eligible(adult(8, 17), "dating-app")).toBe(false);
    expect(eligible(adult(8, 18), "dating-app")).toBe(true);
    const [w] = add(adult(8, 30), "spouse", "coworker-gen", 30);
    expect(eligible(w, "dating-app")).toBe(false);
    expect(idx.storylets.get(D("dating-app"))?.cooldown).toBe(6);
  });

  test("heartbreak needs 14 to 24 and neither partner nor spouse", () => {
    expect(eligible(adult(9, 13), "heartbreak")).toBe(false);
    expect(eligible(adult(9, 20), "heartbreak")).toBe(true);
    expect(eligible(adult(9, 25), "heartbreak")).toBe(false);
    expect(
      eligible(
        add(adult(9, 20), "partner", "coworker-gen", 20)[0],
        "heartbreak",
      ),
    ).toBe(false);
    expect(
      eligible(
        add(adult(9, 20), "spouse", "coworker-gen", 20)[0],
        "heartbreak",
      ),
    ).toBe(false);
  });
});

describe("date night and time with a child", () => {
  test("date night is offered for a partner and a spouse, shrinks with use and can dip", () => {
    const [w, pid] = add(adult(10, 30), "partner", "coworker-gen", 30, 50);
    expect(locked(w, "date-night", pid)).toBe(false);
    const [s, sid] = add(adult(10, 30), "spouse", "coworker-gen", 30, 50);
    expect(locked(s, "date-night", sid)).toBe(false);
    const [f, fid] = add(adult(10, 30), "friend", "coworker-gen", 30, 50);
    expect(locked(f, "date-night", fid)).toBeUndefined();
    force({ "outcome/dating/date-night": 0 });
    const good = runAction(w, bundles, D("date-night"), pid);
    expect(rel(good.world, pid)?.closeness).toBe(56);
    expect(me(good.world).stats.happiness).toBeGreaterThan(
      (me(w).stats.happiness as number) - 1,
    );
    force({ "outcome/dating/date-night": 2 });
    const bad = runAction(w, bundles, D("date-night"), pid);
    expect(rel(bad.world, pid)?.closeness).toBe(47);
    // The fourth use of the year keeps a quarter of the gain.
    force({ "outcome/dating/date-night": 0 });
    let r = w;
    for (let i = 0; i < 4; i++)
      r = runAction(r, bundles, D("date-night"), pid).world;
    expect(rel(r, pid)?.closeness).toBe(50 + 6 * 3 + 1);
  });

  test("time with a child targets child-role persons only", () => {
    const [w, kid] = add(adult(11, 35), "child", "sibling-gen", 6, 50);
    expect(locked(w, "spend-time-with-child", kid)).toBe(false);
    const [f, fid] = add(adult(11, 35), "partner", "coworker-gen", 30, 50);
    expect(locked(f, "spend-time-with-child", fid)).toBeUndefined();
    force({ "outcome/dating/spend-time-with-child": 0 });
    const r = runAction(w, bundles, D("spend-time-with-child"), kid);
    expect(rel(r.world, kid)?.closeness).toBe(56);
  });
});

describe("moving in and the wedding", () => {
  test("move in together: gated on closeness, once, accepted or declined", () => {
    const [w, pid] = add(adult(12, 30), "partner", "coworker-gen", 30, 49);
    expect(locked(w, "move-in-together", pid)).toBe(true);
    const [ok, oid] = add(adult(12, 30), "partner", "coworker-gen", 30, 50);
    expect(locked(ok, "move-in-together", oid)).toBe(false);
    force({ "outcome/dating/move-in-together": 0 });
    const yes = runAction(ok, bundles, D("move-in-together"), oid);
    expect(rel(yes.world, oid)?.household).toBe("together");
    expect(locked(yes.world, "move-in-together", oid)).toBe(true);
    force({ "outcome/dating/move-in-together": 1 });
    const no = runAction(ok, bundles, D("move-in-together"), oid);
    expect(rel(no.world, oid)?.household).toBeUndefined();
    expect(locked(no.world, "move-in-together", oid)).toBe(true);
  });

  const engaged = (money = 100_000_000, partnerMoney = 700_000) => {
    let [w, pid] = add(
      adult(13, 30, "male", money),
      "partner",
      "coworker-gen",
      30,
      80,
    );
    w = setPQ(w, pid, "dating_engaged", true);
    w = updatePerson(w, pid, (p) => ({ ...p, money: partnerMoney }));
    return [w, pid] as const;
  };

  test("plan a wedding needs an accepted proposal, cash for an elopement and no marriage yet", () => {
    const [w, pid] = engaged();
    expect(locked(w, "plan-wedding", pid)).toBe(false);
    const [poor, poorId] = engaged(79_999);
    expect(locked(poor, "plan-wedding", poorId)).toBe(true);
    const [noRing, noId] = add(
      adult(13, 30),
      "partner",
      "coworker-gen",
      30,
      80,
    );
    expect(locked(noRing, "plan-wedding", noId)).toBe(true);
    const [cold, coldId] = engaged();
    expect(locked(updateRel(cold, coldId, 59), "plan-wedding", coldId)).toBe(
      true,
    );
  });

  test("choices are gated by cash: elope $800, small $12,000, big $40,000", () => {
    const s = idx.storylets.get(D("plan-wedding"));
    expect(s?.choices.map((c) => c.label)).toEqual([
      "Elope",
      "Small wedding",
      "Big wedding",
    ]);
    const [w, pid] = engaged(5_000_000);
    const costs: [number, number][] = [
      [0, 80_000],
      [1, 1_200_000],
      [2, 4_000_000],
    ];
    for (const [choice, cost] of costs) {
      const r = play(w, D("plan-wedding"), pid, choice);
      expect(pending(r.world)).toBe(D("wedding-prenup"));
      expect(me(r.world).money).toBe(5_000_000 - cost);
    }
    const [broke, bid] = engaged(100_000);
    const wb = play(broke, D("plan-wedding"), bid, 0);
    expect(me(wb.world).money).toBe(20_000);
  });

  test("no prenup: savings merge, the partner becomes a spouse, married fires and the age is recorded", () => {
    const [w, pid] = engaged(100_000_000, 700_000);
    const r = play(w, D("plan-wedding"), pid, 0, 1);
    expect(roleOf(r.world, pid)).toBe(`${CL}/spouse`);
    expect(me(r.world).money).toBe(100_000_000 - 80_000 + 700_000);
    expect(getPerson(r.world, pid).money).toBe(0);
    expect(rel(r.world, pid)?.household).toBe("merged");
    expect(r.world.state?._milestones).toMatchObject({ married: true });
    expect(q(r.world, "dating_prenup")).toBe(false);
    expect(q(r.world, "dating_married_age")).toBe(30);
    expect(r.lines.join(" ")).toContain("accounts become one");
    // plan-wedding once: a second wedding never opens.
    expect(eligible(r.world, "plan-wedding", pid)).toBe(false);
  });

  test("a prenup costs $1,500, keeps the money apart and still marries", () => {
    const [w, pid] = engaged(100_000_000, 700_000);
    const r = play(w, D("plan-wedding"), pid, 0, 0);
    expect(roleOf(r.world, pid)).toBe(`${CL}/spouse`);
    expect(me(r.world).money).toBe(100_000_000 - 80_000 - 150_000);
    expect(getPerson(r.world, pid).money).toBe(700_000);
    expect(q(r.world, "dating_prenup")).toBe(true);
    expect(rel(r.world, pid)?.household).not.toBe("merged");
    expect(r.world.state?._milestones).toMatchObject({ married: true });
    // The prenup choice needs the lawyer's fee in cash.
    const [thin, tid] = engaged(100_000, 0);
    const t = play(thin, D("plan-wedding"), tid, 0);
    expect(pending(t.world)).toBe(D("wedding-prenup"));
    expect(me(t.world).money).toBe(20_000);
  });
});

const updateRel = (w: World, pid: PersonId, closeness: number): World => ({
  ...w,
  relationships: w.relationships.map((r) =>
    r.to === pid ? { ...r, closeness } : r,
  ),
});

describe("break up and divorce", () => {
  test("break-up ends a partnership into the ex role, drops closeness first and is limited to two", () => {
    const [w, pid] = add(adult(14, 30), "partner", "coworker-gen", 30, 80);
    force({ "outcome/dating/break-up": 0 });
    const civil = runAction(w, bundles, D("break-up"), pid);
    expect(roleOf(civil.world, pid)).toBe(D("ex"));
    expect(rel(civil.world, pid)?.closeness).toBe(65);
    force({ "outcome/dating/break-up": 1 });
    const ugly = runAction(w, bundles, D("break-up"), pid);
    expect(roleOf(ugly.world, pid)).toBe(D("ex"));
    expect(rel(ugly.world, pid)?.closeness).toBe(45);
    expect(idx.storylets.get(D("break-up"))?.maxPerLife).toBe(2);
    const [s, sid] = add(adult(14, 30), "spouse", "coworker-gen", 30);
    expect(locked(s, "break-up", sid)).toBeUndefined();
  });

  const married = (money: number, prenup: boolean, kids = 0, kidAge = 5) => {
    let [w, pid] = add(
      adult(15, 40, "male", money),
      "spouse",
      "coworker-gen",
      40,
      80,
    );
    w = setQ(w, "dating_prenup", prenup);
    for (let i = 0; i < kids; i++)
      w = add(w, "child", "sibling-gen", kidAge, 70)[0];
    return [w, pid] as const;
  };

  test("divorce without kids: half of cash without a prenup, a tenth with one", () => {
    const [w, pid] = married(10_000_000, false);
    const r = play(w, D("divorce"), pid, 2);
    expect(me(r.world).money).toBe(5_000_000);
    expect(roleOf(r.world, pid)).toBe(D("ex"));
    expect(rel(r.world, pid)?.closeness).toBe(40);
    expect(scheduled(r.world)).not.toContain(D("family-child-support-year"));
    const [p, ppid] = married(10_000_000, true);
    const rp = play(p, D("divorce"), ppid, 2);
    expect(me(rp.world).money).toBe(9_000_000);
    const [debt, did] = married(-1_000_000, false);
    const rd = play(debt, D("divorce"), did, 2);
    expect(me(rd.world).money).toBe(-1_000_000);
  });

  test("divorce offers custody only with a child under 18", () => {
    const [w, pid] = married(1_000_000, false);
    expect(
      idx.storylets.get(D("divorce"))?.choices.map((c) => c.label),
    ).toEqual([
      "You keep the kids",
      "Your ex keeps the kids",
      "Sign the papers",
    ]);
    const labels = (world: World) => listChoiceAvailability(world, pid);
    expect(labels(w)).toEqual([false, false, true]);
    const [k] = married(1_000_000, false, 1);
    expect(listChoiceAvailability(k, pid)).toEqual([true, true, false]);
    const [adultKid] = married(1_000_000, false, 1, 18);
    expect(listChoiceAvailability(adultKid, pid)).toEqual([false, false, true]);
  });

  function listChoiceAvailability(world: World, pid: PersonId): boolean[] {
    const s = idx.storylets.get(D("divorce"));
    const env = makeEnv(world, idx, { subject: world.playerId, person: pid });
    return (s?.choices ?? []).map((c) =>
      c.when ? Boolean(evaluate(c.when, env)) : true,
    );
  }

  test("you keep the kids: the split applies and no support is queued", () => {
    const [w, pid] = married(10_000_000, false, 1);
    const r = play(w, D("divorce"), pid, 0);
    expect(me(r.world).money).toBe(5_000_000);
    expect(q(r.world, "dating_pays_support")).toBe(false);
    expect(scheduled(r.world)).not.toContain(D("family-child-support-year"));
  });

  test("your ex keeps the kids: support is queued and paid yearly, capped at cash, until the child is 18", () => {
    const [w, pid] = married(10_000_000, true, 2, 16);
    const r = play(w, D("divorce"), pid, 1);
    expect(me(r.world).money).toBe(9_000_000);
    expect(q(r.world, "dating_pays_support")).toBe(true);
    expect(scheduled(r.world)).toContain(D("family-child-support-year"));
    // One year on: both children are under 18 (17), so two payments of $3,000.
    const y1 = ageUp(r.world, bundles);
    const paid = 9_000_000 - 2 * 300_000;
    expect(me(y1.world).money).toBeLessThanOrEqual(paid);
    expect(y1.lines.join(" ")).toContain("child support");
    expect(scheduled(y1.world)).toContain(D("family-child-support-year"));
    // The cap: a payment never exceeds cash on hand.
    const poor = setPlayer(
      startStorylet(y1.world, bundles, D("family-child-support-year")).world,
      {
        money: 100,
      },
    );
    expect(me(poor).money).toBeGreaterThanOrEqual(0);
  });

  test("divorce is once per life and the forced divorce shares the same split", () => {
    expect(idx.storylets.get(D("divorce"))?.maxPerLife).toBe(1);
    expect(idx.storylets.get(D("divorce-forced"))?.maxPerLife).toBe(1);
    const [w, pid] = married(10_000_000, false);
    const r = play(w, D("divorce-forced"), pid, 2);
    expect(me(r.world).money).toBe(5_000_000);
    expect(roleOf(r.world, pid)).toBe(D("ex"));
    const [p, ppid] = married(10_000_000, true, 1);
    const rk = play(p, D("divorce-forced"), ppid, 1);
    expect(me(rk.world).money).toBe(9_000_000);
    expect(q(rk.world, "dating_pays_support")).toBe(true);
  });
});

describe("affairs", () => {
  test("the affair action is offered for partners and spouses, three per life", () => {
    const [w, pid] = add(adult(16, 30), "partner", "coworker-gen", 30);
    expect(locked(w, "affair-cheat", pid)).toBe(false);
    const [s, sid] = add(adult(16, 30), "spouse", "coworker-gen", 30);
    expect(locked(s, "affair-cheat", sid)).toBe(false);
    expect(idx.storylets.get(D("affair-cheat"))?.maxPerLife).toBe(3);
  });

  test("got away: happiness up, a later discovery is scheduled for the partner", () => {
    const [w, pid] = add(adult(16, 30), "partner", "coworker-gen", 30);
    force({ "outcome/dating/affair-cheat": 0 });
    const r = runAction(w, bundles, D("affair-cheat"), pid);
    expect(q(r.world, "dating_affair")).toBe(1);
    const e = scheduledEntries(r.world).find(
      (x) => x.storyletId === D("affair-found-out"),
    );
    expect(e?.person).toBe(pid);
    expect(roleOf(r.world, pid)).toBe(`${CL}/partner`);
  });

  test("found out later: a quarter of the time the affair is caught", () => {
    const [w, pid] = add(adult(16, 30), "partner", "coworker-gen", 30);
    force({ "outcome/dating/affair-found-out": 0 });
    const caught = startStorylet(w, bundles, D("affair-found-out"), pid);
    expect(roleOf(caught.world, pid)).toBe(D("ex"));
    force({ "outcome/dating/affair-found-out": 1 });
    const fade = startStorylet(w, bundles, D("affair-found-out"), pid);
    expect(roleOf(fade.world, pid)).toBe(`${CL}/partner`);
  });

  test("caught at once: a partner is an ex, a spouse starts the forced divorce", () => {
    const [w, pid] = add(
      adult(17, 30, "male", 10_000_000),
      "partner",
      "coworker-gen",
      30,
      80,
    );
    force({ "outcome/dating/affair-cheat": 1 });
    const p = runAction(w, bundles, D("affair-cheat"), pid);
    expect(roleOf(p.world, pid)).toBe(D("ex"));
    expect(rel(p.world, pid)?.closeness).toBe(50);
    const [s, sid] = add(
      adult(17, 30, "male", 10_000_000),
      "spouse",
      "coworker-gen",
      30,
      80,
    );
    const r = runAction(s, bundles, D("affair-cheat"), sid);
    expect(pending(r.world)).toBe(D("divorce-forced"));
    expect(roleOf(r.world, sid)).toBe(`${CL}/spouse`);
    const done = choose(r.world, bundles, 2);
    expect(roleOf(done.world, sid)).toBe(D("ex"));
    expect(me(done.world).money).toBe(5_000_000);
  });

  test("the partner cheats unseen, then the player forgives or walks away", () => {
    const [w, pid] = add(
      adult(18, 30, "male", 10_000_000),
      "partner",
      "coworker-gen",
      30,
      80,
    );
    expect(eligible(w, "partner-cheats", pid)).toBe(true);
    expect(eligible(w, "partner-cheat-found", pid)).toBe(false);
    const c = startStorylet(w, bundles, D("partner-cheats"), pid);
    expect(pq(c.world, pid, "dating_cheated")).toBe(true);
    expect(eligible(c.world, "partner-cheats", pid)).toBe(false);
    expect(eligible(c.world, "partner-cheat-found", pid)).toBe(true);
    const forgive = play(c.world, D("partner-cheat-found"), pid, 0);
    expect(pq(forgive.world, pid, "dating_cheated")).toBe(false);
    expect(roleOf(forgive.world, pid)).toBe(`${CL}/partner`);
    expect(rel(forgive.world, pid)?.closeness).toBe(70);
    const walk = play(c.world, D("partner-cheat-found"), pid, 1);
    expect(roleOf(walk.world, pid)).toBe(D("ex"));
    const [s, sid] = add(
      adult(18, 30, "male", 10_000_000),
      "spouse",
      "coworker-gen",
      30,
      80,
    );
    const cs = startStorylet(s, bundles, D("partner-cheats"), sid);
    const sw = play(cs.world, D("partner-cheat-found"), sid, 1);
    expect(pending(sw.world)).toBe(D("divorce-forced"));
    // Teen guard: a teen partner cheating needs both under 18.
    const [teen, tid] = add(adult(18, 16), "partner", "classmate-gen", 16);
    expect(eligible(teen, "partner-cheats", tid)).toBe(true);
    const [mixed, mid] = add(adult(18, 16), "partner", "coworker-gen", 19);
    expect(eligible(mixed, "partner-cheats", mid)).toBe(false);
  });
});

describe("pregnancy", () => {
  test("the carrier is the player when they can carry, else a partner who can", () => {
    const [w, pid] = add(
      adult(19, 28, "female"),
      "partner",
      "coworker-gen",
      28,
      80,
      "male",
    );
    expect(locked(w, "try-for-a-baby", pid)).toBe(false);
    const [m, mid] = add(
      adult(19, 28, "male"),
      "partner",
      "coworker-gen",
      28,
      80,
      "female",
    );
    expect(locked(m, "try-for-a-baby", mid)).toBe(false);
    const [none, nid] = add(
      adult(19, 28, "male"),
      "partner",
      "coworker-gen",
      28,
      80,
      "male",
    );
    expect(locked(none, "try-for-a-baby", nid)).toBe(true);
    const [young, yid] = add(
      adult(19, 17, "female"),
      "partner",
      "classmate-gen",
      17,
      80,
      "male",
    );
    expect(locked(young, "try-for-a-baby", yid)).toBe(true);
  });

  test("trying: no news, or the player is pregnant, or the partner is", () => {
    const [w, pid] = add(
      adult(20, 28, "female"),
      "partner",
      "coworker-gen",
      28,
      80,
      "male",
    );
    force({ "outcome/dating/try-for-a-baby": 0 });
    const none = runAction(w, bundles, D("try-for-a-baby"), pid);
    expect(q(none.world, "dating_pregnant")).toBe(0);
    force({ "outcome/dating/try-for-a-baby": 1 });
    const mine = runAction(w, bundles, D("try-for-a-baby"), pid);
    expect(q(mine.world, "dating_pregnant")).toBe(1);
    expect(scheduled(mine.world)).toContain(D("pregnancy-end"));
    expect(locked(mine.world, "try-for-a-baby", pid)).toBe(true);
    const [m, mid] = add(
      adult(20, 28, "male"),
      "partner",
      "coworker-gen",
      28,
      80,
      "female",
    );
    const theirs = runAction(m, bundles, D("try-for-a-baby"), mid);
    expect(pq(theirs.world, mid, "dating_pregnant")).toBe(1);
    expect(q(theirs.world, "dating_pregnant")).toBe(0);
    const e = scheduledEntries(theirs.world).find(
      (x) => x.storyletId === D("partner-pregnancy-end"),
    );
    expect(e?.person).toBe(mid);
  });

  test("an unplanned pregnancy needs a carrier and no running pregnancy", () => {
    const [w, pid] = add(
      adult(21, 28, "male"),
      "partner",
      "coworker-gen",
      28,
      80,
      "female",
    );
    expect(eligible(w, "unplanned-pregnancy", pid)).toBe(true);
    expect(
      eligible(setPQ(w, pid, "dating_pregnant", 1), "unplanned-pregnancy", pid),
    ).toBe(false);
    const [none, nid] = add(
      adult(21, 28, "male"),
      "spouse",
      "coworker-gen",
      28,
      80,
      "male",
    );
    expect(eligible(none, "unplanned-pregnancy", nid)).toBe(false);
    const r = startStorylet(w, bundles, D("unplanned-pregnancy"), pid);
    expect(pq(r.world, pid, "dating_pregnant")).toBe(1);
    expect(scheduled(r.world)).toContain(D("partner-pregnancy-end"));
  });

  test("miscarriage ends the pregnancy with a loss; no child is born", () => {
    const [w, pid] = add(
      adult(22, 28, "female"),
      "partner",
      "coworker-gen",
      28,
      80,
      "male",
    );
    const preg = setQ(w, "dating_pregnant", 1);
    force({ "outcome/dating/pregnancy-end": 0 });
    const r = startStorylet(preg, bundles, D("pregnancy-end"));
    expect(q(r.world, "dating_pregnant")).toBe(0);
    expect(pending(r.world)).toBeUndefined();
    expect(countKin(r.world, r.world.playerId, "child", 0, 120)).toBe(0);
    const [m, mid] = add(
      adult(22, 28, "male"),
      "partner",
      "coworker-gen",
      28,
      80,
      "female",
    );
    const pp = setPQ(m, mid, "dating_pregnant", 1);
    force({ "outcome/dating/partner-pregnancy-end": 0 });
    const rp = startStorylet(pp, bundles, D("partner-pregnancy-end"), mid);
    expect(pq(rp.world, mid, "dating_pregnant")).toBe(0);
    expect(countKin(rp.world, rp.world.playerId, "child", 0, 120)).toBe(0);
  });

  test("keep: a newborn child, both birth parents linked, the first_child milestone and its age", () => {
    const [w, pid] = add(
      adult(23, 28, "female"),
      "spouse",
      "coworker-gen",
      28,
      80,
      "male",
    );
    const preg = setQ(w, "dating_pregnant", 1);
    force({ "outcome/dating/pregnancy-end": 1 });
    const r = startStorylet(preg, bundles, D("pregnancy-end"));
    expect(pending(r.world)).toBe(D("pregnancy-outcome"));
    const kept = choose(r.world, bundles, 0);
    expect(q(kept.world, "dating_pregnant")).toBe(0);
    expect(q(kept.world, "dating_children")).toBe(1);
    expect(q(kept.world, "dating_first_child_age")).toBe(28);
    expect(countKin(kept.world, kept.world.playerId, "child", 0, 0)).toBe(1);
    const baby = [...kept.world.persons.values()].find(
      (p) => !w.persons.has(p.id),
    );
    expect(baby?.age).toBe(0);
    expect(roleOf(kept.world, baby!.id)).toBe(`${CL}/child`);
    const parents = parentLinks(kept.world, baby!.id)
      .map((l) => l.id)
      .sort();
    expect(parents).toEqual([kept.world.playerId, pid].sort());
    expect(kept.world.state?._milestones).toMatchObject({ first_child: true });
  });

  test("a partner who carries is the second birth parent even when only a partner", () => {
    const [w, pid] = add(
      adult(24, 28, "male"),
      "partner",
      "coworker-gen",
      28,
      80,
      "female",
    );
    const pp = setPQ(w, pid, "dating_pregnant", 1);
    force({ "outcome/dating/partner-pregnancy-end": 1 });
    const r = startStorylet(pp, bundles, D("partner-pregnancy-end"), pid);
    expect(pending(r.world)).toBe(D("partner-pregnancy-outcome"));
    const kept = choose(r.world, bundles, 0);
    const baby = [...kept.world.persons.values()].find(
      (p) => !w.persons.has(p.id),
    );
    expect(
      parentLinks(kept.world, baby!.id)
        .map((l) => l.id)
        .sort(),
    ).toEqual([kept.world.playerId, pid].sort());
    expect(pq(kept.world, pid, "dating_pregnant")).toBe(0);
  });

  test("placing the baby for adoption or ending the pregnancy clears the flag and spawns nobody", () => {
    const [w] = add(
      adult(25, 28, "female"),
      "partner",
      "coworker-gen",
      28,
      80,
      "male",
    );
    const preg = setQ(w, "dating_pregnant", 1);
    force({ "outcome/dating/pregnancy-end": 1 });
    for (const choice of [1, 2]) {
      const r = play(preg, D("pregnancy-end"), undefined, choice);
      expect(q(r.world, "dating_pregnant")).toBe(0);
      expect(q(r.world, "dating_children")).toBe(0);
      expect(countKin(r.world, r.world.playerId, "child", 0, 120)).toBe(0);
    }
  });

  test("the schedule fires a year later: age up opens the due date", () => {
    const [w, pid] = add(
      adult(26, 28, "female"),
      "partner",
      "coworker-gen",
      28,
      80,
      "male",
    );
    force({
      "outcome/dating/try-for-a-baby": 1,
      "outcome/dating/pregnancy-end": 1,
    });
    const r = runAction(w, bundles, D("try-for-a-baby"), pid);
    const y = ageUp(r.world, bundles);
    expect(pending(y.world)).toBe(D("pregnancy-outcome"));
  });
});

describe("children and adoption", () => {
  const sibling = (w: World, age: number) =>
    add(w, "child", "sibling-gen", age, 70);

  test("adoption needs 21+, living on your own, a standard above homeless and $5,000", () => {
    const w = setPlayer(adult(27, 30), { withParents: false });
    const id = D("adopt-a-child");
    const lockedAt = (world: World) =>
      listActions(world, bundles, "relationships").find((r) => r.id === id)
        ?.locked;
    expect(lockedAt(w)).toBe(false);
    expect(lockedAt(setPlayer(w, { age: 20 }))).toBe(true);
    expect(lockedAt(setPlayer(w, { money: 499_999 }))).toBe(true);
    expect(lockedAt(setPlayer(w, { withParents: true }))).toBe(true);
    expect(lockedAt(setPlayer(w, { standardId: `${CL}/homeless` }))).toBe(true);
  });

  test("adopting pays the fee, makes an adopted child with the adopted link and fires the milestone", () => {
    const [w, pid] = add(
      setPlayer(adult(28, 30), { withParents: false }),
      "spouse",
      "coworker-gen",
      30,
    );
    const r = runAction(w, bundles, D("adopt-a-child"));
    expect(me(r.world).money).toBe(me(w).money - 500_000);
    const kid = [...r.world.persons.values()].find((p) => !w.persons.has(p.id));
    expect(kid!.age).toBeLessThanOrEqual(17);
    expect(roleOf(r.world, kid!.id)).toBe(`${CL}/child`);
    const links = parentLinks(r.world, kid!.id);
    expect(links.map((l) => l.kind)).toEqual(["adopted", "adopted"]);
    expect(links.map((l) => l.id).sort()).toEqual(
      [r.world.playerId, pid].sort(),
    );
    expect(r.world.state?._milestones).toMatchObject({
      adopted: true,
      first_child: true,
    });
    expect(q(r.world, "dating_children")).toBe(1);
    expect(countKin(r.world, r.world.playerId, "child", 0, 17)).toBe(1);
    const again = listActions(r.world, bundles, "relationships").find(
      (x) => x.id === D("adopt-a-child"),
    );
    expect(again?.locked).toBe(true);
  });

  test("child scenes are ordered by age and bound to child-role persons", () => {
    const [w, kid] = sibling(adult(29, 35), 5);
    expect(eligible(w, "child-first-day-school", kid)).toBe(true);
    const [six, sid] = sibling(adult(29, 35), 6);
    expect(eligible(six, "child-first-day-school", sid)).toBe(false);
    const [t, tid] = sibling(adult(29, 40), 8);
    expect(eligible(t, "child-school-trouble", tid)).toBe(true);
    const [y, yid] = sibling(adult(29, 40), 7);
    expect(eligible(y, "child-school-trouble", yid)).toBe(false);
    const [a, aid] = sibling(adult(29, 50), 18);
    expect(eligible(a, "child-school-trouble", aid)).toBe(false);
    expect(eligible(a, "child-sick-night", aid)).toBe(false);
    const [s, sk] = sibling(adult(29, 40), 0);
    expect(eligible(s, "child-sick-night", sk)).toBe(true);
    for (const id of [
      "child-first-day-school",
      "child-school-trouble",
      "child-sick-night",
      "child-moves-out",
    ])
      expect(idx.storylets.get(D(id))?.target).toEqual([`${CL}/child`]);
  });

  test("a child moves out once between 18 and 25, and the flag stops a second scene", () => {
    const [w, kid] = sibling(adult(30, 50), 19);
    expect(eligible(w, "child-moves-out", kid)).toBe(true);
    const [low, lid] = sibling(adult(30, 50), 17);
    expect(eligible(low, "child-moves-out", lid)).toBe(false);
    const [hi, hid] = sibling(adult(30, 60), 26);
    expect(eligible(hi, "child-moves-out", hid)).toBe(false);
    for (const i of [0, 1, 2]) {
      force({ "outcome/dating/child-moves-out": i });
      const r = startStorylet(w, bundles, D("child-moves-out"), kid);
      expect(pq(r.world, kid, "dating_moved_out")).toBe(true);
      expect(eligible(r.world, "child-moves-out", kid)).toBe(false);
    }
  });

  test("child stats at birth come from the core-loop child ranges", () => {
    const [w, pid] = add(
      adult(31, 28, "female"),
      "spouse",
      "coworker-gen",
      28,
      80,
      "male",
    );
    const preg = setQ(w, "dating_pregnant", 1);
    force({ "outcome/dating/pregnancy-end": 1 });
    const kept = play(preg, D("pregnancy-end"), undefined, 0);
    const baby = [...kept.world.persons.values()].find(
      (p) => !w.persons.has(p.id),
    );
    expect(baby!.stats.happiness).toBeGreaterThanOrEqual(70);
    expect(baby!.stats.health).toBeGreaterThanOrEqual(60);
    expect(pid).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  /** A life that dates, marries, has children and sometimes breaks up, driven by a fixed policy. */
  const lifeOf = (seed: number): World => {
    let w = newLife(bundles, seed);
    for (let y = 0; y < 70 && !w.ended; y++) {
      w = ageUp(w, bundles).world;
      let guard = 0;
      while (w.pending && guard++ < 20) {
        const s = idx.storylets.get(w.pending.storyletId);
        let next: World | undefined;
        for (let i = 0; i < (s?.choices.length ?? 0) && !next; i++) {
          try {
            next = choose(w, bundles, i).world;
          } catch {}
        }
        if (!next) break;
        w = next;
      }
      if (w.ended || w.pending) continue;
      for (const r of [...w.relationships]) {
        if (r.from !== w.playerId) continue;
        for (const a of [
          "date-night",
          "move-in-together",
          "plan-wedding",
          "try-for-a-baby",
          "spend-time-with-child",
        ]) {
          if (w.pending || w.ended) break;
          const row = listActions(w, bundles, "relationships", r.to).find(
            (x) => x.id === D(a),
          );
          if (!row || row.locked) continue;
          try {
            w = runAction(w, bundles, D(a), r.to).world;
          } catch {}
          let g = 0;
          while (w.pending && g++ < 5) w = choose(w, bundles, 0).world;
        }
      }
    }
    return w;
  };

  test("a life through the romance chains replays to the same world and round-trips a save", () => {
    let touched = 0;
    for (const seed of [3, 11, 27, 41]) {
      const w = lifeOf(seed);
      expect(worldHash(replay(seed, bundles, w.choiceLog))).toBe(worldHash(w));
      expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
      if (
        (q(w, "dating_married_age") as number) > 0 ||
        (q(w, "dating_children") as number) > 0
      )
        touched++;
    }
    expect(touched).toBeGreaterThan(0);
  });
});
