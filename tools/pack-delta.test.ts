import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { run } from "./pack-delta.ts";

const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "pack-delta",
);
const BASE = join(FIX, "base.json");
const NEW = join(FIX, "new.json");

function capture(args: string[]): { status: number; stdout: string } {
  let stdout = "";
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    });
  try {
    return { status: run(args), stdout };
  } finally {
    spy.mockRestore();
  }
}

describe("pack-delta", () => {
  it("renders the fixture diff as markdown", () => {
    const { status, stdout } = capture([BASE, NEW]);
    expect(status).toBe(0);
    expect(stdout).toMatchSnapshot();
  });

  it("groups by Pack and flags what passed a threshold", () => {
    const { stdout } = capture([BASE, NEW, "--format", "json"]);
    const d = JSON.parse(stdout);
    expect(d.packs.map((p: { pack: string }) => p.pack)).toEqual([
      "gambling",
      "jobs",
    ]);
    const jobs = d.packs[1].fireRates;
    // promotion 0.50 -> 0.52 is +4%: under the 10% threshold; layoff doubles.
    expect(
      jobs.map((c: { key: string; flagged: boolean }) => [c.key, c.flagged]),
    ).toEqual([
      ["jobs/layoff", true],
      ["jobs/promotion", false],
    ]);
    // an unchanged storylet is not listed
    expect(JSON.stringify(d)).not.toContain("core-loop/birthday");
    // outcome shares: old-age -10 points, gambling-debt appears
    expect(
      d.outcomes.map((c: { key: string; flagged: boolean }) => [
        c.key,
        c.flagged,
      ]),
    ).toEqual([
      ["gambling-debt", true],
      ["old-age", true],
    ]);
  });

  it("--pack restricts the Pack sections", () => {
    const d = JSON.parse(
      capture([BASE, NEW, "--pack", "jobs", "--format", "json"]).stdout,
    );
    expect(d.packs.map((p: { pack: string }) => p.pack)).toEqual(["jobs"]);
  });

  it("exits 1 on breach only with --fail-on-breach", () => {
    expect(capture([BASE, NEW]).status).toBe(0);
    expect(capture([BASE, NEW, "--fail-on-breach"]).status).toBe(1);
    expect(capture([BASE, BASE, "--fail-on-breach"]).status).toBe(0);
  });

  it("exits 2 on a usage error", () => {
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      expect(run([BASE])).toBe(2);
      expect(run([BASE, NEW, "--format", "xml"])).toBe(2);
      expect(run([BASE, join(FIX, "missing.json")])).toBe(2);
    } finally {
      err.mockRestore();
    }
  });
});
