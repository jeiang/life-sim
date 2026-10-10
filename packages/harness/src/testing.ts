import { setStreamOverride } from "@life/core";
import { type ForceEntry, installRollOverride, parseRolls } from "./force.ts";

/** Handle of {@link forceRolls}. */
export interface ForcedRolls {
  /** Rolls forced so far, by the key as given to `forceRolls`. */
  readonly fired: Readonly<Record<string, number>>;
  /** Remove the override (call in `afterEach`). */
  clear(): void;
}

/**
 * Vitest helper: force rolls by purpose key while a test plays Core directly. Keys are those of
 * `--force` (`gambling/play-slots`, `outcome/gambling/play-slots`, an `age:` prefix limits it to
 * one player age: `"30:outcome/x"`); values are `"hit"`, `"miss"`, a pick index, `"int:N"`, an
 * outcome text, or `{ chance?, int?, pick? }`. Module-level state in Core: clear it when done.
 * The harness (`runHarness` with `force`) does the same for whole lives.
 */
export function forceRolls(forces: Record<string, unknown>): ForcedRolls {
  const entries: ForceEntry[] = [];
  const labels: string[] = [];
  for (const [given, value] of Object.entries(forces)) {
    const m = /^(?:(\d+):)?(.+)$/.exec(given) as RegExpExecArray;
    const rolls = parseRolls(value);
    if (typeof rolls === "string")
      throw new Error(`forceRolls ${given}: ${rolls}`);
    entries.push({
      kind: "roll",
      key: m[2] as string,
      ...(m[1] === undefined ? {} : { age: Number(m[1]) }),
      rolls,
      label: given,
    });
    labels.push(given);
  }
  const counts: number[] = entries.map(() => 0);
  installRollOverride(entries, counts);
  return {
    get fired() {
      return Object.fromEntries(labels.map((l, i) => [l, counts[i] ?? 0]));
    },
    clear: () => setStreamOverride(null),
  };
}
