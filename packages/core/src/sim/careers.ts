import type { CompiledOccupationKind, NpcCareersDecl } from "../pack.ts";
import type { Person, PersonId, World } from "../state/types.ts";
import { getPerson, nextStream, updatePerson } from "../state/world.ts";
import { qualityOf, rolesOf } from "./env.ts";
import { clockAge, endOccupation, evalBool, startOccupation } from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";

/**
 * NPC careers (ADR 0002, 0003). People the player holds one of `npc_careers.roles` toward work
 * a real occupation: they start when they enter the role (or turn `start_age`), are paid at
 * settlement into `person.money`, may be promoted or lose the job by yearly keyed rolls, and
 * retire at `retire_age`. Leaving every such role stops the simulation: the occupations stay on
 * record, but nothing rolls and nothing pays. Everyone else keeps the static `Person.job`.
 */

const cmp = (a: number, b: number): number => a - b;

/** True when the person is held by one of the career roles (never the player). */
export function inCareerRole(
  world: World,
  idx: PackIndex,
  id: PersonId,
): boolean {
  const cfg = idx.npcCareers;
  return (
    cfg !== undefined &&
    id !== world.playerId &&
    rolesOf(world, id).some((r) => cfg.roles.includes(r))
  );
}

/** Entry kinds per index: kinds NPCs may start in (nothing promotes to them). */
const entryCache = new WeakMap<PackIndex, readonly CompiledOccupationKind[]>();

function entryKinds(
  idx: PackIndex,
  cfg: NpcCareersDecl,
): readonly CompiledOccupationKind[] {
  const hit = entryCache.get(idx);
  if (hit) return hit;
  const promoted = new Set<string>();
  for (const k of idx.occupations.values())
    if (k.promotesTo) promoted.add(k.promotesTo);
  const kinds = [...idx.occupations.values()]
    .filter(
      (k) =>
        k.group === cfg.group &&
        k.npc !== false &&
        k.id !== cfg.retired &&
        !promoted.has(k.id) &&
        k.durationYears === undefined &&
        !k.confines &&
        !k.providesHousing &&
        !k.loan,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  entryCache.set(idx, kinds);
  return kinds;
}

function holdsJob(p: Person, cfg: NpcCareersDecl): boolean {
  return p.occupations.some((o) => o.group === cfg.group);
}

function retiredKind(p: Person, cfg: NpcCareersDecl): boolean {
  return (
    cfg.retired !== undefined &&
    p.occupations.some((o) => o.kindId === cfg.retired)
  );
}

/** Roll the education qualities once, in order; a quality already true is kept. */
function rollEducation(
  world: World,
  idx: PackIndex,
  cfg: NpcCareersDecl,
  id: PersonId,
): World {
  if (cfg.education.length === 0) return world;
  let w = world;
  const [w1, rng] = nextStream(w, clockAge(w), `career/${id}/education`);
  w = w1;
  const gained: Record<string, boolean> = {};
  for (const e of cfg.education) {
    const hit = rng.chanceBp(e.chanceBp);
    const p = getPerson(w, id);
    const has = (q: string): boolean =>
      gained[q] === true || qualityOf(p, idx, q) === true;
    if (hit && (e.needs === undefined || has(e.needs)))
      gained[e.quality] = true;
  }
  return updatePerson(w, id, (p) => ({
    ...p,
    qualities: { ...p.qualities, ...gained },
  }));
}

/** Start in a uniformly drawn entry kind the person qualifies for. */
function startEntryJob(
  world: World,
  idx: PackIndex,
  cfg: NpcCareersDecl,
  id: PersonId,
): World {
  const [w, rng] = nextStream(world, clockAge(world), `career/${id}/pick`);
  const options = entryKinds(idx, cfg).filter((k) =>
    evalBool(k.requires, w, idx, { subject: id }),
  );
  const pick = options[rng.int(options.length || 1)];
  return pick ? startOccupation(w, idx, id, pick.id) : w;
}

/** Retire: end the job and start the pension kind. */
function retire(
  world: World,
  idx: PackIndex,
  cfg: NpcCareersDecl,
  id: PersonId,
): World {
  let w = world;
  for (const o of getPerson(w, id).occupations)
    if (o.group === cfg.group) w = endOccupation(w, id, o.id);
  return cfg.retired ? startOccupation(w, idx, id, cfg.retired) : w;
}

/** A person with no job: retire by age, else start (first time, for sure) or get hired (by roll). */
function withoutJob(
  world: World,
  idx: PackIndex,
  cfg: NpcCareersDecl,
  id: PersonId,
): World {
  const p = getPerson(world, id);
  if (p.age < cfg.startAge || retiredKind(p, cfg)) return world;
  if (p.age >= cfg.retireAge) return retire(world, idx, cfg, id);
  if (p.occupationHistory.some((o) => o.group === cfg.group)) {
    const [w, rng] = nextStream(world, clockAge(world), `career/${id}/hire`);
    return rng.chanceBp(cfg.hireBp) ? startEntryJob(w, idx, cfg, id) : w;
  }
  return startEntryJob(rollEducation(world, idx, cfg, id), idx, cfg, id);
}

/** One year of a working person: retirement, job loss, then promotion. */
function working(
  world: World,
  idx: PackIndex,
  cfg: NpcCareersDecl,
  id: PersonId,
): World {
  const p = getPerson(world, id);
  const job = p.occupations.find((o) => o.group === cfg.group);
  if (!job) return world;
  if (p.age >= cfg.retireAge) return retire(world, idx, cfg, id);
  const [w1, loss] = nextStream(world, clockAge(world), `career/${id}/loss`);
  if (loss.chanceBp(cfg.jobLossBp)) return endOccupation(w1, id, job.id);
  const kind = idx.occupations.get(job.kindId);
  if (
    !kind?.promotesTo ||
    kind.promotionYears === undefined ||
    job.years < kind.promotionYears
  )
    return w1;
  const [w2, promo] = nextStream(w1, clockAge(w1), `career/${id}/promotion`);
  return promo.chanceBp(cfg.promotionBp)
    ? startOccupation(w2, idx, id, kind.promotesTo)
    : w2;
}

/**
 * The yearly career pass (before settlement): every living person in a career role works
 * through one year, in id order. Persons not in a career role are not touched.
 */
export function npcCareerYear(world: World, idx: PackIndex): World {
  const cfg = idx.npcCareers;
  if (!cfg) return world;
  const ids = new Set<PersonId>();
  for (const r of world.relationships)
    if (
      r.from === world.playerId &&
      cfg.roles.includes(r.role) &&
      world.persons.get(r.to)?.alive
    )
      ids.add(r.to);
  let w = world;
  for (const id of [...ids].sort(cmp)) {
    const p = getPerson(w, id);
    if (p.age < cfg.startAge || retiredKind(p, cfg)) continue;
    w = holdsJob(p, cfg)
      ? working(w, idx, cfg, id)
      : withoutJob(w, idx, cfg, id);
  }
  return w;
}

/** True when the person's money is merged into the player's (`merge_money()`, ADR 0002). */
export function isJointSpouse(
  world: World,
  _idx: PackIndex,
  id: PersonId,
): boolean {
  return world.relationships.some(
    (r) => r.from === world.playerId && r.to === id && r.household === "merged",
  );
}

/** The player just took `role` toward `id`: a career role starts a career at once (if they work age). */
export function enterRole(
  world: World,
  idx: PackIndex,
  id: PersonId,
  role: string,
): World {
  const cfg = idx.npcCareers;
  if (!cfg || !cfg.roles.includes(role)) return world;
  return holdsJob(getPerson(world, id), cfg)
    ? world
    : withoutJob(world, idx, cfg, id);
}

/**
 * Yearly income tier (0 up to `tiers.length`): how many `npc_careers.tiers` thresholds the
 * person's yearly income reaches, where income is held pay plus a twentieth of cash. Someone
 * without a simulated job counts their static tier's threshold as pay.
 */
export function incomeTier(world: World, idx: PackIndex, id: PersonId): number {
  const tiers = idx.npcCareers?.tiers ?? [];
  const p = getPerson(world, id);
  const pay =
    p.occupations.length > 0
      ? p.occupations.reduce((n, o) => n + Math.max(0, o.pay), 0)
      : (tiers[(p.job?.tier ?? 0) - 1] ?? 0);
  const income = pay + Math.trunc(Math.max(0, p.money) / 20);
  return tiers.filter((t) => income >= t).length;
}

/** The job label to show: the held career job, else the static job, else undefined. */
export function jobLabelOf(
  world: World,
  idx: PackIndex,
  id: PersonId,
): string | undefined {
  const p = getPerson(world, id);
  const cfg = idx.npcCareers;
  const held = p.occupations.find((o) => o.group === cfg?.group);
  return (held && idx.occupations.get(held.kindId)?.label) || p.job?.label;
}
