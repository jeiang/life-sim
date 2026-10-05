import type { Obituary, World } from "../state/types.ts";

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

/** A finished life in the graveyard. */
export interface GraveyardEntry {
  /** The id the life had while ongoing. */
  readonly id: string;
  readonly name: string;
  readonly updatedAt?: number;
  readonly obituary: Obituary;
}

/** The whole save: what is exported and imported as one file. */
export interface SaveFile {
  /** Core save schema version (`SAVE_SCHEMA_VERSION`). */
  readonly schemaVersion: number;
  /** Packs (and versions) the file's lives were last saved with, sorted by id. */
  readonly packVersions: readonly {
    readonly id: string;
    readonly version: string;
  }[];
  readonly lives: readonly SavedLife[];
  readonly graveyard: readonly GraveyardEntry[];
}
