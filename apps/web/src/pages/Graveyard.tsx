import type { GraveyardEntry } from "@life/core";
import { useState } from "preact/hooks";
import { ObituaryView } from "../components/ObituaryView.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { graveyard } from "../game/store.ts";
import { closePage } from "../nav.ts";

/** Finished lives; tap one for its obituary. */
export function GraveyardPage() {
  const [selected, setSelected] = useState<GraveyardEntry | null>(null);
  if (selected)
    return (
      <PageShell title="Obituary" onBack={() => setSelected(null)}>
        <ObituaryView obituary={selected.obituary} />
      </PageShell>
    );
  const entries = graveyard.value;
  return (
    <PageShell title="Graveyard" onBack={closePage}>
      {entries.length === 0 ? (
        <p class="text-text-muted">No one has died yet.</p>
      ) : (
        <ul class="space-y-2">
          {entries.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setSelected(g)}
                class="min-h-11 w-full rounded-xl bg-surface-raised p-3 text-left"
              >
                <span class="block font-bold">{g.name}</span>
                <span class="block text-sm text-text-muted">
                  Died at {g.obituary.age}: {g.obituary.cause}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
