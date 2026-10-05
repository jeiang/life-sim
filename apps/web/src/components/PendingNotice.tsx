import { useEffect, useRef } from "preact/hooks";
import { chooseOption, pending } from "../game/store.ts";
import { EmojiText, PackIcon } from "./Emoji.tsx";

/**
 * Minimal blocking notice for the open storylet so the life can never hang on a choice.
 * The full choice dialog (focus trap, outcome chain) replaces this in the choice-dialog issue.
 */
export function PendingNotice() {
  const view = pending.value;
  const first = useRef<HTMLButtonElement>(null);
  const id = view?.storyletId;
  useEffect(() => {
    first.current?.focus();
  }, [id]);
  if (!view) return null;
  const firstEnabled = view.choices.findIndex((c) => c.enabled);
  return (
    <div class="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-text"
        class="modal-card w-full max-w-sm rounded-2xl bg-surface-raised p-4"
      >
        <div class="mb-2 text-center text-4xl">
          <PackIcon icon={view.icon} />
        </div>
        <p id="pending-text" class="mb-3 text-center font-medium">
          <EmojiText text={view.text || "Something happened."} />
        </p>
        <div class="space-y-2">
          {view.choices.map((c) => (
            <button
              key={c.index}
              type="button"
              {...(c.index === firstEnabled ? { ref: first } : {})}
              disabled={!c.enabled}
              onClick={() => chooseOption(c.index)}
              class="min-h-11 w-full rounded-xl bg-primary px-3 py-2.5 font-semibold text-on-primary disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
