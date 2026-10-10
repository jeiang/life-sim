import { useState } from "preact/hooks";
import { ObituaryView } from "../components/ObituaryView.tsx";
import { PageShell } from "../components/PageShell.tsx";
import {
  chooseHeir,
  deathObituary,
  finishLife,
  heirs,
  showLifeList,
} from "../game/store.ts";

const button =
  "min-h-11 w-full rounded-xl px-4 font-semibold disabled:opacity-50";

/**
 * Shown while the current life's player is dead. The player picks an heir to carry on, or
 * finishes the life; the finished generation reaches the graveyard only after that choice.
 */
export function ObituaryPage() {
  const o = deathObituary.value;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!o) return null;
  const list = heirs.value;

  const run = async (go: () => Promise<string | null>): Promise<void> => {
    setBusy(true);
    setError(null);
    const failed = await go();
    // On success this page is gone (the screen changed), so only a failure needs the state back.
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  };

  return (
    <PageShell title="Obituary">
      <ObituaryView obituary={o} />
      {list.length > 0 ? (
        <section aria-label="Choose an heir" class="space-y-2">
          <h3 class="font-bold">Choose an heir</h3>
          <ul class="space-y-2">
            {list.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => chooseHeir(h.id))}
                  class={`${button} bg-action text-left text-on-action`}
                >
                  Continue as {h.name}, age {h.age}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p class="text-text-muted">
          No living child can carry on. The family line ends here.
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(finishLife)}
        class={`${button} bg-surface-raised`}
      >
        Finish this life
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void showLifeList()}
        class={`${button} bg-surface-raised`}
      >
        Back to your lives
      </button>
      {error && (
        <p role="alert" class="text-sm text-danger">
          {error}
        </p>
      )}
    </PageShell>
  );
}
