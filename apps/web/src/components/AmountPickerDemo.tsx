import { signal } from "@preact/signals";
import { AmountPicker } from "./AmountPicker.tsx";

/** e2e-build only: hosts an AmountPicker so the primitive is exercised before the gambling Pack uses it. */
export const amountDemo = signal<{
  min: number;
  max: number;
  step: number;
} | null>(null);

export function AmountPickerDemo() {
  const cfg = amountDemo.value;
  if (!cfg) return null;
  const done = (result: number | null) => {
    (window as unknown as { __picked: number | null }).__picked = result;
    amountDemo.value = null;
  };
  return (
    <AmountPicker
      title="Place your bet"
      {...cfg}
      onConfirm={done}
      onCancel={() => done(null)}
    />
  );
}
