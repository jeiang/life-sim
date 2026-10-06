import type { PackBundle } from "../pack.ts";
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

/**
 * Merge the migration tables of every bundle into one resolver: an old id becomes its
 * renamed id (chains followed), its removal fallback, or null when removed without one.
 * Unlisted ids pass through.
 */
function resolver(bundles: readonly PackBundle[]): Resolve {
  const renamed = new Map<string, string>();
  const removed = new Map<string, string | null>();
  for (const b of bundles) {
    for (const [from, to] of Object.entries(b.migrations.renamed))
      renamed.set(from, to);
    for (const [from, to] of Object.entries(b.migrations.removed))
      removed.set(from, to);
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
  const { cityId, ...rest } = p;
  const city = cityId === undefined ? null : r(cityId);
  return {
    ...rest,
    ...(city === null ? {} : { cityId: city }),
    stats: keys(p.stats, r),
    qualities: keys<QualityValue>(p.qualities, r),
    occupations: kind<Occupation>(p.occupations, r),
    occupationHistory: kind<Occupation>(p.occupationHistory, r),
    assets: kind<Asset>(p.assets, r).map((a) => ({
      ...a,
      qualities: keys(a.qualities, r),
    })),
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
  return obituary(o, resolver(bundles));
}

/**
 * Apply the Pack migrations (renames, removals with optional fallback) to a loaded World,
 * for every Pack whose recorded version is older than the installed one, then record the
 * installed versions. Removed content without a fallback is dropped from persons, the open
 * storylet and the storylet log; obituary history keeps old ids. Pure and idempotent.
 */
export function applyPackMigrations(
  world: World,
  bundles: readonly PackBundle[],
): World {
  const recorded = new Map(
    world.packVersions.map((p) => [p.id, Number(p.version)]),
  );
  const stale = bundles.filter((b) => {
    const v = recorded.get(b.id);
    return v !== undefined && v < b.version;
  });
  const r = resolver(stale);

  const persons = new Map<number, Person>();
  for (const [id, p] of world.persons) persons.set(id, person(p, r));

  const relationships = world.relationships.flatMap((x) => {
    const role = r(x.role);
    return role === null ? [] : [{ ...x, role }];
  });

  let pending = world.pending;
  if (pending) {
    const id = r(pending.storyletId);
    if (id === null) pending = null;
    else {
      const rest = pending.rest && {
        events: pending.rest.events.flatMap((e) => {
          const eid = r(e.storyletId);
          return eid === null ? [] : [{ ...e, storyletId: eid }];
        }),
      };
      pending = { ...pending, storyletId: id, ...(rest ? { rest } : {}) };
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

  const installed = new Map(bundles.map((b) => [b.id, String(b.version)]));
  const packVersions = [
    ...new Set([...world.packVersions.map((p) => p.id), ...installed.keys()]),
  ]
    .sort()
    .map((id) => ({
      id,
      version: installed.get(id) ?? recorded.get(id)?.toString() ?? "0",
    }));

  return {
    ...world,
    persons,
    relationships,
    pending,
    storyletLog,
    ended: world.ended ? obituary(world.ended, r) : null,
    packVersions,
  };
}

/** Apply `applyPackMigrations` to every life and every graveyard obituary in a save. */
export function applyPackMigrationsToSave(
  save: SaveFile,
  bundles: readonly PackBundle[],
): SaveFile {
  const r = resolver(bundles);
  const lives = save.lives.map((l) => ({
    ...l,
    world: applyPackMigrations(l.world, bundles),
  }));
  const installed = new Map(bundles.map((b) => [b.id, String(b.version)]));
  return {
    ...save,
    lives,
    graveyard: save.graveyard.map((g) => ({
      ...g,
      obituary: obituary(g.obituary, r),
    })),
    packVersions: save.packVersions.map((p) => ({
      ...p,
      version: installed.get(p.id) ?? p.version,
    })),
  };
}
