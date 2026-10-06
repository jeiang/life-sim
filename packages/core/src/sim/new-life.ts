import type { FamilyDecl, PackBundle } from "../pack.ts";
import type {
  ChoiceEntry,
  CustomStart,
  PersonId,
  World,
} from "../state/types.ts";
import {
  addJournalLine,
  clamp,
  createWorld,
  nextStream,
  personsInIdOrder,
  updatePerson,
} from "../state/world.ts";
import {
  drawGender,
  NAME_ROLL_RANGE,
  pickFirstName,
  spawnPerson,
} from "./ops.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";

/**
 * Which Pack people data builds the family; a Pack manifest's `family` is the default.
 * Ids may be full (`core-loop/parent-gen`) or short (matched against any Pack). Anything
 * the Packs do not define is skipped.
 */
export type FamilySpec = FamilyDecl;

/** Used when no Pack declares a family. */
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
  /** Birth city (full id); default: a weighted random draw over the Pack cities. */
  readonly cityId?: string;
  /** Overrides the manifest family (or the default) field by field. */
  readonly family?: Partial<FamilySpec>;
  /**
   * God mode custom life: fixes names, gender, starting stats and family size, and records a
   * `start` entry as choice 0 so `replay` rebuilds it.
   */
  readonly custom?: CustomStart;
  /**
   * 18+ mode was on when the life began: records a `mature` entry as choice 0, so `isMature`
   * (and `replay`) read it from the life, never from settings.
   */
  readonly mature?: boolean;
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
  const family: FamilySpec = {
    ...(idx.family ?? DEFAULT_FAMILY),
    ...opts.family,
  };
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
    (family.player ? resolve(idx.generators, family.player) : undefined) ??
    [...idx.generators.keys()].sort()[0];
  const gen = genId ? idx.generators.get(genId) : undefined;
  const pick = (xs: readonly string[] | undefined, fallback: string): string =>
    xs?.length ? (xs[rng.int(xs.length)] as string) : fallback;
  const { custom } = opts;
  // The first-name roll sits where the name draw always was; the gender drawn last picks the pool.
  const nameRoll = rng.int(NAME_ROLL_RANGE);
  const familyName =
    custom?.familyName ?? opts.familyName ?? pick(gen?.lastNames, "Player");
  const stats: Record<string, number> = {};
  for (const s of idx.stats) {
    const [lo, hi] = s.start;
    // Drawn even when overridden, so the streams after it match a plain life.
    const drawn = clamp(lo + rng.int(hi - lo + 1), 0, 100);
    stats[s.id] = custom ? clamp(custom.stats[s.id] ?? drawn, 0, 100) : drawn;
  }
  const qualities: Record<string, number | boolean> = {};
  for (const [id, q] of idx.qualities) qualities[id] = q.default;
  // Drawn last and always, so the other draws match a plain life.
  const drawnGender = drawGender(rng, gen);
  const gender = custom?.gender ?? drawnGender;
  const givenName =
    custom?.givenName ??
    opts.givenName ??
    pickFirstName(gen, gender, nameRoll, "Player");
  let w = updatePerson(w0, w0.playerId, (p) => ({
    ...p,
    givenName,
    familyName,
    gender,
    stats,
    qualities,
  }));
  w = addJournalLine(w, 0, `${givenName} ${familyName} was born.`);

  // Family.
  w = spawnFamily(w, idx, w.playerId, family, familyName, custom);

  // Birth city: the whole family lives there, and the player with them.
  const chosen = opts.cityId ?? custom?.cityId;
  if (chosen !== undefined && !idx.cities.has(chosen))
    throw new RangeError(`unknown city '${chosen}'`);
  let cityId = chosen;
  if (cityId === undefined && idx.cities.size > 0) {
    const [w4, cityRng] = nextStream(w, 0, "birth/city");
    w = w4;
    const cities = [...idx.cities.values()].sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    let roll = cityRng.int(cities.reduce((n, c) => n + c.weight, 0));
    for (const c of cities) {
      if (roll < c.weight) {
        cityId = c.id;
        break;
      }
      roll -= c.weight;
    }
  }
  for (const p of personsInIdOrder(w)) {
    w = updatePerson(w, p.id, (x) => ({
      ...x,
      ...(cityId === undefined ? {} : { cityId }),
      ...(x.id === w.playerId ? { withParents: true } : {}),
    }));
  }
  const head: ChoiceEntry[] = [
    ...(opts.mature ? [{ t: "mature" } as const] : []),
    ...(custom ? [{ t: "start", ...custom } as const] : []),
  ];
  return head.length > 0 ? { ...w, choiceLog: [...w.choiceLog, ...head] } : w;
}

function spawnFamily(
  world: World,
  idx: PackIndex,
  playerId: PersonId,
  family: FamilySpec,
  familyName: string,
  custom: CustomStart | undefined,
): World {
  let w = world;
  const parentRole = resolve(idx.roles, family.parent.role);
  const parentGen = resolve(idx.generators, family.parent.generator);
  if (parentRole && parentGen) {
    for (let i = 0; i < (custom?.parents ?? family.parent.count); i++)
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
    const n = custom ? custom.siblings : lo + rng.int(hi - lo + 1);
    for (let i = 0; i < n; i++)
      w = spawnPerson(w, idx, playerId, sibRole, sibGen, { familyName })[0];
  }
  return w;
}
