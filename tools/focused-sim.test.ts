import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadProfiles } from "../packages/harness/src/index.ts";
import { compilePacks } from "../packages/pack-tools/src/index.ts";
import {
  type Analysis,
  outside,
  planRuns,
  renderMarkdown,
  run,
} from "./focused-sim.ts";
import { parseSheet } from "./lib/sheet.ts";
import { runTool, toolNames } from "./run.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures", "focused-sim");
const REAL = join(HERE, "..", "packs");

async function capture(
  args: string[],
): Promise<{ status: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const out = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((c: string | Uint8Array) => {
      stdout += String(c);
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((c: string | Uint8Array) => {
      stderr += String(c);
      return true;
    });
  try {
    return { status: await run(args), stdout, stderr };
  } finally {
    out.mockRestore();
    errSpy.mockRestore();
  }
}

const json = (stdout: string): Analysis => JSON.parse(stdout) as Analysis;

describe("focused-sim", () => {
  it("is a registered tool", () => {
    expect(toolNames()).toContain("focused-sim");
  });

  it("allows a measured mean inside the band, with slack for the sample", () => {
    expect(outside(1, 0, 0.5, 1.5)).toBeNull();
    expect(outside(0.45, 0.1, 0.5, 1.5)).toBeNull();
    expect(outside(0.1, 0.01, 0.5, 1.5)).toBe("low");
    expect(outside(2, 0.1, 0.5, 1.5)).toBe("high");
    expect(outside(10, 1, 0.5, 1.5)).toBe("high");
  });

  it("plans the baseline, the Pack's own profiles and the sheet's profile, once each", () => {
    const compiled = compilePacks(REAL, { only: ["gambling"] });
    if (!compiled.ok) throw new Error("gambling does not compile");
    const { profiles } = loadProfiles(REAL, compiled.bundles);
    expect(planRuns(profiles, "gambling", undefined)).toEqual([
      { roles: ["baseline"], profiles: ["random"] },
      { roles: ["focused"], profiles: ["gambler"] },
    ]);
    const parsed = parseSheet(
      "# Content sheet: x\n\n- pack: gambling\n- packs: gambling\n- profile: gambler\n\n## s\n- trigger: event\n- chance: 1%\n- text: t\n\n### outcomes\n- outcome: 1\n  - text: o\n",
    );
    if (!parsed.ok) throw new Error("sheet does not parse");
    expect(planRuns(profiles, "gambling", parsed.sheet)).toEqual([
      { roles: ["baseline"], profiles: ["random"] },
      { roles: ["focused", "sheet"], profiles: ["gambler"] },
    ]);
  });

  it("matches a sheet whose rates fit the gambling Pack and flags nothing", async () => {
    const r = await capture([
      "--pack",
      "gambling",
      "--sheet",
      join(FIXTURES, "gambling-ok.md"),
      "--budget",
      "0",
      "--jobs",
      "4",
      "--format",
      "json",
    ]);
    expect(r.status).toBe(0);
    const a = json(r.stdout);
    expect(a.flags).toEqual([]);
    expect(a.runs.map((x) => x.lives)).toEqual([60, 60]);
    expect(a.rates.map((x) => x.storylet)).toEqual([
      "gambling/hot-tip",
      "gambling/play-slots",
    ]);
  }, 120_000);

  it("flags a sheet that is off by 10x and a storylet the Pack lacks, and still exits 0", async () => {
    const r = await capture([
      "--pack",
      "gambling",
      "--sheet",
      join(FIXTURES, "gambling-off-by-10x.md"),
      "--budget",
      "0",
      "--jobs",
      "4",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/- \*\*off-band\*\* `gambling\/hot-tip`: opens/);
    expect(r.stdout).toMatch(/`gambling\/play-slots` o5: outcome o5 picked/);
    expect(r.stdout).toMatch(
      /- \*\*not-in-pack\*\* `gambling\/ghost-storylet`/,
    );
    expect(r.stdout).toContain("**FLAG**");
  }, 120_000);

  it("stops at the time budget and reports the lives played", async () => {
    const t = performance.now();
    const r = await capture([
      "--pack",
      "gambling",
      "--budget",
      "3",
      "--jobs",
      "4",
      "--format",
      "json",
    ]);
    expect(r.status).toBe(0);
    const a = json(r.stdout);
    for (const x of a.runs) {
      expect(x.lives).toBeGreaterThan(0);
      expect(x.lives).toBeLessThan(x.requested);
    }
    expect(renderMarkdown(a)).toContain("stopped at the time budget");
    expect((performance.now() - t) / 1000).toBeLessThan(20);
  }, 60_000);

  it("runs the gambling Pack under 20 s with the default budget", async () => {
    const t = performance.now();
    const r = await capture(["--pack", "gambling", "--format", "json"]);
    expect(r.status).toBe(0);
    expect(json(r.stdout).runs.length).toBeGreaterThan(0);
    expect((performance.now() - t) / 1000).toBeLessThan(20);
  }, 60_000);

  it("exits 2 on a usage error or an unknown Pack", async () => {
    expect((await capture([])).status).toBe(2);
    expect((await capture(["--pack", "nope"])).status).toBe(2);
    expect(
      (await capture(["--pack", "gambling", "--sheet", "/no/such.md"])).status,
    ).toBe(2);
    expect(await runTool(["focused-sim", "--bogus"])).toBe(2);
  });
});
