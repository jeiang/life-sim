/**
 * Core state model (ADR 0002). Everything is a plain integer, string, boolean,
 * array or Map: no floats, no Dates, no class instances. Money is in minor units.
 * Ids are integers allocated from `World.nextId`; "id order" means ascending.
 */

export type PersonId = number;
export type QualityValue = number | boolean;

export interface Occupation {
  readonly id: number;
  /** Pack occupation kind id. */
  readonly kindId: string;
  /** Exclusivity group declared by the kind (for example `school`, `full-time`). */
  readonly group: string;
  readonly startedAge: number;
  /** Completed years in this occupation. */
  readonly years: number;
  /** 0-100. */
  readonly performance: number;
  /** Yearly pay (positive) or charge such as tuition (negative), minor units. */
  readonly pay: number;
  /** Age at which it ended; absent while held, set once moved to history. */
  readonly endedAge?: number;
}

export interface Loan {
  readonly id: number;
  readonly kindId: string;
  /** Original amount, minor units. */
  readonly principal: number;
  /** Outstanding amount, minor units. */
  readonly balance: number;
  /** Yearly rate in basis points (10000 = 100%). */
  readonly rateBp: number;
  readonly termYears: number;
  /** Fixed yearly payment, minor units. */
  readonly payment: number;
  readonly securedAssetId?: number;
  /** Consecutive missed payments (`loan.missed`). */
  readonly missed: number;
}

export interface Asset {
  readonly id: number;
  readonly kindId: string;
  readonly purchasePrice: number;
  readonly value: number;
  /** Player age when acquired; `asset.years` is the age gap. Absent means 0 years. */
  readonly acquiredAge?: number;
  /**
   * City the asset is in (a home only counts where it stands), set at acquisition to the
   * owner's city. Absent in older saves: read as the owner's city, see `assetCityId`.
   */
  readonly cityId?: string;
  readonly qualities: Readonly<Record<string, QualityValue>>;
}

/** Gender chosen in god mode; absent on generated people. */
export type Gender = "male" | "female" | "nonbinary";
export const GENDERS: readonly Gender[] = ["male", "female", "nonbinary"];

export interface Person {
  readonly id: PersonId;
  readonly givenName: string;
  readonly familyName: string;
  readonly gender?: Gender;
  readonly age: number;
  readonly alive: boolean;
  /** Pack-declared stats, integers 0-100. */
  readonly stats: Readonly<Record<string, number>>;
  readonly qualities: Readonly<Record<string, QualityValue>>;
  /** Money in minor units; may be held by any person, shown for the player. */
  readonly money: number;
  /** Currently held occupations, in id order. */
  readonly occupations: readonly Occupation[];
  /** Ended occupations, oldest first. */
  readonly occupationHistory: readonly Occupation[];
  /** In id order. */
  readonly assets: readonly Asset[];
  /** In id order. */
  readonly loans: readonly Loan[];
  /** Pack city id the person lives in; absent in lives made before cities existed. */
  readonly cityId?: string;
  /**
   * True while the person lives with their parents. Absent in lives made before living
   * situations existed (read as: with parents under 18, on their own from 18).
   */
  readonly withParents?: boolean;
  /**
   * The standard of living (full id) the person chose while on their own. Absent: the Pack's
   * default standard, so lives made before standards existed pay for it from the next age-up.
   */
  readonly standardId?: string;
  /**
   * The standard they actually live (and paid for) this year: the chosen one, or the best
   * they could afford at settlement. Absent: the chosen one.
   */
  readonly livedStandardId?: string;
}

export interface Relationship {
  readonly from: PersonId;
  readonly to: PersonId;
  /** parent, sibling, partner, friend, classmate, coworker, ... */
  readonly role: string;
  /** 0-100. */
  readonly closeness: number;
}

export interface JournalEntry {
  readonly age: number;
  readonly lines: readonly string[];
}

/** A storylet bound to one of the player's loans or to one non-player person. */
export interface ScopeRef {
  readonly kind: "loan" | "person";
  /** Loan id or person id. */
  readonly id: number;
}

/** An event drawn for this age-up and not yet opened. */
export interface QueuedEvent {
  readonly storyletId: string;
  readonly scope?: ScopeRef;
}

/**
 * An open storylet waiting for the player's choice. While set, the life cannot age up.
 * `rest` is present when the storylet was drawn during an age-up: the events still to open
 * (the NPC pass follows them); absent for actions.
 */
export interface Pending {
  readonly storyletId: string;
  readonly scope?: ScopeRef;
  readonly rest?: { readonly events: readonly QueuedEvent[] };
}

/** How often a storylet (per scope binding) has fired, for `once`, `cooldown`, `max_per_life`. */
export interface StoryletRecord {
  readonly count: number;
  readonly lastAge: number;
}

export interface ObituaryOccupation {
  readonly kindId: string;
  readonly startedAge: number;
  readonly endedAge: number;
  readonly years: number;
}

/** Record of a finished life, kept in the graveyard. */
export interface Obituary {
  readonly personId: PersonId;
  readonly givenName: string;
  readonly familyName: string;
  readonly age: number;
  readonly cause: string;
  /** Cash plus asset values minus loan balances, minor units. */
  readonly netWorth: number;
  /** Occupations outside the `school` exclusivity group, oldest first. */
  readonly career: readonly ObituaryOccupation[];
  /** Occupations in the `school` exclusivity group, oldest first. */
  readonly education: readonly ObituaryOccupation[];
}

/** The starting options a god-mode "custom life" fixes (the `start` log entry). */
export interface CustomStart {
  readonly givenName: string;
  readonly familyName: string;
  readonly gender: Gender;
  /** Starting value (0-100) per Pack stat id. */
  readonly stats: Readonly<Record<string, number>>;
  /** Parents spawned (the manifest family's count otherwise). */
  readonly parents: number;
  /** Siblings spawned (drawn from the manifest range otherwise). */
  readonly siblings: number;
  /** Birth city (full id); absent: drawn by weight like a plain life. */
  readonly cityId?: string;
}

/**
 * One player choice, in the order made (ADR 0003). With the life seed the list replays the
 * life on the build that wrote it.
 */
export type ChoiceEntry =
  | { readonly t: "age" }
  | { readonly t: "choose"; readonly i: number }
  | { readonly t: "action"; readonly id: string; readonly target?: PersonId }
  | {
      readonly t: "buy";
      readonly kind: string;
      readonly mode: "cash" | "loan";
    }
  | { readonly t: "sell"; readonly asset: number }
  /** God mode: always entry 0 of a custom life; replay feeds it to `newLife`. */
  | ({ readonly t: "start" } & CustomStart)
  /** God mode: set one of the player's stats (0-100). */
  | { readonly t: "god-stat"; readonly stat: string; readonly value: number }
  /** God mode: set the player's money (minor units). */
  | { readonly t: "god-money"; readonly value: number };

export interface PackVersion {
  readonly id: string;
  readonly version: string;
}

export interface World {
  /** Core save schema version; see `SCHEMA_VERSION`. */
  readonly schemaVersion: number;
  /** Life seed: uint32. */
  readonly seed: number;
  /** The player pointer. */
  readonly playerId: PersonId;
  /** Next id to allocate for persons, occupations, loans and assets. */
  readonly nextId: number;
  readonly persons: ReadonlyMap<PersonId, Person>;
  /** Kept sorted by (from, to, role). */
  readonly relationships: readonly Relationship[];
  /** One entry per age with events, ascending by age. */
  readonly journal: readonly JournalEntry[];
  /** Roll-site counters, keyed `"<age>/<purposeKey>"`. */
  readonly rngCounters: Readonly<Record<string, number>>;
  /** Open storylet awaiting a choice; null when none. */
  readonly pending: Pending | null;
  /** Set when the player died; the life is over. */
  readonly ended: Obituary | null;
  /** Storylet firing counts, keyed by storylet id, plus `#<scope id>` when scoped. */
  readonly storyletLog: Readonly<Record<string, StoryletRecord>>;
  /** Every player choice so far, in order; see `replay`. */
  readonly choiceLog: readonly ChoiceEntry[];
  /** Packs (and versions) the save was made with, sorted by id. */
  readonly packVersions: readonly PackVersion[];
}

export const SCHEMA_VERSION = 1;
