import {
  AGGREGATE_PREFIX,
  type Aggregate,
  type ExprEnv as Env,
  evaluate,
  pureFunctions,
  type Value,
} from "../expr/index.ts";
import type { TableDecl } from "../pack.ts";
import { cellValue, counterValue } from "../state/containers.ts";
import {
  type Loan,
  type Person,
  type PersonId,
  pronounOf,
  type QualityValue,
  type World,
} from "../state/types.ts";
import { getPerson } from "../state/world.ts";
import { incomeTier } from "./careers.ts";
import {
  confinementOf,
  costIndexOf,
  dependentsOf,
  livesWithGuardian,
  livesWithParents,
  livingBreakdown,
  livingCost,
  riskBpOf,
  standardOf,
  wageIndexOf,
} from "./living.ts";
import {
  changeBp,
  forecastBp,
  holdingValue,
  portfolioValue,
  priceNow,
} from "./market.ts";
import type { PackIndex } from "./pack-index.ts";
import { aggregate, combineSlot } from "./readables.ts";

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
  /** `uses_this_year`: uses of the running repeatable action so far this year, this one included. */
  readonly uses?: number;
  /** Share of every gain this outcome keeps, basis points (default 10000: all of it). */
  readonly factorBp?: number;
  /** `amount` in the choices and outcomes of an action with an amount input. */
  readonly amount?: number;
  /** Persons bound by `spawn_person(...) as <name>` in the running outcome. */
  readonly bound?: ReadonlyMap<string, PersonId>;
  /** RNG purpose key for a roll the running effect makes (`spawn_person`); set by lifecycle hooks. */
  readonly purpose?: string;
}

export function qualityOf(p: Person, idx: PackIndex, id: string): QualityValue {
  const v = p.qualities[id];
  if (v !== undefined) return v;
  const d = idx.qualities.get(id);
  if (!d) throw new RangeError(`unknown quality '${id}'`);
  return d.default;
}

/** The table declaration and key of a `<id>.<key>` path tail (after `table.`). */
export function tableRef(idx: PackIndex, rest: string): [TableDecl, string] {
  const dot = rest.indexOf(".");
  const decl = idx.state.get(dot < 0 ? rest : rest.slice(0, dot));
  if (dot < 0 || decl?.kind !== "table")
    throw new RangeError(`unknown table cell 'table.${rest}'`);
  return [decl, rest.slice(dot + 1)];
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

/** The player's closeness to a person: the maximum over their role rows, 0 with no tie. */
export function closenessOf(world: World, id: PersonId): number {
  let best = 0;
  for (const r of world.relationships)
    if (r.from === world.playerId && r.to === id && r.closeness > best)
      best = r.closeness;
  return best;
}

/** Living people the player holds `role` toward with closeness in `[min, max]`. */
function countRole(
  world: World,
  role: string,
  min: number,
  max: number,
): number {
  let n = 0;
  for (const r of world.relationships)
    if (
      r.from === world.playerId &&
      r.role === role &&
      r.closeness >= min &&
      r.closeness <= max &&
      getPerson(world, r.to).alive
    )
      n++;
  return n;
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
  if (field === "gender") return p.gender ?? "";
  const pronoun = pronounOf(p.gender, field);
  if (pronoun !== undefined) return pronoun;
  if (field === "age") return p.age;
  if (field === "alive") return p.alive;
  if (field === "role") return roleOf(world, id) ?? "";
  if (field === "closeness") return closenessOf(world, id);
  if (field === "money") return p.money;
  if (field === "income_tier") return incomeTier(world, idx, id);
  if (field.startsWith("stat.")) return p.stats[field.slice(5)] ?? 0;
  if (field.startsWith("quality."))
    return qualityOf(p, idx, field.slice(8)) as Value;
  if (field.startsWith("table.")) {
    const [decl, key] = tableRef(idx, field.slice(6));
    return cellValue(p, decl, key);
  }
  throw new RangeError(`unknown name '${path}'`);
}

const heldOf = (p: Person, kindId: string) =>
  p.holdings.find((h) => h.kindId === kindId);

/** Total years the person has spent in an occupation kind, held now or in history. */
function yearsIn(p: Person, kindId: string): number {
  let n = 0;
  for (const o of p.occupations) if (o.kindId === kindId) n += o.years;
  for (const o of p.occupationHistory) if (o.kindId === kindId) n += o.years;
  return n;
}

/** Total years across every occupation (held or past) whose exclusivity group is `group`. */
function yearsInGroup(p: Person, group: string): number {
  let n = 0;
  for (const o of p.occupations) if (o.group === group) n += o.years;
  for (const o of p.occupationHistory) if (o.group === group) n += o.years;
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

let chanceDropSink: ((ids: readonly string[]) => void) | null = null;

/** Report the chance hits dropped by the yearly cap (storylet keys, one call per capped age-up); `null` stops. */
export function setChanceDropSink(
  sink: ((ids: readonly string[]) => void) | null,
): void {
  chanceDropSink = sink;
}

/** @internal Used by the year draw. */
export function reportChanceDrops(ids: readonly string[]): void {
  chanceDropSink?.(ids);
}

let outcomeSink: ((storyletId: string, moneyDelta: number) => void) | null =
  null;

/** Report the money change of every resolved outcome (storylet id, the subject's change); `null` stops. For the balance harness. */
export function setOutcomeSink(
  sink: ((storyletId: string, moneyDelta: number) => void) | null,
): void {
  outcomeSink = sink;
}

/** @internal Used by outcome resolution. */
export function reportOutcome(storyletId: string, moneyDelta: number): void {
  outcomeSink?.(storyletId, moneyDelta);
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
      if (path === "uses_this_year") return scope.uses ?? 0;
      if (path === "amount" && scope.amount !== undefined) return scope.amount;
      const readable = idx.readables.get(path);
      if (readable) {
        // Readables read the player-level names only, whatever scope the caller is in.
        const base = makeEnv(world, idx, { subject: scope.subject });
        const d = readable.decl;
        return d.kind === "readable"
          ? evaluate(d.expr, base)
          : combineSlot(
              d,
              readable.terms.map((t) => evaluate(t, base) as number | boolean),
            );
      }
      if (path.startsWith("stat.")) return subject.stats[path.slice(5)] ?? 0;
      if (path.startsWith("quality."))
        return qualityOf(subject, idx, path.slice(8)) as Value;
      if (path.startsWith("world.")) {
        const decl = idx.state.get(path.slice(6));
        if (decl?.kind !== "counter")
          throw new RangeError(`unknown name '${path}'`);
        return counterValue(world, decl);
      }
      if (path.startsWith("table.")) {
        const [decl, key] = tableRef(idx, path.slice(6));
        return cellValue(subject, decl, key);
      }
      if (path.startsWith("player."))
        return personField(world, idx, scope.subject, path.slice(7), path);
      if (path === "city.cost_index") return costIndexOf(subject, idx);
      if (path === "city.wage_index") return wageIndexOf(subject, idx);
      if (path === "portfolio") return portfolioValue(world, scope.subject);
      if (path === "confined") return confinementOf(subject, idx) !== undefined;
      if (path === "living.cost") return livingCost(world, idx, subject);
      if (path === "living.standard") return standardOf(subject, idx)?.id ?? "";
      if (path === "living.risk") return riskBpOf(subject, idx);
      if (path === "city.label")
        return (subject.cityId && idx.cities.get(subject.cityId)?.label) || "";
      if (path === "city.country")
        return (
          (subject.cityId && idx.cities.get(subject.cityId)?.country) || ""
        );
      if (path === "city.id") return subject.cityId ?? "";
      if (path === "living.with_parents") return livesWithParents(subject);
      if (path === "living.with_guardian") return livesWithGuardian(subject);
      if (path === "living.dependents")
        return dependentsOf(world, idx, subject);
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
      if (name.startsWith(AGGREGATE_PREFIX))
        return aggregate(
          world,
          idx,
          subject,
          name.slice(AGGREGATE_PREFIX.length) as Aggregate,
          args[0] as string,
        );
      const id = args[0] as string;
      switch (name) {
        case "has_remote_job":
          return subject.occupations.some(
            (o) => idx.occupations.get(o.kindId)?.remote === true,
          );
        case "has_occupation":
          return subject.occupations.some((o) => o.kindId === id);
        case "owns":
          return subject.assets.some((a) => a.kindId === id);
        case "years_in":
          return yearsIn(subject, id);
        case "standard_cost": {
          const std = idx.standardsById.get(id);
          if (!std) throw new RangeError(`unknown standard '${id}'`);
          return livingBreakdown(world, idx, subject, std).total;
        }
        case "role_closeness": {
          const alive = world.relationships.filter(
            (r) =>
              r.from === world.playerId &&
              r.role === id &&
              world.persons.get(r.to)?.alive,
          );
          return alive.length
            ? Math.trunc(
                alive.reduce((n, r) => n + r.closeness, 0) / alive.length,
              )
            : 0;
        }
        case "in_group":
          return subject.occupations.some((o) => o.group === id);
        case "years_in_group":
          return yearsInGroup(subject, id);
        case "count_role":
          return countRole(world, id, args[1] as number, args[2] as number);
        case "price":
          return priceNow(world, idx, id);
        case "change":
          return changeBp(world, id);
        case "forecast":
          return forecastBp(world, id);
        case "units":
          return heldOf(subject, id)?.units ?? 0;
        case "cost_basis":
          return heldOf(subject, id)?.basis ?? 0;
        case "holding_value": {
          const h = heldOf(subject, id);
          return h ? holdingValue(world, h) : 0;
        }
        case "holding_years": {
          const h = heldOf(subject, id);
          return h ? subject.age - h.firstAge : 0;
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
