import {
  type ActionRow,
  listActions,
  listShop,
  type PackBundle,
  type PendingView,
  type PersonId,
  type Rng,
  type World,
} from "@life/core";

export const PROFILE_NAMES = ["random", "studious", "spender", "idle", "gambler"] as const;
/** Profiles that only run when asked for by name (`--profile grinder`), never in `all`. */
export const EXTRA_PROFILE_NAMES = ["grinder"] as const;
export type ProfileName =
  | (typeof PROFILE_NAMES)[number]
  | (typeof EXTRA_PROFILE_NAMES)[number];

/** One voluntary move: an action from a menu, a purchase, or a sale. */
export type Move =
  | {
      readonly t: "action";
      readonly id: string;
      readonly target?: PersonId;
      readonly amount?: number;
      /** 1-based position of `amount` on the action's grid (the price tier, for trips). */
      readonly slot?: number;
    }
  | {
      readonly t: "buy";
      readonly kind: string;
      readonly mode: "cash" | "loan";
    }
  | { readonly t: "sell"; readonly asset: number };

/** What a profile may look at: the bundles' menu layout and the pure Core listings. */
export interface Context {
  readonly bundles: readonly PackBundle[];
  readonly menus: Menus;
}

export interface Menus {
  /** Menu paths holding actions that need no target. */
  readonly plain: readonly string[];
  /** Menu paths holding `scope: person` actions. */
  readonly person: readonly string[];
}

export interface Profile {
  /** The next voluntary move this year, or null to stop (called up to `maxMoves` times). */
  readonly maxMoves: (rng: Rng) => number;
  readonly nextMove: (w: World, ctx: Context, rng: Rng) => Move | null;
  /** Index into `enabled` (which is never empty) for an open event's choice. */
  readonly pickChoice: (
    view: PendingView,
    enabled: PendingView["choices"],
    rng: Rng,
  ) => number;
}

export function menusOf(bundles: readonly PackBundle[]): Menus {
  const plain = new Set<string>();
  const person = new Set<string>();
  for (const b of bundles)
    for (const s of b.storylets) {
      if (s.trigger !== "action" || s.menu === undefined) continue;
      (s.scope === "person" ? person : plain).add(s.menu);
    }
  return { plain: [...plain].sort(), person: [...person].sort() };
}

function others(w: World): PersonId[] {
  return [...w.persons.values()]
    .filter((p) => p.alive && p.id !== w.playerId)
    .map((p) => p.id)
    .sort((a, b) => a - b);
}

/** Every unlocked action now, with targets for person actions. */
export function unlockedActions(
  w: World,
  ctx: Context,
): (ActionRow & { target?: PersonId })[] {
  const out: (ActionRow & { target?: PersonId })[] = [];
  for (const m of ctx.menus.plain)
    for (const r of listActions(w, ctx.bundles, m)) if (!r.locked) out.push(r);
  if (ctx.menus.person.length > 0) {
    for (const id of others(w))
      for (const m of ctx.menus.person)
        for (const r of listActions(w, ctx.bundles, m, id))
          if (!r.locked) out.push({ ...r, target: id });
  }
  return out;
}

/** The `pickAmount` hook: an amount drawn uniformly from the action's grid of allowed amounts. */
export function pickAmount(
  range: NonNullable<ActionRow["amount"]>,
  rng: Rng,
): number {
  const steps = Math.floor((range.max - range.min) / range.step) + 1;
  return range.min + rng.int(steps) * range.step;
}

const asMove = (r: ActionRow & { target?: PersonId }, rng: Rng): Move => {
  const amount = r.amount ? pickAmount(r.amount, rng) : undefined;
  return {
    t: "action",
    id: r.id,
    ...(r.target === undefined ? {} : { target: r.target }),
    ...(r.amount && amount !== undefined
      ? {
          amount,
          slot: Math.round((amount - r.amount.min) / r.amount.step) + 1,
        }
      : {}),
  };
};

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[rng.int(xs.length)] as T;

const uniformChoice: Profile["pickChoice"] = (_v, enabled, rng) =>
  (pick(enabled, rng) as { index: number }).index;

const short = (id: string): string => id.split("/").pop() ?? id;

const random: Profile = {
  maxMoves: (rng) => rng.int(3),
  nextMove(w, ctx, rng) {
    const rows = unlockedActions(w, ctx);
    return rows.length === 0 ? null : asMove(pick(rows, rng), rng);
  },
  pickChoice: uniformChoice,
};

const STUDY = /^(enrol-|study-harder$|visit-library$)/;
const JOB = /^apply-/;
const ACCEPT = /^(accept|yes|take|say yes|apply|sign)/i;

const studious: Profile = {
  maxMoves: () => 2,
  nextMove(w, ctx, rng) {
    // Repeatable actions never lock, so the diligent player does each at most once a year,
    // as the old one-year cooldown made it; otherwise it would study forever and never work.
    const rows = unlockedActions(w, ctx).filter(
      (r) => !w.uses[r.target === undefined ? r.id : `${r.id}#${r.target}`],
    );
    const age = [...w.persons.values()].find((p) => p.id === w.playerId)?.age;
    if ((age ?? 0) >= 65) {
      const retire = rows.find((r) => short(r.id) === "retire");
      if (retire) return asMove(retire, rng);
    }
    const study = rows.filter((r) => STUDY.test(short(r.id)));
    const school = study.filter((r) => r.menu === "occupation/education");
    const pool =
      school.length > 0
        ? school
        : study.length > 0
          ? study
          : rows.filter((r) => JOB.test(short(r.id)));
    return pool.length === 0 ? null : asMove(pick(pool, rng), rng);
  },
  pickChoice(_v, enabled, rng) {
    const yes = enabled.filter((c) => ACCEPT.test(c.label));
    return (pick(yes.length > 0 ? yes : enabled, rng) as { index: number })
      .index;
  },
};

const spender: Profile = {
  maxMoves: () => 3,
  nextMove(w, ctx, rng) {
    const buyable = listShop(w, ctx.bundles).filter((r) => !r.locked);
    if (buyable.length > 0) {
      const row = pick(buyable, rng);
      return {
        t: "buy",
        kind: row.id,
        mode: row.canLoan ? "loan" : "cash",
      };
    }
    // Broke: look for work, so there is something to spend.
    const jobs = unlockedActions(w, ctx).filter((r) => JOB.test(short(r.id)));
    return jobs.length === 0 ? null : asMove(pick(jobs, rng), rng);
  },
  pickChoice: uniformChoice,
};

/** Actions of the Gambling Pack (casino games, lottery, support meetings). */
const GAMBLING = /^gambling\//;
const GAMBLE = /^(play-|bet-|roll-|buy-lottery)/;

/**
 * Bets all year at the casinos and the lottery; works only when nothing is left to bet on.
 * Once addicted it tries to quit: support meetings and work, with a one-in-five relapse
 * on each move.
 */
const gambler: Profile = {
  maxMoves: () => 4,
  nextMove(w, ctx, rng) {
    const rows = unlockedActions(w, ctx);
    const me = w.persons.get(w.playerId);
    const quitting = me?.qualities.gambling_addicted === true && rng.int(5) > 0;
    const meeting = rows.find(
      (r) => r.id === "gambling/gambling-support-meeting",
    );
    if (quitting && meeting) return asMove(meeting, rng);
    const bets = rows.filter(
      (r) => GAMBLING.test(r.id) && GAMBLE.test(short(r.id)),
    );
    if (!quitting && bets.length > 0) return asMove(pick(bets, rng), rng);
    const jobs = rows.filter((r) => JOB.test(short(r.id)));
    return jobs.length === 0 ? null : asMove(pick(jobs, rng), rng);
  },
  pickChoice: uniformChoice,
};

const idle: Profile = {
  maxMoves: () => 0,
  nextMove: () => null,
  pickChoice: uniformChoice,
};

/** Does repeatable actions all year, 12 a year, to stress diminishing returns. */
const grinder: Profile = {
  maxMoves: () => 12,
  nextMove(w, ctx, rng) {
    const repeatable = new Set(
      ctx.bundles.flatMap((b) =>
        b.storylets.filter((s) => s.repeatable).map((s) => s.id),
      ),
    );
    const rows = unlockedActions(w, ctx).filter((r) => repeatable.has(r.id));
    return rows.length === 0 ? null : asMove(pick(rows, rng), rng);
  },
  pickChoice: uniformChoice,
};

export const PROFILES: Record<ProfileName, Profile> = {
  grinder,
  random,
  studious,
  spender,
  idle,
  gambler,
};
