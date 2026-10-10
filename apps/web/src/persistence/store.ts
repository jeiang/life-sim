import {
  applyPackMigrations,
  applyPackMigrationsToSave,
  canonicalStringify,
  checkSaveVersion,
  type GraveyardEntry,
  migrateObituary,
  type PackBundle,
  readSave,
  SAVE_SCHEMA_VERSION,
  type SavedLife,
  type SaveFile,
  worldToJson,
} from "@life/core";
import { openDb, request, run } from "./idb.ts";

const DB_NAME = "life-sim";
const DB_VERSION = 1;
const LIVES = "lives";
const GRAVEYARD = "graveyard";

/** One stored row: the entry as canonical JSON text, tagged with the schema it was written under. */
interface Row {
  readonly id: string;
  readonly schemaVersion: number;
  readonly data: string;
}

/** A row that could not be loaded (damaged or from a newer build); left untouched in the store. */
export interface LoadProblem {
  readonly id: string;
  readonly error: string;
}

export interface Loaded<T> {
  readonly items: readonly T[];
  readonly problems: readonly LoadProblem[];
}

export type ConflictPolicy = "keep-newer" | "overwrite";

export interface ImportSummary {
  readonly livesAdded: number;
  readonly livesReplaced: number;
  readonly livesSkipped: number;
  readonly graveyardAdded: number;
}

const lifeRow = (life: SavedLife): Row => ({
  id: life.id,
  schemaVersion: SAVE_SCHEMA_VERSION,
  data: canonicalStringify({ ...life, world: worldToJson(life.world) }),
});

const graveRow = (g: GraveyardEntry): Row => ({
  id: g.id,
  schemaVersion: SAVE_SCHEMA_VERSION,
  data: canonicalStringify(g),
});

/** Decode one row through the Core save checks by wrapping it as a one-entry save file. */
function decode(
  row: Row,
  kind: "lives" | "graveyard",
): SavedLife | GraveyardEntry {
  const entry: unknown = JSON.parse(row.data);
  const file = checkSaveVersion({
    schemaVersion: row.schemaVersion,
    capabilities: [],
    appliedMigrations: [],
    lives: kind === "lives" ? [entry] : [],
    graveyard: kind === "graveyard" ? [entry] : [],
  });
  const save = readSave(file);
  const out = kind === "lives" ? save.lives[0] : save.graveyard[0];
  if (!out) throw new Error("empty row");
  return out;
}

const message = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export interface LifeStore {
  /** Insert or overwrite one ongoing life. */
  saveLife(life: SavedLife): Promise<void>;
  /** All ongoing lives, newest first, with Pack migrations applied (and written back when they changed anything). */
  loadLives(bundles: readonly PackBundle[]): Promise<Loaded<SavedLife>>;
  /** All graveyard entries, newest first. */
  loadGraveyard(
    bundles: readonly PackBundle[],
  ): Promise<Loaded<GraveyardEntry>>;
  deleteLife(id: string): Promise<void>;
  /**
   * In one transaction: write the life's obituary to the graveyard and delete the life.
   * `life.world.ended` must be set (only death moves a life to the graveyard).
   */
  moveToGraveyard(life: SavedLife): Promise<GraveyardEntry>;
  /** Everything as one `SaveFile` (what export writes). Rows that fail to load are omitted and reported. */
  exportAll(
    bundles: readonly PackBundle[],
  ): Promise<{ save: SaveFile; problems: readonly LoadProblem[] }>;
  /** Merge an already validated save into the store. */
  importSave(
    save: SaveFile,
    bundles: readonly PackBundle[],
    onConflict?: ConflictPolicy,
  ): Promise<ImportSummary>;
  close(): void;
}

const newestFirst = <T extends { updatedAt?: number }>(a: T, b: T): number =>
  (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

/** Open (creating if needed) the IndexedDB-backed store. `factory` is injectable for tests. */
export async function openLifeStore(
  factory: IDBFactory = indexedDB,
): Promise<LifeStore> {
  const db = await openDb(factory, DB_NAME, DB_VERSION, (d) => {
    if (!d.objectStoreNames.contains(LIVES))
      d.createObjectStore(LIVES, { keyPath: "id" });
    if (!d.objectStoreNames.contains(GRAVEYARD))
      d.createObjectStore(GRAVEYARD, { keyPath: "id" });
  });

  async function readAll<T extends { updatedAt?: number }>(
    store: string,
    kind: "lives" | "graveyard",
  ): Promise<{ items: T[]; problems: LoadProblem[]; rows: Map<string, Row> }> {
    const rows = await run(db, store, "readonly", (tx) =>
      request(tx.objectStore(store).getAll() as IDBRequest<Row[]>),
    );
    const items: T[] = [];
    const problems: LoadProblem[] = [];
    const byId = new Map<string, Row>();
    for (const row of rows) {
      byId.set(row.id, row);
      try {
        items.push(decode(row, kind) as unknown as T);
      } catch (e) {
        problems.push({ id: row.id, error: message(e) });
      }
    }
    return { items: items.sort(newestFirst), problems, rows: byId };
  }

  const putAll = (store: string, rows: readonly Row[]): Promise<void> =>
    rows.length === 0
      ? Promise.resolve()
      : run(db, store, "readwrite", async (tx) => {
          const os = tx.objectStore(store);
          for (const r of rows) await request(os.put(r));
        });

  const self: LifeStore = {
    saveLife: (life) => putAll(LIVES, [lifeRow(life)]),

    async loadLives(bundles) {
      const { items, problems, rows } = await readAll<SavedLife>(
        LIVES,
        "lives",
      );
      const migrated = items.map((l) => ({
        ...l,
        world: applyPackMigrations(l.world, bundles),
      }));
      const stale = migrated
        .map(lifeRow)
        .filter(
          (r) =>
            rows.get(r.id)?.data !== r.data ||
            rows.get(r.id)?.schemaVersion !== r.schemaVersion,
        );
      await putAll(LIVES, stale);
      return { items: migrated, problems };
    },

    async loadGraveyard(bundles) {
      const { items, problems } = await readAll<GraveyardEntry>(
        GRAVEYARD,
        "graveyard",
      );
      return {
        items: items.map((g) => ({
          ...g,
          obituary: migrateObituary(g.obituary, bundles),
        })),
        problems,
      };
    },

    deleteLife: (id) =>
      run(db, LIVES, "readwrite", async (tx) => {
        await request(tx.objectStore(LIVES).delete(id));
      }),

    async moveToGraveyard(life) {
      const obituary = life.world.ended;
      if (!obituary)
        throw new Error(
          "Only a life that has ended can move to the graveyard.",
        );
      const entry: GraveyardEntry = {
        id: life.id,
        name: life.name,
        ...(life.updatedAt === undefined ? {} : { updatedAt: life.updatedAt }),
        obituary,
      };
      await run(db, [LIVES, GRAVEYARD], "readwrite", async (tx) => {
        await request(tx.objectStore(GRAVEYARD).put(graveRow(entry)));
        await request(tx.objectStore(LIVES).delete(life.id));
      });
      return entry;
    },

    async exportAll(bundles) {
      const lives = await self.loadLives(bundles);
      const grave = await self.loadGraveyard(bundles);
      const sorted = (ids: Iterable<string>) =>
        [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const save: SaveFile = {
        schemaVersion: SAVE_SCHEMA_VERSION,
        capabilities: sorted(lives.items.flatMap((l) => l.world.capabilities)),
        appliedMigrations: sorted(
          lives.items.flatMap((l) => l.world.appliedMigrations),
        ),
        lives: lives.items,
        graveyard: grave.items,
      };
      return { save, problems: [...lives.problems, ...grave.problems] };
    },

    async importSave(save, bundles, onConflict = "keep-newer") {
      const migrated = applyPackMigrationsToSave(save, bundles);
      return run(db, [LIVES, GRAVEYARD], "readwrite", async (tx) => {
        const lives = tx.objectStore(LIVES);
        const grave = tx.objectStore(GRAVEYARD);
        let livesAdded = 0;
        let livesReplaced = 0;
        let livesSkipped = 0;
        let graveyardAdded = 0;
        for (const life of migrated.lives) {
          // A life already in the graveyard stays dead, whatever an older backup says.
          if ((await request(grave.getKey(life.id))) !== undefined) {
            livesSkipped++;
            continue;
          }
          const existing = (await request(lives.get(life.id))) as
            | Row
            | undefined;
          if (existing) {
            let keep = false;
            if (onConflict === "keep-newer") {
              try {
                const cur = decode(existing, "lives") as SavedLife;
                keep = (cur.updatedAt ?? 0) >= (life.updatedAt ?? 0);
              } catch {
                keep = false; // the stored row is unreadable; the import repairs it
              }
            }
            if (keep) {
              livesSkipped++;
              continue;
            }
            livesReplaced++;
          } else livesAdded++;
          await request(lives.put(lifeRow(life)));
        }
        for (const g of migrated.graveyard) {
          if ((await request(grave.getKey(g.id))) !== undefined) continue;
          await request(grave.put(graveRow(g)));
          // A life that died after the backup was made must not linger as ongoing.
          await request(lives.delete(g.id));
          graveyardAdded++;
        }
        return { livesAdded, livesReplaced, livesSkipped, graveyardAdded };
      });
    },

    close: () => db.close(),
  };
  return self;
}
