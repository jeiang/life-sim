import { bundles } from "virtual:packs";
import { useRef, useState } from "preact/hooks";
import { ExportPanel } from "../components/ExportPanel.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { godMode, setGodMode, tryUnlock } from "../game/god.ts";
import {
  currentLifeId,
  getLifeStore,
  refreshLists,
  showLifeList,
  world,
} from "../game/store.ts";
import { closeAllPages, closePage, openPage } from "../nav.ts";
import {
  IMPORT_ACCEPT,
  importFile,
  type PersistState,
  persistState,
} from "../persistence/index.ts";

function ImportPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const onFile = async (file: File | undefined) => {
    const store = getLifeStore();
    if (!file) return;
    if (!store) {
      setResult({ ok: false, text: "Storage is unavailable." });
      return;
    }
    const r = await importFile(store, file, bundles);
    if (input.current) input.current.value = "";
    if (!r.ok) {
      setResult({ ok: false, text: r.error });
      return;
    }
    await refreshLists();
    setResult({
      ok: true,
      text: `Imported: ${r.livesAdded} added, ${r.livesReplaced} replaced, ${r.livesSkipped} skipped, ${r.graveyardAdded} added to the graveyard.`,
    });
  };
  return (
    <div class="space-y-2">
      <label class="block">
        <span class="mb-1 block font-semibold">Import lives</span>
        <input
          ref={input}
          type="file"
          accept={IMPORT_ACCEPT}
          onChange={(e) => void onFile(e.currentTarget.files?.[0])}
          class="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-on-primary"
        />
      </label>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          class={`text-sm ${result.ok ? "" : "text-danger"}`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}

const STORAGE_LABEL: Record<PersistState, string> = {
  granted: "Persistent",
  denied: "May be cleared by the browser",
  unsupported: "Not supported",
  unknown: "Not checked yet",
};

function displayMode(): string {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "Installed app" : "Browser tab";
}

const UNLOCK_TAPS = 7;

function AboutInstall() {
  const [taps, setTaps] = useState(0);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const rows: [string, string][] = [
    ["Storage", STORAGE_LABEL[persistState.value]],
    ["Display mode", displayMode()],
  ];
  return (
    <section class="space-y-2 rounded-xl bg-surface-raised p-4">
      <h2 class="font-bold">About this install</h2>
      <dl class="space-y-1 text-sm">
        <div class="flex items-center justify-between gap-4">
          <dt>Build version</dt>
          <dd>
            <button
              type="button"
              onClick={() => setTaps(taps + 1)}
              class="min-h-11 font-semibold"
            >
              {__BUILD_REV__}
            </button>
          </dd>
        </div>
        {rows.map(([name, value]) => (
          <div key={name} class="flex justify-between gap-4">
            <dt>{name}</dt>
            <dd class="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {taps >= UNLOCK_TAPS && !godMode.value && (
        <form
          class="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void tryUnlock(code).then((ok) => {
              setWrong(!ok);
              if (ok) setCode("");
            });
          }}
        >
          <label class="block">
            <span class="mb-1 block font-semibold">Code</span>
            <input
              value={code}
              autoCapitalize="off"
              autocomplete="off"
              onInput={(e) => setCode(e.currentTarget.value)}
              class="min-h-11 w-full rounded-xl border border-text-muted/50 bg-surface px-3"
            />
          </label>
          {wrong && (
            <p role="alert" class="text-sm text-danger">
              That code is not right.
            </p>
          )}
          <button
            type="submit"
            class="min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action"
          >
            Unlock
          </button>
        </form>
      )}
    </section>
  );
}

function GodSection() {
  if (!godMode.value) return null;
  return (
    <section class="space-y-2 rounded-xl bg-surface-raised p-4">
      <label class="flex min-h-11 items-center justify-between gap-4">
        <span class="font-bold">God mode</span>
        <input
          type="checkbox"
          role="switch"
          aria-checked="true"
          checked
          onChange={() => setGodMode(false)}
          class="size-6"
        />
      </label>
      {currentLifeId.value !== null && !world.value.ended && (
        <button type="button" class={linkClass} onClick={() => openPage("god")}>
          Edit this life
        </button>
      )}
    </section>
  );
}

const linkClass =
  "flex min-h-11 w-full items-center rounded-xl bg-surface-raised px-4 font-semibold";

export function SettingsPage() {
  return (
    <PageShell title="Settings" onBack={closePage}>
      <section class="space-y-4 rounded-xl bg-surface-raised p-4">
        <h2 class="font-bold">Backup</h2>
        <ExportPanel />
        <ImportPanel />
      </section>
      {currentLifeId.value !== null && (
        <button
          type="button"
          class={linkClass}
          onClick={() => {
            closeAllPages();
            void showLifeList();
          }}
        >
          Switch life
        </button>
      )}
      <button
        type="button"
        class={linkClass}
        onClick={() => openPage("graveyard")}
      >
        Graveyard
      </button>
      <button
        type="button"
        class={linkClass}
        onClick={() => openPage("credits")}
      >
        Credits
      </button>
      <GodSection />
      <AboutInstall />
    </PageShell>
  );
}
