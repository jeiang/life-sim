/**
 * Compiled Pack bundle: the JSON the pack compiler (`@life/pack-tools`) writes and the Core
 * reads. Pure data, no behaviour. Every id is namespaced (`<pack>/<id>`), every expression
 * is an AST (ADR 0004), and every reference has been resolved and kind-checked.
 */
import type { Effect, Expr } from "./expr/index.ts";
import type { Gender } from "./state/types.ts";

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

/**
 * Diminishing returns for a repeatable action: uses 1..`full` in a year give the full effect,
 * uses up to `reduced` give `factorBp` of every gain (basis points), later uses give none.
 */
export interface RepeatCurve {
  readonly full: number;
  readonly reduced: number;
  readonly factorBp: number;
}

/** Curve used when neither the storylet nor any manifest sets one. */
export const DEFAULT_REPEAT: RepeatCurve = {
  full: 10,
  reduced: 20,
  factorBp: 2500,
};

/** An action's amount input: integer expressions over the player, evaluated when the menu lists it. */
export interface CompiledAmount {
  readonly min: Expr;
  readonly max: Expr;
  /** Spacing of allowed amounts from `min`; below 1 counts as 1. */
  readonly step: Expr;
}

export interface CompiledStorylet {
  readonly id: string;
  /** Actions: the menu label; absent: derived from the id. */
  readonly label?: string;
  readonly icon?: IconRef;
  readonly tags: readonly string[];
  readonly trigger: "event" | "action";
  /** Actions only: `<top>` or `<top>/<submenu>`. */
  readonly menu?: string;
  readonly scope?: "loan" | "person";
  /** `scope: person` only: role ids the bound person must hold toward the player. Empty/absent: any. */
  readonly target?: readonly string[];
  readonly when?: Expr;
  /** Events only; exactly one of `chance` (basis points per year) or `weight`. */
  readonly chance?: Expr;
  readonly weight?: Expr;
  readonly once: boolean;
  /** Years between occurrences. */
  readonly cooldown?: number;
  readonly maxPerLife?: number;
  /** Actions only: may be repeated within a year, with diminishing returns. Excludes `cooldown`. */
  readonly repeatable?: true;
  /** Overrides of the manifest's curve, field by field (repeatable actions only). */
  readonly repeat?: Partial<RepeatCurve>;
  readonly text?: string;
  /**
   * Actions only: the player picks an amount (money, minor units) before it runs. Bound as
   * `amount` in choice and outcome `when`, `weight`, effects and text, and nowhere else.
   */
  readonly amount?: CompiledAmount;
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
  /**
   * While held, housing is provided (for example prison, boarding school): no living cost is
   * charged and the standard's effects do not apply.
   */
  readonly providesHousing?: boolean;
  /**
   * While held, the player is confined (prison, hospital): housing is provided, and content
   * without the Core tag `custody-ok` cannot run. `menus` locks action menus and the shop;
   * `events` locks yearly events.
   */
  readonly confines?: { readonly menus: boolean; readonly events: boolean };
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
  /** Boolean expression over the player that must hold to buy it. */
  readonly requires?: Expr;
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
  /** Share of the price paid in cash up front, basis points. */
  readonly downPaymentBp: number;
  /** Secured by the asset it bought. */
  readonly secured: boolean;
}

/**
 * A place to live. The Relocation pack later groups cities into countries; `costIndexBp`
 * scales living costs (10000 = 100%).
 */
export interface CompiledCity {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** Cost of living relative to the baseline, basis points (7000 = 70%). */
  readonly costIndexBp: number;
  /** Relative weight when a life picks its birth city. */
  readonly weight: number;
  /** Pay multiplier for working here, basis points (10000 = 100%). */
  readonly wageIndexBp: number;
  /** Country the city belongs to, a plain string until countries exist as content. */
  readonly country?: string;
}

/**
 * A standard of living. Standards are ordered by `cost`; a lower one costs less, hurts more
 * and raises illness and death risk.
 */
export interface CompiledStandard {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** Base yearly cost, minor units, before the city cost index (0 for homeless). */
  readonly cost: number;
  /** Yearly change to the player's happiness and health. */
  readonly happiness: number;
  readonly health: number;
  /**
   * Positive changes stop at this stat value (0-100); negative ones always apply. A stat
   * already above it stays where it is.
   */
  readonly cap: number;
  /** Multiplier for illness and death chances, read as `living.risk`; basis points, 10000 = 100%. */
  readonly riskBp: number;
}

/** Living-cost settings of a Pack (the first manifest that declares them wins). */
export interface LivingDecl {
  /** Standard chosen on moving out when affordable (full id). */
  readonly defaultStandard: string;
  /** Share of the cost an owned home in the current city removes, basis points. */
  readonly housingShareBp: number;
  /** Item kind category that counts as a home. */
  readonly homeCategory: string;
}

export interface CompiledRole {
  readonly type: "role";
  readonly id: string;
  readonly label: string;
}

export interface CompiledGenerator {
  readonly type: "generator";
  readonly id: string;
  /** First-name pool per gender (non-binary: both pools, unless the source gave a neutral list). */
  readonly firstNames: Readonly<Record<Gender, readonly string[]>>;
  /** Draw weights per gender; a weight of 0 never draws. Default male 1, female 1. */
  readonly genderWeights: Readonly<Record<Gender, number>>;
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

/** Which Pack people data builds the starting family. */
export interface FamilyDecl {
  /** Generator for the player's name; absent: the first generator's names. */
  readonly player?: string;
  readonly parent: {
    readonly role: string;
    readonly generator: string;
    readonly count: number;
  };
  readonly sibling: {
    readonly role: string;
    readonly generator: string;
    /** Inclusive count range. */
    readonly count: readonly [number, number];
  };
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
    /**
     * Decision slots: basis points per slot of "at least k+1 decisions this year", in
     * non-increasing order. Absent: choice events draw as ordinary flavour.
     */
    readonly decisions?: readonly number[];
    /** Age reached from which decision slots roll (default 0). */
    readonly decisionsMinAge?: number;
    /** Neutral lines for a year in which nothing else was journaled. */
    readonly quiet?: readonly string[];
  };
  /** Living costs; needs `standards`. */
  readonly living?: LivingDecl;
  /** Default diminishing-returns curve for repeatable actions. */
  readonly repeat?: RepeatCurve;
  /** Starting family; ids are full. The first Pack that declares one wins. */
  readonly family?: FamilyDecl;
  readonly migrations: PackMigrations;
  /** All content below is sorted by id. */
  readonly storylets: readonly CompiledStorylet[];
  readonly occupations: readonly CompiledOccupationKind[];
  readonly items: readonly CompiledItemKind[];
  readonly loans: readonly CompiledLoanKind[];
  readonly cities: readonly CompiledCity[];
  readonly standards: readonly CompiledStandard[];
  readonly people: readonly CompiledPeopleItem[];
}
