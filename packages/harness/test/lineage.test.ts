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
import { type LifeResult, type Lineage, runLife } from "../src/run.ts";
import {
  findShardFiles,
  mergeShards,
  shardRunOf,
  writeShard,
} from "../src/shard.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The real core-loop and karma Packs plus the fixture Pack `kids`, which gives every life children. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "harness-lineage-"));
  for (const id of ["core-loop", "karma"])
    cpSync(here(`../../../packs/${id}`), join(dir, id), { recursive: true });
  cpSync(here("./fixtures/lineage/kids"), join(dir, "kids"), {
    recursive: true,
  });
  const c = compilePacks(dir);
  if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
  const spec = loadProfiles(dir, c.bundles).profiles;
  const m = loadMetrics(dir, c.bundles);
  if (m.diagnostics.length > 0)
    throw new Error(m.diagnostics.map((d) => d.message).join("; "));
  return { bundles: c.bundles, profileSpecs: spec, metrics: m.metrics };
}

const s = setup();
const random = s.profileSpecs.find((p) => p.id === "random") as never;
const three: Lineage = { generations: 3, heir: "eldest" };

describe("--generations", () => {
  test("a life continues as its heirs, with no faults, a record per generation", () => {
    let continued = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const r = runLife(s.bundles, seed, random, s.metrics, [], three);
      expect(r.faults, `seed ${seed}`).toEqual([]);
      const lin = r.lineage ?? [];
      expect(lin.length).toBeGreaterThanOrEqual(1);
      expect(lin.length).toBeLessThanOrEqual(3);
      expect(lin.map((g) => g.generation)).toEqual(lin.map((_, i) => i));
      if (lin.length > 1) continued++;
      for (const g of lin.slice(1)) {
        expect(g.heirAge).toBeGreaterThanOrEqual(0);
        expect(g.minorHeir).toBe(g.heirAge < 18 ? 1 : 0);
      }
      // The founder's own fields are the founder's life alone.
      expect(r.death?.age).toBe(lin[0]?.deathAge);
    }
    expect(continued).toBeGreaterThan(10);
  }, 120_000);

  test("the founder's life is the same with and without generations", () => {
    for (const seed of [3, 4, 5]) {
      const one = runLife(s.bundles, seed, random, s.metrics, []);
      const many = runLife(s.bundles, seed, random, s.metrics, [], three);
      const { lineage, heirFires, metrics, faults, ...rest } = many;
      const { metrics: m1, faults: f1, ...rest1 } = one;
      expect(lineage).toBeDefined();
      expect(one.lineage).toBeUndefined();
      expect(heirFires).toBeDefined();
      expect(rest).toEqual(rest1);
      expect(faults).toEqual(f1);
      expect(Object.keys(metrics)).toEqual(Object.keys(m1));
    }
  }, 120_000);

  test("a run is deterministic", () => {
    const a = runLife(s.bundles, 8, random, s.metrics, [], three);
    expect(
      JSON.stringify(runLife(s.bundles, 8, random, s.metrics, [], three)),
    ).toBe(JSON.stringify(a));
  }, 60_000);

  test("heir policy: the eldest is older than the youngest heir; richest and random differ", () => {
    const run = (heir: Lineage["heir"]) =>
      Array.from(
        { length: 20 },
        (_, i) =>
          runLife(s.bundles, 100 + i, random, s.metrics, [], {
            generations: 2,
            heir,
          }).lineage?.[1]?.heirAge,
      );
    const eldest = run("eldest");
    const random_ = run("random");
    const sum = (v: (number | undefined)[]) =>
      v.reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(sum(eldest)).toBeGreaterThan(sum(random_));
    expect(run("richest").some((a, i) => a !== eldest[i])).toBe(true);
  }, 240_000);

  test("lineage metrics reach the report; one generation shows none of them", () => {
    const base = { ...s, lives: 30, profiles: ["random"], seed: 11 };
    const one = runHarness(base).report.packMetrics["core-loop"];
    expect(one?.stats.looks_median).toBeDefined();
    expect(one?.stats.heir_available_0).toBeUndefined();
    expect(one?.blocks.every((b) => !("visibleIfMeasure" in b))).toBe(true);
    const many = runHarness({ ...base, lineage: three });
    const sec = many.report.packMetrics["core-loop"];
    expect(sec?.title).toBe("Core loop");
    const rate = (id: string) =>
      sec?.stats[id]?.rows.find((r) => r.group === "all")?.value;
    expect(rate("heir_available_0")).toBeGreaterThan(50);
    expect(rate("reached_1")).toBeGreaterThan(0);
    const inherited = sec?.stats.inheritance_1?.rows[0]?.value;
    expect(inherited).toHaveProperty("p50");
    expect(many.report.faults.total).toBe(0);
    expect(
      renderMarkdown(many.report, { seed: 11, profiles: ["random"] }),
    ).toContain("generation 0 deaths with a living child");
    expect(
      renderMarkdown(runHarness(base).report, {
        seed: 11,
        profiles: ["random"],
      }),
    ).not.toContain("deaths with a living child");
  }, 240_000);

  test("sharded runs merge to the unsharded report", () => {
    const lives = 8;
    const base = { ...s, lives, profiles: ["random"], seed: 5, lineage: three };
    const whole = runHarness(base);
    const out = mkdtempSync(join(tmpdir(), "harness-lineage-shards-"));
    for (let i = 0; i < 2; i++) {
      const shard = { index: i, count: 2 };
      const got: LifeResult[] = [];
      runHarness({ ...base, shard }, (r) => void got.push(r));
      writeShard(
        join(out, `s${i}`),
        shardRunOf(5, lives, ["random"], undefined, three),
        shard,
        got,
      );
    }
    const merged = mergeShards(findShardFiles(out), s.bundles, s.metrics);
    expect(JSON.stringify(merged.report)).toBe(JSON.stringify(whole.report));
    expect(merged.run.lineage).toEqual(three);
  }, 240_000);
});
