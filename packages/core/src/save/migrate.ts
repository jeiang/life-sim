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

/**
 * Check a raw (parsed JSON) save's schema version. There is no upgrade chain: version 6 was a
 * one-time reset, so a save from an older schema is rejected with a message that says so.
 * Throws `SaveError` for non-saves, older saves and saves from a newer build.
 */
export function checkSaveVersion(
  raw: unknown,
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
  if (declared > target)
    throw new SaveError(
      `This save is from a newer version of the game (save version ${declared}, this build reads version ${target}). Update the app and try again.`,
    );
  if (declared < target)
    throw new SaveError(
      `This save is from an older, incompatible version of the game (save version ${declared}; this build reads only version ${target}). Saves were reset at version ${target} and cannot be upgraded, so it cannot be loaded.`,
    );
  return raw;
}
