import { type PackBundle, streamFor } from "@life/core";
import type { PackMetrics } from "./metrics.ts";
import { type ProfileSpec, selectProfiles } from "./profile-spec.ts";
import { Aggregate, type Report } from "./report.ts";
import { type LifeResult, runLife } from "./run.ts";

export interface HarnessOptions {
  readonly bundles: readonly PackBundle[];
  /** Pack metrics to collect and report (`loadMetrics`); none by default. */
  readonly metrics?: readonly PackMetrics[];
  readonly lives: number;
  /** The profile registry (`loadProfiles`): every profile a Pack declares. */
  readonly profileSpecs: readonly ProfileSpec[];
  /** Ids of the profiles lives are dealt to in turn; empty means the registry's default set. */
  readonly profiles: readonly string[];
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
    "lives" | "profiles" | "profileSpecs" | "seed" | "lifeSeed" | "metrics"
  >,
  from: number,
  to: number,
  onLife?: (r: LifeResult) => void,
): LifeResult[] {
  const profiles = selectProfiles(opts.profileSpecs, opts.profiles);
  const out: LifeResult[] = [];
  for (let i = from; i < to; i++) {
    const seed = opts.lifeSeed ?? lifeSeedFor(opts.seed, i);
    const profile = profiles[i % profiles.length] as ProfileSpec;
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
