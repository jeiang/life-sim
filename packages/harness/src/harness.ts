import { type PackBundle, streamFor } from "@life/core";
import { PROFILE_NAMES, type ProfileName } from "./profiles.ts";
import { Aggregate, type Report } from "./report.ts";
import { type LifeResult, runLife } from "./run.ts";

export interface HarnessOptions {
  readonly bundles: readonly PackBundle[];
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

export function runHarness(
  opts: HarnessOptions,
  onLife?: (r: LifeResult) => void,
): HarnessResult {
  const start = performance.now();
  const agg = new Aggregate(opts.bundles);
  const profiles = opts.profiles.length > 0 ? opts.profiles : PROFILE_NAMES;
  const n = opts.lifeSeed === undefined ? opts.lives : 1;
  for (let i = 0; i < n; i++) {
    const seed = opts.lifeSeed ?? lifeSeedFor(opts.seed, i);
    const profile = profiles[i % profiles.length] as ProfileName;
    const r = runLife(opts.bundles, seed, profile);
    agg.add(r);
    onLife?.(r);
  }
  return { report: agg.report(), seconds: (performance.now() - start) / 1000 };
}
