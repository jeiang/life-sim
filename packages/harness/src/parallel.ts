import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { ForcedTally } from "./force.ts";
import {
  type HarnessOptions,
  type HarnessResult,
  lifeCount,
} from "./harness.ts";
import { Aggregate } from "./report.ts";
import type { LifeResult } from "./run.ts";

/** Lives per batch handed to a worker; small enough to balance load, large enough to amortise messaging. */
const BATCH = 32;

/** Lives [from, to) of a run, with the options that fix their seeds and profiles. */
export interface Job
  extends Pick<
    HarnessOptions,
    "lives" | "profiles" | "seed" | "lifeSeed" | "force" | "shard"
  > {
  readonly from: number;
  readonly to: number;
}

export type WorkerIn = { readonly job: Job };
export type WorkerOut =
  | { readonly t: "ready" }
  | { readonly t: "error"; readonly message: string }
  | {
      readonly t: "done";
      readonly from: number;
      readonly results: LifeResult[];
    };

export interface ParallelOptions extends HarnessOptions {
  /** Directory `bundles` were compiled from; every worker compiles it once for itself. */
  readonly packsDir: string;
  /** Called with every life, in life order. */
  readonly onLife?: (r: LifeResult) => void;
  /** Pack subset every worker compiles (with its required closure); unset means every Pack. */
  readonly only?: readonly string[];
  /** Worker threads; 0 or unset means the available cores. */
  readonly jobs?: number;
  /**
   * Stop handing out batches once this many seconds have passed since the run began and report
   * the lives played so far. The lives played are always the first ones in life order, so the
   * report equals an unlimited run's report over fewer lives; how many depends on the speed
   * of the machine. Unset: play every life.
   */
  readonly deadlineSeconds?: number;
  /** Lives per batch handed to a worker (default 32); small batches make `deadlineSeconds` stop sooner. */
  readonly batchSize?: number;
}

/** Worker threads to use for `requested` (0 or undefined: the available cores). */
export const resolveJobs = (requested?: number): number =>
  requested ? requested : availableParallelism();

/**
 * Play the run across worker threads. Batches of lives go to whichever worker is free, but
 * results are added to the Aggregate in life order, so the report is identical for any `jobs`.
 */
export function runHarnessParallel(
  opts: ParallelOptions,
): Promise<HarnessResult> {
  const start = performance.now();
  const total = lifeCount(opts);
  const batch = opts.batchSize ?? BATCH;
  const batches = Math.ceil(total / batch);
  const jobs = Math.max(1, Math.min(resolveJobs(opts.jobs), batches));
  const agg = new Aggregate(opts.bundles, opts.metrics);
  const tally = opts.force ? new ForcedTally(opts.force) : undefined;
  const finish = (): HarnessResult => ({
    report: agg.report(),
    ...(tally ? { forced: tally.report() } : {}),
    seconds: (performance.now() - start) / 1000,
  });
  if (total === 0) return Promise.resolve(finish());

  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    const pending = new Map<number, LifeResult[]>();
    let nextBatch = 0;
    let nextToAdd = 0;
    let settled = false;

    const stop = (err?: Error): void => {
      if (settled) return;
      settled = true;
      for (const w of workers) void w.terminate();
      if (err) reject(err);
      else resolve(finish());
    };

    let stopped = false;
    const dispatch = (w: Worker): void => {
      if (
        !stopped &&
        nextBatch > 0 &&
        opts.deadlineSeconds !== undefined &&
        (performance.now() - start) / 1000 >= opts.deadlineSeconds
      )
        stopped = true;
      if (stopped || nextBatch >= batches) return;
      const from = nextBatch++ * batch;
      const job: Job = {
        lives: opts.lives,
        profiles: opts.profiles,
        seed: opts.seed,
        ...(opts.lifeSeed === undefined ? {} : { lifeSeed: opts.lifeSeed }),
        ...(opts.force ? { force: opts.force } : {}),
        ...(opts.shard ? { shard: opts.shard } : {}),
        from,
        to: Math.min(from + batch, total),
      };
      w.postMessage({ job } satisfies WorkerIn);
    };

    for (let k = 0; k < jobs; k++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), {
        workerData: { packsDir: opts.packsDir, only: opts.only },
      });
      workers.push(w);
      w.on("error", (e) => stop(e));
      w.on("exit", (code) => {
        if (!settled && code !== 0)
          stop(new Error(`harness worker exited with code ${code}`));
      });
      w.on("message", (m: WorkerOut) => {
        if (m.t === "error") return stop(new Error(m.message));
        if (m.t === "done") {
          pending.set(m.from, m.results);
          for (;;) {
            const r = pending.get(nextToAdd);
            if (!r) break;
            pending.delete(nextToAdd);
            for (const life of r) {
              agg.add(life);
              tally?.add(life);
              opts.onLife?.(life);
            }
            nextToAdd += batch;
          }
          if (nextToAdd >= total) return stop();
        }
        dispatch(w);
        if (stopped && nextToAdd >= nextBatch * batch) stop();
      });
    }
  });
}
