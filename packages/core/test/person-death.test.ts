import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  addParentLink,
  addPerson,
  ageUp,
  choose,
  deserializeWorld,
  endLife,
  getPerson,
  newLife,
  type PackBundle,
  type PersonId,
  replay,
  runAction,
  scheduledEntries,
  serializeWorld,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");
const FIXTURE = join(HERE, "fixtures", "person-death");

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The real core-loop and karma Packs plus the fixture Pack `pdx`. */
function tree(): string {
  const dir = mkdtempSync(join(tmpdir(), "person-death-"));
  dirs.push(dir);
  for (const p of ["core-loop", "karma"])
    cpSync(join(PACKS, p), join(dir, p), { recursive: true });
  cpSync(join(FIXTURE, "pdx"), join(dir, "pdx"), { recursive: true });
  return dir;
}

function build(): PackBundle[] {
  const out = compilePacks(tree());
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return [...out.bundles];
}

const bundles = build();

const player = (w: World) => getPerson(w, w.playerId);
const q = (w: World, id: string): number =>
  (player(w).qualities[id] as number | undefined) ?? 0;

/** Dead NPCs in the world. Every one should have opened `estate` once. */
const deadNpcs = (w: World): number =>
  [...w.persons.values()].filter((p) => !p.alive && p.id !== w.playerId).length;

/** A new life with a parent (age 60, money 5000) linked to the player. */
function withParent(seed: number): [World, PersonId] {
  const base = newLife(bundles, seed);
  let [w, parent] = addPerson(base, {
    givenName: "Pat",
    familyName: "Parent",
    age: 60,
  });
  w = addParentLink(w, w.playerId, parent);
  w = updatePerson(w, parent, (p) => ({ ...p, money: 5000 }));
  return [w, parent];
}

/** Kill a person through the fixture action `kill`, which applies `die` to the target. */
const kill = (w: World, id: PersonId): World =>
  runAction(w, bundles, "pdx/kill", id).world;

/** One age-up, answering every decision with its first choice. */
function year(w: World): World {
  let r = ageUp(w, bundles).world;
  while (r.pending) r = choose(r, bundles, 0).world;
  return r;
}
const years = (w: World, n: number): World => {
  let r = w;
  for (let i = 0; i < n; i++) r = year(r);
  return r;
};

describe("person_death storylets", () => {
  test("opens once per NPC death, with that person bound", () => {
    const [w0, parent] = withParent(1);
    const before = player(w0).money;
    const w = kill(w0, parent);
    expect(getPerson(w, parent).alive).toBe(false);
    // `estate` opens first (no choice), then the `mourn` decision on the same death.
    expect(q(w, "deaths_seen")).toBe(1);
    expect(q(w, "seen_age")).toBe(60);
    expect(player(w).money - before).toBe(5000);
    expect(w.pending?.storyletId).toBe("pdx/mourn");
    expect(w.pending?.scope).toEqual({ kind: "person", id: parent });
    expect(scheduledEntries(w)).toEqual([]);

    const done = choose(w, bundles, 0).world;
    expect(done.pending).toBeNull();
    expect(q(done, "mourned")).toBe(1);
    expect(q(done, "deaths_seen")).toBe(1);
  });

  test("each NPC death opens the storylet again, for that person", () => {
    const [w0, parent] = withParent(2);
    const first = choose(kill(w0, parent), bundles, 0).world;
    let [w1, kid] = addPerson(first, {
      givenName: "Kim",
      familyName: "Kid",
      age: 30,
    });
    w1 = addParentLink(w1, w1.playerId, kid);
    const second = kill(w1, kid);
    expect(q(second, "deaths_seen")).toBe(2);
    expect(second.pending?.scope).toEqual({ kind: "person", id: kid });
  });

  test("a drained death does not open the storylet again", () => {
    const [w0, parent] = withParent(3);
    const w = years(choose(kill(w0, parent), bundles, 0).world, 2);
    // One `estate` per dead NPC: the parent's death is not counted again each year.
    expect(q(w, "deaths_seen")).toBe(deadNpcs(w));
    expect(q(w, "mourned")).toBe(q(w, "deaths_seen"));
  });

  test("never opens for the player's own death", () => {
    const [w0] = withParent(4);
    const w = endLife(w0, w0.playerId, "illness");
    expect(q(w, "deaths_seen")).toBe(0);
    expect(w.pending).toBeNull();
    expect(scheduledEntries(w)).toEqual([]);
  });

  test("an NPC who dies in the age-up opens the storylet during it, once", () => {
    const [w0, parent] = withParent(5);
    // The `passing` event (chance 100%, once) kills living parents at age-up.
    const w = years(w0, 3);
    expect(getPerson(w, parent).alive).toBe(false);
    expect(q(w, "passed")).toBeGreaterThanOrEqual(1);
    expect(q(w, "deaths_seen")).toBe(deadNpcs(w));
    expect(q(w, "mourned")).toBe(q(w, "deaths_seen"));
    expect(scheduledEntries(w)).toEqual([]);
  });

  test("the same seed and choices replay the same world, deaths included", () => {
    let deaths = 0;
    for (const seed of [1, 2, 3]) {
      const w = years(newLife(bundles, seed), 3);
      deaths += q(w, "deaths_seen");
      expect(worldHash(replay(seed, bundles, w.choiceLog))).toBe(worldHash(w));
    }
    expect(deaths).toBeGreaterThan(0);
  });

  test("a world with a pending death storylet round-trips with the dead person bound", () => {
    const [w0, parent] = withParent(6);
    const w = kill(w0, parent);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
    expect(back.pending?.scope).toEqual({ kind: "person", id: parent });
  });
});
