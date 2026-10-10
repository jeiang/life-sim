import {
  type ActionRow,
  evaluate,
  indexBundles,
  listActions,
  listShop,
  makeEnv,
  type PackBundle,
  type PendingView,
  type PersonId,
  type Rng,
  type World,
} from "@life/core";
import type { Globs, ProfileSpec, RuleSpec } from "./profile-spec.ts";

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

type Row = ActionRow & { target?: PersonId };

const asMove = (
  r: Row,
  rng: Rng,
  policy: ProfileSpec["amount"] = "uniform",
): Move => {
  const range = r.amount;
  const amount = !range
    ? undefined
    : policy === "min"
      ? range.min
      : policy === "max"
        ? range.max
        : pickAmount(range, rng);
  return {
    t: "action",
    id: r.id,
    ...(r.target === undefined ? {} : { target: r.target }),
    ...(range && amount !== undefined
      ? {
          amount,
          slot: Math.round((amount - range.min) / range.step) + 1,
        }
      : {}),
  };
};

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[rng.int(xs.length)] as T;

const anyOf = (globs: Globs, s: string): boolean =>
  globs.some((g) => g.test(s));

function candidates(
  rule: RuleSpec,
  rows: readonly Row[],
  repeatable: ReadonlySet<string>,
): Row[] {
  return rows.filter(
    (r) =>
      (rule.ids === null || anyOf(rule.ids, r.id)) &&
      !anyOf(rule.except, r.id) &&
      (rule.menu === null || r.menu === rule.menu) &&
      (!rule.repeatable || repeatable.has(r.id)),
  );
}

/**
 * The candidate with the highest (`max`) or lowest (`min`) `by` value, the first in menu
 * order on a tie; null when none is ranked. Draws no randomness.
 */
function ranked(
  rule: RuleSpec,
  found: readonly Row[],
  w: World,
  ctx: Context,
): Row | null {
  const by = rule.by;
  if (by === null) return null;
  const idx = indexBundles(ctx.bundles);
  const sign = rule.pick === "max" ? 1 : -1;
  let best: Row | null = null;
  let bestScore = 0;
  for (const r of found) {
    const e =
      "all" in by
        ? { expr: by.all, usesPerson: by.usesPerson }
        : by.each.find((x) => x.glob.test(r.id));
    if (e === undefined) continue;
    if (e.usesPerson && r.target === undefined) continue;
    const env = makeEnv(w, idx, {
      subject: w.playerId,
      ...(r.target === undefined ? {} : { person: r.target }),
    });
    const v = evaluate(e.expr, env);
    const score = sign * (typeof v === "boolean" ? Number(v) : Number(v));
    if (best === null || score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A `random` pick: uniform, unless the profile's `adjust` entries weigh some candidate
 * differently from 1, then proportional to the product of the matching multipliers (in
 * parts per 10,000, at least 1). When every candidate weighs 1 the uniform draw is used, so
 * a profile nobody adjusts plays exactly as before.
 */
function randomPick(
  spec: ProfileSpec,
  found: readonly Row[],
  tagsOf: ReadonlyMap<string, readonly string[]>,
  rng: Rng,
): Row {
  if (spec.weights.length === 0) return pick(found, rng);
  const factors = found.map((r) => {
    let f = 1;
    for (const a of spec.weights)
      if (
        anyOf(a.ids, r.id) ||
        (tagsOf.get(r.id) ?? []).some((t) => a.tags.includes(t))
      )
        f *= a.weight;
    return f;
  });
  if (factors.every((f) => f === 1)) return pick(found, rng);
  const weights = factors.map((f) => Math.max(1, Math.round(f * 10000)));
  return found[rng.weightedPick(weights)] as Row;
}

/**
 * The interpreter of a declared profile (`packs/<id>/harness/profiles.yaml`). It draws from
 * the life's `harness/<profile>` stream only, in a fixed order, so a profile's lives never
 * depend on which other profiles exist.
 */
export function makeProfile(
  spec: ProfileSpec,
  bundles: readonly PackBundle[],
): Profile {
  const repeatable = new Set(
    spec.rules.some((r) => r.repeatable)
      ? bundles.flatMap((b) =>
          b.storylets.filter((s) => s.repeatable).map((s) => s.id),
        )
      : [],
  );
  const tagsOf = new Map(
    spec.weights.length === 0
      ? []
      : bundles.flatMap((b) =>
          b.storylets
            .filter((s) => s.trigger === "action")
            .map((s): [string, readonly string[]] => [s.id, s.tags]),
        ),
  );
  return {
    maxMoves: (rng) =>
      "fixed" in spec.moves ? spec.moves.fixed : rng.int(spec.moves.below),
    nextMove(w, ctx, rng) {
      const me = w.persons.get(w.playerId);
      const quit = spec.quit;
      const quitting =
        quit !== undefined &&
        quit !== null &&
        me?.qualities[quit.quality] === true &&
        rng.int(quit.relapseOneIn) > 0;
      let rows: Row[] | null = null;
      for (const rule of spec.rules) {
        const { quitting: q, ageAtLeast } = rule.when;
        if (q !== undefined && q !== quitting) continue;
        if (ageAtLeast !== undefined && (me?.age ?? 0) < ageAtLeast) continue;
        if (rule.shop) {
          const buyable = listShop(w, ctx.bundles).filter(
            (r) => !r.locked && (rule.ids === null || anyOf(rule.ids, r.id)),
          );
          if (buyable.length === 0) continue;
          const row = pick(buyable, rng);
          return {
            t: "buy",
            kind: row.id,
            mode: row.canLoan ? "loan" : "cash",
          };
        }
        rows ??= unlockedActions(w, ctx).filter(
          (r) =>
            !spec.oncePerYear ||
            !w.uses[r.target === undefined ? r.id : `${r.id}#${r.target}`],
        );
        const found = candidates(rule, rows, repeatable);
        if (found.length === 0) continue;
        const row =
          rule.pick === "first"
            ? (found[0] as Row)
            : rule.pick === "random"
              ? randomPick(spec, found, tagsOf, rng)
              : ranked(rule, found, w, ctx);
        if (row === null) continue;
        return asMove(row, rng, spec.amount);
      }
      return null;
    },
    pickChoice(_v, enabled, rng) {
      const liked =
        spec.choice.prefer.length === 0
          ? []
          : enabled.filter((c) => anyOf(spec.choice.prefer, c.label));
      let pool = liked.length > 0 ? liked : enabled;
      const kept = pool.filter((c) => !anyOf(spec.choice.avoid, c.label));
      if (kept.length > 0) pool = kept;
      return (pick(pool, rng) as { index: number }).index;
    },
  };
}
