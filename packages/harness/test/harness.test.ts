import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePacks } from "@life/pack-tools";
import { describe, expect, test } from "vitest";
import { runHarness } from "../src/harness.ts";
import { runHarnessParallel } from "../src/parallel.ts";
import { loadProfiles, selectProfiles } from "../src/profile-spec.ts";
import { renderMarkdown } from "../src/report.ts";

const fixture = (name: string) =>
  join(fileURLToPath(new URL("./fixtures", import.meta.url)), name);

// The harness workers compile a whole directory, so the real Pack under test is copied into
// a directory of its own: other packs' content cannot break these tests.
const corePackDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "harness-core-loop-"));
  cpSync(
    fileURLToPath(new URL("../../../packs/core-loop", import.meta.url)),
    join(dir, "core-loop"),
    { recursive: true },
  );
  // core-loop requires the karma leaf Pack.
  cpSync(
    fileURLToPath(new URL("../../../packs/karma", import.meta.url)),
    join(dir, "karma"),
    { recursive: true },
  );
  return dir;
};

function bundlesOf(dir: string) {
  const c = compilePacks(dir);
  if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
  return c.bundles;
}

/** The profile registry of a Packs directory (its Packs' `harness/profiles.yaml`). */
function profileSpecsOf(dir: string) {
  const loaded = loadProfiles(dir, bundlesOf(dir));
  expect(loaded.diagnostics).toEqual([]);
  return loaded.profiles;
}

describe("engine fault detection", () => {
  test("an expression division by zero is a fault", () => {
    const { report } = runHarness({
      bundles: bundlesOf(fixture("divzero")),
      profileSpecs: profileSpecsOf(fixture("divzero")),
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
      profileSpecs: profileSpecsOf(fixture("stuck")),
      lives: 4,
      profiles: ["random"],
      seed: 1,
    });
    expect(report.faults.byKind.stuck).toBeGreaterThan(0);
    expect(report.faults.first[0]?.message).toContain("no selectable choice");
  });
});

describe("the core-loop Pack", () => {
  const dir = corePackDir();
  const bundles = bundlesOf(dir);
  const profileSpecs = profileSpecsOf(dir);
  const allNames = profileSpecs.map((p) => p.id);

  test("every profile plays lives to death without a fault, reproducibly", () => {
    const opts = {
      bundles,
      profileSpecs,
      lives: 10,
      profiles: allNames,
      seed: 7,
    };
    const a = runHarness(opts).report;
    const b = runHarness(opts).report;
    expect(a.faults.total).toBe(0);
    expect(a.death.ended).toBe(10);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 60_000);

  test("--life-seed replays one life", () => {
    const { report } = runHarness({
      bundles,
      profileSpecs,
      lives: 1,
      profiles: ["random"],
      seed: 0,
      lifeSeed: 12345,
    });
    expect(report.lives).toBe(1);
  });
});

describe("parallel runs", () => {
  const packsDir = corePackDir();
  const bundles = bundlesOf(packsDir);
  const profileSpecs = profileSpecsOf(packsDir);
  const profiles: string[] = [];
  const opts = { bundles, profileSpecs, lives: 70, profiles, seed: 11 };
  const files = (report: ReturnType<typeof runHarness>["report"]) =>
    JSON.stringify(report) + renderMarkdown(report, { seed: 11, profiles });

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
      profileSpecs: profileSpecsOf(dir),
      lives: 40,
      profiles: ["idle"],
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

describe("declared profiles", () => {
  const dir = fixture("custom-profile");
  const bundles = bundlesOf(dir);
  const profileSpecs = profileSpecsOf(dir);

  test("a profile file in a Pack is a profile; opt-in ones stay out of the default set", () => {
    expect(profileSpecs.map((p) => p.id)).toEqual(["homebody", "hoarder"]);
    expect(selectProfiles(profileSpecs, []).map((p) => p.id)).toEqual([
      "homebody",
    ]);
    const { report } = runHarness({
      bundles,
      profileSpecs,
      lives: 6,
      profiles: ["homebody", "hoarder"],
      seed: 3,
    });
    // The fixture has no mortality, so every life ends at the age cap and nothing else faults.
    expect(Object.keys(report.faults.byKind)).toEqual(["stuck"]);
    expect(Object.keys(report.profiles).sort()).toEqual([
      "hoarder",
      "homebody",
    ]);
  });

  test("an unknown profile name throws", () => {
    expect(() =>
      runHarness({
        bundles,
        profileSpecs,
        lives: 1,
        profiles: ["nope"],
        seed: 1,
      }),
    ).toThrow("unknown profile 'nope'");
  });

  test("a profile's lives do not depend on the other profiles", () => {
    const one = (profiles: string[]) =>
      runHarness({
        bundles,
        profileSpecs,
        lives: 1,
        profiles,
        seed: 0,
        lifeSeed: 99,
      }).report;
    const alone = one(["hoarder"]);
    const beside = one(["hoarder", "homebody"]);
    expect(JSON.stringify(beside)).toBe(JSON.stringify(alone));
  });

  test("the real Packs' profiles are valid and a bad profile file is reported with its path", () => {
    const real = fileURLToPath(new URL("../../../packs", import.meta.url));
    const all = loadProfiles(real, bundlesOf(real));
    expect(all.diagnostics).toEqual([]);
    expect(all.profiles.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "random",
        "studious",
        "spender",
        "idle",
        "grinder",
        "gambler",
      ]),
    );
    const bad = mkdtempSync(join(tmpdir(), "harness-bad-profile-"));
    cpSync(dir, bad, { recursive: true });
    writeFileSync(
      join(bad, "core-loop/harness/profiles.yaml"),
      `profiles:
  broken:
    moves: 1
    bogus: 1
    quit: { quality: no_such_quality, relapse_one_in: 5 }
    rules:
      - ids: ["*/no-such-action"]
        when: { quitting: true }
`,
    );
    const messages = loadProfiles(bad, bundlesOf(bad)).diagnostics.map(
      (d) => `${d.path}: ${d.message}`,
    );
    expect(messages.join("\n")).toContain("unknown key 'bogus'");
    expect(messages.join("\n")).toContain("unknown quality 'no_such_quality'");
    expect(messages.join("\n")).toContain("matches no action");
  });
});
