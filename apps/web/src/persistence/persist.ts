import { computed, signal } from "@preact/signals";

/**
 * Result of asking the browser for durable storage (`navigator.storage.persist()`):
 * `unknown` before the first request, `unsupported` when the API is missing.
 */
export type PersistState = "unknown" | "granted" | "denied" | "unsupported";

export const persistState = signal<PersistState>("unknown");

/** True when the UI should nudge the player to export a backup (storage is not durable). */
export const shouldNudgeBackup = computed(
  () => persistState.value === "denied" || persistState.value === "unsupported",
);

/**
 * Ask for durable storage. Call after the first real save (a user gesture helps). The
 * browser decides silently; `denied` is normal (for example a Safari tab) and only drives
 * the backup nudge. Updates `persistState` and returns it.
 */
export async function requestPersistence(
  storage: StorageManager | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.storage,
): Promise<PersistState> {
  let state: PersistState;
  if (!storage || typeof storage.persist !== "function") state = "unsupported";
  else {
    try {
      const already =
        typeof storage.persisted === "function" && (await storage.persisted());
      state = already || (await storage.persist()) ? "granted" : "denied";
    } catch {
      state = "denied";
    }
  }
  persistState.value = state;
  return state;
}
