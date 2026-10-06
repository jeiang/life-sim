/**
 * Function and effect signatures, declared once so the pack-tools checker and the Core
 * evaluator agree. Adding one is a Core release (ADR 0002, ADR 0004).
 */

/** `group` is an exclusivity group declared in a manifest (a bare word or a string literal). */
export type Type = "int" | "bool" | "string" | "id" | "group";

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
  /** Yearly cost for the player of a standard of living now (city index and home waiver applied). */
  standard_cost: { params: ["id"], returns: "int" },
  /** Average closeness (integer) to the living people the player holds this role toward; 0 with none. */
  role_closeness: { params: ["id"], returns: "int" },
  in_group: { params: ["group"], returns: "bool" },
  years_in_group: { params: ["group"], returns: "int" },
  count_role: { params: ["id", "int", "int"], returns: "int" },
  /** Market kinds. Price of one whole unit now, minor units. */
  price: { params: ["id"], returns: "int" },
  /** One-year price change, basis points. */
  change: { params: ["id"], returns: "int" },
  /** Units the player holds, x10^4 (10000 = one whole unit). */
  units: { params: ["id"], returns: "int" },
  /** Current value of the player's holding, minor units. */
  holding_value: { params: ["id"], returns: "int" },
  /** Cash paid for the units still held, minor units. */
  cost_basis: { params: ["id"], returns: "int" },
  /** Years since the player first invested in the kind (0 with no holding). */
  holding_years: { params: ["id"], returns: "int" },
  /** The return, basis points, the next settlement will apply (drawn a year in advance). */
  forecast: { params: ["id"], returns: "int" },
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
  /** Move the player to a city (family and others stay where they are). */
  move_to: { params: ["id"], returns: "bool" },
  /**
   * Stop living with parents; takes the default standard of living or the best affordable.
   * Never applies under 18: a minor goes to live with a guardian instead.
   */
  move_out: { params: [], returns: "bool" },
  /** In `scope: person`: that partner moves in, so they pay a share of the living cost. */
  move_in: { params: [], returns: "bool" },
  /** In `scope: person`: that spouse's money merges into the player's; no separate share. */
  merge_money: { params: [], returns: "bool" },
  /** Choose a standard of living (ignored while living with parents). */
  set_standard: { params: ["id"], returns: "bool" },
  /** Buy (positive) or sell (negative) that much cash worth of a market kind. */
  trade: { params: ["id", "int"], returns: "bool" },
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
