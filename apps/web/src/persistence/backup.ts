import {
  type PackBundle,
  type SaveFile,
  serializeSave,
  validateImport,
} from "@life/core";
import type {
  ConflictPolicy,
  ImportSummary,
  LifeStore,
  LoadProblem,
} from "./store.ts";

/** Value for the import `<input type="file" accept>`. */
export const IMPORT_ACCEPT = "application/json,.json";

/** Refuse absurd files before reading them: real saves are KBs to low MBs. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export interface PreparedExport {
  readonly file: File;
  /** Rows that could not be read and are missing from the file. */
  readonly problems: readonly LoadProblem[];
  readonly lives: number;
  readonly graveyard: number;
}

export type ExportOutcome = "shared" | "downloaded" | "cancelled";

export function exportFilename(timestamp: number): string {
  const d = new Date(timestamp);
  const p = (n: number) => String(n).padStart(2, "0");
  return `life-sim-backup-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}.json`;
}

export function exportFileFor(save: SaveFile, timestamp: number): File {
  return new File([serializeSave(save)], exportFilename(timestamp), {
    type: "application/json",
  });
}

/**
 * Read everything and build the file. Do this before the user taps "Export" (for example
 * when Settings opens): `shareExport` must run inside the tap's transient user activation,
 * and Safari can let it lapse across a slow async read.
 */
export async function prepareExport(
  store: LifeStore,
  bundles: readonly PackBundle[],
  timestamp: number = Date.now(),
): Promise<PreparedExport> {
  const { save, problems } = await store.exportAll(bundles);
  return {
    file: exportFileFor(save, timestamp),
    problems,
    lives: save.lives.length,
    graveyard: save.graveyard.length,
  };
}

/**
 * Hand the file to the player: the share sheet when the browser can share files (iOS,
 * Android), otherwise a download link. Call from a click handler.
 */
export async function shareExport(file: File): Promise<ExportOutcome> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Life Sim backup" });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        return "cancelled";
      // NotAllowedError (activation lapsed) or an unsupported target: fall back to a download.
    }
  }
  downloadFile(file);
  return "downloaded";
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ImportOutcome =
  | ({ readonly ok: true } & ImportSummary)
  | { readonly ok: false; readonly error: string };

/**
 * Import a file chosen with `<input type="file">`: validate (schema, shape, Pack
 * compatibility), then merge into the store. Never throws; failures come back as `error`
 * text fit to show the player, and nothing is written.
 */
export async function importFile(
  store: LifeStore,
  file: File,
  bundles: readonly PackBundle[],
  onConflict?: ConflictPolicy,
): Promise<ImportOutcome> {
  if (file.size > MAX_IMPORT_BYTES)
    return { ok: false, error: "This file is too large to be a save." };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "The file could not be read." };
  }
  const checked = validateImport(text, bundles);
  if (!checked.ok) return { ok: false, error: checked.error };
  try {
    const summary = await store.importSave(checked.save, bundles, onConflict);
    return { ok: true, ...summary };
  } catch (e) {
    return {
      ok: false,
      error: `The save could not be stored: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
