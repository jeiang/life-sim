import { useId, useState } from "preact/hooks";
import { Modal } from "./Modal.tsx";

/**
 * Modal amount picker: a range slider and a numeric input kept in sync. Values are integers
 * on the `min + n * step` grid, clamped to `[min, max]`.
 */
export function AmountPicker(props: {
  title: string;
  min: number;
  max: number;
  step?: number;
  initial?: number;
  confirmLabel?: string;
  /** Formats the current amount for display (e.g. money). */
  format?: (n: number) => string;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const step = props.step && props.step > 0 ? props.step : 1;
  const { min, max } = props;
  const snap = (n: number): number => {
    if (!Number.isFinite(n)) return min;
    const snapped = min + Math.round((n - min) / step) * step;
    return Math.min(
      max,
      Math.max(min, snapped > max ? snapped - step : snapped),
    );
  };
  const [amount, setAmount] = useState(snap(props.initial ?? min));
  const [text, setText] = useState(String(amount));
  const id = useId();
  const fmt = props.format ?? String;

  function commitText(): void {
    const n = snap(Number(text));
    setAmount(n);
    setText(String(n));
  }

  return (
    <Modal labelledBy={`${id}-title`} onClose={props.onCancel}>
      <h2 id={`${id}-title`} class="mb-3 text-center text-lg font-semibold">
        {props.title}
      </h2>
      <p class="mb-3 text-center text-2xl font-bold" aria-live="polite">
        {fmt(amount)}
      </p>
      <input
        type="range"
        aria-label={`${props.title} slider`}
        min={min}
        max={max}
        step={step}
        value={amount}
        onInput={(e) => {
          const n = snap(Number(e.currentTarget.value));
          setAmount(n);
          setText(String(n));
        }}
        class="mb-3 w-full"
      />
      <label class="mb-4 block text-sm">
        <span class="mb-1 block text-text-muted">
          Amount ({fmt(min)} to {fmt(max)})
        </span>
        <input
          type="number"
          inputMode="numeric"
          data-autofocus
          min={min}
          max={max}
          step={step}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const n = snap(Number(text));
              props.onConfirm(n);
            }
          }}
          class="min-h-11 w-full rounded-xl border border-text-muted/50 bg-surface px-3 py-2 text-text"
        />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          class="min-h-11 rounded-xl border border-text-muted/50 px-3 py-2.5 font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => props.onConfirm(snap(Number(text)))}
          class="min-h-11 rounded-xl bg-primary px-3 py-2.5 font-semibold text-on-primary"
        >
          {props.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </Modal>
  );
}
