import type { PackBundle, PackMigration } from "../pack.ts";
import type {
  Asset,
  Loan,
  Obituary,
  ObituaryOccupation,
  Occupation,
  Person,
  QualityValue,
  World,
} from "../state/types.ts";
import type { SaveFile } from "./types.ts";

type Resolve = (id: string) => string | null;

const sortedIds = (ids: Iterable<string>): string[] =>
  [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const allMigrations = (bundles: readonly PackBundle[]): PackMigration[] =>
  bundles.flatMap((b) => b.migrations);

/**
 * Merge migrations into one resolver: an old id becomes its renamed id (chains followed),
 * its removal fallback, or null when removed without one. Unlisted ids pass through.
 */
function resolver(migrations: readonly PackMigration[]): Resolve {
  const renamed = new Map<string, string>();
  const removed = new Map<string, string | null>();
  for (const m of migrations) {
    for (const [from, to] of Object.entries(m.renamed)) renamed.set(from, to);
    for (const [from, to] of Object.entries(m.removed)) removed.set(from, to);
  }
  return (id) => {
    let cur = id;
    for (let hops = 0; hops <= renamed.size + removed.size; hops++) {
      const next = renamed.get(cur);
      if (next !== undefined) {
        cur = next;
        continue;
      }
      if (removed.has(cur)) {
        const fallback = removed.get(cur) ?? null;
        if (fallback === null) return null;
        cur = fallback;
        continue;
      }
      return cur;
    }
    return cur;
  };
}

function keys<V>(
  rec: Readonly<Record<string, V>>,
  r: Resolve,
): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(rec)) {
    const nk = r(k);
    if (nk !== null) out[nk] = v;
  }
  return out;
}

const kind = <T extends { kindId: string }>(
  list: readonly T[],
  r: Resolve,
): T[] =>
  list.flatMap((x) => {
    const k = r(x.kindId);
    return k === null ? [] : [{ ...x, kindId: k }];
  });

function person(p: Person, r: Resolve): Person {
  const { cityId, standardId, livedStandardId, ...rest } = p;
  const city = cityId === undefined ? null : r(cityId);
  const standard = standardId === undefined ? null : r(standardId);
  const lived = livedStandardId === undefined ? null : r(livedStandardId);
  return {
    ...rest,
    ...(city === null ? {} : { cityId: city }),
    ...(standard === null ? {} : { standardId: standard }),
    ...(lived === null ? {} : { livedStandardId: lived }),
    stats: keys(p.stats, r),
    qualities: keys<QualityValue>(p.qualities, r),
    occupations: kind<Occupation>(p.occupations, r),
    occupationHistory: kind<Occupation>(p.occupationHistory, r),
    assets: kind<Asset>(p.assets, r).map((a) => {
      const { cityId: assetCity, ...fields } = a;
      const city = assetCity === undefined ? null : r(assetCity);
      return {
        ...fields,
        ...(city === null ? {} : { cityId: city }),
        qualities: keys(a.qualities, r),
      };
    }),
    loans: kind<Loan>(p.loans, r),
  };
}

function career(
  list: readonly ObituaryOccupation[],
  r: Resolve,
): ObituaryOccupation[] {
  // History is kept as written when its kind was removed; only renames and fallbacks apply.
  return list.map((o) => ({ ...o, kindId: r(o.kindId) ?? o.kindId }));
}

function obituary(o: Obituary, r: Resolve): Obituary {
  return {
    ...o,
    career: career(o.career, r),
    education: career(o.education, r),
  };
}

/** Rewrite a graveyard obituary's occupation ids with the Packs' rename/removal migrations. */
export function migrateObituary(
  o: Obituary,
  bundles: readonly PackBundle[],
): Obituary {
  return obituary(o, resolver(allMigrations(bundles)));
}

/**
 * Apply the Pack migrations (renames, removals with optional fallback) to a loaded World,
 * for every installed migration whose id the World has not yet applied, then record the
 * installed migration ids. Removed content without a fallback is dropped from persons, the open
 * storylet and the storylet log; obituary history keeps old ids. Pure and idempotent.
 */
export function applyPackMigrations(
  world: World,
  bundles: readonly PackBundle[],
): World {
  const applied = new Set(world.appliedMigrations);
  const pending = allMigrations(bundles).filter((m) => !applied.has(m.id));
  const r = resolver(pending);

  const persons = new Map<number, Person>();
  for (const [id, p] of world.persons) persons.set(id, person(p, r));

  const relationships = world.relationships.flatMap((x) => {
    const role = r(x.role);
    return role === null ? [] : [{ ...x, role }];
  });

  let open = world.pending;
  if (open) {
    const id = r(open.storyletId);
    if (id === null) open = null;
    else {
      const rest = open.rest && {
        events: open.rest.events.flatMap((e) => {
          const eid = r(e.storyletId);
          return eid === null ? [] : [{ ...e, storyletId: eid }];
        }),
      };
      open = { ...open, storyletId: id, ...(rest ? { rest } : {}) };
    }
  }

  const storyletLog: Record<string, { count: number; lastAge: number }> = {};
  for (const [key, rec] of Object.entries(world.storyletLog)) {
    const hash = key.indexOf("#");
    const base = hash < 0 ? key : key.slice(0, hash);
    const nb = r(base);
    if (nb === null) continue;
    const nk = hash < 0 ? nb : nb + key.slice(hash);
    const prior = storyletLog[nk];
    storyletLog[nk] = prior
      ? {
          count: prior.count + rec.count,
          lastAge: Math.max(prior.lastAge, rec.lastAge),
        }
      : { ...rec };
  }

  const uses: Record<string, number> = {};
  for (const [key, n] of Object.entries(world.uses)) {
    const hash = key.indexOf("#");
    const nb = r(hash < 0 ? key : key.slice(0, hash));
    if (nb === null) continue;
    const nk = hash < 0 ? nb : nb + key.slice(hash);
    uses[nk] = (uses[nk] ?? 0) + n;
  }

  return {
    ...world,
    persons,
    relationships,
    pending: open,
    storyletLog,
    uses,
    ended: world.ended ? obituary(world.ended, r) : null,
    appliedMigrations: sortedIds([
      ...world.appliedMigrations,
      ...pending.map((m) => m.id),
    ]),
  };
}

/** Apply `applyPackMigrations` to every life and every graveyard obituary in a save. */
export function applyPackMigrationsToSave(
  save: SaveFile,
  bundles: readonly PackBundle[],
): SaveFile {
  const migrations = allMigrations(bundles);
  const r = resolver(
    migrations.filter((m) => !save.appliedMigrations.includes(m.id)),
  );
  const lives = save.lives.map((l) => ({
    ...l,
    world: applyPackMigrations(l.world, bundles),
  }));
  return {
    ...save,
    lives,
    graveyard: save.graveyard.map((g) => ({
      ...g,
      obituary: obituary(g.obituary, r),
    })),
    appliedMigrations: sortedIds([
      ...save.appliedMigrations,
      ...migrations.map((m) => m.id),
    ]),
  };
}
