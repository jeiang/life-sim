import {
  type ExprEnv as Env,
  pureFunctions,
  type Value,
} from "../expr/index.ts";
import type {
  Loan,
  Person,
  PersonId,
  QualityValue,
  World,
} from "../state/types.ts";
import { getPerson } from "../state/world.ts";
import {
  costIndexOf,
  housingProvided,
  livesWithParents,
  livingCost,
  standardCost,
  standardOf,
  wageIndexOf,
} from "./living.ts";
import type { PackIndex } from "./pack-index.ts";

/** What names resolve against: the subject person (the player) and optional bindings. */
export interface Scope {
  /** The person `age`, `money`, `stat.*`, `quality.*`, `player.*` read from. */
  readonly subject: PersonId;
  /** `loan.*` in `scope: loan`. */
  readonly loan?: Loan;
  /** `person.*` in `scope: person`. */
  readonly person?: PersonId;
  /** `asset.*` in item kind value formulas. */
  readonly asset?: {
    readonly purchasePrice: number;
    readonly value: number;
    readonly years: number;
  };
  /** Persons bound by `spawn_person(...) as <name>` in the running outcome. */
  readonly bound?: ReadonlyMap<string, PersonId>;
}

export function qualityOf(p: Person, idx: PackIndex, id: string): QualityValue {
  const v = p.qualities[id];
  if (v !== undefined) return v;
  const d = idx.qualities.get(id);
  if (!d) throw new RangeError(`unknown quality '${id}'`);
  return d.default;
}

/** The player's relationship role toward a person (first by id order), if any. */
export function roleOf(world: World, id: PersonId): string | undefined {
  for (const r of world.relationships)
    if (r.from === world.playerId && r.to === id) return r.role;
  return undefined;
}

/** Every role the player holds toward a person. */
export function rolesOf(world: World, id: PersonId): string[] {
  return world.relationships
    .filter((r) => r.from === world.playerId && r.to === id)
    .map((r) => r.role);
}

function personField(
  world: World,
  idx: PackIndex,
  id: PersonId,
  field: string,
  path: string,
): Value {
  const p = getPerson(world, id);
  if (field === "first_name") return p.givenName;
  if (field === "last_name") return p.familyName;
  if (field === "age") return p.age;
  if (field === "alive") return p.alive;
  if (field === "role") return roleOf(world, id) ?? "";
  if (field.startsWith("stat.")) return p.stats[field.slice(5)] ?? 0;
  if (field.startsWith("quality."))
    return qualityOf(p, idx, field.slice(8)) as Value;
  throw new RangeError(`unknown name '${path}'`);
}

/** Total years the person has spent in an occupation kind, held now or in history. */
function yearsIn(p: Person, kindId: string): number {
  let n = 0;
  for (const o of p.occupations) if (o.kindId === kindId) n += o.years;
  for (const o of p.occupationHistory) if (o.kindId === kindId) n += o.years;
  return n;
}

let assertSink: ((message: string) => void) | null = null;

/**
 * Route expression runtime assertions (division by zero, overflow) to `sink` for every
 * expression the Core evaluates from now on; `null` restores production behaviour (no hook,
 * values clamp silently). For the balance harness and dev builds; ADR 0004.
 */
export function setAssertSink(sink: ((message: string) => void) | null): void {
  assertSink = sink;
}

/** What the decision-slot draw did in one age-up (for the balance harness). */
export interface DecisionDraw {
  /** Slots that fired (the length of the unbroken run of hits). */
  readonly fired: number;
  /** Decisions queued: chance choice events plus decisions drawn into slots, under the cap. */
  readonly queued: number;
  /** Fired slots (after chance choice events counted) with no eligible decision to draw. */
  readonly empty: number;
}

let decisionSink: ((draw: DecisionDraw) => void) | null = null;

/** Report every decision-slot draw to `sink` (pack with `year.decisions` only); `null` stops. */
export function setDecisionSink(
  sink: ((draw: DecisionDraw) => void) | null,
): void {
  decisionSink = sink;
}

/** @internal Used by the year draw. */
export function reportDecisions(draw: DecisionDraw): void {
  decisionSink?.(draw);
}

/** Expression environment (ADR 0004) over the world. Only the whitelisted names exist. */
export function makeEnv(world: World, idx: PackIndex, scope: Scope): Env {
  const subject = getPerson(world, scope.subject);
  const sink = assertSink;
  return {
    ...(sink ? { onAssert: sink } : {}),
    get(path: string): Value {
      if (path === "age") return subject.age;
      if (path === "money") return subject.money;
      if (path.startsWith("stat.")) return subject.stats[path.slice(5)] ?? 0;
      if (path.startsWith("quality."))
        return qualityOf(subject, idx, path.slice(8)) as Value;
      if (path.startsWith("player."))
        return personField(world, idx, scope.subject, path.slice(7), path);
      if (path === "city.cost_index") return costIndexOf(subject, idx);
      if (path === "city.wage_index") return wageIndexOf(subject, idx);
      if (path === "living.cost") return livingCost(subject, idx);
      if (path === "living.standard") return standardOf(subject, idx)?.id ?? "";
      if (path === "living.risk")
        return housingProvided(subject, idx)
          ? 10000
          : (standardOf(subject, idx)?.riskBp ?? 10000);
      if (path === "city.label")
        return (subject.cityId && idx.cities.get(subject.cityId)?.label) || "";
      if (path === "city.country")
        return (
          (subject.cityId && idx.cities.get(subject.cityId)?.country) || ""
        );
      if (path === "city.id") return subject.cityId ?? "";
      if (path === "living.with_parents") return livesWithParents(subject);
      if (path.startsWith("loan.") && scope.loan) {
        const f = path.slice(5);
        if (f === "balance") return scope.loan.balance;
        if (f === "payment") return scope.loan.payment;
        if (f === "missed") return scope.loan.missed;
      }
      if (path.startsWith("asset.") && scope.asset) {
        const f = path.slice(6);
        if (f === "purchase_price") return scope.asset.purchasePrice;
        if (f === "value") return scope.asset.value;
        if (f === "years") return scope.asset.years;
      }
      if (path.startsWith("person.") && scope.person !== undefined)
        return personField(world, idx, scope.person, path.slice(7), path);
      const dot = path.indexOf(".");
      if (dot > 0) {
        const bound = scope.bound?.get(path.slice(0, dot));
        if (bound !== undefined)
          return personField(world, idx, bound, path.slice(dot + 1), path);
      }
      throw new RangeError(`unknown name '${path}'`);
    },
    call(name: string, args: Value[]): Value {
      const pure = pureFunctions[name];
      if (pure) return pure(...(args as number[]));
      const id = args[0] as string;
      switch (name) {
        case "has_occupation":
          return subject.occupations.some((o) => o.kindId === id);
        case "owns":
          return subject.assets.some((a) => a.kindId === id);
        case "years_in":
          return yearsIn(subject, id);
        case "standard_cost": {
          const std = idx.standardsById.get(id);
          if (!std) throw new RangeError(`unknown standard '${id}'`);
          return standardCost(subject, idx, std);
        }
        case "role_closeness":
        case "role_count": {
          const alive = world.relationships.filter(
            (r) =>
              r.from === world.playerId &&
              r.role === id &&
              world.persons.get(r.to)?.alive,
          );
          if (name === "role_count") return alive.length;
          return alive.length
            ? Math.trunc(
                alive.reduce((n, r) => n + r.closeness, 0) / alive.length,
              )
            : 0;
        }
        case "has":
          return (
            subject.occupations.some((o) => o.kindId === id) ||
            subject.occupationHistory.some((o) => o.kindId === id) ||
            subject.assets.some((a) => a.kindId === id)
          );
        default:
          throw new RangeError(`unknown function '${name}'`);
      }
    },
  };
}
