import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PackBundle } from "@life/core";
import {
  type ForcedReport,
  ForcedTally,
  type ForceEntry,
  type ForceSet,
} from "./force.ts";
import { lifeCount, type Shard } from "./harness.ts";
import type { PackMetrics } from "./metrics.ts";
import { Aggregate, type Report } from "./report.ts";
import type { LifeResult, Lineage } from "./run.ts";

/** What every shard of one run agrees on; merging refuses shards whose `run` differs. */
export interface ShardRun {
  readonly seed: number;
  readonly lives: number;
  readonly profiles: readonly string[];
  /** Forced run: the script, its profile and the entry labels (all a report shows of them). */
  readonly force: {
    readonly script?: string;
    readonly profile?: string;
    readonly labels: readonly string[];
  } | null;
  /** Generations played per life and the heir policy; absent for single lives. */
  readonly lineage?: Lineage;
}

/** The raw lives of one shard, so that a merge replays them exactly as a single run would. */
export interface ShardFile {
  readonly version: 1;
  readonly run: ShardRun;
  readonly shard: Shard;
  /** In life-index order: life `shard.index + j * shard.count` is `lives[j]`. */
  readonly lives: readonly LifeResult[];
}

export const shardRunOf = (
  seed: number,
  lives: number,
  profiles: readonly string[],
  force: ForceSet | undefined,
  lineage?: Lineage,
): ShardRun => ({
  seed,
  lives,
  profiles,
  force: force
    ? {
        ...(force.script === undefined ? {} : { script: force.script }),
        ...(force.profile === undefined ? {} : { profile: force.profile }),
        labels: force.entries.map((e) => e.label),
      }
    : null,
  ...(lineage && lineage.generations > 1 ? { lineage } : {}),
});

const SHARD_FILE = /^shard-(\d+)-of-(\d+)\.json\.gz$/;

/** Parse `--shard i/n` (1-based `i`, as in `2/4`); null when malformed. */
export function parseShard(arg: string): Shard | null {
  const m = /^(\d+)\/(\d+)$/.exec(arg);
  if (!m) return null;
  const i = Number(m[1]);
  const n = Number(m[2]);
  return n >= 1 && i >= 1 && i <= n ? { index: i - 1, count: n } : null;
}

/** Write one shard's lives to `dir`; returns the file path. */
export function writeShard(
  dir: string,
  run: ShardRun,
  shard: Shard,
  lives: readonly LifeResult[],
): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `shard-${shard.index + 1}-of-${shard.count}.json.gz`);
  const body: ShardFile = { version: 1, run, shard, lives };
  writeFileSync(file, gzipSync(JSON.stringify(body)));
  return file;
}

/** Shard files under `dir`, found recursively (CI downloads one artifact directory per shard), sorted. */
export function findShardFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && SHARD_FILE.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

export interface Merged {
  readonly run: ShardRun;
  readonly report: Report;
  readonly forced?: ForcedReport;
}

/**
 * Combine shard files into the report of the whole run. The lives are replayed through one
 * Aggregate in life-index order, so the result is identical to an unsharded run.
 */
export function mergeShards(
  files: readonly string[],
  bundles: readonly PackBundle[],
  metrics: readonly PackMetrics[] | undefined,
): Merged {
  if (files.length === 0) throw new Error("no shard-*.json.gz files found");
  const shards = files.map((f) => {
    const s = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8"));
    if (s?.version !== 1) throw new Error(`${f}: not a shard file`);
    return { file: f, ...(s as ShardFile) };
  });
  const first = shards[0] as (typeof shards)[number];
  const runKey = JSON.stringify(first.run);
  const count = first.shard.count;
  const byIndex: (typeof shards)[number][] = [];
  for (const s of shards) {
    if (JSON.stringify(s.run) !== runKey)
      throw new Error(
        `${s.file} comes from a different run than ${first.file} (seed, lives, profiles or forcing differ)`,
      );
    if (s.shard.count !== count)
      throw new Error(`${s.file} is a shard of ${s.shard.count}, not ${count}`);
    if (byIndex[s.shard.index])
      throw new Error(`shard ${s.shard.index + 1}/${count} appears twice`);
    byIndex[s.shard.index] = s;
  }
  const missing = Array.from({ length: count }, (_, i) => i).filter(
    (i) => !byIndex[i],
  );
  if (missing.length > 0)
    throw new Error(
      `missing shard(s) ${missing.map((i) => `${i + 1}/${count}`).join(", ")}`,
    );

  const total = lifeCount({ lives: first.run.lives });
  const agg = new Aggregate(bundles, metrics);
  const force = first.run.force;
  const tally = force
    ? new ForcedTally({
        ...(force.script === undefined ? {} : { script: force.script }),
        ...(force.profile === undefined ? {} : { profile: force.profile }),
        entries: force.labels.map((label) => ({ label }) as ForceEntry),
      })
    : undefined;
  for (const s of byIndex) {
    const expected = Math.max(0, Math.ceil((total - s.shard.index) / count));
    if (s.lives.length !== expected)
      throw new Error(
        `${s.file}: ${s.lives.length} lives, expected ${expected} for shard ${s.shard.index + 1}/${count} of ${total} lives`,
      );
  }
  for (let i = 0; i < total; i++) {
    const life = (byIndex[i % count] as (typeof shards)[number]).lives[
      Math.floor(i / count)
    ] as LifeResult;
    agg.add(life);
    tally?.add(life);
  }
  return {
    run: first.run,
    report: agg.report(),
    ...(tally ? { forced: tally.report() } : {}),
  };
}

export const FAIL_ON = ["faults", "never-fired"] as const;
export type FailOn = (typeof FAIL_ON)[number];

/** Parse `--fail-on a,b`; the unknown names, if any, are returned for the error message. */
export function parseFailOn(arg: string): {
  on: Set<FailOn>;
  unknown: string[];
} {
  const names = arg.split(",").filter((n) => n !== "");
  return {
    on: new Set(
      names.filter((n): n is FailOn => FAIL_ON.includes(n as FailOn)),
    ),
    unknown: names.filter((n) => !FAIL_ON.includes(n as FailOn)),
  };
}

/** Never-fired storylet ids by Pack (the id's first segment), Packs sorted. */
export function neverFiredByPack(report: Report): [string, string[]][] {
  const by = new Map<string, string[]>();
  for (const id of report.storylets.neverFired) {
    const pack = id.split("/")[0] as string;
    by.set(pack, [...(by.get(pack) ?? []), id]);
  }
  return [...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Why a run fails, one line each; empty when it passes. Faults and never-matched forced
 * entries always fail; never-fired content fails only with `never-fired` in `failOn`.
 */
export function failures(
  report: Report,
  forced: ForcedReport | undefined,
  failOn: ReadonlySet<FailOn>,
): string[] {
  const out: string[] = [];
  if (report.faults.total > 0)
    out.push(`${report.faults.total} engine fault(s)`);
  for (const label of forced?.neverMatched ?? [])
    out.push(`FORCED never matched: ${label}`);
  if (failOn.has("never-fired"))
    for (const [pack, ids] of neverFiredByPack(report))
      out.push(`never fired in ${pack} (${ids.length}): ${ids.join(", ")}`);
  return out;
}
