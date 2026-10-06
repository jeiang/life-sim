import { amountRequest } from "../game/store.ts";
import { AmountPicker } from "./AmountPicker.tsx";

/** Hosts the shared amount picker for whatever asked for an amount (`requestAmount`). */
export function AmountPrompt() {
  const req = amountRequest.value;
  if (!req) return null;
  const close = () => {
    amountRequest.value = null;
  };
  return (
    <AmountPicker
      {...req}
      onConfirm={(n) => {
        close();
        req.onConfirm(n);
      }}
      onCancel={() => {
        close();
        req.onCancel?.();
      }}
    />
  );
}
