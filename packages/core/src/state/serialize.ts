import {
  type ChoiceEntry,
  GENDERS,
  type Gender,
  type Holding,
  type Obituary,
  type ObituaryOccupation,
  type Occupation,
  type Pending,
  type Person,
  type QualityValue,
  type QueuedEvent,
  type ScopeRef,
  type Series,
  type StateTree,
  type StateValue,
  type StoryletRecord,
  type World,
} from "./types.ts";

/**
 * Canonical JSON: every object's keys sorted by UTF-16 code unit order,
 * no whitespace, persons as an array in id order. Only integers, strings,
 * booleans, arrays and objects can appear, so the text is identical on every
 * engine. Arrays keep their order (it is meaningful state).
 */
export function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value))
        throw new TypeError(`non-integer number in state: ${value}`);
      return Object.is(value, -0) ? "0" : String(value);
    case "object": {
      if (Array.isArray(value))
        return `[${value.map(canonicalStringify).join(",")}]`;
      const o = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const k of Object.keys(o).sort()) {
        if (o[k] === undefined) continue;
        parts.push(`${JSON.stringify(k)}:${canonicalStringify(o[k])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`cannot serialize ${typeof value}`);
  }
}

export function serializeWorld(world: World): string {
  return canonicalStringify({
    ...world,
    persons: [...world.persons.values()].sort((a, b) => a.id - b.id),
  });
}

type Json = Record<string, unknown>;

function fail(path: string, what: string): never {
  throw new TypeError(`invalid world at ${path}: expected ${what}`);
}
const obj = (v: unknown, p: string): Json =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Json)
    : fail(p, "object");
const arr = (v: unknown, p: string): unknown[] =>
  Array.isArray(v) ? v : fail(p, "array");
const int = (v: unknown, p: string): number =>
  Number.isSafeInteger(v) ? (v as number) : fail(p, "integer");
const str = (v: unknown, p: string): string =>
  typeof v === "string" ? v : fail(p, "string");
const bool = (v: unknown, p: string): boolean =>
  typeof v === "boolean" ? v : fail(p, "boolean");
const optInt = (v: unknown, p: string): number | undefined =>
  v === undefined ? undefined : int(v, p);

function qualities(v: unknown, p: string): Record<string, QualityValue> {
  const out: Record<string, QualityValue> = {};
  for (const [k, x] of Object.entries(obj(v, p))) {
    out[k] = typeof x === "boolean" ? x : int(x, `${p}.${k}`);
  }
  return out;
}

function intRecord(v: unknown, p: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(obj(v, p))) out[k] = int(x, `${p}.${k}`);
  return out;
}

/** A container tree: integers, booleans and records of them, any depth. */
function stateValue(v: unknown, p: string): StateValue {
  if (typeof v === "boolean") return v;
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const out: Record<string, StateValue> = {};
    for (const [k, x] of Object.entries(v as Json))
      out[k] = stateValue(x, `${p}.${k}`);
    return out;
  }
  return int(v, p);
}

function stateTree(v: unknown, p: string): StateTree {
  const out: Record<string, StateValue> = {};
  for (const [k, x] of Object.entries(obj(v, p)))
    out[k] = stateValue(x, `${p}.${k}`);
  return out;
}

function occupation(v: unknown, p: string): Occupation {
  const o = obj(v, p);
  const endedAge = optInt(o.endedAge, `${p}.endedAge`);
  return {
    id: int(o.id, `${p}.id`),
    kindId: str(o.kindId, `${p}.kindId`),
    group: str(o.group, `${p}.group`),
    startedAge: int(o.startedAge, `${p}.startedAge`),
    years: int(o.years, `${p}.years`),
    performance: int(o.performance, `${p}.performance`),
    pay: int(o.pay, `${p}.pay`),
    ...(endedAge === undefined ? {} : { endedAge }),
  };
}

function holding(v: unknown, p: string): Holding {
  const o = obj(v, p);
  const maturesYear = optInt(o.maturesYear, `${p}.maturesYear`);
  return {
    kindId: str(o.kindId, `${p}.kindId`),
    units: int(o.units, `${p}.units`),
    basis: int(o.basis, `${p}.basis`),
    firstAge: int(o.firstAge, `${p}.firstAge`),
    ...(maturesYear === undefined ? {} : { maturesYear }),
  };
}

function market(v: unknown, p: string): Record<string, Series> {
  const out: Record<string, Series> = {};
  for (const [k, x] of Object.entries(obj(v, p))) {
    const o = obj(x, `${p}.${k}`);
    const face = optInt(o.face, `${p}.${k}.face`);
    out[k] = {
      from: int(o.from, `${p}.${k}.from`),
      prices: arr(o.prices, `${p}.${k}.prices`).map((n, i) =>
        int(n, `${p}.${k}.prices[${i}]`),
      ),
      next: int(o.next, `${p}.${k}.next`),
      ...(face === undefined ? {} : { face }),
    };
  }
  return out;
}

function gender(v: unknown, p: string): Gender {
  return GENDERS.includes(v as Gender) ? (v as Gender) : fail(p, "gender");
}

function person(v: unknown, p: string): Person {
  const o = obj(v, p);
  const cityId =
    o.cityId === undefined ? undefined : str(o.cityId, `${p}.cityId`);
  const standardId =
    o.standardId === undefined
      ? undefined
      : str(o.standardId, `${p}.standardId`);
  const livedStandardId =
    o.livedStandardId === undefined
      ? undefined
      : str(o.livedStandardId, `${p}.livedStandardId`);
  const withGuardian =
    o.withGuardian === undefined
      ? undefined
      : bool(o.withGuardian, `${p}.withGuardian`);
  const withParents =
    o.withParents === undefined
      ? undefined
      : bool(o.withParents, `${p}.withParents`);
  const job =
    o.job === undefined
      ? undefined
      : (() => {
          const j = obj(o.job, `${p}.job`);
          return {
            label: str(j.label, `${p}.job.label`),
            tier: int(j.tier, `${p}.job.tier`),
          };
        })();
  const state =
    o.state === undefined ? undefined : stateTree(o.state, `${p}.state`);
  return {
    ...(job === undefined ? {} : { job }),
    ...(cityId === undefined ? {} : { cityId }),
    ...(withParents === undefined ? {} : { withParents }),
    ...(withGuardian === undefined ? {} : { withGuardian }),
    ...(standardId === undefined ? {} : { standardId }),
    ...(livedStandardId === undefined ? {} : { livedStandardId }),
    ...(state === undefined ? {} : { state }),
    id: int(o.id, `${p}.id`),
    givenName: str(o.givenName, `${p}.givenName`),
    familyName: str(o.familyName, `${p}.familyName`),
    ...(o.gender === undefined
      ? {}
      : { gender: gender(o.gender, `${p}.gender`) }),
    age: int(o.age, `${p}.age`),
    alive: bool(o.alive, `${p}.alive`),
    stats: intRecord(o.stats, `${p}.stats`),
    qualities: qualities(o.qualities, `${p}.qualities`),
    money: int(o.money, `${p}.money`),
    occupations: arr(o.occupations, `${p}.occupations`).map((x, i) =>
      occupation(x, `${p}.occupations[${i}]`),
    ),
    occupationHistory: arr(o.occupationHistory, `${p}.occupationHistory`).map(
      (x, i) => occupation(x, `${p}.occupationHistory[${i}]`),
    ),
    assets: arr(o.assets, `${p}.assets`).map((x, i) => {
      const a = obj(x, `${p}.assets[${i}]`);
      const q = `${p}.assets[${i}]`;
      const acquiredAge = optInt(a.acquiredAge, `${q}.acquiredAge`);
      const cityId =
        a.cityId === undefined ? undefined : str(a.cityId, `${q}.cityId`);
      return {
        id: int(a.id, `${q}.id`),
        ...(cityId === undefined ? {} : { cityId }),
        kindId: str(a.kindId, `${q}.kindId`),
        purchasePrice: int(a.purchasePrice, `${q}.purchasePrice`),
        value: int(a.value, `${q}.value`),
        ...(acquiredAge === undefined ? {} : { acquiredAge }),
        qualities: qualities(a.qualities, `${q}.qualities`),
      };
    }),
    holdings: (o.holdings === undefined
      ? []
      : arr(o.holdings, `${p}.holdings`)
    ).map((x, i) => holding(x, `${p}.holdings[${i}]`)),
    loans: arr(o.loans, `${p}.loans`).map((x, i) => {
      const l = obj(x, `${p}.loans[${i}]`);
      const q = `${p}.loans[${i}]`;
      const securedAssetId = optInt(l.securedAssetId, `${q}.securedAssetId`);
      return {
        id: int(l.id, `${q}.id`),
        kindId: str(l.kindId, `${q}.kindId`),
        principal: int(l.principal, `${q}.principal`),
        balance: int(l.balance, `${q}.balance`),
        rateBp: int(l.rateBp, `${q}.rateBp`),
        termYears: int(l.termYears, `${q}.termYears`),
        payment: int(l.payment, `${q}.payment`),
        ...(securedAssetId === undefined ? {} : { securedAssetId }),
        missed: int(l.missed, `${q}.missed`),
      };
    }),
  };
}

function scope(v: unknown, p: string): ScopeRef {
  const o = obj(v, p);
  const kind = str(o.kind, `${p}.kind`);
  if (kind !== "loan" && kind !== "person") fail(`${p}.kind`, "loan or person");
  return { kind, id: int(o.id, `${p}.id`) };
}

function optAmount(v: unknown, p: string): { amount?: number } {
  const amount = optInt(v, p);
  return amount === undefined ? {} : { amount };
}

function queued(v: unknown, p: string): QueuedEvent {
  const o = obj(v, p);
  return {
    storyletId: str(o.storyletId, `${p}.storyletId`),
    ...(o.scope === undefined ? {} : { scope: scope(o.scope, `${p}.scope`) }),
    ...optAmount(o.amount, `${p}.amount`),
  };
}

function pending(v: unknown, p: string): Pending {
  const o = obj(v, p);
  return {
    storyletId: str(o.storyletId, `${p}.storyletId`),
    ...(o.scope === undefined ? {} : { scope: scope(o.scope, `${p}.scope`) }),
    ...optAmount(o.amount, `${p}.amount`),
    ...(o.factorBp === undefined
      ? {}
      : { factorBp: int(o.factorBp, `${p}.factorBp`) }),
    ...(o.rest === undefined
      ? {}
      : {
          rest: {
            events: arr(
              obj(o.rest, `${p}.rest`).events,
              `${p}.rest.events`,
            ).map((x, i) => queued(x, `${p}.rest.events[${i}]`)),
          },
        }),
  };
}

function obituaryOccupations(v: unknown, p: string): ObituaryOccupation[] {
  return arr(v, p).map((x, i) => {
    const o = obj(x, `${p}[${i}]`);
    return {
      kindId: str(o.kindId, `${p}[${i}].kindId`),
      startedAge: int(o.startedAge, `${p}[${i}].startedAge`),
      endedAge: int(o.endedAge, `${p}[${i}].endedAge`),
      years: int(o.years, `${p}[${i}].years`),
    };
  });
}

function obituary(v: unknown, p: string): Obituary {
  const o = obj(v, p);
  return {
    personId: int(o.personId, `${p}.personId`),
    givenName: str(o.givenName, `${p}.givenName`),
    familyName: str(o.familyName, `${p}.familyName`),
    age: int(o.age, `${p}.age`),
    cause: str(o.cause, `${p}.cause`),
    netWorth: int(o.netWorth, `${p}.netWorth`),
    career: obituaryOccupations(o.career, `${p}.career`),
    education: obituaryOccupations(o.education, `${p}.education`),
  };
}

function storyletLog(v: unknown, p: string): Record<string, StoryletRecord> {
  const out: Record<string, StoryletRecord> = {};
  for (const [k, x] of Object.entries(obj(v, p))) {
    const o = obj(x, `${p}.${k}`);
    out[k] = {
      count: int(o.count, `${p}.${k}.count`),
      lastAge: int(o.lastAge, `${p}.${k}.lastAge`),
    };
  }
  return out;
}

function choiceLog(v: unknown, p: string): ChoiceEntry[] {
  return arr(v, p).map((x, i): ChoiceEntry => {
    const q = `${p}[${i}]`;
    const o = obj(x, q);
    const t = str(o.t, `${q}.t`);
    switch (t) {
      case "age":
      case "mature":
        return { t };
      case "choose":
        return { t, i: int(o.i, `${q}.i`) };
      case "action": {
        const target = optInt(o.target, `${q}.target`);
        return {
          t,
          id: str(o.id, `${q}.id`),
          ...(target === undefined ? {} : { target }),
          ...optAmount(o.amount, `${q}.amount`),
        };
      }
      case "buy": {
        const mode = str(o.mode, `${q}.mode`);
        if (mode !== "cash" && mode !== "loan")
          fail(`${q}.mode`, "cash or loan");
        return { t, kind: str(o.kind, `${q}.kind`), mode };
      }
      case "sell":
        return { t, asset: int(o.asset, `${q}.asset`) };
      case "trade":
        return {
          t,
          kind: str(o.kind, `${q}.kind`),
          amount: int(o.amount, `${q}.amount`),
        };
      case "succeed":
        return { t, heir: int(o.heir, `${q}.heir`) };
      case "start": {
        const cityId =
          o.cityId === undefined ? undefined : str(o.cityId, `${q}.cityId`);
        return {
          t,
          ...(cityId === undefined ? {} : { cityId }),
          givenName: str(o.givenName, `${q}.givenName`),
          familyName: str(o.familyName, `${q}.familyName`),
          gender: gender(o.gender, `${q}.gender`),
          stats: intRecord(o.stats, `${q}.stats`),
          parents: int(o.parents, `${q}.parents`),
          siblings: int(o.siblings, `${q}.siblings`),
        };
      }
      case "god-stat":
        return {
          t,
          stat: str(o.stat, `${q}.stat`),
          value: int(o.value, `${q}.value`),
        };
      case "god-money":
        return { t, value: int(o.value, `${q}.value`) };
      default:
        return fail(
          `${q}.t`,
          "age, choose, action, buy, sell, trade, mature, start, god-stat or god-money",
        );
    }
  });
}

/** Parse and validate a serialized world. Throws TypeError on any shape or non-integer violation. Schema migrations are applied before this by the save layer. */
export function deserializeWorld(text: string): World {
  const o = obj(JSON.parse(text), "$");
  const persons = new Map<number, Person>();
  for (const [i, x] of arr(o.persons, "$.persons").entries()) {
    const p = person(x, `$.persons[${i}]`);
    persons.set(p.id, p);
  }
  return {
    schemaVersion: int(o.schemaVersion, "$.schemaVersion"),
    seed: int(o.seed, "$.seed"),
    playerId: int(o.playerId, "$.playerId"),
    // Saves from before generations: founder, with the world clock at the player's age.
    generation: optInt(o.generation, "$.generation") ?? 0,
    worldYear:
      optInt(o.worldYear, "$.worldYear") ??
      persons.get(int(o.playerId, "$.playerId"))?.age ??
      0,
    nextId: int(o.nextId, "$.nextId"),
    // Saves from before markets: no series yet (they start at the next settlement).
    market: o.market === undefined ? {} : market(o.market, "$.market"),
    persons,
    ...(o.state === undefined ? {} : { state: stateTree(o.state, "$.state") }),
    relationships: arr(o.relationships, "$.relationships").map((x, i) => {
      const r = obj(x, `$.relationships[${i}]`);
      const household = r.household;
      if (
        household !== undefined &&
        household !== "together" &&
        household !== "merged"
      )
        throw new RangeError(`$.relationships[${i}].household: bad value`);
      return {
        ...(household === undefined ? {} : { household }),
        from: int(r.from, `$.relationships[${i}].from`),
        to: int(r.to, `$.relationships[${i}].to`),
        role: str(r.role, `$.relationships[${i}].role`),
        closeness: int(r.closeness, `$.relationships[${i}].closeness`),
      };
    }),
    journal: arr(o.journal, "$.journal").map((x, i) => {
      const e = obj(x, `$.journal[${i}]`);
      return {
        age: int(e.age, `$.journal[${i}].age`),
        lines: arr(e.lines, `$.journal[${i}].lines`).map((l, j) =>
          str(l, `$.journal[${i}].lines[${j}]`),
        ),
      };
    }),
    rngCounters: intRecord(o.rngCounters, "$.rngCounters"),
    pending: o.pending === null ? null : pending(o.pending, "$.pending"),
    ended: o.ended === null ? null : obituary(o.ended, "$.ended"),
    storyletLog: storyletLog(o.storyletLog, "$.storyletLog"),
    uses: intRecord(o.uses, "$.uses"),
    choiceLog: choiceLog(o.choiceLog, "$.choiceLog"),
    capabilities: arr(o.capabilities, "$.capabilities").map((x, i) =>
      str(x, `$.capabilities[${i}]`),
    ),
    appliedMigrations: arr(o.appliedMigrations, "$.appliedMigrations").map(
      (x, i) => str(x, `$.appliedMigrations[${i}]`),
    ),
  };
}
