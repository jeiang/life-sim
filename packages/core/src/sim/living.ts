import type { CompiledStandard } from "../pack.ts";
import type { Asset, Person, PersonId, World } from "../state/types.ts";
import {
  addJournalLine,
  getPerson,
  setStat,
  updatePerson,
} from "../state/world.ts";
import { isSpouseRole } from "./kinship.ts";
import type { PackIndex } from "./pack-index.ts";

/** Living costs and standard effects never apply below this age (a minor with no parent left). */
export const ADULT_AGE = 18;

/** True while the person lives with their parents (see `Person.withParents`). */
export function livesWithParents(p: Person): boolean {
  return p.withParents ?? p.age < 18;
}

/** Cost index (basis points, 10000 = 100%) of the person's city; 10000 without one. */
export function costIndexOf(p: Person, idx: PackIndex): number {
  return (p.cityId && idx.cities.get(p.cityId)?.costIndexBp) || 10000;
}

/** Wage index (basis points, 10000 = 100%) of the person's city; 10000 without one. */
export function wageIndexOf(p: Person, idx: PackIndex): number {
  return (p.cityId && idx.cities.get(p.cityId)?.wageIndexBp) || 10000;
}

/** City an asset is in: its recorded city, else (older saves) the owner's. */
export function assetCityId(owner: Person, asset: Asset): string | undefined {
  return asset.cityId ?? owner.cityId;
}

/** True while the person lives with a guardian (see `Person.withGuardian`). */
export function livesWithGuardian(p: Person): boolean {
  return p.withGuardian === true;
}

/**
 * True for a minor who left home with no guardian: on their own, so living costs and standard
 * effects apply (`withParents` false, no `withGuardian`).
 */
export function livesWithoutGuardian(p: Person): boolean {
  return p.age < ADULT_AGE && p.withParents === false && !p.withGuardian;
}

/**
 * True when housing is provided (or they are confined), which waives living costs: an
 * occupation the person holds provides it or confines them, or a guardian houses them.
 */
export function housingProvided(p: Person, idx: PackIndex): boolean {
  return (
    livesWithGuardian(p) ||
    p.occupations.some((o) => {
      const k = idx.occupations.get(o.kindId);
      return k?.providesHousing || k?.confines;
    })
  );
}

/** What the person's confining occupations lock; undefined when they are not confined. */
export function confinementOf(
  p: Person,
  idx: PackIndex,
): { readonly menus: boolean; readonly events: boolean } | undefined {
  let out: { menus: boolean; events: boolean } | undefined;
  for (const o of p.occupations) {
    const c = idx.occupations.get(o.kindId)?.confines;
    if (c)
      out = {
        menus: (out?.menus ?? false) || c.menus,
        events: (out?.events ?? false) || c.events,
      };
  }
  return out;
}

/** Multiplier for illness and death chances (basis points): neutral for a minor or when housed. */
export function riskBpOf(p: Person, idx: PackIndex): number {
  return (p.age < ADULT_AGE && !livesWithoutGuardian(p)) ||
    housingProvided(p, idx)
    ? 10000
    : (standardOf(p, idx)?.riskBp ?? 10000);
}

/** Living people the person supports at home: the Pack's dependent role while they live with their parents. */
export function dependentsOf(world: World, idx: PackIndex, p: Person): number {
  const h = idx.living?.household;
  if (!h) return 0;
  return world.relationships.filter((r) => {
    const child = world.persons.get(r.to);
    return (
      r.from === p.id &&
      r.role === h.dependentRole &&
      child?.alive &&
      livesWithParents(child)
    );
  }).length;
}

/** The living partner or spouse who moved in with the person and has not merged finances, if any. */
function sharingPartner(
  world: World,
  idx: PackIndex,
  p: Person,
): Person | undefined {
  const h = idx.living?.household;
  if (!h) return undefined;
  for (const r of world.relationships) {
    if (
      r.from !== p.id ||
      (r.role !== h.partnerRole && !isSpouseRole(r.role)) ||
      r.household !== "together"
    )
      continue;
    const partner = world.persons.get(r.to);
    if (partner?.alive) return partner;
  }
  return undefined;
}

/** The standard the person chose: their own, else the Pack default; undefined without standards. */
export function chosenStandardOf(
  p: Person,
  idx: PackIndex,
): CompiledStandard | undefined {
  return (
    (p.standardId && idx.standardsById.get(p.standardId)) ||
    (idx.living && idx.standardsById.get(idx.living.defaultStandard)) ||
    undefined
  );
}

/** The standard the person lives now: the one paid at the last settlement, else the chosen one. */
export function standardOf(
  p: Person,
  idx: PackIndex,
): CompiledStandard | undefined {
  return (
    (p.livedStandardId && idx.standardsById.get(p.livedStandardId)) ||
    chosenStandardOf(p, idx)
  );
}

/**
 * Yearly cost of a standard for the person: base cost times the city cost index, less the
 * housing share when they own a home in their current city. Integer arithmetic, truncated.
 */
export function standardCost(
  p: Person,
  idx: PackIndex,
  standard: CompiledStandard,
): number {
  let cost = Math.trunc((standard.cost * costIndexOf(p, idx)) / 10000);
  const living = idx.living;
  if (living) {
    const ownsHome = p.assets.some(
      (a) =>
        idx.items.get(a.kindId)?.category === living.homeCategory &&
        assetCityId(p, a) === p.cityId,
    );
    if (ownsHome) cost -= Math.trunc((cost * living.housingShareBp) / 10000);
  }
  return cost;
}

/** What a standard costs the person per year, split into its terms; all minor units. */
export interface LivingBreakdown {
  /** The standard's cost after the city cost index and the home's housing share. */
  readonly standard: number;
  /** Dependents living at home, and what they cost together (cost index applied). */
  readonly dependents: number;
  readonly dependentsCost: number;
  /** What a partner who moved in pays toward the standard (up to their money). */
  readonly partnerShare: number;
  /** What the person pays: the terms above, never negative. */
  readonly total: number;
}

/** Yearly cost of living at `standard` for the person, with the household terms. */
export function livingBreakdown(
  world: World,
  idx: PackIndex,
  p: Person,
  standard: CompiledStandard,
): LivingBreakdown {
  const base = standardCost(p, idx, standard);
  const h = idx.living?.household;
  const dependents = dependentsOf(world, idx, p);
  const dependentsCost = h
    ? dependents * Math.trunc((h.dependentCost * costIndexOf(p, idx)) / 10000)
    : 0;
  const partner = sharingPartner(world, idx, p);
  const partnerShare =
    h && partner
      ? Math.min(
          Math.max(0, partner.money),
          Math.trunc((base * h.partnerShareBp) / 10000),
        )
      : 0;
  return {
    standard: base,
    dependents,
    dependentsCost,
    partnerShare,
    total: Math.max(0, base + dependentsCost - partnerShare),
  };
}

/** What the person pays now: 0 with parents, a guardian, housing provided, or without standards. */
export function livingCost(world: World, idx: PackIndex, p: Person): number {
  const s = standardOf(p, idx);
  return !s ||
    (p.age < ADULT_AGE && !livesWithoutGuardian(p)) ||
    livesWithParents(p) ||
    housingProvided(p, idx)
    ? 0
    : livingBreakdown(world, idx, p, s).total;
}

/** The most expensive standard the person can pay for with `money`; the cheapest if none. */
function bestAffordable(
  world: World,
  idx: PackIndex,
  p: Person,
  money: number,
): CompiledStandard | undefined {
  let best: CompiledStandard | undefined;
  for (const s of idx.standards)
    if (best === undefined || livingBreakdown(world, idx, p, s).total <= money)
      best = s;
  return best;
}

/** A minor with no parent left lives with a guardian: no cost, no standard, assets in trust. */
export function startLivingWithGuardian(world: World, id: PersonId): World {
  return updatePerson(world, id, (x) => ({
    ...x,
    withParents: false,
    withGuardian: true,
  }));
}

/**
 * The person stops living with their parents (or their guardian) and takes the Pack's default
 * standard, or the best one they can afford with their money. Under 18 a minor lives with a
 * guardian instead (`moveOut` in guardian.ts rolls the 16-17 no-guardian exception).
 */
export function startLivingOnOwn(
  world: World,
  idx: PackIndex,
  id: PersonId,
): World {
  if (getPerson(world, id).age < ADULT_AGE)
    return startLivingWithGuardian(world, id);
  return takeOwnStandard(world, idx, id);
}

/** Leave parents and guardian and take the default (or best affordable) standard, at any age. */
export function takeOwnStandard(
  world: World,
  idx: PackIndex,
  id: PersonId,
): World {
  const p = getPerson(world, id);
  const def = idx.living && idx.standardsById.get(idx.living.defaultStandard);
  const standard =
    def && livingBreakdown(world, idx, p, def).total <= p.money
      ? def
      : bestAffordable(world, idx, p, p.money);
  return updatePerson(world, id, (x) => {
    const { withGuardian: _, ...rest } = x;
    return {
      ...rest,
      withParents: false,
      ...(standard
        ? { standardId: standard.id, livedStandardId: standard.id }
        : {}),
    };
  });
}

/**
 * Settlement: the player on their own pays the yearly cost of the standard they chose plus
 * dependents at home, less the share a moved-in partner pays from their own money. When
 * savings cannot cover it they live (and pay for) the best standard they can afford, down to
 * the cheapest, and the next age-up tries the chosen one again; money never goes negative.
 * A change of the lived standard is journaled. Then the lived standard's yearly effects apply.
 * Nothing happens with parents, while housing is provided, or in a Pack without standards.
 */
export function settleLiving(world: World, idx: PackIndex): World {
  const id = world.playerId;
  const p = getPerson(world, id);
  const chosen = chosenStandardOf(p, idx);
  if (
    !p.alive ||
    !chosen ||
    (p.age < ADULT_AGE && !livesWithoutGuardian(p)) ||
    livesWithParents(p) ||
    housingProvided(p, idx)
  )
    return world;
  const before = standardOf(p, idx) as CompiledStandard;
  const money = Math.max(0, p.money);
  const lived =
    livingBreakdown(world, idx, p, chosen).total <= money
      ? chosen
      : (bestAffordable(world, idx, p, money) as CompiledStandard);
  const bill = livingBreakdown(world, idx, p, lived);
  const cost = Math.min(bill.total, money);
  let w = updatePerson(world, id, (x) => ({
    ...x,
    money: x.money - cost,
    livedStandardId: lived.id,
  }));
  const partner = sharingPartner(world, idx, p);
  if (partner && bill.partnerShare > 0)
    w = updatePerson(w, partner.id, (x) => ({
      ...x,
      money: x.money - bill.partnerShare,
    }));
  if (lived.id !== before.id) {
    const name = lived.label.toLowerCase();
    w = addJournalLine(
      w,
      p.age,
      lived.cost < before.cost
        ? `You cannot afford ${before.label.toLowerCase()} living any more and drop to ${name}.`
        : `You can afford more again and live ${name}.`,
    );
  }
  for (const [stat, delta] of [
    ["happiness", lived.happiness],
    ["health", lived.health],
  ] as const) {
    if (delta === 0) continue;
    const cur = getPerson(w, id).stats[stat];
    if (cur === undefined) continue;
    w = setStat(
      w,
      id,
      stat,
      delta > 0 ? Math.max(cur, Math.min(lived.cap, cur + delta)) : cur + delta,
    );
  }
  return w;
}
