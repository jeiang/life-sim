import type { CompiledStandard } from "../pack.ts";
import type { Asset, Person, PersonId, World } from "../state/types.ts";
import {
  addJournalLine,
  getPerson,
  setStat,
  updatePerson,
} from "../state/world.ts";
import type { PackIndex } from "./pack-index.ts";

/** Living costs and standard effects never apply below this age (a minor with no parent left). */
const ADULT_AGE = 18;

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

/** True when an occupation the person holds provides housing, which waives living costs. */
export function housingProvided(p: Person, idx: PackIndex): boolean {
  return p.occupations.some(
    (o) => idx.occupations.get(o.kindId)?.providesHousing,
  );
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

/** What the person pays now: 0 with parents, with housing provided, or without standards. */
export function livingCost(p: Person, idx: PackIndex): number {
  const s = standardOf(p, idx);
  return !s ||
    p.age < ADULT_AGE ||
    livesWithParents(p) ||
    housingProvided(p, idx)
    ? 0
    : standardCost(p, idx, s);
}

/** The most expensive standard the person can pay for with `money`; the cheapest if none. */
function bestAffordable(
  p: Person,
  idx: PackIndex,
  money: number,
): CompiledStandard | undefined {
  let best: CompiledStandard | undefined;
  for (const s of idx.standards)
    if (best === undefined || standardCost(p, idx, s) <= money) best = s;
  return best;
}

/**
 * The person stops living with their parents and takes the Pack's default standard, or the
 * best one they can afford with their money.
 */
export function startLivingOnOwn(
  world: World,
  idx: PackIndex,
  id: PersonId,
): World {
  const p = getPerson(world, id);
  const def = idx.living && idx.standardsById.get(idx.living.defaultStandard);
  const standard =
    def && standardCost(p, idx, def) <= p.money
      ? def
      : bestAffordable(p, idx, p.money);
  return updatePerson(world, id, (x) => ({
    ...x,
    withParents: false,
    ...(standard
      ? { standardId: standard.id, livedStandardId: standard.id }
      : {}),
  }));
}

/**
 * Settlement: the player on their own pays the yearly cost of the standard they chose. When
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
    p.age < ADULT_AGE ||
    livesWithParents(p) ||
    housingProvided(p, idx)
  )
    return world;
  const before = standardOf(p, idx) as CompiledStandard;
  const money = Math.max(0, p.money);
  const lived =
    standardCost(p, idx, chosen) <= money
      ? chosen
      : (bestAffordable(p, idx, money) as CompiledStandard);
  const cost = Math.min(standardCost(p, idx, lived), money);
  let w = updatePerson(world, id, (x) => ({
    ...x,
    money: x.money - cost,
    livedStandardId: lived.id,
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
