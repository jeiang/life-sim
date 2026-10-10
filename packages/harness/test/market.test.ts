import { fileURLToPath } from "node:url";
import { compilePacks, parseYaml } from "@life/pack-tools";
import { describe, expect, test } from "vitest";
import { runHarness } from "../src/harness.ts";
import { compileMetrics, loadMetrics } from "../src/metrics.ts";
import { loadProfiles } from "../src/profile-spec.ts";

const dir = fileURLToPath(new URL("./fixtures/market", import.meta.url));
const c = compilePacks(dir);
if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
const bundles = c.bundles;

const run = (lives: number) => {
  const { report } = runHarness({
    bundles,
    metrics: loadMetrics(dir, bundles).metrics,
    profileSpecs: loadProfiles(dir, bundles).profiles,
    lives,
    profiles: ["idle"],
    seed: 5,
  });
  const stats = report.packMetrics.base?.stats ?? {};
  return (id: string): unknown => stats[id]?.rows[0]?.value;
};

describe("market measures", () => {
  test("every life ends at age 30 with a series point per world year", () => {
    const v = run(3);
    expect(v("lives")).toBe(3);
    expect(v("years")).toBe(29);
  });

  // Hand-computed from the fixture: 30 steps (ages 0 to 30), prices truncated to minor units.
  test("price path measures match a hand-computed series", () => {
    const v = run(3);
    let steady = 10000;
    for (let i = 0; i < 30; i++) steady = Math.trunc((steady * 10500) / 10000);
    expect(v("steady_start")).toBe(10000);
    expect(v("steady_end")).toBe(steady);
    expect(v("steady_max")).toBe(steady);
    expect(v("steady_return")).toBeCloseTo(
      (steady / 10000) ** (1 / 30) * 10000 - 10000,
      4,
    );
    // -30% a year: 7000, 4900, 3430, 2401, 1680 (1680.7 truncated), then floors continue.
    let slump = 10000;
    let min = slump;
    for (let i = 0; i < 30; i++) {
      slump = Math.max(1, Math.trunc((slump * 7000) / 10000));
      min = Math.min(min, slump);
    }
    expect(v("slump_end")).toBe(slump);
    expect(v("slump_min")).toBe(min);
    expect(v("slump_return")).toBeCloseTo(
      (slump / 10000) ** (1 / 30) * 10000 - 10000,
      4,
    );
  });

  test("years with a drop of at least a threshold, per threshold", () => {
    const v = run(2);
    // Every step of the slumping fund drops 30% until the price is too small to lose 30%.
    let p = 10000;
    let drops = 0;
    for (let i = 0; i < 30; i++) {
      const next = Math.max(1, Math.trunc((p * 7000) / 10000));
      if (((p - next) * 10000) / p >= 2500) drops++;
      p = next;
    }
    expect(v("slump_drops")).toBe(drops);
    expect(v("slump_drops_big")).toBe(0);
    expect(drops).toBeGreaterThan(5);
  });

  test("delistings, relistings and bond defaults are counted from the series", () => {
    const v = run(2);
    // 30 steps of 0, 0, start repeating from step 1: delisted at steps 1, 4, ..., 28; relisted at 3, 6, ..., 30.
    expect(v("doomed_delists")).toBe(10);
    expect(v("doomed_relists")).toBe(10);
    // Relisted at the start price on the last step: endpoint to endpoint is flat.
    expect(v("doomed_return")).toBe(0);
    // A default every year: the face drops 40% of what is left each time.
    expect(v("shaky_defaults")).toBeGreaterThan(0);
  });

  test("choice outcome counts come from storylets.outcomes keys", () => {
    const v = run(40);
    const left = v("left") as number;
    const right = v("right") as number;
    expect(left + right).toBe(40);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });

  test("holdings snapshots read 0 for a player who holds nothing", () => {
    const v = run(2);
    expect(v("held_at_10")).toEqual({ n: 2, value: 0 });
    expect(v("held_steady_at_10")).toEqual({ n: 2, value: 0 });
  });
});

describe("market measure validation", () => {
  const check = (yaml: string) => {
    const diags: never[] = [];
    const src = parseYaml("base/harness/metrics.yaml", yaml, diags);
    if (!src) throw new Error("not YAML");
    return compileMetrics("base", src, bundles).diagnostics.map(
      (d) => d.message,
    );
  };

  test("unknown kinds, takes and outcome keys are reported", () => {
    const errs = check(`
title: T
measures:
  a: { market: base/nope, take: end_price }
  b: { market: base/steady, take: whatever }
  c: { market: base/steady, take: drop_years }
  d: { market: base/steady, take: end_price, drop_bp: 5 }
  e: { outcome: { storylet: base/fork, key: o0 } }
  f: { outcome: { storylet: base/fork, key: c0.o9 } }
  g: { outcome: { storylet: base/calm-year, key: c0.o0 } }
  h: { snapshot: { holding: base/nope }, ages: [10] }
`);
    expect(errs.join("\n")).toMatch(/unknown market kind 'base\/nope'/);
    expect(errs.join("\n")).toMatch(/expected one of: annualized_return/);
    expect(errs.join("\n")).toMatch(/has choices: use c<j>.o<i>/);
    expect(errs.join("\n")).toMatch(/past the 1 outcome/);
    expect(errs.join("\n")).toMatch(/has no choices: use o<i>/);
    expect(errs.length).toBeGreaterThanOrEqual(8);
  });
});
