import { useEffect, useRef } from "preact/hooks";
import { chainLines, chooseOption, pending } from "../game/store.ts";
import { EmojiText, PackIcon } from "./Emoji.tsx";
import { Modal } from "./Modal.tsx";

/**
 * The open storylet. A `next:` chain stays in this modal: outcome lines of earlier steps
 * show above the current step. There is no way to dismiss it without choosing.
 */
export function ChoiceDialog() {
  const view = pending.value;
  const list = useRef<HTMLDivElement>(null);
  const step = view?.storyletId;
  // Each chain step moves focus to its first enabled choice.
  useEffect(() => {
    if (step === undefined) return;
    list.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }, [step]);
  if (!view) return null;
  return (
    <Modal labelledBy="pending-text">
      {chainLines.value.length > 0 && (
        <ul class="mb-3 space-y-1 border-b border-text-muted/30 pb-3 text-sm text-text-muted">
          {chainLines.value.map((line, i) => (
            <li key={i}>
              <EmojiText text={line} />
            </li>
          ))}
        </ul>
      )}
      <div class="mb-2 text-center text-4xl">
        <PackIcon icon={view.icon} />
      </div>
      <p id="pending-text" class="mb-3 text-center font-medium">
        <EmojiText text={view.text || "Something happened."} />
      </p>
      <div ref={list} class="space-y-2">
        {view.choices.map((c) => (
          <button
            key={`${view.storyletId}:${c.index}`}
            type="button"
            disabled={!c.enabled}
            onClick={() => chooseOption(c.index)}
            class="min-h-11 w-full rounded-xl bg-primary px-3 py-2.5 font-semibold text-on-primary disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
