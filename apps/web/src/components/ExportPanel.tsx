import { bundles } from "virtual:packs";
import { useEffect, useState } from "preact/hooks";
import { flushSaves, getLifeStore } from "../game/store.ts";
import {
  type PreparedExport,
  prepareExport,
  shareExport,
} from "../persistence/index.ts";

/**
 * Export button. The file is prepared when the panel mounts so the click can hand it to the
 * share sheet inside the tap's user activation.
 */
export function ExportPanel() {
  const [prepared, setPrepared] = useState<PreparedExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const store = getLifeStore();
    if (!store) {
      setError("Storage is unavailable, so there is nothing to export.");
      return;
    }
    let live = true;
    flushSaves()
      .then(() => prepareExport(store, bundles))
      .then((p) => live && setPrepared(p))
      .catch(
        (e) => live && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      live = false;
    };
  }, []);

  const onExport = async () => {
    if (!prepared) return;
    const outcome = await shareExport(prepared.file);
    setMessage(
      outcome === "cancelled"
        ? null
        : outcome === "shared"
          ? "Backup shared."
          : `Backup saved as ${prepared.file.name}.`,
    );
  };

  return (
    <div class="space-y-2">
      <button
        type="button"
        disabled={!prepared}
        onClick={() => void onExport()}
        class="min-h-11 w-full rounded-xl bg-action px-4 font-semibold text-on-action disabled:opacity-60"
      >
        Export lives
      </button>
      {prepared && (
        <p class="text-sm text-text-muted">
          {prepared.lives} ongoing, {prepared.graveyard} in the graveyard.
        </p>
      )}
      {prepared && prepared.problems.length > 0 && (
        <p role="alert" class="text-sm text-danger">
          {prepared.problems.length} saved life
          {prepared.problems.length === 1 ? "" : "s"} could not be read and{" "}
          {prepared.problems.length === 1 ? "is" : "are"} missing from the file.
        </p>
      )}
      {error && (
        <p role="alert" class="text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" class="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
