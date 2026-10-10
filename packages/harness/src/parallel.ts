import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
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
  extends Pick<HarnessOptions, "lives" | "profiles" | "seed" | "lifeSeed"> {
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
  /** Worker threads; 0 or unset means the available cores. */
  readonly jobs?: number;
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
  const batches = Math.ceil(total / BATCH);
  const jobs = Math.max(1, Math.min(resolveJobs(opts.jobs), batches));
  const agg = new Aggregate(opts.bundles, opts.metrics);
  const finish = (): HarnessResult => ({
    report: agg.report(),
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

    const dispatch = (w: Worker): void => {
      if (nextBatch >= batches) return;
      const from = nextBatch++ * BATCH;
      const job: Job = {
        lives: opts.lives,
        profiles: opts.profiles,
        seed: opts.seed,
        ...(opts.lifeSeed === undefined ? {} : { lifeSeed: opts.lifeSeed }),
        from,
        to: Math.min(from + BATCH, total),
      };
      w.postMessage({ job } satisfies WorkerIn);
    };

    for (let k = 0; k < jobs; k++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), {
        workerData: { packsDir: opts.packsDir },
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
            for (const life of r) agg.add(life);
            nextToAdd += BATCH;
          }
          if (nextToAdd >= total) return stop();
        }
        dispatch(w);
      });
    }
  });
}
