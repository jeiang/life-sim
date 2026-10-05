import { reloadForUpdate, updateAvailable } from "../update.ts";

export function UpdateBanner() {
  if (!updateAvailable.value) return null;
  return (
    <div
      role="status"
      class="flex items-center justify-between gap-3 bg-surface-raised px-4 py-2 text-text border-b border-text-muted"
    >
      <span>Update available</span>
      <button
        type="button"
        class="min-h-11 min-w-11 rounded bg-action px-4 font-semibold text-on-action"
        onClick={() => void reloadForUpdate()}
      >
        Reload
      </button>
    </div>
  );
}
