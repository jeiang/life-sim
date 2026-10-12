import { type PackBundle, streamFor } from "@life/core";
import {
  type ForcedReport,
  ForcedTally,
  type ForceSet,
  SCRIPTED_ID,
  SCRIPTED_PROFILE,
} from "./force.ts";
import type { PackMetrics } from "./metrics.ts";
import { type ProfileSpec, selectProfiles } from "./profile-spec.ts";
import { Aggregate, type Report } from "./report.ts";
import { type LifeResult, type Lineage, runLife } from "./run.ts";

/** Shard `index` (0-based) of `count`; the lives it holds are those `shardOf` assigns to it. */
export interface Shard {
  readonly index: number;
  readonly count: number;
}

/**
 * The shard of life `i` when lives are dealt to `profiles` profiles in turn. Life `i` is in round
 * `floor(i / profiles)` at slot `i % profiles`; its shard is round plus slot, mod `count`. So each
 * shard gets one life of every profile in every `count` rounds, whatever `count` is. A plain
 * `i % count` would starve profiles whenever the shard count shares a factor with the profile count.
 */
export const shardOf = (i: number, profiles: number, count: number): number =>
  (Math.floor(i / profiles) + (i % profiles)) % count;

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
  /** Forced rolls, choices and actions (`--force`, forced scripts); absent: an unforced run. */
  readonly force?: ForceSet;
  /** Continue each life as an heir for up to `generations` (`--generations`, `--heir`); absent: one life. */
  readonly lineage?: Lineage;
  /** Play only the lives `shardOf` assigns to shard `shard.index`; seeds are unchanged. */
  readonly shard?: Shard;
}

export interface HarnessResult {
  readonly report: Report;
  /** What the forcing did; present when the run forced anything. */
  readonly forced?: ForcedReport;
  readonly seconds: number;
}

/** The seed of life `i` under base seed `seed`, from a harness-keyed stream. */
export function lifeSeedFor(seed: number, i: number): number {
  return streamFor(seed, i, "harness/life-seed", 0).next32();
}

/**
 * Lives [from, to) of the run, in order; lives past the run's end are skipped. With `onLife`
 * each life goes to it and none is kept (the result is empty), so long runs stay in bounded memory.
 */
export function runLives(
  bundles: readonly PackBundle[],
  opts: Pick<
    HarnessOptions,
    | "lives"
    | "profiles"
    | "profileSpecs"
    | "seed"
    | "lifeSeed"
    | "metrics"
    | "force"
    | "lineage"
    | "shard"
  >,
  from: number,
  to: number,
  onLife?: (r: LifeResult) => void,
): LifeResult[] {
  const registry = opts.profiles.includes(SCRIPTED_ID)
    ? [...opts.profileSpecs, SCRIPTED_PROFILE]
    : opts.profileSpecs;
  const profiles = selectProfiles(registry, opts.profiles);
  const out: LifeResult[] = [];
  for (let i = from; i < to; i++) {
    if (
      opts.shard &&
      shardOf(i, profiles.length, opts.shard.count) !== opts.shard.index
    )
      continue;
    const seed = opts.lifeSeed ?? lifeSeedFor(opts.seed, i);
    const profile = profiles[i % profiles.length] as ProfileSpec;
    const r = runLife(
      bundles,
      seed,
      profile,
      opts.metrics,
      opts.force?.entries,
      opts.lineage,
    );
    if (onLife) onLife(r);
    else out.push(r);
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
  const tally = opts.force ? new ForcedTally(opts.force) : undefined;
  runLives(opts.bundles, opts, 0, lifeCount(opts), (r) => {
    agg.add(r);
    tally?.add(r);
    onLife?.(r);
  });
  return {
    report: agg.report(),
    ...(tally ? { forced: tally.report() } : {}),
    seconds: (performance.now() - start) / 1000,
  };
}
