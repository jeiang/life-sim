import { type Rng, streamFor } from "../rng.ts";
import {
  type Asset,
  type Holding,
  type JournalEntry,
  type Loan,
  type PackVersion,
  type Person,
  type PersonId,
  type QualityValue,
  type Relationship,
  SCHEMA_VERSION,
  type World,
} from "./types.ts";

export type PersonDraft = Pick<Person, "givenName" | "familyName" | "age"> &
  Partial<Omit<Person, "id" | "givenName" | "familyName" | "age">>;

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function byId<T extends { id: number }>(
  list: readonly T[],
  item: T,
): readonly T[] {
  return [...list.filter((x) => x.id !== item.id), item].sort(
    (x, y) => x.id - y.id,
  );
}

function compareRel(a: Relationship, b: Relationship): number {
  return (
    a.from - b.from ||
    a.to - b.to ||
    (a.role < b.role ? -1 : a.role > b.role ? 1 : 0)
  );
}

/** Allocate a fresh id. */
export function allocId(world: World): [World, number] {
  return [{ ...world, nextId: world.nextId + 1 }, world.nextId];
}

/** A world whose only person is the player. */
export function createWorld(opts: {
  seed: number;
  player: PersonDraft;
  packVersions?: readonly PackVersion[];
}): World {
  const empty: World = {
    schemaVersion: SCHEMA_VERSION,
    seed: opts.seed >>> 0,
    playerId: 0,
    generation: 0,
    worldYear: 0,
    nextId: 0,
    market: {},
    persons: new Map(),
    relationships: [],
    journal: [],
    rngCounters: {},
    pending: null,
    ended: null,
    storyletLog: {},
    uses: {},
    choiceLog: [],
    packVersions: [...(opts.packVersions ?? [])].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
  };
  const [world, id] = addPerson(empty, opts.player);
  return { ...world, playerId: id };
}

export function addPerson(world: World, draft: PersonDraft): [World, PersonId] {
  const [w, id] = allocId(world);
  const person: Person = {
    stats: {},
    qualities: {},
    money: 0,
    alive: true,
    occupations: [],
    occupationHistory: [],
    assets: [],
    loans: [],
    holdings: [],
    ...draft,
    id,
  };
  return [{ ...w, persons: new Map(w.persons).set(id, person) }, id];
}

export function getPerson(world: World, id: PersonId): Person {
  const p = world.persons.get(id);
  if (!p) throw new RangeError(`no person ${id}`);
  return p;
}

export function updatePerson(
  world: World,
  id: PersonId,
  fn: (p: Person) => Person,
): World {
  return {
    ...world,
    persons: new Map(world.persons).set(id, fn(getPerson(world, id))),
  };
}

/** Persons in ascending id order. */
export function personsInIdOrder(world: World): Person[] {
  return [...world.persons.values()].sort((a, b) => a.id - b.id);
}

export function setStat(
  world: World,
  id: PersonId,
  stat: string,
  value: number,
): World {
  return updatePerson(world, id, (p) => ({
    ...p,
    stats: { ...p.stats, [stat]: clamp(value, 0, 100) },
  }));
}

export function setQuality(
  world: World,
  id: PersonId,
  quality: string,
  value: QualityValue,
): World {
  return updatePerson(world, id, (p) => ({
    ...p,
    qualities: { ...p.qualities, [quality]: value },
  }));
}

export function addMoney(world: World, id: PersonId, delta: number): World {
  return updatePerson(world, id, (p) => ({ ...p, money: p.money + delta }));
}

export function putAsset(world: World, id: PersonId, asset: Asset): World {
  return updatePerson(world, id, (p) => ({
    ...p,
    assets: byId(p.assets, asset),
  }));
}

export function removeAsset(
  world: World,
  id: PersonId,
  assetId: number,
): World {
  return updatePerson(world, id, (p) => ({
    ...p,
    assets: p.assets.filter((a) => a.id !== assetId),
  }));
}

export function putLoan(world: World, id: PersonId, loan: Loan): World {
  return updatePerson(world, id, (p) => ({ ...p, loans: byId(p.loans, loan) }));
}

export function removeLoan(world: World, id: PersonId, loanId: number): World {
  return updatePerson(world, id, (p) => ({
    ...p,
    loans: p.loans.filter((l) => l.id !== loanId),
  }));
}

/** Insert, replace or (with 0 units) remove the person's holding of `holding.kindId`. */
export function putHolding(
  world: World,
  id: PersonId,
  holding: Holding,
): World {
  return updatePerson(world, id, (p) => {
    const rest = p.holdings.filter((h) => h.kindId !== holding.kindId);
    if (holding.units <= 0) return { ...p, holdings: rest };
    return {
      ...p,
      holdings: [...rest, holding].sort((a, b) =>
        a.kindId < b.kindId ? -1 : a.kindId > b.kindId ? 1 : 0,
      ),
    };
  });
}

/** Insert or replace the relationship with the same (from, to, role). */
export function putRelationship(world: World, rel: Relationship): World {
  const rest = world.relationships.filter((r) => compareRel(r, rel) !== 0);
  return { ...world, relationships: [...rest, rel].sort(compareRel) };
}

/** Append a line to the journal entry for `age`, creating it in age order if needed. */
export function addJournalLine(world: World, age: number, line: string): World {
  const i = world.journal.findIndex((e) => e.age === age);
  if (i >= 0) {
    const entry = world.journal[i] as JournalEntry;
    const journal = world.journal.slice();
    journal[i] = { age, lines: [...entry.lines, line] };
    return { ...world, journal };
  }
  const journal = [...world.journal, { age, lines: [line] }].sort(
    (a, b) => a.age - b.age,
  );
  return { ...world, journal };
}

/**
 * Open the next stream for a roll site: reads this site's counter from the
 * world, derives the stream, and returns the world with the counter advanced.
 * Distinct purpose keys (or ages) have independent counters.
 */
export function nextStream(
  world: World,
  age: number,
  purposeKey: string,
): [World, Rng] {
  const key = `${age}/${purposeKey}`;
  const counter = world.rngCounters[key] ?? 0;
  return [
    { ...world, rngCounters: { ...world.rngCounters, [key]: counter + 1 } },
    streamFor(world.seed, age, purposeKey, counter, world.generation),
  ];
}
