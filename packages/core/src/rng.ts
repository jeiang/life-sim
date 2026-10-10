import { cyrb128 } from "./hash.ts";

/**
 * sfc32 generator (Chris Doty-Humphrey, public domain), 32-bit state words,
 * Math.imul and >>> 0 only. Mutable by design; keep it local to one roll site.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(a: number, b: number, c: number, d: number) {
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
    for (let i = 0; i < 12; i++) this.next32();
  }

  /** Next uint32. */
  next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [0, n), unbiased (rejection sampling). 1 <= n <= 2^32. */
  int(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 0x100000000) {
      throw new RangeError(`int(n): n must be an integer in 1..2^32, got ${n}`);
    }
    const limit = Math.floor(0x100000000 / n) * n;
    let x = this.next32();
    while (x >= limit) x = this.next32();
    return x % n;
  }

  /** True with probability bp/10000 (basis points). bp <= 0 never, >= 10000 always; consumes no randomness at the extremes. */
  chanceBp(bp: number): boolean {
    if (!Number.isInteger(bp))
      throw new RangeError(`chanceBp(bp): bp must be an integer, got ${bp}`);
    if (bp <= 0) return false;
    if (bp >= 10000) return true;
    return this.int(10000) < bp;
  }

  /** Index chosen with probability weights[i] / sum(weights). Weights are non-negative integers with a positive sum; zero weights are never chosen. */
  weightedPick(
    weights: readonly number[],
    _labels?: readonly string[],
  ): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w < 0)
        throw new RangeError(`weightedPick: invalid weight ${w}`);
      total += w;
    }
    if (total < 1)
      throw new RangeError("weightedPick: weights must have a positive sum");
    let r = this.int(total);
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (r < w) return i;
      r -= w;
    }
    throw new Error("unreachable");
  }
}

/** Values a {@link ScriptedRng} returns in place of random draws; unset kinds fall back to the (all-zero-seeded) generator. */
export interface ScriptedRolls {
  /** Result of `chanceBp` (hit or miss), whatever the probability. */
  readonly chance?: boolean;
  /** Result of `int(n)`; must lie in `[0, n)`. */
  readonly int?: number;
  /** Result of `weightedPick`: an index with positive weight, or a label matched exactly against the caller's labels (outcomes: their `text`). */
  readonly pick?: number | string;
}

/**
 * A stream whose draws are forced (test and harness only; ADR 0003 amendment).
 * Returned from a stream override, it replaces the derived stream of one roll site.
 */
export class ScriptedRng extends Rng {
  private readonly forced: ScriptedRolls;

  constructor(forced: ScriptedRolls) {
    super(0, 0, 0, 0);
    this.forced = forced;
  }

  override int(n: number): number {
    const v = this.forced.int;
    if (v === undefined) return super.int(n);
    if (!Number.isInteger(v) || v < 0 || v >= n)
      throw new RangeError(`forced int ${v} is outside [0, ${n})`);
    return v;
  }

  override chanceBp(bp: number): boolean {
    return this.forced.chance ?? super.chanceBp(bp);
  }

  override weightedPick(
    weights: readonly number[],
    labels?: readonly string[],
  ): number {
    const p = this.forced.pick;
    if (p === undefined) return super.weightedPick(weights, labels);
    const i = typeof p === "string" ? (labels?.indexOf(p) ?? -1) : p;
    if (typeof p === "string" && i < 0)
      throw new RangeError(
        `forced pick "${p}" matches no label (${labels?.join(" | ") ?? "none given"})`,
      );
    if (!Number.isInteger(i) || !((weights[i] ?? 0) > 0))
      throw new RangeError(`forced pick ${i} is not a drawable index`);
    return i;
  }
}

let streamOverride:
  | ((age: number, purposeKey: string, counter: number) => Rng | undefined)
  | null = null;

/**
 * Replace the stream of any roll site: `override` is asked for every `nextStream` (the age, the
 * purpose key such as `gambling/play-slots` or `outcome/gambling/play-slots`, and the counter the
 * site would use) and a returned Rng is used instead of the derived one; `undefined` leaves the
 * roll alone. Counters advance exactly as without it, so unforced rolls are unchanged. `null`
 * clears. Forced rolls are not logged: a forced life is not replayable from its choice log.
 * Module-level, for vitest and the harness; `apps/web` must never import it (the e2e
 * production-bundle guard checks).
 */
export function setStreamOverride(
  override:
    | ((age: number, purposeKey: string, counter: number) => Rng | undefined)
    | null,
): void {
  streamOverride = override;
}

/** @internal Used by `nextStream`. */
export function forcedStream(
  age: number,
  purposeKey: string,
  counter: number,
): Rng | undefined {
  return streamOverride?.(age, purposeKey, counter);
}

/**
 * Derive an independent stream for one roll site (ADR 0003). The inputs are
 * joined as `seed|age|counter|purposeKey` (purpose key last, so it may contain
 * any character) and expanded with cyrb128 into the four sfc32 state words.
 * Generation 0 keeps that form; later generations insert `g<n>` after the seed
 * (never numeric, so it cannot collide with a generation-0 key).
 */
export function streamFor(
  seed: number,
  age: number,
  purposeKey: string,
  counter: number,
  generation = 0,
): Rng {
  const gen = generation === 0 ? "" : `|g${generation}`;
  const [a, b, c, d] = cyrb128(`${seed}${gen}|${age}|${counter}|${purposeKey}`);
  return new Rng(a, b, c, d);
}
