import { ObituaryView } from "../components/ObituaryView.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { deathObituary, dismissObituary } from "../game/store.ts";

/** Shown when the player's life ends; leads back to the life list. */
export function ObituaryPage() {
  const o = deathObituary.value;
  if (!o) return null;
  return (
    <PageShell title="Obituary">
      <ObituaryView obituary={o} />
      <button
        type="button"
        onClick={() => void dismissObituary()}
        class="min-h-11 w-full rounded-xl bg-action px-4 font-semibold text-on-action"
      >
        Back to your lives
      </button>
    </PageShell>
  );
}
