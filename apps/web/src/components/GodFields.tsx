import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

export const inputClass =
  "min-h-11 w-full rounded-xl border border-text-muted/50 bg-surface px-3";

/** A labelled form field for the god-mode screens. */
export function Field(props: { label: string; children: ComponentChildren }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child input.
    <label class="block">
      <span class="mb-1 block font-semibold">{props.label}</span>
      {props.children}
    </label>
  );
}

/** Marks a life that used god mode. */
export const GodBadge = () => (
  <span class="ml-2 rounded-full bg-surface px-2 py-0.5 align-middle text-xs font-semibold text-text-muted">
    Edited
  </span>
);

/** One number input with its own Set button, so one press is one logged edit. */
export function EditRow(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onSet: (n: number) => string | null;
}) {
  const [text, setText] = useState(String(props.value));
  const [error, setError] = useState<string | null>(null);
  return (
    <div class="space-y-1">
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <Field label={props.label}>
            <input
              type="number"
              inputMode="decimal"
              min={props.min}
              max={props.max}
              step={props.step ?? 1}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              class={inputClass}
            />
          </Field>
        </div>
        <button
          type="button"
          aria-label={`Set ${props.label}`}
          disabled={text.trim() === "" || Number.isNaN(Number(text))}
          onClick={() => {
            const err = props.onSet(Number(text));
            setError(err);
            if (!err) setText(String(props.value));
          }}
          class="min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action disabled:opacity-50"
        >
          Set
        </button>
      </div>
      {error && (
        <p role="alert" class="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
