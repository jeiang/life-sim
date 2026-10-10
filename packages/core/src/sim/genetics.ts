/**
 * Genetics (docs/spec/core-loop.md#genetics): the stats a Pack marks `inherit` are re-drawn for
 * an heir as a random blend of their parents, so a lineage drifts toward its ancestors instead
 * of re-rolling every generation. Parents are the heir's kin `parent` (birth or adoption), the
 * dead player included; an heir with none (a step-child) keeps their stats.
 */
import type { PersonId, World } from "../state/types.ts";
import { clamp, getPerson, nextStream, updatePerson } from "../state/world.ts";
import { kinOf } from "./kinship.ts";
import type { PackIndex } from "./pack-index.ts";

/** The heir's world with every inheriting stat re-drawn (see the file comment). */
export function inheritStats(
  world: World,
  idx: PackIndex,
  heir: PersonId,
): World {
  const genetic = idx.stats.filter((s) => s.inheritBp !== undefined);
  if (genetic.length === 0) return world;
  const parents = kinOf(world, heir)
    .filter((k) => k.kin === "parent")
    .map((k) => getPerson(world, k.id));
  if (parents.length === 0) return world;
  const age = getPerson(world, heir).age;
  let w = world;
  const next: Record<string, number> = {};
  for (const s of genetic) {
    const [w2, rng] = nextStream(w, age, `succession/genetics/${s.id}`);
    w = w2;
    const [lo, hi] = s.start;
    // The blend leans toward one parent or the other by a draw; the fresh draw is the rest.
    const lean = rng.int(101);
    const values = parents.map((p) => p.stats[s.id] ?? lo);
    const a = values[0] as number;
    const b = values[1] ?? a;
    const blend = (lean * a + (100 - lean) * b) / 100;
    const fresh = lo + rng.int(hi - lo + 1);
    const share = s.inheritBp as number;
    next[s.id] = clamp(
      Math.round((share * blend + (10000 - share) * fresh) / 10000),
      0,
      100,
    );
  }
  return updatePerson(w, heir, (p) => ({
    ...p,
    stats: { ...p.stats, ...next },
  }));
}
