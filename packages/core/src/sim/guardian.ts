import type { Person, PersonId, World } from "../state/types.ts";
import { addJournalLine, getPerson, nextStream } from "../state/world.ts";
import { kinOf } from "./kinship.ts";
import { ADULT_AGE, startLivingOnOwn, takeOwnStandard } from "./living.ts";
import { clockAge, evalInt } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";

/**
 * The guardian a minor goes to: the closest living adult relative, drawn from the Pack's
 * `guardian_kin` in order (highest closeness first within a kinship id, then person id).
 * Never a minor. Undefined when no relative qualifies: the guardian is then unnamed.
 */
export function guardianOf(
  world: World,
  idx: PackIndex,
  p: Person,
): Person | undefined {
  const order = idx.living?.household?.guardianKin ?? [];
  const closeness = (id: PersonId): number =>
    Math.max(
      0,
      ...world.relationships
        .filter((r) => r.from === p.id && r.to === id)
        .map((r) => r.closeness),
    );
  let best: { who: Person; rank: number; close: number } | undefined;
  for (const k of kinOf(world, p.id, { alive: true })) {
    const rank = order.indexOf(k.kin);
    const who = world.persons.get(k.id);
    if (rank < 0 || !who || who.age < ADULT_AGE) continue;
    const close = closeness(k.id);
    if (!best || rank < best.rank || (rank === best.rank && close > best.close))
      best = { who, rank, close };
  }
  return best?.who;
}

/** The journal clause naming the guardian, or the unnamed one. */
export function guardianPhrase(guardian: Person | undefined): string {
  return guardian
    ? `${guardian.givenName} ${guardian.familyName} becomes your guardian`
    : "a guardian takes you in";
}

function hasLivingParent(world: World, idx: PackIndex, p: Person): boolean {
  const role = idx.family?.parent.role;
  return (
    !!role &&
    world.relationships.some(
      (r) =>
        r.from === p.id && r.role === role && world.persons.get(r.to)?.alive,
    )
  );
}

/**
 * The chance (basis points) that a minor who leaves home gets no guardian: 0 unless the Pack
 * declares `no_guardian`, the minor is at least `from_age`, and a parent is still alive (an
 * orphan always gets a guardian).
 */
export function noGuardianBp(world: World, idx: PackIndex, p: Person): number {
  const d = idx.living?.household?.noGuardian;
  if (
    !d ||
    p.age < d.fromAge ||
    p.age >= ADULT_AGE ||
    !hasLivingParent(world, idx, p)
  )
    return 0;
  return Math.min(
    10000,
    Math.max(0, evalInt(d.chance, world, idx, { subject: p.id })),
  );
}

/**
 * `move_out()`: the person leaves home. An adult takes their own standard. A minor goes to a
 * guardian (named in the journal for the player), except a 16-17 year old with a living
 * parent who rolls `no_guardian`: they live on their own with living costs and a standard.
 */
export function moveOut(world: World, idx: PackIndex, id: PersonId): World {
  const p = getPerson(world, id);
  if (p.age >= ADULT_AGE) return startLivingOnOwn(world, idx, id);
  const bp = noGuardianBp(world, idx, p);
  let w = world;
  let none = false;
  if (bp > 0) {
    const [w2, rng] = nextStream(w, clockAge(w), `guardian/none/${id}`);
    w = w2;
    none = rng.chanceBp(bp);
  }
  const next = none
    ? takeOwnStandard(w, idx, id)
    : startLivingOnOwn(w, idx, id);
  if (id !== w.playerId) return next;
  return addJournalLine(
    next,
    p.age,
    none
      ? "You are out of the house with no guardian: you are on your own, paying your own way."
      : `${guardianPhrase(guardianOf(w, idx, p))}. Your assets are held in trust until you are 18.`,
  );
}
