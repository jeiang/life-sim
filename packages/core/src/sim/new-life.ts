import type { PackBundle } from "../pack.ts";
import type { PersonId, World } from "../state/types.ts";
import {
  addJournalLine,
  clamp,
  createWorld,
  nextStream,
  updatePerson,
} from "../state/world.ts";
import { spawnPerson } from "./ops.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";

/**
 * Which Pack people data builds the family. Ids may be full (`core-loop/parents`) or short
 * (`parents`, matched against any Pack). Anything the Packs do not define is skipped.
 */
export interface FamilySpec {
  /** Generator for the player's name; absent or unknown: the first generator's names. */
  readonly player: string;
  readonly parent: {
    readonly role: string;
    readonly generator: string;
    readonly count: number;
  };
  readonly sibling: {
    readonly role: string;
    readonly generator: string;
    /** Inclusive count range. */
    readonly count: readonly [number, number];
  };
}

export const DEFAULT_FAMILY: FamilySpec = {
  player: "player",
  parent: { role: "parent", generator: "parents", count: 2 },
  sibling: { role: "sibling", generator: "siblings", count: [0, 2] },
};

export interface NewLifeOptions {
  /** Override the generated first name. */
  readonly givenName?: string;
  /** Override the generated family name (parents and siblings share it). */
  readonly familyName?: string;
  readonly family?: Partial<FamilySpec>;
}

function resolve(
  map: ReadonlyMap<string, unknown>,
  id: string,
): string | undefined {
  if (map.has(id)) return id;
  for (const k of [...map.keys()].sort()) if (k.endsWith(`/${id}`)) return k;
  return undefined;
}

/**
 * Create a new life at age 0: the player with starting stats drawn from the manifest ranges
 * and quality defaults, parents and siblings from Pack people data, and a birth journal line.
 * Deterministic in `seed`.
 */
export function newLife(
  bundles: readonly PackBundle[],
  seed: number,
  opts: NewLifeOptions = {},
): World {
  const idx = indexBundles(bundles);
  const family: FamilySpec = { ...DEFAULT_FAMILY, ...opts.family };
  const packVersions = bundles.map((b) => ({
    id: b.id,
    version: String(b.version),
  }));

  // The player's name, stats and qualities.
  const seeded = createWorld({
    seed,
    player: { givenName: "", familyName: "", age: 0 },
    packVersions,
  });
  const [w0, rng] = nextStream(seeded, 0, "birth/player");
  const genId =
    resolve(idx.generators, family.player) ??
    [...idx.generators.keys()].sort()[0];
  const gen = genId ? idx.generators.get(genId) : undefined;
  const pick = (xs: readonly string[] | undefined, fallback: string): string =>
    xs?.length ? (xs[rng.int(xs.length)] as string) : fallback;
  const givenName = opts.givenName ?? pick(gen?.firstNames, "Player");
  const familyName = opts.familyName ?? pick(gen?.lastNames, "Player");
  const stats: Record<string, number> = {};
  for (const s of idx.stats) {
    const [lo, hi] = s.start;
    stats[s.id] = clamp(lo + rng.int(hi - lo + 1), 0, 100);
  }
  const qualities: Record<string, number | boolean> = {};
  for (const [id, q] of idx.qualities) qualities[id] = q.default;
  let w = updatePerson(w0, w0.playerId, (p) => ({
    ...p,
    givenName,
    familyName,
    stats,
    qualities,
  }));
  w = addJournalLine(w, 0, `${givenName} ${familyName} was born.`);

  // Family.
  w = spawnFamily(w, idx, w.playerId, family, familyName);
  return w;
}

function spawnFamily(
  world: World,
  idx: PackIndex,
  playerId: PersonId,
  family: FamilySpec,
  familyName: string,
): World {
  let w = world;
  const parentRole = resolve(idx.roles, family.parent.role);
  const parentGen = resolve(idx.generators, family.parent.generator);
  if (parentRole && parentGen) {
    for (let i = 0; i < family.parent.count; i++)
      w = spawnPerson(w, idx, playerId, parentRole, parentGen, {
        familyName,
      })[0];
  }
  const sibRole = resolve(idx.roles, family.sibling.role);
  const sibGen = resolve(idx.generators, family.sibling.generator);
  if (sibRole && sibGen) {
    const [lo, hi] = family.sibling.count;
    const [w2, rng] = nextStream(w, 0, "birth/siblings");
    w = w2;
    const n = lo + rng.int(hi - lo + 1);
    for (let i = 0; i < n; i++)
      w = spawnPerson(w, idx, playerId, sibRole, sibGen, { familyName })[0];
  }
  return w;
}
