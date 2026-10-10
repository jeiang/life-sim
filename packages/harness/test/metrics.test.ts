import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePacks, parseYaml } from "@life/pack-tools";
import { describe, expect, test } from "vitest";
import { runHarness } from "../src/harness.ts";
import {
  compileMetrics,
  evalExpr,
  loadMetrics,
  parseExpr,
} from "../src/metrics.ts";
import { runHarnessParallel } from "../src/parallel.ts";
import { loadProfiles } from "../src/profile-spec.ts";

const packs = fileURLToPath(new URL("../../../packs", import.meta.url));

/** The real Packs under test in a directory of their own, so other Packs cannot break the run. */
function dirWith(...ids: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-metrics-"));
  // core-loop requires the karma leaf Pack, so it always comes along.
  for (const id of ["karma", ...ids])
    cpSync(join(packs, id), join(dir, id), { recursive: true });
  return dir;
}

function bundlesOf(dir: string) {
  const c = compilePacks(dir);
  if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
  return c.bundles;
}

describe("metric expressions", () => {
  const val = (src: string, m: Record<string, number> = {}) =>
    evalExpr(parseExpr(src), (id) => m[id]);

  test("comparisons, and, or, not and parentheses", () => {
    expect(val("a > 0 and not b", { a: 2, b: 0 })).toBe(1);
    expect(val("a > 0 and not b", { a: 2, b: 1 })).toBe(0);
    expect(val("(a or b) and c == 3", { b: 1, c: 3 })).toBe(1);
    expect(val("a != 1", {})).toBe(1);
  });

  test("a syntax error throws", () => {
    expect(() => parseExpr("a >")).toThrow();
    expect(() => parseExpr("(a")).toThrow();
    expect(() => parseExpr("a $ b")).toThrow();
  });
});

describe("metrics.yaml validation", () => {
  const bundles = bundlesOf(dirWith("core-loop", "gambling"));
  const check = (yaml: string) => {
    const diags: never[] = [];
    const src = parseYaml("gambling/harness/metrics.yaml", yaml, diags);
    if (!src) throw new Error("not YAML");
    return compileMetrics("gambling", src, bundles).diagnostics.map(
      (d) => `${d.path}: ${d.message}`,
    );
  };

  test("the core-loop, Gambling and Vacations Packs declare valid metrics", () => {
    const all = bundlesOf(dirWith("core-loop", "gambling", "vacations"));
    const dir = dirWith("core-loop", "gambling", "vacations");
    const loaded = loadMetrics(dir, all);
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.metrics.map((m) => m.pack)).toEqual([
      "core-loop",
      "gambling",
      "vacations",
    ]);
  });

  test("unknown keys, qualities, measures and expressions are reported with their path", () => {
    const errors = check(`
title: T
bogus: 1
measures:
  a: { quality: no_such_quality, at: end }
  b: { when: "missing > 0" }
tables:
  t:
    raises: gambling_wagered
    columns:
      n: count
stats:
  s:
    kind: share
    when: "(b"
  u:
    kind: mean
    value: t.nope
blocks:
  - stats: [s, v]
`);
    expect(errors.join("\n")).toContain("bogus: unknown key 'bogus'");
    expect(errors.join("\n")).toContain("measures.a.quality: unknown quality");
    expect(errors.join("\n")).toContain("measures.b.when: 'missing'");
    expect(errors.join("\n")).toContain("stats.s.when:");
    expect(errors.join("\n")).toContain(
      "stats.u.value: table 't' has no column",
    );
    expect(errors.join("\n")).toContain(
      "blocks[0].stats[1]: unknown statistic",
    );
  });

  test("generation measures and visible_if_measure are checked", () => {
    const errors = check(`
title: T
measures:
  a: { generation: no_such_value }
  b: { generation: inheritance, n: 2 }
  c: { generation: reached, n: -1 }
stats: {}
blocks:
  - { text: x, visible_if_measure: nope }
`);
    const all = errors.join("\n");
    expect(all).toContain("measures.a.generation: expected one of: reached");
    expect(all).toContain("measures.c.n:");
    expect(all).toContain(
      "blocks[0].visible_if_measure: 'nope' is not a measure",
    );
    expect(all).not.toContain("measures.b");
  });
});

describe("a Pack's declared metrics in a run", () => {
  const dir = dirWith("core-loop", "gambling");
  const bundles = bundlesOf(dir);
  const metrics = loadMetrics(dir, bundles).metrics;
  const run = {
    bundles,
    metrics,
    profileSpecs: loadProfiles(dir, bundles).profiles,
    lives: 40,
    profiles: ["gambler", "idle"] as const,
    seed: 11,
  };

  test("the gambler profile fills the Gambling section; serial and parallel agree", async () => {
    const serial = runHarness({ ...run, profiles: [...run.profiles] }).report;
    const sec = serial.packMetrics.gambling;
    expect(sec?.title).toBe("Gambling");
    const shares = sec?.stats.gambled?.rows ?? [];
    const share = (g: string) =>
      shares.find((r) => r.group === g)?.value as number;
    // The idle profile stakes only through events; the gambler bets every year.
    expect(share("gambler")).toBeGreaterThan(share("idle"));
    expect(Object.keys(sec?.stats ?? {})).toContain("return");
    const par = (
      await runHarnessParallel({
        ...run,
        profiles: [...run.profiles],
        packsDir: dir,
        jobs: 2,
      })
    ).report;
    expect(JSON.stringify(par)).toBe(JSON.stringify(serial));
  }, 120_000);

  test("a Pack without metrics adds no section", () => {
    const { report } = runHarness({
      bundles,
      profileSpecs: run.profileSpecs,
      lives: 4,
      profiles: ["idle"],
      seed: 1,
    });
    expect(report.packMetrics).toEqual({});
  });
});
