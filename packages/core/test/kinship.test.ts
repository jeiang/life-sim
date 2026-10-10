import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import { evaluate } from "../src/expr/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  checkWorldState,
  choose,
  countKin,
  createWorld,
  describePending,
  deserializeWorld,
  endLife,
  getPerson,
  indexBundles,
  isKinshipId,
  KINSHIP_IDS,
  type KinshipId,
  kinOf,
  kinshipLabel,
  kinshipOf,
  linkFamilyRole,
  listActions,
  makeEnv,
  newLife,
  PARENTS_ID,
  type ParentKind,
  parentLinks,
  putRelationship,
  replay,
  runAction,
  serializeWorld,
  succeed,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");
const dir = mkdtempSync(join(tmpdir(), "kinship-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
/** The real core-loop and karma Packs plus the fixture Pack `kx`, copied under `to`. */
function copyPacks(to: string): void {
  for (const p of ["core-loop", "karma"])
    cpSync(join(PACKS, p), join(to, p), { recursive: true });
  cpSync(join(HERE, "fixtures", "kinship", "kx"), join(to, "kx"), {
    recursive: true,
  });
}
copyPacks(dir);
const compiled = compilePacks(dir);
if (!compiled.ok)
  throw new Error(
    compiled.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"),
  );
const bundles = compiled.bundles;
const idx = indexBundles(bundles);

type Links = readonly (readonly [string, ParentKind?])[];

/**
 * A family tree built by name; `me` is the player. Each entry lists that person's parents.
 */
function tree(spec: Record<string, Links>, spouses: [string, string][] = []) {
  let w = createWorld({
    seed: 1,
    player: { givenName: "Me", familyName: "Lee", age: 30 },
  });
  const ids: Record<string, number> = { me: w.playerId };
  for (const name of Object.keys(spec)) {
    if (name === "me") continue;
    const [w2, id] = addPerson(w, {
      givenName: name,
      familyName: "Lee",
      age: 30,
    });
    w = w2;
    ids[name] = id;
  }
  for (const [name, links] of Object.entries(spec))
    for (const [parent, kind] of links)
      w = addParentLink(w, ids[name] as number, ids[parent] as number, kind);
  for (const [a, b] of spouses)
    w = putRelationship(w, {
      from: ids[a] as number,
      to: ids[b] as number,
      role: "core-loop/spouse",
      closeness: 50,
    });
  const kin = (name: string, viewer = "me") =>
    kinshipOf(w, ids[viewer] as number, ids[name] as number);
  return { w, ids, kin };
}

const FAMILY: Record<string, Links> = {
  ggp: [],
  gpa: [["ggp"]],
  gma: [],
  dad: [["gpa"], ["gma"]],
  mum: [],
  me: [["dad"], ["mum"]],
  sister: [["dad"], ["mum"]],
  half: [["dad"], ["other"]],
  other: [],
  twin: [
    ["dad", "adopted"],
    ["mum", "adopted"],
  ],
  stepmum: [],
  stepsib: [["stepmum"]],
  uncle: [["gpa"], ["gma"]],
  cousin: [["uncle"]],
  "grand-uncle": [["ggp"]],
  niece: [["sister"]],
  "great-niece": [["niece"]],
  child: [["me"], ["spouse"]],
  grandchild: [["child"]],
  "great-grandchild": [["grandchild"]],
  "great-great-grandchild": [["great-grandchild"]],
  spouse: [["pil"]],
  pil: [],
  sil: [["pil"]],
  cil: [],
  "sister-spouse": [],
  stranger: [],
  "cousin-child": [["cousin"]],
  second_cousin: [["cousin-child"]],
};

describe("kinship ids", () => {
  const t = tree(
    {
      ...FAMILY,
      me: [["dad"], ["mum"], ["stepmum", "step"]],
      stepkid: [["me", "step"]],
    },
    [
      ["me", "spouse"],
      ["child", "cil"],
      ["sister", "sister-spouse"],
    ],
  );

  const expected: Record<string, KinshipId> = {
    dad: "parent",
    gpa: "grandparent",
    ggp: "great-grandparent",
    child: "child",
    grandchild: "grandchild",
    "great-grandchild": "great-grandchild",
    sister: "sibling",
    half: "half-sibling",
    stepsib: "step-sibling",
    twin: "adopted-sibling",
    uncle: "aunt-uncle",
    "grand-uncle": "great-aunt-uncle",
    cousin: "cousin",
    niece: "niece-nephew",
    stepmum: "step-parent",
    stepkid: "step-child",
    spouse: "spouse",
    pil: "parent-in-law",
    sil: "sibling-in-law",
    cil: "child-in-law",
    "sister-spouse": "sibling-in-law",
  };

  test.each(Object.entries(expected))("%s is %s", (name, id) => {
    expect(t.kin(name)).toBe(id);
  });

  test("every kinship id is covered", () => {
    expect(new Set(Object.values(expected))).toEqual(new Set(KINSHIP_IDS));
  });

  test("outside the named relations, and the viewer, have no kinship", () => {
    for (const name of [
      "me",
      "stranger",
      "other",
      "great-niece",
      "great-great-grandchild",
      "second_cousin",
    ])
      expect(t.kin(name)).toBeUndefined();
  });

  test("a parent's parent through a step link is not a grandparent", () => {
    const s = tree({ me: [["dad", "step"]], dad: [["gpa"]], gpa: [] });
    expect(s.kin("dad")).toBe("step-parent");
    expect(s.kin("gpa")).toBeUndefined();
  });

  test("adoption makes a full parent, and an adopted child a child", () => {
    const s = tree({ me: [["dad", "adopted"]], dad: [["gpa"]], gpa: [] });
    expect(s.kin("dad")).toBe("parent");
    expect(s.kin("gpa")).toBe("grandparent");
    expect(s.kin("me", "dad")).toBe("child");
  });

  test("siblings with the same single known parent are full siblings", () => {
    const s = tree({ me: [["dad"]], sis: [["dad"]], dad: [] });
    expect(s.kin("sis")).toBe("sibling");
  });

  test("a sibling who shares one of two parents is a half-sibling", () => {
    const s = tree({
      me: [["dad"], ["mum"]],
      sis: [["dad"]],
      dad: [],
      mum: [],
    });
    expect(s.kin("sis")).toBe("half-sibling");
  });

  test("kinOf lists every relative once, in id order, and filters by alive", () => {
    const rows = kinOf(t.w, t.w.playerId);
    expect(rows.map((r) => r.id)).toEqual(
      [...rows.map((r) => r.id)].sort((a, b) => a - b),
    );
    const byName = Object.entries(t.ids)
      .map(([name, id]) => ({ id, kin: t.kin(name) }))
      .filter((r) => r.kin !== undefined)
      .sort((x, y) => x.id - y.id);
    expect(rows).toEqual(byName);
    const dead = updatePerson(t.w, t.ids.dad as number, (p) => ({
      ...p,
      alive: false,
    }));
    expect(
      kinOf(dead, dead.playerId, { alive: true }).some(
        (r) => r.id === t.ids.dad,
      ),
    ).toBe(false);
    expect(
      kinOf(dead, dead.playerId, { alive: false }).map((r) => r.id),
    ).toEqual([t.ids.dad]);
  });

  test("labels follow gender, neutral without one", () => {
    expect(kinshipLabel("aunt-uncle")).toBe("aunt or uncle");
    expect(kinshipLabel("aunt-uncle", "female")).toBe("aunt");
    expect(kinshipLabel("parent", "male")).toBe("father");
    expect(kinshipLabel("parent", "nonbinary")).toBe("parent");
    expect(isKinshipId("cousin")).toBe(true);
    expect(isKinshipId("granddad")).toBe(false);
  });
});

describe("heir re-derivation", () => {
  test("names are recomputed from the new player's position", () => {
    const t = tree(FAMILY, [["me", "spouse"]]);
    const heir = t.ids.child as number;
    const w = succeed(endLife(t.w, t.w.playerId, "test"), bundles, heir).world;
    expect(w.playerId).toBe(heir);
    const kin = (n: string) => kinshipOf(w, heir, t.ids[n] as number);
    expect(kin("me")).toBe("parent");
    expect(kin("spouse")).toBe("parent");
    expect(kin("dad")).toBe("grandparent");
    expect(kin("gpa")).toBe("great-grandparent");
    expect(kin("sister")).toBe("aunt-uncle");
    expect(kin("niece")).toBe("cousin");
    expect(kin("grandchild")).toBe("child");
    expect(kin("uncle")).toBe("great-aunt-uncle");
  });
});

describe("expressions", () => {
  const t = tree(FAMILY);
  const env = (person: number) =>
    makeEnv(t.w, idx, { subject: t.w.playerId, person });
  const call = (person: number, name: string, ...rest: unknown[]) =>
    evaluate(
      ["call", name, ["s", "person"], ...rest.map((r) => ["s", r])] as never,
      env(person),
    );

  test("kin and is_kin", () => {
    expect(call(t.ids.gma as number, "kin")).toBe("grandparent");
    expect(call(t.ids.stranger as number, "kin")).toBe("");
    expect(call(t.ids.sister as number, "is_kin", "sibling")).toBe(true);
    expect(call(t.ids.half as number, "is_kin", "sibling")).toBe(false);
  });

  test("count_kin counts living people in an age range", () => {
    const old = updatePerson(t.w, t.ids.mum as number, (p) => ({
      ...p,
      age: 70,
    }));
    expect(countKin(t.w, t.w.playerId, "parent", 20, 60)).toBe(2);
    expect(countKin(old, t.w.playerId, "parent", 20, 60)).toBe(1);
    const dead = updatePerson(t.w, t.ids.dad as number, (p) => ({
      ...p,
      alive: false,
    }));
    expect(countKin(dead, t.w.playerId, "parent", 0, 100)).toBe(1);
  });

  test("storylets use kin functions; a spawned parent is kin", () => {
    const rows = (name: string) =>
      listActions(t.w, bundles, "relationships", t.ids[name]).map((r) => r.id);
    const sib = listActions(t.w, bundles, "relationships", t.ids.sister).find(
      (r) => r.id === "kx/sibling-only",
    );
    expect(sib?.locked).toBeFalsy();
    const half = listActions(t.w, bundles, "relationships", t.ids.half).find(
      (r) => r.id === "kx/sibling-only",
    );
    expect(half?.locked).toBe(true);
    expect(rows("dad")).toBeDefined();
    const w = runAction(t.w, bundles, "kx/parents-around").world;
    expect(getPerson(w, w.playerId).qualities.kin_hits).toBe(10);
  });

  test("target takes kinship ids; {person.kin} renders the gendered label", () => {
    const storylet = bundles
      .flatMap((b) => b.storylets)
      .find((s) => s.id === "kx/half-only");
    expect(storylet?.target).toEqual(["half-sibling", "cousin"]);
    const listed = (name: string) =>
      listActions(t.w, bundles, "relationships", t.ids[name]).find(
        (r) => r.id === "kx/half-only",
      );
    expect(listed("half")).toMatchObject({ locked: false });
    expect(listed("cousin")).toMatchObject({ locked: false });
    expect(listed("sister")).toBeUndefined();
    const w = updatePerson(t.w, t.ids.half as number, (p) => ({
      ...p,
      gender: "female",
    }));
    const opened = runAction(
      w,
      bundles,
      "kx/half-only",
      t.ids.half as number,
    ).world;
    expect(describePending(opened, bundles)?.text).toMatch(
      /is your half-sister\.$/,
    );
  });

  test("the kinship argument is checked at build time", () => {
    const bad = mkdtempSync(join(tmpdir(), "kinship-bad-"));
    try {
      copyPacks(bad);
      const file = join(bad, "kx", "storylets", "kin.yaml");
      const src = readFileSync(file, "utf8");
      writeFileSync(
        file,
        src.replace("is_kin(person, sibling)", "is_kin(person, siblng)"),
      );
      const r = compilePacks(bad);
      expect(r.ok).toBe(false);
      expect(r.diagnostics.map((d) => d.message).join("\n")).toMatch(
        /expected a kinship id.*did you mean 'sibling'/,
      );
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
  });
});

describe("family roles keep the tree in step", () => {
  const role = (name: string) => `core-loop/${name}`;

  test("a new life links the player, parents and siblings", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = newLife(bundles, seed);
      const mine = parentLinks(w, w.playerId);
      const rows = (r: string) =>
        w.relationships.filter(
          (x) => x.from === w.playerId && x.role === role(r),
        );
      expect(mine.map((l) => l.id)).toEqual(
        rows("parent")
          .map((x) => x.to)
          .sort((a, b) => a - b),
      );
      for (const r of rows("sibling")) {
        expect(parentLinks(w, r.to)).toEqual(mine);
        expect(kinshipOf(w, w.playerId, r.to)).toBe(
          mine.length > 1 ? "sibling" : undefined,
        );
      }
      for (const r of rows("parent"))
        expect(kinshipOf(w, w.playerId, r.to)).toBe("parent");
    }
  });

  test("spawn_person with the parent role adds a parent link", () => {
    const w0 = newLife(bundles, 5);
    const before = parentLinks(w0, w0.playerId).length;
    const w = runAction(w0, bundles, "kx/adopt-parent").world;
    expect(parentLinks(w, w.playerId).length).toBe(before + 1);
    expect(getPerson(w, w.playerId).qualities.kin_hits).toBe(5);
  });

  test("sibling, child, parent and grandparent roles", () => {
    const t = tree({ me: [["dad"], ["mum"]], dad: [], mum: [], x: [], gp: [] });
    const id = (n: string) => t.ids[n] as number;
    let w = linkFamilyRole(t.w, id("me"), id("x"), role("sibling"));
    expect(kinshipOf(w, id("me"), id("x"))).toBe("sibling");
    w = linkFamilyRole(w, id("me"), id("gp"), role("grandparent"));
    expect(kinshipOf(w, id("me"), id("gp"))).toBe("grandparent");
    w = linkFamilyRole(w, id("me"), id("x"), "parent");
    expect(kinshipOf(w, id("me"), id("x"))).toBe("parent");
    expect(linkFamilyRole(w, id("me"), id("x"), role("friend"))).toBe(w);
  });

  test("a child of a married player has both as parents", () => {
    const t = tree({ me: [], spouse: [], kid: [] }, [["me", "spouse"]]);
    const w = linkFamilyRole(
      t.w,
      t.w.playerId,
      t.ids.kid as number,
      role("child"),
    );
    expect(kinshipOf(w, w.playerId, t.ids.kid as number)).toBe("child");
    expect(kinshipOf(w, t.ids.spouse as number, t.ids.kid as number)).toBe(
      "child",
    );
  });
});

describe("spawn_person parent and link", () => {
  const kidOf = (w: World) => {
    const row = w.relationships.find(
      (r) => r.from === w.playerId && r.role === "core-loop/child",
    );
    return row?.to as number;
  };
  const mateOf = (w: World) =>
    w.relationships.find(
      (r) => r.from === w.playerId && r.role === "core-loop/partner",
    )?.to as number;

  test("a child of a partner links both as birth parents", () => {
    const w0 = newLife(bundles, 5);
    const w = runAction(w0, bundles, "kx/partner-child").world;
    const kid = kidOf(w);
    const mate = mateOf(w);
    expect(parentLinks(w, kid)).toEqual([
      { id: w.playerId, kind: "birth" },
      { id: mate, kind: "birth" },
    ]);
    expect(kinshipOf(w, w.playerId, kid)).toBe("child");
    expect(kinshipOf(w, mate, kid)).toBe("child");
    expect(deserializeWorld(serializeWorld(w))).toEqual(w);
  });

  test("the named parent replaces the spouses, so an affair child has one spouse-free pair", () => {
    let w0 = newLife(bundles, 5);
    const [w1, spouse] = addPerson(w0, {
      givenName: "S",
      familyName: "L",
      age: 30,
    });
    w0 = putRelationship(w1, {
      from: w1.playerId,
      to: spouse,
      role: "core-loop/spouse",
      closeness: 50,
    });
    const w = runAction(w0, bundles, "kx/partner-child").world;
    const links = parentLinks(w, kidOf(w)).map((l) => l.id);
    expect(links).toEqual([w.playerId, mateOf(w)]);
    expect(links).not.toContain(spouse);
  });

  test("a child with no parent: argument takes the living spouse, else the lowest-id partner", () => {
    const role = (name: string) => `core-loop/${name}`;
    const t = tree({ me: [], p2: [], p1: [], kid: [] });
    const id = (n: string) => t.ids[n] as number;
    const partner = (w: World, n: string) =>
      putRelationship(w, {
        from: id("me"),
        to: id(n),
        role: "core-loop/partner",
        closeness: 50,
      });
    let w = partner(partner(t.w, "p2"), "p1");
    const p1 = id("p1") < id("p2") ? "p1" : "p2";
    const low = linkFamilyRole(w, id("me"), id("kid"), role("child"));
    expect(parentLinks(low, id("kid")).map((l) => l.id)).toEqual(
      [id("me"), id(p1)].sort((a, b) => a - b),
    );
    w = putRelationship(w, {
      from: id("me"),
      to: id("p1"),
      role: "core-loop/spouse",
      closeness: 50,
    });
    const wed = linkFamilyRole(w, id("me"), id("kid"), role("child"));
    expect(parentLinks(wed, id("kid")).map((l) => l.id)).toEqual(
      [id("me"), id("p1")].sort((a, b) => a - b),
    );
  });

  test("link: adopted makes the player's own link adopted too", () => {
    const w = runAction(newLife(bundles, 5), bundles, "kx/adopt-child").world;
    expect(parentLinks(w, kidOf(w))).toEqual([
      { id: w.playerId, kind: "adopted" },
      { id: mateOf(w), kind: "adopted" },
    ]);
    expect(kinshipOf(w, w.playerId, kidOf(w))).toBe("child");
  });

  test("a grandchild spawned with parent: the child resolves as grandchild, and saves and replays", () => {
    const w0 = newLife(bundles, 5);
    const w = runAction(w0, bundles, "kx/grandchild-born").world;
    const row = w.relationships.find(
      (r) => r.from === w.playerId && r.role === "kx/grandchild",
    );
    const grandkid = row?.to as number;
    const son = w.relationships.find(
      (r) => r.from === w.playerId && r.role === "core-loop/child",
    )?.to as number;
    expect(parentLinks(w, grandkid)).toEqual([{ id: son, kind: "birth" }]);
    expect(kinshipOf(w, w.playerId, grandkid)).toBe("grandchild");
    expect(countKin(w, w.playerId, "grandchild", 0, 120)).toBe(1);
    expect(getPerson(w, w.playerId).qualities.kin_hits).toBe(7);
    expect(deserializeWorld(serializeWorld(w))).toEqual(w);
    const again = replay(w.seed, bundles, w.choiceLog);
    expect(worldHash(again)).toBe(worldHash(w));
  });

  test("a grandchild spawn without parent: is a build error", () => {
    const bad = mkdtempSync(join(tmpdir(), "kinship-gc-"));
    try {
      copyPacks(bad);
      const file = join(bad, "kx", "storylets", "kin.yaml");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace(
          "grandchild, core-loop/sibling-gen, parent: son) as grandkid",
          "grandchild, core-loop/sibling-gen, link: step) as grandkid",
        ),
      );
      const r = compilePacks(bad);
      expect(r.ok).toBe(false);
      expect(r.diagnostics.map((d) => d.message).join("\n")).toMatch(
        /grandchild role needs 'parent/,
      );
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
  });

  test("link without parent keeps the default parents with that kind", () => {
    const w = runAction(newLife(bundles, 5), bundles, "kx/adopt-alone").world;
    expect(parentLinks(w, kidOf(w))).toEqual([
      { id: w.playerId, kind: "step" },
    ]);
  });

  test("parent and link are checked at build time", () => {
    const bad = mkdtempSync(join(tmpdir(), "kinship-bad-"));
    try {
      copyPacks(bad);
      const file = join(bad, "kx", "storylets", "kin.yaml");
      const src = readFileSync(file, "utf8");
      const messages = (from: string, to: string): string => {
        writeFileSync(file, src.replace(from, to));
        const r = compilePacks(bad);
        expect(r.ok).toBe(false);
        return r.diagnostics.map((d) => d.message).join("\n");
      };
      expect(messages("parent: mate)", "parent: mat)")).toMatch(
        /unknown person 'mat'.*did you mean 'mate'/,
      );
      expect(messages("link: adopted", "link: fostered")).toMatch(
        /unknown link kind 'fostered'/,
      );
      expect(
        messages(
          "spawn_person(core-loop/child, core-loop/sibling-gen, link: step)",
          "spawn_person(core-loop/partner, core-loop/coworker-gen, link: step)",
        ),
      ).toMatch(/need a child or grandchild role/);
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
  });
});

describe("state container, replay and save", () => {
  const play = (seed: number) => {
    let w = newLife(bundles, seed);
    for (let i = 0; i < 12 && !w.ended; i++) {
      w = ageUp(w, bundles).world;
      let g = 0;
      while (w.pending && !w.ended && g++ < 20) w = choose(w, bundles, 0).world;
    }
    return w;
  };

  test("replay rebuilds the same tree and hash", () => {
    const w = play(7);
    const r = replay(w.seed, bundles, w.choiceLog);
    expect(worldHash(r)).toBe(worldHash(w));
    expect(parentLinks(r, r.playerId)).toEqual(parentLinks(w, w.playerId));
  });

  test("parent links live in the _parents person container and round-trip", () => {
    const t = tree({
      ...FAMILY,
      me: [["dad"], ["mum", "adopted"], ["stepmum", "step"]],
    });
    expect(getPerson(t.w, t.w.playerId).state?.[PARENTS_ID]).toEqual({
      [t.ids.dad as number]: 1,
      [t.ids.mum as number]: 2,
      [t.ids.stepmum as number]: 3,
    });
    const back = deserializeWorld(serializeWorld(t.w));
    expect(serializeWorld(back)).toBe(serializeWorld(t.w));
    expect(worldHash(back)).toBe(worldHash(t.w));
    expect(parentLinks(back, back.playerId).map((l) => l.kind)).toEqual([
      "birth",
      "adopted",
      "step",
    ]);
    expect(checkWorldState(back, idx.state)).toEqual([]);
  });

  test("a malformed parent table rejects the world", () => {
    const w = newLife(bundles, 2);
    const me = w.playerId;
    const with_ = (v: unknown) =>
      updatePerson(w, me, (p) => ({
        ...p,
        state: { ...p.state, [PARENTS_ID]: v as never },
      }));
    const problems = (v: unknown) => checkWorldState(with_(v), idx.state);
    expect(problems({ [me]: 1 }).join()).toMatch(/own parent/);
    expect(problems({ 9999: 1 }).join()).toMatch(/no such person/);
    expect(problems({ x: 1 }).join()).toMatch(/not a person id/);
    expect(problems({ 1: 4 }).join()).toMatch(/kind code/);
    expect(problems(3).join()).toMatch(/parent table/);
  });

  test("addParentLink ignores a link to oneself and rejects a missing parent", () => {
    const w = newLife(bundles, 3);
    expect(addParentLink(w, w.playerId, w.playerId)).toBe(w);
    expect(() => addParentLink(w, w.playerId, 9999)).toThrow(/no person/);
  });
});
