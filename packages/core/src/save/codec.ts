import type { PackBundle } from "../pack.ts";
import { canonicalStringify, deserializeWorld } from "../state/serialize.ts";
import type { Obituary, World } from "../state/types.ts";
import { migrateSave, SAVE_SCHEMA_VERSION, SaveError } from "./migrate.ts";
import type { GraveyardEntry, SavedLife, SaveFile } from "./types.ts";

type Json = Record<string, unknown>;

/** A World as plain JSON (persons as an id-ordered array), the form that is stored and exported. */
export function worldToJson(world: World): Json {
  return {
    ...world,
    persons: [...world.persons.values()].sort((a, b) => a.id - b.id),
  } as unknown as Json;
}

/** Canonical JSON text of a save; identical for equal saves on every engine. */
export function serializeSave(save: SaveFile): string {
  return canonicalStringify({
    ...save,
    lives: save.lives.map((l) => ({ ...l, world: worldToJson(l.world) })),
  });
}

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function bad(path: string, what: string): never {
  throw new SaveError(`This save is damaged: ${path} should be ${what}.`);
}
const str = (v: unknown, p: string): string =>
  typeof v === "string" ? v : bad(p, "text");
const optTime = (v: unknown, p: string): number | undefined =>
  v === undefined
    ? undefined
    : typeof v === "number" && Number.isFinite(v)
      ? v
      : bad(p, "a number");

function packVersions(v: unknown, p: string): SaveFile["packVersions"] {
  if (!Array.isArray(v)) return bad(p, "a list");
  return v.map((x, i) => {
    if (!isObj(x)) return bad(`${p}[${i}]`, "an object");
    return {
      id: str(x.id, `${p}[${i}].id`),
      version: str(x.version, `${p}[${i}].version`),
    };
  });
}

function world(v: unknown, p: string): World {
  if (!isObj(v)) return bad(p, "an object");
  if (v.schemaVersion !== SAVE_SCHEMA_VERSION)
    return bad(`${p}.schemaVersion`, `${SAVE_SCHEMA_VERSION}`);
  try {
    return deserializeWorld(JSON.stringify(v));
  } catch (e) {
    throw new SaveError(
      `This save is damaged: ${p}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function obituary(v: unknown, p: string): Obituary {
  if (!isObj(v)) return bad(p, "an object");
  // Reuse the world parser's obituary check by embedding it in a minimal world.
  const w = world(
    {
      schemaVersion: SAVE_SCHEMA_VERSION,
      seed: 0,
      playerId: 0,
      nextId: 1,
      persons: [],
      relationships: [],
      journal: [],
      rngCounters: {},
      pending: null,
      ended: v,
      storyletLog: {},
      choiceLog: [],
      packVersions: [],
    },
    p,
  );
  return w.ended as Obituary;
}

function ids(list: readonly { id: string }[], what: string): void {
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.id))
      throw new SaveError(
        `This save is damaged: two ${what} share the id "${x.id}".`,
      );
    seen.add(x.id);
  }
}

/**
 * Check a raw, already migrated save and turn it into a `SaveFile`.
 * Throws `SaveError` naming the first thing wrong.
 */
export function readSave(raw: Json): SaveFile {
  if (!Array.isArray(raw.lives)) return bad("lives", "a list");
  if (!Array.isArray(raw.graveyard)) return bad("graveyard", "a list");
  const lives: SavedLife[] = raw.lives.map((l: unknown, i: number) => {
    const p = `lives[${i}]`;
    if (!isObj(l)) return bad(p, "an object");
    const updatedAt = optTime(l.updatedAt, `${p}.updatedAt`);
    return {
      id: str(l.id, `${p}.id`),
      name: str(l.name, `${p}.name`),
      ...(updatedAt === undefined ? {} : { updatedAt }),
      world: world(l.world, `${p}.world`),
    };
  });
  const graveyard: GraveyardEntry[] = raw.graveyard.map(
    (g: unknown, i: number) => {
      const p = `graveyard[${i}]`;
      if (!isObj(g)) return bad(p, "an object");
      const updatedAt = optTime(g.updatedAt, `${p}.updatedAt`);
      return {
        id: str(g.id, `${p}.id`),
        name: str(g.name, `${p}.name`),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        obituary: obituary(g.obituary, `${p}.obituary`),
      };
    },
  );
  ids(lives, "lives");
  ids(graveyard, "graveyard entries");
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    packVersions: packVersions(raw.packVersions, "packVersions"),
    lives,
    graveyard,
  };
}

/** Parse text, migrate and validate: the load path. Throws `SaveError`. */
export function parseSave(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("This file is not valid JSON, so it cannot be a save.");
  }
  return readSave(migrateSave(raw));
}

export type ImportResult =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly error: string };

/**
 * Validate an imported file (text or parsed JSON). With `bundles`, also reject saves that
 * need a Pack this build lacks or a newer Pack version than it has. Never throws.
 */
export function validateImport(
  input: unknown,
  bundles?: readonly PackBundle[],
): ImportResult {
  try {
    let raw = input;
    if (typeof input === "string") {
      try {
        raw = JSON.parse(input);
      } catch {
        throw new SaveError(
          "This file is not valid JSON, so it cannot be a save.",
        );
      }
    }
    const save = readSave(migrateSave(raw));
    if (bundles) {
      const have = new Map(bundles.map((b) => [b.id, b.version]));
      const needed = [
        ...save.packVersions,
        ...save.lives.flatMap((l) => l.world.packVersions),
      ];
      for (const { id, version } of needed) {
        const cur = have.get(id);
        if (cur === undefined)
          throw new SaveError(
            `This save needs the content pack "${id}", which this version of the game does not include.`,
          );
        if (Number(version) > cur)
          throw new SaveError(
            `This save was made with a newer "${id}" content pack (version ${version}; this build has ${cur}). Update the app and try again.`,
          );
      }
    }
    return { ok: true, save };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
