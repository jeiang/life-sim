import type { NetWorthPoint } from "../sim/networth.ts";
import type { JournalEntry, Obituary, World } from "../state/types.ts";

/** One ongoing life in the life list. */
export interface SavedLife {
  /** Stable key for this life (the caller generates it; the Core has no clock or entropy). */
  readonly id: string;
  /** Display name for the life list. */
  readonly name: string;
  /** Caller-supplied timestamp (ms since the epoch); the Core never reads a clock. */
  readonly updatedAt?: number;
  readonly world: World;
}

/**
 * One finished generation of a life in the graveyard. A life that passes to an heir
 * (succession) leaves one entry per generation, keyed `lifeId/generation`.
 */
export interface GraveyardEntry {
  /** `${lifeId}/${generation}`. Entries written before generations existed keep the bare life id. */
  readonly id: string;
  /** The id the life had while ongoing; shared by every generation of it. */
  readonly lifeId: string;
  /** The generation that died (`World.generation` at death; 0 for the founder). */
  readonly generation: number;
  readonly name: string;
  readonly updatedAt?: number;
  readonly obituary: Obituary;
  /** That generation's journal, archived at death (succession clears it). */
  readonly journal: readonly JournalEntry[];
  /** That generation's net worth by age, as the UI recorded it. */
  readonly netWorth: readonly NetWorthPoint[];
}

/** The whole save: what is exported and imported as one file. */
export interface SaveFile {
  /** Core save schema version (`SAVE_SCHEMA_VERSION`). */
  readonly schemaVersion: number;
  /** Capability ids the file's lives were last saved with, sorted. */
  readonly capabilities: readonly string[];
  /** Pack migration ids already applied to the file's lives, sorted. */
  readonly appliedMigrations: readonly string[];
  readonly lives: readonly SavedLife[];
  readonly graveyard: readonly GraveyardEntry[];
}
