import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePacks } from "@life/pack-tools";
import { describe, expect, test } from "vitest";
import { runHarness } from "../src/harness.ts";
import { loadMetrics } from "../src/metrics.ts";
import { loadProfiles } from "../src/profile-spec.ts";
import { renderMarkdown } from "../src/report.ts";
import type { LifeResult } from "../src/run.ts";
import {
  failures,
  findShardFiles,
  type Merged,
  mergeShards,
  neverFiredByPack,
  parseFailOn,
  parseShard,
  shardRunOf,
  unionRuns,
  writeShard,
} from "../src/shard.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

function setup(dir: string) {
  const c = compilePacks(dir);
  if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
  const p = loadProfiles(dir, c.bundles);
  const m = loadMetrics(dir, c.bundles);
  return { bundles: c.bundles, profileSpecs: p.profiles, metrics: m.metrics };
}

const realPacks = () => {
  const dir = mkdtempSync(join(tmpdir(), "harness-shard-"));
  for (const id of ["core-loop", "karma"])
    cpSync(here(`../../../packs/${id}`), join(dir, id), { recursive: true });
  return dir;
};

describe("--shard / merge", () => {
  test("parseShard is 1-based and strict", () => {
    expect(parseShard("2/4")).toEqual({ index: 1, count: 4 });
    for (const bad of ["0/4", "5/4", "1", "a/b", "1/0", ""])
      expect(parseShard(bad)).toBeNull();
  });

  test("merged shards equal the unsharded run, byte for byte", async () => {
    const dir = realPacks();
    const s = setup(dir);
    const lives = 13;
    const profiles = s.profileSpecs
      .filter((p) => p.default !== false)
      .map((p) => p.id);
    const base = { ...s, lives, profiles, seed: 7 };
    const whole = runHarness(base);

    const out = mkdtempSync(join(tmpdir(), "harness-shards-"));
    for (let i = 0; i < 4; i++) {
      const shard = { index: i, count: 4 };
      const got: LifeResult[] = [];
      runHarness({ ...base, shard }, (r) => void got.push(r));
      writeShard(
        join(out, `s${i}`),
        shardRunOf(7, lives, profiles, undefined),
        shard,
        got,
      );
    }
    const merged = await mergeShards(findShardFiles(out), s.bundles, s.metrics);
    const json = (r: unknown) => JSON.stringify(r, null, 2);
    expect(json(merged.report)).toBe(json(whole.report));
    const meta = { seed: 7, profiles };
    expect(renderMarkdown(merged.report, meta)).toBe(
      renderMarkdown(whole.report, meta),
    );
  }, 60_000);

  test("merge rejects a missing shard", async () => {
    const dir = realPacks();
    const s = setup(dir);
    const out = mkdtempSync(join(tmpdir(), "harness-shards-"));
    const base = { ...s, lives: 4, profiles: ["random"], seed: 1 };
    const shard = { index: 0, count: 2 };
    const got: LifeResult[] = [];
    runHarness({ ...base, shard }, (r) => void got.push(r));
    writeShard(out, shardRunOf(1, 4, ["random"], undefined), shard, got);
    await expect(
      mergeShards(findShardFiles(out), s.bundles, s.metrics),
    ).rejects.toThrow(/missing shard\(s\) 2\/2/);
  });
});

describe("unionRuns", () => {
  const run = (never: string[], faults: number): Merged =>
    ({
      run: { seed: 1, lives: 1, profiles: [], force: null },
      report: {
        faults: {
          total: faults,
          byKind: faults ? { exception: faults } : {},
          first: [],
        },
        storylets: { neverFired: never, chainStepsNeverFired: never },
      },
    }) as unknown as Merged;

  test("content is never fired only if no run fired it; faults add up", () => {
    const u = unionRuns([run(["a/x", "a/y"], 0), run(["a/y", "a/z"], 2)]);
    expect(u.report.storylets.neverFired).toEqual(["a/y"]);
    expect(u.report.faults.total).toBe(2);
    expect(u.report.faults.byKind).toEqual({ exception: 2 });
  });
});

describe("--fail-on", () => {
  test("never-fired content fails only with the flag, listed per Pack", () => {
    const dir = here("./fixtures/dead");
    const s = setup(dir);
    const { report } = runHarness({
      ...s,
      lives: 6,
      profiles: ["idle"],
      seed: 1,
    });
    expect(neverFiredByPack(report).map(([p]) => p)).toEqual(["base"]);
    // Immortal lives are stuck faults, which fail regardless; never-fired is the flag's.
    expect(
      failures(report, undefined, parseFailOn("").on).join("\n"),
    ).not.toContain("never fired");
    const why = failures(
      report,
      undefined,
      parseFailOn("faults,never-fired").on,
    );
    const line = why.find((w) => w.startsWith("never fired in base"));
    expect(line).toContain("never-year");
  });

  test("faults always fail", () => {
    const dir = here("./fixtures/divzero");
    const s = setup(dir);
    const { report } = runHarness({
      ...s,
      lives: 4,
      profiles: ["idle"],
      seed: 1,
    });
    expect(failures(report, undefined, new Set())[0]).toMatch(/engine fault/);
  });

  test("unknown names are reported", () => {
    expect(parseFailOn("faults,nope").unknown).toEqual(["nope"]);
  });
});
