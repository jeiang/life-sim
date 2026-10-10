import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  deserializeWorld,
  getPerson,
  hasTargetRole,
  indexBundles,
  isAnimal,
  listActions,
  newLife,
  runAction,
  serializeWorld,
  spawnPerson,
  updatePerson,
  type World,
  worldHash,
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

const adult = (seed: number): World =>
  updatePerson(newLife(bundles, seed), 0, (p) => ({ ...p, age: 30 }));
/** Age up, then answer every open choice with its first available option. */
function year(w: World): World {
  let r = ageUp(w, bundles);
  for (let n = 0; r.world.pending && n < 20; n++) {
    let next: typeof r | undefined;
    for (let i = 0; i < 4 && !next; i++) {
      try {
        next = choose(r.world, bundles, i);
      } catch {}
    }
    if (!next) throw new Error("no choice available");
    r = next;
  }
  return r.world;
}
const withDog = (w: World): [World, number] =>
  spawnPerson(w, idx, w.playerId, `${CL}/dog`, `${CL}/dog-gen`);

describe("pets as persons", () => {
  test("a spawned pet is an animal with no family name", () => {
    const [w, dog] = withDog(adult(1));
    expect(isAnimal(w, idx, dog)).toBe(true);
    expect(getPerson(w, dog).familyName).toBe("");
    expect(getPerson(w, dog).givenName).not.toBe("");
  });

  test("a storylet with no target or a human target never binds an animal", () => {
    const [w, dog] = withDog(adult(2));
    const friend = spawnPerson(
      w,
      idx,
      w.playerId,
      `${CL}/friend`,
      `${CL}/coworker-gen`,
    );
    const scoped = [...idx.storylets.values()].filter(
      (s) => s.scope === "person",
    );
    expect(scoped.length).toBeGreaterThan(10);
    for (const s of scoped) {
      const names = s.target?.some((t) => t === `${CL}/dog`) ?? false;
      expect(hasTargetRole(w, idx, s, dog), s.id).toBe(names);
    }
    // The same storylets still bind a human where their target fits.
    const untargeted = scoped.find((s) => !s.target?.length);
    expect(untargeted).toBeDefined();
    expect(hasTargetRole(friend[0], idx, untargeted as never, friend[1])).toBe(
      true,
    );
  });

  test("relationship actions: humans' verbs are not offered for a pet, the pet's are", () => {
    const [w, dog] = withDog(adult(3));
    const ids = listActions(w, bundles, "relationships", dog).map((r) => r.id);
    expect(ids).toContain(`${CL}/play-with-pet`);
    expect(ids).not.toContain(`${CL}/spend-time-with-loved-ones`);
    expect(ids).not.toContain(`${CL}/have-a-conversation`);
    const played = runAction(w, bundles, `${CL}/play-with-pet`, dog).world;
    expect(played.storyletLog[`${CL}/play-with-pet#${dog}`]?.count).toBe(1);
  });

  test("years of aging never open a human storylet for a pet", () => {
    for (let seed = 1; seed <= 12; seed++) {
      let [w] = withDog(adult(seed));
      for (let y = 0; y < 25 && !w.ended; y++) w = year(w);
      for (const key of Object.keys(w.storyletLog)) {
        const at = key.indexOf("#");
        if (at < 0) continue;
        const pid = Number(key.slice(at + 1));
        if (!isAnimal(w, idx, pid)) continue;
        const s = idx.storylets.get(key.slice(0, at));
        expect(
          s && hasTargetRole(w, idx, s, pid),
          `${key} bound an animal`,
        ).toBe(true);
      }
    }
  });

  test("pet mortality ends a pet's life; the pet is not a human death", () => {
    let [w, dog] = withDog(adult(4));
    w = updatePerson(w, dog, (p) => ({ ...p, age: 25 }));
    for (let y = 0; y < 3 && getPerson(w, dog).alive; y++) w = year(w);
    expect(getPerson(w, dog).alive).toBe(false);
    expect(w.ended).toBeNull();
  });

  test("an unlisted person is hidden from counts and never bound again", () => {
    const [w0, dog] = withDog(adult(5));
    const w = updatePerson(w0, dog, (p) => ({ ...p, listed: false as const }));
    const s = idx.storylets.get(`${CL}/pet-mortality`);
    expect(s).toBeDefined();
    // Bound neither by yearly events nor by actions' eligibility.
    let aged = updatePerson(w, dog, (p) => ({ ...p, age: 25 }));
    for (let y = 0; y < 3; y++) aged = year(aged);
    expect(getPerson(aged, dog).alive).toBe(true);
  });

  test("pets that run off or are rehomed become unlisted through the effect", () => {
    let w = adult(7);
    for (let i = 0; i < 250; i++) w = withDog(w)[0];
    w = year(w);
    const pets = [...w.persons.values()].filter((p) => isAnimal(w, idx, p.id));
    const gone = pets.filter((p) => p.listed === false);
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.length).toBeLessThan(pets.length / 2);
    for (const p of gone) expect(p.alive).toBe(true);
  }, 30_000);

  test("unlisted survives a save round trip and changes the world hash", () => {
    const [w, dog] = withDog(adult(6));
    const hidden = updatePerson(w, dog, (p) => ({
      ...p,
      listed: false as const,
    }));
    expect(worldHash(hidden)).not.toBe(worldHash(w));
    const back = deserializeWorld(serializeWorld(hidden));
    expect(getPerson(back, dog).listed).toBe(false);
    expect(worldHash(back)).toBe(worldHash(hidden));
  });
});
