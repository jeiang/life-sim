import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import { evaluate } from "../src/expr/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  choose,
  countKin,
  createWorld,
  deserializeWorld,
  getPerson,
  indexBundles,
  KINSHIP_IDS,
  type KinshipId,
  kinshipLabel,
  kinshipOf,
  listActions,
  makeEnv,
  migrateSave,
  newLife,
  type ParentKind,
  parseSave,
  putRelationship,
  replay,
  runAction,
  serializeSave,
  serializeWorld,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

type Links = readonly (readonly [string, ParentKind?])[];

/**
 * A family tree built by name. `me` is the player. Parent links are given by name:
 *   ggp -> gpa -> dad -> me;  gma, mum;  uncle (gpa's child) -> cousin;  grand-uncle (ggp's child)
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
      role: "life/spouse",
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
  second_cousin: [["cousin-child"]],
  "cousin-child": [["cousin"]],
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

  const expected: Record<string, KinshipId | undefined> = {
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

  test("labels follow gender, neutral without one", () => {
    expect(kinshipLabel("aunt-uncle")).toBe("aunt or uncle");
    expect(kinshipLabel("aunt-uncle", "female")).toBe("aunt");
    expect(kinshipLabel("parent", "male")).toBe("father");
    expect(kinshipLabel("parent", "nonbinary")).toBe("parent");
  });
});

describe("heir re-derivation", () => {
  test("names are recomputed from the new player's position", () => {
    const t = tree({ ...FAMILY, "sister-spouse": [] }, [["me", "spouse"]]);
    const heir = t.ids.child as number;
    const w: World = { ...t.w, playerId: heir };
    const kin = (n: string) => kinshipOf(w, heir, t.ids[n] as number);
    expect(kin("me")).toBe("parent");
    expect(kin("spouse")).toBe("parent");
    expect(kin("dad")).toBe("grandparent");
    expect(kin("gpa")).toBe("great-grandparent");
    expect(kin("sister")).toBe("aunt-uncle");
    expect(kin("niece")).toBe("cousin");
    expect(kin("grandchild")).toBe("child");
    expect(kin("uncle")).toBe("great-aunt-uncle");
    // The player-relative reads use the moved pointer.
    const idx = indexBundles(bundles);
    const env = makeEnv(w, idx, { subject: heir, person: t.ids.dad as number });
    expect(env.get("person.kin")).toBe("grandparent");
    expect(env.get("person.kin_label")).toBe("grandparent");
  });
});

describe("expressions and targets", () => {
  const idx = indexBundles(bundles);
  const t = tree({ ...FAMILY });
  const env = (person: number) =>
    makeEnv(t.w, idx, { subject: t.w.playerId, person });
  const call = (person: number, name: string, ...rest: unknown[]) =>
    evaluate(
      ["call", name, ["s", "person"], ...rest.map((r) => ["id", r])] as never,
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

  test("a storylet target may list kinship ids", () => {
    const rows = (name: string) =>
      listActions(t.w, bundles, "relationships/family", t.ids[name]).map(
        (r) => r.id,
      );
    expect(rows("gpa")).toContain("life/kin-visit");
    expect(rows("uncle")).toContain("life/kin-visit");
    expect(rows("dad")).not.toContain("life/kin-visit");
    expect(rows("sister")).toContain("life/kin-sibling-only");
    const half = listActions(
      t.w,
      bundles,
      "relationships/family",
      t.ids.half,
    ).find((r) => r.id === "life/kin-sibling-only");
    expect(half?.locked).toBe(true);
  });

  test("the kinship label is a text placeholder", () => {
    const lines = (w: World) => w.journal.flatMap((j) => j.lines);
    const w = runAction(t.w, bundles, "life/kin-adopt-in-law").world;
    expect(lines(w).some((l) => /^Met (mother|father) \w+\.$/.test(l))).toBe(
      true,
    );
    expect(env(t.ids.uncle as number).get("person.kin_label")).toBe(
      "aunt or uncle",
    );
    expect(env(t.ids.stranger as number).get("person.kin_label")).toBe(
      "acquaintance",
    );
  });
});

describe("family from role rows", () => {
  test("a new life links the player, parents and siblings", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = newLife(bundles, seed);
      const me = getPerson(w, w.playerId);
      const rows = (role: string) =>
        w.relationships.filter(
          (r) => r.from === w.playerId && r.role === `life/${role}`,
        );
      expect(me.parents.map((l) => l.id)).toEqual(
        rows("parent")
          .map((r) => r.to)
          .sort((a, b) => a - b),
      );
      for (const r of rows("sibling")) {
        expect(getPerson(w, r.to).parents).toEqual(me.parents);
        expect(kinshipOf(w, w.playerId, r.to)).toBe(
          me.parents.length ? "sibling" : undefined,
        );
      }
      for (const r of rows("parent"))
        expect(kinshipOf(w, w.playerId, r.to)).toBe("parent");
    }
  });

  test("spawn_person with the parent role adds a parent link", () => {
    const w0 = newLife(bundles, 5);
    const before = getPerson(w0, w0.playerId).parents.length;
    const w = runAction(w0, bundles, "life/kin-adopt-in-law").world;
    const me = getPerson(w, w.playerId);
    expect(me.parents.length).toBe(before + 1);
    const added = me.parents.at(-1)?.id as number;
    expect(kinshipOf(w, w.playerId, added)).toBe("parent");
  });
});

describe("replay and save round trip", () => {
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
    expect(getPerson(r, r.playerId).parents).toEqual(
      getPerson(w, w.playerId).parents,
    );
  });

  test("parent links survive serialize and deserialize", () => {
    const t = tree({
      ...FAMILY,
      me: [["dad"], ["mum", "adopted"], ["stepmum", "step"]],
    });
    const back = deserializeWorld(serializeWorld(t.w));
    expect(serializeWorld(back)).toBe(serializeWorld(t.w));
    expect(getPerson(back, back.playerId).parents.map((l) => l.kind)).toEqual([
      "birth",
      "adopted",
      "step",
    ]);
  });

  test("a bad parent link kind is rejected", () => {
    const j = JSON.parse(serializeWorld(newLife(bundles, 2)));
    j.persons[0].parents = [{ id: 1, kind: "foster" }];
    expect(() => deserializeWorld(JSON.stringify(j))).toThrow(
      /birth, adopted or step/,
    );
  });
});

describe("old-save migration", () => {
  test("a v4 save gets parent links from the player's role rows", () => {
    const w = newLife(bundles, 11);
    const j = JSON.parse(serializeWorld(w));
    j.schemaVersion = 5;
    for (const p of j.persons) delete p.parents;
    const raw = { schemaVersion: 5, lives: [{ id: "a", name: "A", world: j }] };
    const migrated = migrateSave(raw) as {
      lives: { world: { persons: unknown[] } }[];
    };
    expect(migrated.lives[0]?.world.persons).toBeDefined();
    const world = deserializeWorld(
      JSON.stringify((migrated.lives[0] as { world: unknown }).world),
    );
    expect(world.schemaVersion).toBe(6);
    for (const p of w.persons.values())
      expect(getPerson(world, p.id).parents).toEqual(p.parents);
    expect(worldHash(world)).toBe(worldHash(w));
  });

  test("grandparent and child role rows become tree links", () => {
    const t = tree({ me: [["dad"]], dad: [], gp: [], kid: [] });
    let w = t.w;
    w = putRelationship(w, {
      from: w.playerId,
      to: t.ids.dad as number,
      role: "core-loop/parent",
      closeness: 50,
    });
    w = putRelationship(w, {
      from: w.playerId,
      to: t.ids.gp as number,
      role: "core-loop/grandparent",
      closeness: 50,
    });
    w = putRelationship(w, {
      from: w.playerId,
      to: t.ids.kid as number,
      role: "core-loop/child",
      closeness: 50,
    });
    const j = JSON.parse(serializeWorld(w));
    j.schemaVersion = 5;
    for (const p of j.persons) delete p.parents;
    const out = migrateSave({
      schemaVersion: 5,
      lives: [{ id: "a", name: "A", world: j }],
    }) as {
      lives: { world: unknown }[];
    };
    const m = deserializeWorld(JSON.stringify(out.lives[0]?.world));
    expect(kinshipOf(m, m.playerId, t.ids.dad as number)).toBe("parent");
    expect(kinshipOf(m, m.playerId, t.ids.gp as number)).toBe("grandparent");
    expect(kinshipOf(m, m.playerId, t.ids.kid as number)).toBe("child");
  });

  test("a full save file round-trips and loads at the current schema", () => {
    const w = newLife(bundles, 4);
    const text = serializeSave({
      schemaVersion: 6,
      packVersions: [{ id: "life", version: "1" }],
      lives: [{ id: "a", name: "A", updatedAt: 1, world: w }],
      graveyard: [],
    });
    const save = parseSave(text);
    expect(worldHash(save.lives[0]?.world as World)).toBe(worldHash(w));
  });
});
