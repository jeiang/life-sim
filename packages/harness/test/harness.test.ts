import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePacks } from "@life/pack-tools";
import { describe, expect, test } from "vitest";
import { runHarness } from "../src/harness.ts";
import { runHarnessParallel } from "../src/parallel.ts";
import { PROFILE_NAMES } from "../src/profiles.ts";
import { renderMarkdown } from "../src/report.ts";

const fixture = (name: string) =>
  join(fileURLToPath(new URL("./fixtures", import.meta.url)), name);

function bundlesOf(dir: string) {
  const c = compilePacks(dir);
  if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
  return c.bundles;
}

describe("engine fault detection", () => {
  test("an expression division by zero is a fault", () => {
    const { report } = runHarness({
      bundles: bundlesOf(fixture("divzero")),
      lives: 4,
      profiles: ["idle"],
      seed: 1,
    });
    expect(report.faults.byKind.assertion).toBeGreaterThan(0);
    expect(report.faults.first[0]?.message).toContain("division by zero");
  });

  test("an open event with no selectable choice is a fault", () => {
    const { report } = runHarness({
      bundles: bundlesOf(fixture("stuck")),
      lives: 4,
      profiles: ["random"],
      seed: 1,
    });
    expect(report.faults.byKind.stuck).toBeGreaterThan(0);
    expect(report.faults.first[0]?.message).toContain("no selectable choice");
  });
});

describe("the core-loop Pack", () => {
  const bundles = bundlesOf(
    fileURLToPath(new URL("../../../packs", import.meta.url)),
  );

  test("every profile plays lives to death without a fault, reproducibly", () => {
    const opts = { bundles, lives: 8, profiles: PROFILE_NAMES, seed: 7 };
    const a = runHarness(opts).report;
    const b = runHarness(opts).report;
    expect(a.faults.total).toBe(0);
    expect(a.death.ended).toBe(8);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 120_000);

  test("--life-seed replays one life", () => {
    const { report } = runHarness({
      bundles,
      lives: 1,
      profiles: ["random"],
      seed: 0,
      lifeSeed: 12345,
    });
    expect(report.lives).toBe(1);
  });
});

describe("parallel runs", () => {
  const packsDir = fileURLToPath(new URL("../../../packs", import.meta.url));
  const bundles = bundlesOf(packsDir);
  const opts = { bundles, lives: 70, profiles: PROFILE_NAMES, seed: 11 };
  const files = (report: ReturnType<typeof runHarness>["report"]) =>
    JSON.stringify(report) +
    renderMarkdown(report, { seed: 11, profiles: PROFILE_NAMES });

  test("the report is identical for --jobs 1, 3 and 8 and to a single-thread run", async () => {
    const single = files(runHarness(opts).report);
    for (const jobs of [1, 3, 8]) {
      const r = await runHarnessParallel({ ...opts, packsDir, jobs });
      expect(files(r.report)).toBe(single);
    }
  }, 120_000);

  test("a fault found in a worker carries its life seed", async () => {
    const dir = fixture("divzero");
    const o = {
      bundles: bundlesOf(dir),
      lives: 40,
      profiles: ["idle" as const],
      seed: 1,
    };
    const r = await runHarnessParallel({ ...o, packsDir: dir, jobs: 2 });
    expect(files(r.report)).toBe(files(runHarness(o).report));
    expect(r.report.faults.first[0]?.seed).toBe(
      runHarness(o).report.faults.first[0]?.seed,
    );
    expect(r.report.faults.byKind.assertion).toBeGreaterThan(0);
  }, 60_000);
});
