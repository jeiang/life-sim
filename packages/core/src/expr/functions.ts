/**
 * Function and effect signatures, declared once so the pack-tools checker and the Core
 * evaluator agree. Adding one is a Core release (ADR 0002, ADR 0004).
 */

export type Type = "int" | "bool" | "string" | "id";

export interface Signature {
  readonly params: readonly Type[];
  readonly returns: Type;
}

/** Whitelisted expression functions. Only `min`, `max`, `clamp` are pure; see `pureFunctions`. */
export const FUNCTIONS = {
  min: { params: ["int", "int"], returns: "int" },
  max: { params: ["int", "int"], returns: "int" },
  clamp: { params: ["int", "int", "int"], returns: "int" },
  has: { params: ["id"], returns: "bool" },
  has_occupation: { params: ["id"], returns: "bool" },
  owns: { params: ["id"], returns: "bool" },
  years_in: { params: ["id"], returns: "int" },
} as const satisfies Record<string, Signature>;

/** Effect calls (statements with arguments). `spawn_person(...) as <name>` is parsed separately. */
export const EFFECTS = {
  take_loan: { params: ["id", "int"], returns: "bool" },
  grant_asset: { params: ["id"], returns: "bool" },
  remove_asset: { params: ["id"], returns: "bool" },
  start_occupation: { params: ["id"], returns: "bool" },
  end_occupation: { params: ["id"], returns: "bool" },
  spawn_person: { params: ["id", "id"], returns: "bool" },
  journal: { params: ["string"], returns: "bool" },
  die: { params: ["string"], returns: "bool" },
} as const satisfies Record<string, Signature>;

export type AssignOp = "=" | "+=" | "-=";

/** Assignable roots and the operators each allows (pack-format.md#effect-statements). */
export const ASSIGNABLE: Readonly<Record<string, readonly AssignOp[]>> = {
  stat: ["+=", "-=", "="],
  quality: ["+=", "="],
  money: ["+=", "-="],
};

/** Pure function implementations, usable as the base of an evaluator function table. */
export const pureFunctions: Readonly<
  Record<string, (...a: number[]) => number>
> = {
  min: (a, b) => Math.min(a as number, b as number),
  max: (a, b) => Math.max(a as number, b as number),
  clamp: (x, lo, hi) =>
    Math.min(hi as number, Math.max(lo as number, x as number)),
};
