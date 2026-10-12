import { type GodCategory, rollId } from "../rng.ts";
import {
  type ChoiceEntry,
  GENDERS,
  type Gender,
  type PersonId,
  type Series,
  type World,
} from "../state/types.ts";
import { clamp, setStat, updatePerson } from "../state/world.ts";
import { appendChoice } from "./flow.ts";
import { MAX_RETURN, MIN_RETURN } from "./market.ts";

type GodRollEntry = Extract<ChoiceEntry, { t: "god-roll" }>;
type GodMarketEvent = NonNullable<Series["nextEvent"]>;

function assertEditable(world: World): void {
  if (world.ended) throw new RangeError("this life is over");
}

/** God mode: set one of the player's stats (clamped to 0-100). Logged, so replay reproduces it. */
export function godSetStat(world: World, stat: string, value: number): World {
  assertEditable(world);
  const player = world.persons.get(world.playerId);
  if (!player || !(stat in player.stats))
    throw new RangeError(`unknown stat '${stat}'`);
  const v = clamp(Math.trunc(value), 0, 100);
  return appendChoice(setStat(world, world.playerId, stat, v), {
    t: "god-stat",
    stat,
    value: v,
  });
}

/** God mode: set the player's money, minor units (any safe integer). Logged. */
export function godSetMoney(world: World, value: number): World {
  assertEditable(world);
  if (!Number.isSafeInteger(value))
    throw new RangeError("money must be a whole number of minor units");
  return appendChoice(
    updatePerson(world, world.playerId, (p) => ({ ...p, money: value })),
    { t: "god-money", value },
  );
}

/**
 * God mode: log one roll pick and put it in the table the next step consumes. The entry is
 * the pick itself, so replay appends the same entry. Throws on a malformed entry or a pick
 * already in the table; a pick the step never draws fails in `finishGodStep`.
 */
export function godPickRoll(
  world: World,
  pick: Omit<GodRollEntry, "t">,
): World {
  const { age, key, n, d, v } = pick;
  if (!Number.isSafeInteger(age) || age < 0)
    throw new RangeError(
      `god pick age must be a non-negative integer, got ${age}`,
    );
  if (key === "") throw new RangeError("god pick key must not be empty");
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(
      `god pick counter must be a non-negative integer, got ${n}`,
    );
  if (!Number.isSafeInteger(d) || d < 0)
    throw new RangeError(
      `god pick ordinal must be a non-negative integer, got ${d}`,
    );
  if (typeof v !== "boolean" && !Number.isFinite(v))
    throw new RangeError(
      `god pick value must be a finite number or a boolean, got ${v}`,
    );
  const id = rollId({ age, key, n }, d);
  const god = world.god ?? { picks: new Map(), used: new Set<string>() };
  if (god.picks.has(id)) throw new RangeError(`god pick ${id} is already set`);
  return appendChoice(
    {
      ...world,
      god: {
        ...god,
        used: new Set<string>(),
        picks: new Map(god.picks).set(id, v),
      },
    },
    { t: "god-roll", age, key, n, d, v },
  );
}

/**
 * Arm the next step: which categories of draw may ask (`ask`) and which draws the player
 * chose to leave to the dice (`skip`, by roll id). Keeps the picks; never logged.
 */
export function withGodAsk(
  world: World,
  ask: readonly GodCategory[],
  skip?: ReadonlySet<string>,
): World {
  const god = world.god ?? { picks: new Map(), used: new Set<string>() };
  return {
    ...world,
    god: {
      picks: god.picks,
      used: new Set<string>(),
      ask,
      ...(skip === undefined ? {} : { skip }),
    },
  };
}

/**
 * After a step: throws if a pick in the table was never drawn (an engine change, or a Pack
 * edit between runs), else returns the world without the god context.
 */
export function finishGodStep(world: World): World {
  const { god, ...rest } = world;
  if (god)
    for (const id of god.picks.keys())
      if (!god.used.has(id))
        throw new RangeError(`god pick ${id} was never drawn`);
  return rest;
}

/**
 * God mode: set a market kind's stored forecast (`next`, basis points, clamped to the
 * return range) and/or its next settlement event, applied by the next settlement. Logged.
 */
export function godSetMarket(
  world: World,
  kind: string,
  edit: { next?: number; event?: GodMarketEvent },
): World {
  assertEditable(world);
  const s = world.market[kind];
  if (!s) throw new RangeError(`no price series for '${kind}' yet`);
  if (edit.next === undefined && edit.event === undefined)
    throw new RangeError("a market edit sets next, event, or both");
  if (edit.next !== undefined && !Number.isSafeInteger(edit.next))
    throw new RangeError(
      `market return must be whole basis points, got ${edit.next}`,
    );
  const next =
    edit.next === undefined
      ? undefined
      : clamp(edit.next, MIN_RETURN, MAX_RETURN);
  const series: Series = {
    ...s,
    ...(next === undefined ? {} : { next }),
    ...(edit.event === undefined ? {} : { nextEvent: edit.event }),
  };
  return appendChoice(
    { ...world, market: { ...world.market, [kind]: series } },
    {
      t: "god-market",
      kind,
      ...(next === undefined ? {} : { next }),
      ...(edit.event === undefined ? {} : { event: edit.event }),
    },
  );
}

/**
 * God mode: rename, re-sex or set the stats of a living person (stats clamped to 0-100).
 * Logged, applied between steps.
 */
export function godEditPerson(
  world: World,
  id: PersonId,
  patch: {
    givenName?: string;
    familyName?: string;
    gender?: Gender;
    stats?: Readonly<Record<string, number>>;
  },
): World {
  assertEditable(world);
  const p = world.persons.get(id);
  if (!p) throw new RangeError(`unknown person ${id}`);
  if (!p.alive) throw new RangeError(`person ${id} is not alive`);
  const givenName = patch.givenName?.trim();
  const familyName = patch.familyName?.trim();
  if (givenName === "" || familyName === "")
    throw new RangeError("a name must not be empty");
  if (patch.gender !== undefined && !GENDERS.includes(patch.gender))
    throw new RangeError(`unknown gender '${patch.gender}'`);
  const stats: Record<string, number> = {};
  for (const [stat, v] of Object.entries(patch.stats ?? {})) {
    if (!Object.hasOwn(p.stats, stat))
      throw new RangeError(`unknown stat '${stat}' for person ${id}`);
    if (!Number.isInteger(v))
      throw new RangeError(`stat '${stat}' must be a whole number, got ${v}`);
    stats[stat] = clamp(v, 0, 100);
  }
  return appendChoice(
    updatePerson(world, id, (x) => ({
      ...x,
      ...(givenName === undefined ? {} : { givenName }),
      ...(familyName === undefined ? {} : { familyName }),
      ...(patch.gender === undefined ? {} : { gender: patch.gender }),
      ...(patch.stats === undefined ? {} : { stats: { ...x.stats, ...stats } }),
    })),
    {
      t: "god-person",
      id,
      ...(givenName === undefined ? {} : { givenName }),
      ...(familyName === undefined ? {} : { familyName }),
      ...(patch.gender === undefined ? {} : { gender: patch.gender }),
      ...(patch.stats === undefined ? {} : { stats }),
    },
  );
}

/** True when the life used god mode (a custom start or any edit): the "edited" badge. */
export function isGodLife(world: World): boolean {
  return world.choiceLog.some(
    (c) =>
      c.t === "start" ||
      c.t === "god-stat" ||
      c.t === "god-money" ||
      c.t === "god-roll" ||
      c.t === "god-market" ||
      c.t === "god-person",
  );
}
