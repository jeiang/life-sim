import { signal } from "@preact/signals";

/** SHA-256 of the lowercased unlock code; the code itself is never stored (docs/spec/screens.md). */
const CODE_HASH =
  "6c58bc00fea09c8d7fdb97c7b58741ad37bd7ba8e5c76d35076e3b57071b172b";
const KEY = "life-sim:god-mode";

const stored = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** True once unlocked on this install and not switched off again. */
export const godMode = signal(stored());

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Check a typed code (case-insensitive); on a match, turn god mode on for this install. */
export async function tryUnlock(code: string): Promise<boolean> {
  if ((await sha256Hex(code.trim().toLowerCase())) !== CODE_HASH) return false;
  setGodMode(true);
  return true;
}

export function setGodMode(on: boolean): void {
  godMode.value = on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: god mode lasts for this session only
  }
}
