import { saveError } from "../game/store.ts";

/** Shown when saving fails (storage unavailable, quota): the life is only in memory. */
export function SaveWarning() {
  const e = saveError.value;
  if (!e) return null;
  return (
    <div role="alert" class="bg-danger px-4 py-2 text-sm text-surface">
      Your life could not be saved: {e}
    </div>
  );
}
