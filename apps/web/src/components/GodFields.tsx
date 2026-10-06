import type { ComponentChildren } from "preact";

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
