import { type PackBundle, streamFor } from "@life/core";
import type { PackMetrics } from "./metrics.ts";
import { PROFILE_NAMES, type ProfileName } from "./profiles.ts";
import { Aggregate, type Report } from "./report.ts";
import { type LifeResult, runLife } from "./run.ts";

export interface HarnessOptions {
  readonly bundles: readonly PackBundle[];
  /** Pack metrics to collect and report (`loadMetrics`); none by default. */
  readonly metrics?: readonly PackMetrics[];
  readonly lives: number;
  /** Lives are dealt to these profiles in turn. */
  readonly profiles: readonly ProfileName[];
  /** Base seed; each life's seed is derived from it. */
  readonly seed: number;
  /** Run exactly one life with this life seed (replays a reported fault). */
  readonly lifeSeed?: number;
}

export interface HarnessResult {
  readonly report: Report;
  readonly seconds: number;
}

/** The seed of life `i` under base seed `seed`, from a harness-keyed stream. */
export function lifeSeedFor(seed: number, i: number): number {
  return streamFor(seed, i, "harness/life-seed", 0).next32();
}

/** Lives [from, to) of the run, in order; lives past the run's end are skipped. */
export function runLives(
  bundles: readonly PackBundle[],
  opts: Pick<
    HarnessOptions,
    "lives" | "profiles" | "seed" | "lifeSeed" | "metrics"
  >,
  from: number,
  to: number,
  onLife?: (r: LifeResult) => void,
): LifeResult[] {
  const profiles = opts.profiles.length > 0 ? opts.profiles : PROFILE_NAMES;
  const out: LifeResult[] = [];
  for (let i = from; i < to; i++) {
    const seed = opts.lifeSeed ?? lifeSeedFor(opts.seed, i);
    const profile = profiles[i % profiles.length] as ProfileName;
    const r = runLife(bundles, seed, profile, opts.metrics);
    out.push(r);
    onLife?.(r);
  }
  return out;
}

/** How many lives a run plays: one when replaying a life seed. */
export const lifeCount = (opts: Pick<HarnessOptions, "lives" | "lifeSeed">) =>
  opts.lifeSeed === undefined ? opts.lives : 1;

export function runHarness(
  opts: HarnessOptions,
  onLife?: (r: LifeResult) => void,
): HarnessResult {
  const start = performance.now();
  const agg = new Aggregate(opts.bundles, opts.metrics);
  runLives(opts.bundles, opts, 0, lifeCount(opts), (r) => {
    agg.add(r);
    onLife?.(r);
  });
  return { report: agg.report(), seconds: (performance.now() - start) / 1000 };
}
