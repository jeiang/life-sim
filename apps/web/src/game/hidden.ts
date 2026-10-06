import { setMature } from "@life/core";
import { signal } from "@preact/signals";
import bcrypt from "bcryptjs";

/** bcrypt hash of the hidden code, baked in at build time; the code itself is never in the repo (docs/spec/deploy.md). */
const CODE_HASH: string | undefined =
  import.meta.env.VITE_HIDDEN_CODE_HASH || undefined;

const UNLOCKED = "life-sim:hidden-unlocked";
// Same key the old god-mode unlock used: "1" there meant unlocked and on.
const GOD = "life-sim:god-mode";
const MATURE = "life-sim:mature-mode";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface HiddenState {
  readonly unlocked: boolean;
  readonly god: boolean;
  readonly mature: boolean;
}

/**
 * Read the per-install state. An install unlocked by the old SHA-256 code has only the god-mode
 * key set to "1": it stays unlocked with god mode on, and the new unlock key is written.
 */
export function loadHidden(store: Store | null): HiddenState {
  try {
    if (!store) throw new Error("no storage");
    const god = store.getItem(GOD) === "1";
    if (god && store.getItem(UNLOCKED) !== "1") store.setItem(UNLOCKED, "1");
    return {
      unlocked: god || store.getItem(UNLOCKED) === "1",
      god,
      mature: store.getItem(MATURE) === "1",
    };
  } catch {
    return { unlocked: false, god: false, mature: false };
  }
}

/** Whether `code` matches the bcrypt `hash`; false with no hash (a build without the code field) or a malformed one. */
export async function verifyCode(
  code: string,
  hash: string | undefined,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(code.trim(), hash);
  } catch {
    return false;
  }
}

const storage = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

const initial = loadHidden(storage());

/** True once the code was entered on this install (or migrated from the old unlock). */
export const unlocked = signal(initial.unlocked);
export const godMode = signal(initial.god);
/** 18+ mode: the `mature` expression name (docs/spec/pack-format.md). */
export const matureMode = signal(initial.mature);
setMature(initial.mature);

/** The build carries a code hash, so Settings can offer the code field. */
export const hasCodeField = CODE_HASH !== undefined;

function persist(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // storage blocked: the switch lasts for this session only
  }
}

/** Check a typed code; on a match, unlock the Hidden options menu for this install. */
export async function tryUnlock(code: string): Promise<boolean> {
  if (!(await verifyCode(code, CODE_HASH))) return false;
  unlocked.value = true;
  persist(UNLOCKED, true);
  return true;
}

export function setGodMode(on: boolean): void {
  godMode.value = on;
  persist(GOD, on);
}

export function setMatureMode(on: boolean): void {
  matureMode.value = on;
  setMature(on);
  persist(MATURE, on);
}
