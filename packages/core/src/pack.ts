/**
 * Compiled Pack bundle: the JSON the pack compiler (`@life/pack-tools`) writes and the Core
 * reads. Pure data, no behaviour. Every id is namespaced (`<pack>/<id>`), every expression
 * is an AST (ADR 0004), and every reference has been resolved and kind-checked.
 */
import type { Effect, Expr } from "./expr/index.ts";

/** Bundle format version; bump when the shape below changes incompatibly. */
export const PACK_BUNDLE_FORMAT = 1;

/** `twemoji:<codepoints>` (for example `twemoji:1f4bc`) or `gameicons:<author>/<name>`. */
export type IconRef = string;

export interface StatDecl {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** Inclusive start range, 0-100. */
  readonly start: readonly [number, number];
}

export type QualityDecl =
  | {
      readonly id: string;
      readonly type: "int";
      readonly min?: number;
      readonly max?: number;
      readonly default: number;
    }
  | {
      readonly id: string;
      readonly type: "flag";
      readonly default: boolean;
    };

export interface CompiledOutcome {
  /** Integer expression; 1 when omitted in the source. */
  readonly weight: Expr;
  readonly when?: Expr;
  readonly text?: string;
  readonly effects: readonly Effect[];
  /** Full storylet id opened immediately after this outcome. */
  readonly next?: string;
}

export interface CompiledChoice {
  readonly label: string;
  readonly when?: Expr;
  readonly outcomes: readonly CompiledOutcome[];
}

export interface CompiledStorylet {
  readonly id: string;
  readonly icon?: IconRef;
  readonly tags: readonly string[];
  readonly trigger: "event" | "action";
  /** Actions only: `<top>` or `<top>/<submenu>`. */
  readonly menu?: string;
  readonly scope?: "loan" | "person";
  readonly when?: Expr;
  /** Events only; exactly one of `chance` (basis points per year) or `weight`. */
  readonly chance?: Expr;
  readonly weight?: Expr;
  readonly once: boolean;
  /** Years between occurrences. */
  readonly cooldown?: number;
  readonly maxPerLife?: number;
  readonly text?: string;
  /** Empty when the storylet has a single `outcomes` list. */
  readonly choices: readonly CompiledChoice[];
  /** Used when `choices` is empty. */
  readonly outcomes: readonly CompiledOutcome[];
}

export interface CompiledOccupationKind {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** Exclusivity group, declared in a manifest. */
  readonly group: string;
  /** Ladder name, for display and promotion grouping. */
  readonly ladder?: string;
  /** Eligibility to start it. */
  readonly requires?: Expr;
  /** Yearly pay (positive) or charge such as tuition (negative), minor units. */
  readonly pay: Expr;
  /** Completed years after which it ends by itself (for example 4 for university). */
  readonly durationYears?: number;
  readonly promotesTo?: string;
  readonly promotionYears?: number;
  /** Loan kind that can finance it (student loan). */
  readonly loan?: string;
}

export interface CompiledItemKind {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  readonly category: string;
  /** Purchase price, minor units. */
  readonly price: Expr;
  /**
   * Yearly value at settlement, minor units. Names: `asset.purchase_price`, `asset.value`,
   * `asset.years` (completed years owned).
   */
  readonly value: Expr;
  /** Loan kind that can finance it. */
  readonly loan?: string;
}

export interface CompiledLoanKind {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** Yearly rate in basis points. */
  readonly rateBp: number;
  readonly termYears: number;
  /** Secured by the asset it bought. */
  readonly secured: boolean;
}

export interface CompiledRole {
  readonly type: "role";
  readonly id: string;
  readonly label: string;
}

export interface CompiledGenerator {
  readonly type: "generator";
  readonly id: string;
  readonly firstNames: readonly string[];
  readonly lastNames: readonly string[];
  /** Inclusive age range at spawn. */
  readonly age: readonly [number, number];
  /** Stat id -> inclusive start range. */
  readonly stats: Readonly<Record<string, readonly [number, number]>>;
}

export type CompiledPeopleItem = CompiledRole | CompiledGenerator;

export interface PackMigrations {
  /** Old full id -> new full id. */
  readonly renamed: Readonly<Record<string, string>>;
  /** Removed full id -> optional fallback full id. */
  readonly removed: Readonly<Record<string, string | null>>;
}

export interface PackBundle {
  readonly format: typeof PACK_BUNDLE_FORMAT;
  readonly id: string;
  readonly version: number;
  readonly depends: readonly string[];
  readonly currency?: { readonly symbol: string; readonly digits: number };
  readonly stats: readonly StatDecl[];
  readonly qualities: readonly QualityDecl[];
  readonly exclusivity: readonly string[];
  readonly year?: {
    readonly slots: readonly [number, number];
    readonly cap: number;
  };
  readonly migrations: PackMigrations;
  /** All content below is sorted by id. */
  readonly storylets: readonly CompiledStorylet[];
  readonly occupations: readonly CompiledOccupationKind[];
  readonly items: readonly CompiledItemKind[];
  readonly loans: readonly CompiledLoanKind[];
  readonly people: readonly CompiledPeopleItem[];
}
