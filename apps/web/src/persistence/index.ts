/**
 * Persistence API for the UI (IndexedDB lives and graveyard, autosave, durable-storage
 * request, backup export and import). Pure save format and migrations live in `@life/core`.
 */
export {
  type AutosaveOptions,
  type Autosaver,
  createAutosaver,
} from "./autosave.ts";
export {
  downloadFile,
  type ExportOutcome,
  exportFileFor,
  exportFilename,
  IMPORT_ACCEPT,
  type ImportOutcome,
  importFile,
  MAX_IMPORT_BYTES,
  type PreparedExport,
  prepareExport,
  shareExport,
} from "./backup.ts";
export {
  type PersistState,
  persistState,
  requestPersistence,
  shouldNudgeBackup,
} from "./persist.ts";
export {
  type ConflictPolicy,
  type ImportSummary,
  type LifeStore,
  type Loaded,
  type LoadProblem,
  openLifeStore,
} from "./store.ts";
