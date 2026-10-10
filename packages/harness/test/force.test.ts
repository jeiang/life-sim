import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePacks, type Diagnostic, parseYaml } from "@life/pack-tools";
import { afterEach, describe, expect, test } from "vitest";
import {
  compileScript,
  forceSetOf,
  loadScripts,
  parseForceArg,
  SCRIPTED_ID,
} from "../src/force.ts";
import { runHarness, runLives } from "../src/harness.ts";
import { runHarnessParallel } from "../src/parallel.ts";
import { loadProfiles } from "../src/profile-spec.ts";
import { renderMarkdown } from "../src/report.ts";
import { forceRolls } from "../src/testing.ts";

const fixture = join(
  fileURLToPath(new URL("./fixtures", import.meta.url)),
  "meteor",
);

function setup(dir: string, only?: string[]) {
  const c = compilePacks(dir, only ? { only } : {});
  if (!c.ok) throw new Error(c.diagnostics.map((d) => d.message).join("; "));
  const reg = loadProfiles(dir, c.bundles);
  expect(reg.diagnostics).toEqual([]);
  const scripts = loadScripts(dir, c.bundles, reg.profiles);
  expect(scripts.diagnostics).toEqual([]);
  return {
    bundles: c.bundles,
    profileSpecs: reg.profiles,
    scripts: scripts.scripts,
  };
}

const meteorDeaths = (cause: string | undefined) => cause === "meteor";

describe("forced script on a rare branch", () => {
  const { bundles, profileSpecs, scripts } = setup(fixture);
  const script = scripts.find((s) => s.name === "base/meteor");
  const force = forceSetOf(script, []);
  const lives = 24;

  test("unforced, the one-in-10,000 branch does not fire in the lives", () => {
    const { report } = runHarness({
      bundles,
      profileSpecs,
      lives,
      profiles: ["idle"],
      seed: 3,
    });
    expect(report.death.causes.meteor ?? 0).toBe(0);
  });

  test("the script makes it fire in every life, and the report says so", () => {
    expect(script?.entries).toHaveLength(3);
    const results = runLives(
      bundles,
      {
        lives,
        profiles: [SCRIPTED_ID],
        profileSpecs,
        seed: 3,
        force,
      },
      0,
      lives,
    );
    expect(results).toHaveLength(lives);
    for (const r of results) {
      expect(r.faults).toEqual([]);
      expect(meteorDeaths(r.death?.cause)).toBe(true);
      expect(r.forced?.every((n) => n > 0)).toBe(true);
    }
    const { report, forced } = runHarness({
      bundles,
      profileSpecs,
      lives,
      profiles: [SCRIPTED_ID],
      seed: 3,
      force,
    });
    expect(forced?.neverMatched).toEqual([]);
    expect(forced?.entries.map((e) => e.lives)).toEqual([lives, lives, lives]);
    const md = renderMarkdown(report, {
      seed: 3,
      profiles: [SCRIPTED_ID],
      forced,
    });
    expect(md).toContain("FORCED RUN");
    expect(md).toContain("roll base/meteor = hit (age 1)");
  });

  test("worker threads apply the same overrides: identical to a single thread", async () => {
    const dir = mkdtempSync(join(tmpdir(), "harness-meteor-"));
    cpSync(fixture, dir, { recursive: true });
    const opts = {
      bundles,
      profileSpecs,
      lives: 40,
      profiles: [SCRIPTED_ID],
      seed: 9,
      force,
    };
    const single = runHarness(opts);
    const multi = await runHarnessParallel({ ...opts, packsDir: dir, jobs: 2 });
    expect(multi.forced).toEqual(single.forced);
    expect(multi.report).toEqual(single.report);
    expect(single.report.death.causes.meteor).toBe(40);
  });

  test("a forced entry that never matches is reported", () => {
    const { forced } = runHarness({
      bundles,
      profileSpecs,
      lives: 3,
      profiles: [SCRIPTED_ID],
      seed: 3,
      force: {
        entries: [
          {
            kind: "roll",
            key: "base/meteor",
            age: 150,
            rolls: { chance: true },
            label: "never",
          },
        ],
      },
    });
    expect(forced?.neverMatched).toEqual(["never"]);
  });

  test("the forceRolls helper forces a roll while a test plays Core", () => {
    const handle = forceRolls({
      "base/meteor": "hit",
      "outcome/base/meteor": "A meteor strikes.",
    });
    try {
      const [life] = runLives(
        bundles,
        { lives: 1, profiles: ["idle"], profileSpecs, seed: 5 },
        0,
        1,
      );
      expect(meteorDeaths(life?.death?.cause)).toBe(true);
      expect(handle.fired["base/meteor"]).toBeGreaterThan(0);
    } finally {
      handle.clear();
    }
    const [after] = runLives(
      bundles,
      { lives: 1, profiles: ["idle"], profileSpecs, seed: 5 },
      0,
      1,
    );
    expect(meteorDeaths(after?.death?.cause)).toBe(false);
  });
});

describe("force validation", () => {
  const { bundles, profileSpecs } = setup(fixture);

  test("--force with an unknown key fails", () => {
    const bad = parseForceArg("outcome/base/metoer=0", bundles);
    expect(bad.entries).toEqual([]);
    expect(bad.diagnostics[0]?.message).toContain("no storylet 'base/metoer'");
    expect(parseForceArg("nonsense=hit", bundles).diagnostics).toHaveLength(1);
    expect(parseForceArg("base/meteor", bundles).diagnostics).toHaveLength(1);
  });

  test("--force parses values, ages and several keys", () => {
    const ok = parseForceArg(
      "base/meteor=hit,5:outcome/base/meteor=1,pack/base/x/0=int:2,outcome/base/meteor=A meteor strikes.",
      bundles,
    );
    expect(ok.diagnostics).toEqual([]);
    expect(
      ok.entries.map((e) => (e.kind === "roll" ? [e.age, e.rolls] : null)),
    ).toEqual([
      [undefined, { chance: true }],
      [5, { pick: 1 }],
      [undefined, { int: 2 }],
      [undefined, { pick: "A meteor strikes." }],
    ]);
  });

  test("a script with an unknown key, action or profile fails", () => {
    const check = (text: string) => {
      const diags: Diagnostic[] = [];
      const src = parseYaml("x.yaml", text, diags);
      if (!src) throw new Error("bad yaml");
      return compileScript("base", "base/x", src, bundles, profileSpecs)
        .diagnostics;
    };
    expect(
      check("steps:\n  - roll: outcome/base/metoer\n    value: 0\n")[0]
        ?.message,
    ).toContain("no storylet");
    expect(
      check("steps:\n  - age: 1\n    do: nothing\n")[0]?.message,
    ).toContain("no action");
    expect(
      check("profile: nobody\nsteps:\n  - choose: x\n")[0]?.message,
    ).toContain("unknown profile");
    expect(check("steps:\n  - roll: base/meteor\n")[0]?.message).toContain(
      "value",
    );
    expect(check("steps: []\n")).toHaveLength(1);
  });
});

describe("the Packs' example scripts", () => {
  const dir = fileURLToPath(new URL("../../../packs", import.meta.url));

  test("gambling/bust makes every slots spin the gambler plays a loss", () => {
    const { bundles, profileSpecs, scripts } = setup(dir, ["gambling"]);
    const script = scripts.find((s) => s.name === "gambling/bust");
    expect(script).toBeDefined();
    const opts = {
      bundles,
      profileSpecs,
      lives: 6,
      profiles: [script?.profile ?? SCRIPTED_ID],
      seed: 4,
      force: forceSetOf(script, []),
    };
    const results = runLives(bundles, opts, 0, opts.lives);
    let spins = 0;
    for (const r of results) {
      expect(r.faults).toEqual([]);
      const played = r.fires["gambling/play-slots"] ?? 0;
      spins += played;
      expect(r.forced?.[0]).toBe(played);
    }
    expect(spins).toBeGreaterThan(0);
    expect(runHarness(opts).forced?.neverMatched).toEqual([]);
    expect(runLives(bundles, opts, 0, opts.lives)).toEqual(results);
  }, 60_000);

  test("vacations/accident ends beach holidays in the travel accident", () => {
    const { bundles, profileSpecs, scripts } = setup(dir, ["vacations"]);
    const script = scripts.find((s) => s.name === "vacations/accident");
    expect(script).toBeDefined();
    const { report, forced } = runHarness({
      bundles,
      profileSpecs,
      lives: 24,
      profiles: [script?.profile ?? SCRIPTED_ID],
      seed: 4,
      force: forceSetOf(script, []),
    });
    expect(forced?.neverMatched).toEqual([]);
    expect(report.faults.total).toBe(0);
    expect(report.death.causes["travel accident"]).toBeGreaterThan(0);
  });
});

afterEach(() => forceRolls({}).clear());
