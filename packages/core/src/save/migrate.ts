import { SCHEMA_VERSION } from "../state/types.ts";

/** Core save schema version: the file's and every World's `schemaVersion`. */
export const SAVE_SCHEMA_VERSION = SCHEMA_VERSION;

type Json = Record<string, unknown>;

/** Thrown for any save that cannot be loaded; the message is fit to show the player. */
export class SaveError extends Error {
  override readonly name = "SaveError";
}

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A step that upgrades a raw save from version N to N + 1 (keyed by N). */
export type Migration = (raw: Json) => Json;

function mapWorlds(raw: Json, f: (w: Json) => Json): Json {
  const lives = Array.isArray(raw.lives) ? raw.lives : [];
  return {
    ...raw,
    lives: lives.map((l) =>
      isObj(l) && isObj(l.world) ? { ...l, world: f(l.world) } : l,
    ),
  };
}

/**
 * Version 0 was the prototype layout: no file-level `packVersions`, and worlds without
 * `pending`, `ended`, `storyletLog` or `choiceLog`. Version 1 adds them.
 */
const v0to1: Migration = (raw) => {
  const migrated = mapWorlds(raw, (w) => ({
    ...w,
    schemaVersion: 1,
    pending: w.pending ?? null,
    ended: w.ended ?? null,
    storyletLog: w.storyletLog ?? {},
    choiceLog: w.choiceLog ?? [],
    packVersions: w.packVersions ?? [],
  }));
  const seen = new Map<string, string>();
  for (const l of migrated.lives as unknown[]) {
    const pv = isObj(l) && isObj(l.world) ? l.world.packVersions : undefined;
    if (!Array.isArray(pv)) continue;
    for (const p of pv)
      if (isObj(p) && typeof p.id === "string" && typeof p.version === "string")
        seen.set(p.id, p.version);
  }
  return {
    ...migrated,
    schemaVersion: 1,
    graveyard: raw.graveyard ?? [],
    packVersions:
      raw.packVersions ??
      [...seen]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, version]) => ({ id, version })),
  };
};

/** Version 2 adds `uses`, the per-year counters of repeatable actions (empty in an old save). */
const v1to2: Migration = (raw) =>
  mapWorlds(raw, (w) => ({ ...w, schemaVersion: 2, uses: w.uses ?? {} }));

/** Version 3 adds the optional `amount` on pending storylets and action log entries; only the stamps change. */
const v2to3: Migration = (raw) =>
  mapWorlds(raw, (w) => ({ ...w, schemaVersion: 3 }));

/** Version 4 adds `generation` and `worldYear` (loaded as generation 0, world year = the player's age when absent). */
const v3to4: Migration = (raw) =>
  mapWorlds(raw, (w) => ({ ...w, schemaVersion: 4 }));

/** Version 5 adds `market` (price series) and `Person.holdings`; both load empty from an old save, and series start at the next settlement. */
const v4to5: Migration = (raw) =>
  mapWorlds(raw, (w) => ({ ...w, schemaVersion: 5 }));

/**
 * Version 6 stores parent links on every person (kinship is derived from them, ADR 0005).
 * An old world gets them from the player's role rows by the last segment of the role id:
 * `parent` rows become the player's parents, `sibling` rows share those parents, `child` rows
 * have the player as parent, and a `grandparent` row becomes a parent of the player's first
 * parent. Everyone else starts with no parents.
 */
const v5to6: Migration = (raw) =>
  mapWorlds(raw, (w) => {
    const persons = (Array.isArray(w.persons) ? w.persons : []).filter(isObj);
    const rows = (Array.isArray(w.relationships) ? w.relationships : []).filter(
      isObj,
    );
    const links = new Map<number, { id: number; kind: string }[]>();
    const link = (child: unknown, parent: unknown): void => {
      if (typeof child !== "number" || typeof parent !== "number") return;
      const list = links.get(child) ?? [];
      if (!list.some((l) => l.id === parent))
        links.set(child, [...list, { id: parent, kind: "birth" }]);
    };
    const rolled = (role: string): unknown[] =>
      rows
        .filter(
          (r) =>
            r.from === w.playerId &&
            typeof r.role === "string" &&
            r.role.slice(r.role.lastIndexOf("/") + 1) === role,
        )
        .map((r) => r.to)
        .sort((a, b) => (a as number) - (b as number));
    const parents = rolled("parent");
    for (const p of parents) link(w.playerId, p);
    for (const s of rolled("sibling")) for (const p of parents) link(s, p);
    for (const c of rolled("child")) link(c, w.playerId);
    for (const g of rolled("grandparent")) link(parents[0], g);
    return {
      ...w,
      schemaVersion: 6,
      persons: persons.map((p) => ({
        ...p,
        parents: (links.get(p.id as number) ?? []).sort((a, b) => a.id - b.id),
      })),
    };
  });

/** Migrations by the version they upgrade from. Append only; never edit a shipped step. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  0: v0to1,
  1: v1to2,
  2: v2to3,
  3: v3to4,
  4: v4to5,
  5: v5to6,
};

/**
 * Upgrade a raw (parsed JSON) save to `target` by running the migration chain. The result
 * is still unvalidated JSON; `validateImport` / `parseSave` check its shape.
 * Throws `SaveError` for non-saves, saves from a newer build, and gaps in the chain.
 */
export function migrateSave(
  raw: unknown,
  chain: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = SAVE_SCHEMA_VERSION,
): Json {
  if (!isObj(raw)) throw new SaveError("This is not a save file.");
  const declared = raw.schemaVersion;
  if (
    typeof declared !== "number" ||
    !Number.isSafeInteger(declared) ||
    declared < 0
  )
    throw new SaveError(
      "This file has no valid save version, so it is not a life-sim save.",
    );
  let v = declared;
  if (v > target)
    throw new SaveError(
      `This save is from a newer version of the game (save version ${v}, this build reads up to ${target}). Update the app and try again.`,
    );
  let cur = raw;
  while (v < target) {
    const step = chain[v];
    if (!step)
      throw new SaveError(
        `This save (version ${v}) is too old to upgrade: no migration exists.`,
      );
    cur = step(cur);
    v += 1;
    if (cur.schemaVersion !== v) cur = { ...cur, schemaVersion: v };
  }
  return cur;
}
