import { type Expr, evaluate } from "../expr/index.ts";
import type { CompiledGenerator } from "../pack.ts";
import type { Rng } from "../rng.ts";
import {
  type Asset,
  DEFAULT_GENDER_WEIGHTS,
  GENDERS,
  type Gender,
  type Loan,
  type Obituary,
  type ObituaryOccupation,
  type Occupation,
  type Person,
  type PersonId,
  type World,
} from "../state/types.ts";
import {
  addJournalLine,
  addPerson,
  allocId,
  clamp,
  getPerson,
  nextStream,
  putAsset,
  putLoan,
  putRelationship,
  removeAsset,
  updatePerson,
} from "../state/world.ts";
import { makeEnv, type Scope } from "./env.ts";
import { portfolioValue } from "./market.ts";
import { linkFamilyRole } from "./kinship.ts";
import type { PackIndex } from "./pack-index.ts";
import { nameOf } from "./text.ts";

/** Evaluate an expression to an integer (booleans are 0 or 1). */
export function evalInt(
  e: Expr,
  world: World,
  idx: PackIndex,
  scope: Scope,
): number {
  const v = evaluate(e, makeEnv(world, idx, scope));
  return typeof v === "number" ? v : v === true ? 1 : 0;
}

export function evalBool(
  e: Expr | undefined,
  world: World,
  idx: PackIndex,
  scope: Scope,
): boolean {
  return e === undefined
    ? true
    : Boolean(evaluate(e, makeEnv(world, idx, scope)));
}

/** The age on the world clock: the player's age. */
export function clockAge(world: World): number {
  return getPerson(world, world.playerId).age;
}

/** Cash plus asset values and market holdings minus loan balances. */
export function netWorth(world: World, person: Person): number {
  let n = person.money + portfolioValue(world, person.id);
  for (const a of person.assets) n += a.value;
  for (const l of person.loans) n -= l.balance;
  return n;
}

/**
 * Smallest fixed yearly payment that repays `principal` within `years` at `rateBp` yearly
 * interest (interest truncated each year). Integer arithmetic only.
 */
export function loanPayment(
  principal: number,
  rateBp: number,
  years: number,
): number {
  const n = Math.max(1, years);
  const repaid = (p: number): boolean => {
    let b = principal;
    for (let y = 0; y < n && b > 0; y++) {
      b += Math.trunc((b * rateBp) / 10000);
      b -= p;
    }
    return b <= 0;
  };
  let lo = Math.max(1, Math.trunc(principal / n));
  let hi = Math.max(
    lo,
    principal + Math.trunc((principal * rateBp * n) / 10000),
  );
  while (lo < hi) {
    const mid = lo + Math.trunc((hi - lo) / 2);
    if (repaid(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Credit `principal` to the person and record a loan. Returns the world and the loan id. */
export function openLoan(
  world: World,
  personId: PersonId,
  loan: {
    readonly kindId: string;
    readonly principal: number;
    readonly rateBp: number;
    readonly termYears: number;
    readonly securedAssetId?: number;
  },
): [World, number] {
  const [w, id] = allocId(world);
  const l: Loan = {
    id,
    kindId: loan.kindId,
    principal: loan.principal,
    balance: loan.principal,
    rateBp: loan.rateBp,
    termYears: loan.termYears,
    payment: loanPayment(loan.principal, loan.rateBp, loan.termYears),
    ...(loan.securedAssetId === undefined
      ? {}
      : { securedAssetId: loan.securedAssetId }),
    missed: 0,
  };
  const w2 = updatePerson(putLoan(w, personId, l), personId, (p) => ({
    ...p,
    money: p.money + loan.principal,
  }));
  return [w2, id];
}

/** Create an asset of an item kind at its current price. Money is not charged. */
export function grantAsset(
  world: World,
  idx: PackIndex,
  personId: PersonId,
  kindId: string,
): [World, number] {
  const kind = idx.items.get(kindId);
  if (!kind) throw new RangeError(`unknown item kind '${kindId}'`);
  const price = Math.max(
    0,
    evalInt(kind.price, world, idx, { subject: personId }),
  );
  const [w, id] = allocId(world);
  const asset: Asset = {
    id,
    kindId,
    purchasePrice: price,
    value: price,
    acquiredAge: getPerson(world, personId).age,
    ...(getPerson(world, personId).cityId === undefined
      ? {}
      : { cityId: getPerson(world, personId).cityId as string }),
    qualities: {},
  };
  return [putAsset(w, personId, asset), id];
}

/** Remove the person's lowest-id asset of a kind; a loan it secured becomes unsecured. */
export function dropAsset(
  world: World,
  personId: PersonId,
  assetId: number,
): World {
  let w = removeAsset(world, personId, assetId);
  for (const l of getPerson(w, personId).loans) {
    if (l.securedAssetId === assetId) {
      const { securedAssetId: _drop, ...rest } = l;
      w = putLoan(w, personId, rest);
    }
  }
  return w;
}

/** Move a held occupation to history. */
export function endOccupation(
  world: World,
  personId: PersonId,
  occupationId: number,
): World {
  return updatePerson(world, personId, (p) => {
    const occ = p.occupations.find((o) => o.id === occupationId);
    if (!occ) return p;
    return {
      ...p,
      occupations: p.occupations.filter((o) => o.id !== occupationId),
      occupationHistory: [...p.occupationHistory, { ...occ, endedAge: p.age }],
    };
  });
}

/**
 * Start an occupation: ends any held occupation in the same exclusivity group first. Does
 * nothing if the kind is already held or its `requires` is false.
 */
export function startOccupation(
  world: World,
  idx: PackIndex,
  personId: PersonId,
  kindId: string,
): World {
  const kind = idx.occupations.get(kindId);
  if (!kind) throw new RangeError(`unknown occupation kind '${kindId}'`);
  const scope: Scope = { subject: personId };
  const person = getPerson(world, personId);
  if (person.occupations.some((o) => o.kindId === kindId)) return world;
  if (
    kind.requires !== undefined &&
    !evalBool(kind.requires, world, idx, scope)
  )
    return world;
  let w = world;
  for (const o of person.occupations)
    if (o.group === kind.group) w = endOccupation(w, personId, o.id);
  const [w2, id] = allocId(w);
  const occ: Occupation = {
    id,
    kindId,
    group: kind.group,
    startedAge: person.age,
    years: 0,
    performance: 50,
    pay: evalInt(kind.pay, w2, idx, scope),
  };
  return updatePerson(w2, personId, (p) => ({
    ...p,
    occupations: [...p.occupations, occ],
  }));
}

/** Range of the first-name roll: one raw draw, mapped onto the pool once the gender is known. */
export const NAME_ROLL_RANGE = 0x100000000;

/** Gender drawn by the generator's weights (one draw, even when a single gender has weight). */
export function drawGender(
  rng: Rng,
  gen: CompiledGenerator | undefined,
): Gender {
  const weights = GENDERS.map(
    (g) => gen?.genderWeights[g] ?? DEFAULT_GENDER_WEIGHTS[g],
  );
  return GENDERS[rng.weightedPick(weights)] as Gender;
}

/** First name for `gender` from a `NAME_ROLL_RANGE` roll; "" with an empty pool. */
export function pickFirstName(
  gen: CompiledGenerator | undefined,
  gender: Gender,
  roll: number,
  fallback = "",
): string {
  const pool = gen?.firstNames[gender];
  return pool?.length
    ? (pool[Math.floor((roll * pool.length) / NAME_ROLL_RANGE)] as string)
    : fallback;
}

/** Create a person from a generator and link them from `from` with the role. */
export function spawnPerson(
  world: World,
  idx: PackIndex,
  from: PersonId,
  roleId: string,
  generatorId: string,
  opts: { familyName?: string; closeness?: number } = {},
): [World, PersonId] {
  const gen = idx.generators.get(generatorId);
  if (!gen) throw new RangeError(`unknown generator '${generatorId}'`);
  const age = clockAge(world);
  const [w0, rng] = nextStream(world, age, `spawn/${generatorId}`);
  // The first-name roll sits where the name draw always was; the gender drawn last picks the pool.
  const nameRoll = rng.int(NAME_ROLL_RANGE);
  const lastNames = gen.lastNames;
  const drawn = lastNames.length
    ? (lastNames[rng.int(lastNames.length)] as string)
    : "";
  const stats: Record<string, number> = {};
  for (const s of idx.stats) {
    const [lo, hi] = gen.stats[s.id] ?? s.start;
    stats[s.id] = clamp(lo + rng.int(hi - lo + 1), 0, 100);
  }
  const [lo, hi] = gen.age;
  const personAge = lo + rng.int(hi - lo + 1);
  const gender = drawGender(rng, gen);
  const [w1, id] = addPerson(w0, {
    givenName: pickFirstName(gen, gender, nameRoll),
    familyName: opts.familyName ?? drawn,
    age: personAge,
    gender,
    stats,
  });
  const linked = putRelationship(w1, {
    from,
    to: id,
    role: roleId,
    closeness: opts.closeness ?? 50,
  });
  return [linkFamilyRole(linked, from, id, roleId), id];
}

function obitOccupation(o: Occupation, age: number): ObituaryOccupation {
  return {
    kindId: o.kindId,
    startedAge: o.startedAge,
    endedAge: o.endedAge ?? age,
    years: o.years,
  };
}

/** End the life: obituary on the world, pending cleared, journal line written. */
export function endLife(
  world: World,
  personId: PersonId,
  cause: string,
): World {
  const p = getPerson(world, personId);
  const all = [...p.occupationHistory, ...p.occupations]
    .map((o) => ({ o, group: o.group }))
    .sort((a, b) => a.o.startedAge - b.o.startedAge || a.o.id - b.o.id);
  const obit: Obituary = {
    personId,
    givenName: p.givenName,
    familyName: p.familyName,
    age: p.age,
    cause,
    netWorth: netWorth(world, p),
    career: all
      .filter((x) => x.group !== "school")
      .map((x) => obitOccupation(x.o, p.age)),
    education: all
      .filter((x) => x.group === "school")
      .map((x) => obitOccupation(x.o, p.age)),
  };
  const w = updatePerson(world, personId, (x) => ({ ...x, alive: false }));
  return addJournalLine(
    { ...w, pending: null, ended: obit },
    p.age,
    `${nameOf(w, personId)} died at ${p.age}: ${cause}.`,
  );
}

/** A non-player person dies; the life goes on. */
export function killPerson(
  world: World,
  personId: PersonId,
  cause: string,
): World {
  const w = updatePerson(world, personId, (x) => ({ ...x, alive: false }));
  return addJournalLine(
    w,
    clockAge(w),
    `${nameOf(w, personId)} died at ${getPerson(w, personId).age}: ${cause}.`,
  );
}
