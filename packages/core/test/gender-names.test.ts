import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  type CompiledGenerator,
  type Gender,
  getPerson,
  indexBundles,
  newLife,
  type PackBundle,
  spawnPerson,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));

const POOLS = { male: ["Al", "Ben"], female: ["Cy", "Di"] };

/** The fixture's generators, with `local` given gender pools and optional gender weights. */
function withLocal(
  extra: Partial<Pick<CompiledGenerator, "genderWeights">>,
): PackBundle[] {
  return compiled.bundles.map((b) => ({
    ...b,
    people: b.people.map((p) =>
      p.type === "generator" &&
      (p.id.endsWith("/local") || p.id.endsWith("/player"))
        ? {
            ...p,
            firstNames: {
              ...POOLS,
              nonbinary: [...POOLS.male, ...POOLS.female],
            },
            ...extra,
          }
        : p,
    ),
  }));
}

function spawnMany(bundles: PackBundle[], n: number) {
  const idx = indexBundles(bundles);
  const gen = [...idx.generators.keys()].find((k) => k.endsWith("/local"));
  if (!gen) throw new Error("no local generator");
  let w = newLife(bundles, 7);
  const out: { name: string; gender: Gender | undefined }[] = [];
  for (let i = 0; i < n; i++) {
    const [w2, id] = spawnPerson(w, idx, w.playerId, "life/neighbour", gen);
    w = w2;
    const p = getPerson(w, id);
    out.push({ name: p.givenName, gender: p.gender });
  }
  return out;
}

describe("generator first names and gender", () => {
  test("a first name always comes from the pool of the drawn gender", () => {
    const seen = new Set<Gender | undefined>();
    for (const { name, gender } of spawnMany(withLocal({}), 60)) {
      seen.add(gender);
      expect(POOLS[gender as "male" | "female"]).toContain(name);
    }
    expect(seen).toEqual(new Set(["male", "female"]));
  });

  test("generator gender weights are respected, including a fixed gender", () => {
    const only = (g: Gender) => ({
      genderWeights: { male: 0, female: 0, nonbinary: 0, [g]: 1 },
    });
    for (const g of ["male", "female"] as const)
      for (const p of spawnMany(withLocal(only(g)), 20)) {
        expect(p.gender).toBe(g);
        expect(POOLS[g]).toContain(p.name);
      }
    for (const p of spawnMany(withLocal(only("nonbinary")), 40)) {
      expect(p.gender).toBe("nonbinary");
      expect([...POOLS.male, ...POOLS.female]).toContain(p.name);
    }
  });

  test("the player's name follows the player's gender", () => {
    const bundles = withLocal({});
    const idx = indexBundles(bundles);
    const player = idx.generators.get("life/player") as CompiledGenerator;
    for (let seed = 0; seed < 30; seed++) {
      const w = newLife(bundles, seed);
      const p = getPerson(w, w.playerId);
      const pool = player.firstNames[p.gender as Gender];
      expect(pool).toContain(p.givenName);
    }
  });
});
