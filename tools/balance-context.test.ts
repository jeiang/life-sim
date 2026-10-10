import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Report } from "../packages/harness/src/index.ts";
import { balanceContext, run } from "./balance-context.ts";
import { runTool, toolNames } from "./run.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "balance-context", "report.json");
const report = JSON.parse(readFileSync(FIXTURE, "utf8")) as Report;

function capture(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const o = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((c: string | Uint8Array) => {
      stdout += String(c);
      return true;
    });
  const e = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((c: string | Uint8Array) => {
      stderr += String(c);
      return true;
    });
  try {
    return { status: run(args), stdout, stderr };
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

describe("balance-context", () => {
  it("is a listed tool", () => {
    expect(toolNames()).toContain("balance-context");
    expect(typeof runTool).toBe("function");
  });

  it("prints the global numbers in under 40 lines", () => {
    const lines = balanceContext(report);
    expect(lines.length).toBeLessThan(40);
    expect(lines).toMatchInlineSnapshot(`
      [
        "300 lives, no engine faults",
        "death age: median 71, p10 52, p90 91 (0 unfinished)",
        "net worth, median (major units): at 40 267707, at 65 1270634",
        "employment share (ages 25-64): 71.5%",
        "decision slots, years with >=1 / >=2 / >=3: 90.2% / 49.4% / 28.6% (target 90 / 50 / 30)",
        "decision share by storylet, top 5 of 6 (2700 decisions; 6 over 3%): core-loop/everyday-stress-choice 25.93% OVER, core-loop/job-offer 22.22% OVER, core-loop/lend-money 18.52% OVER, core-loop/pick-a-fight 14.81% OVER, core-loop/study-group 11.11% OVER",
        "yearly cap hits: 12 chance hits dropped (0.1% of years)",
        "top storylet: core-loop/everyday-stress, 37.6% of 25618 fires",
        "storylets never fired: 0 of 270",
        "pack gambling: 3 declared metrics, 12 cap drops (--pack gambling)",
      ]
    `);
  });

  it("matches harness-summary.mjs where they overlap", () => {
    const md = execFileSync(
      "node",
      [
        join(HERE, "..", ".github", "scripts", "harness-summary.mjs"),
        FIXTURE,
        "",
        "1",
        "0",
        "https://example.invalid",
      ],
      { encoding: "utf8" },
    );
    const cell = (name: string): string =>
      md
        .split("\n")
        .find((l) => l.startsWith(`| ${name} |`))
        ?.split("|")[2]
        ?.trim() ?? "";
    const out = balanceContext(report).join("\n");
    expect(out).toContain(`median ${cell("median age at death")},`);
    const [p10, p90] = cell("p10 / p90 age at death").split(" / ");
    expect(out).toContain(`p10 ${p10}, p90 ${p90}`);
    expect(out).toContain(`at 40 ${cell("median net worth at 40")}`);
    expect(out).toContain(`at 65 ${cell("median net worth at 65")}`);
    expect(out).toContain(`${cell("employment rate %")}%`);
    expect(out).toContain(`never fired: ${cell("storylets never fired")} of`);
  });

  it("adds the Pack's declared metrics and cap drops with --pack", () => {
    const lines = balanceContext(report, "gambling");
    expect(lines.length).toBeLessThan(40);
    expect(lines.slice(9)).toMatchInlineSnapshot(`
      [
        "pack gambling: 12 chance hits dropped by the yearly cap",
        "  gambled: 84.7%",
        "  stakes_per_gambler: 400000 (median)",
        "  return: gambling/bet-on-horse-races 98.6%, gambling/buy-lottery-ticket 47.4%, gambling/play-baccarat 91.3%, gambling/play-blackjack 71.4% (+4 more)",
      ]
    `);
  });

  it("run: exit codes", () => {
    expect(capture([FIXTURE]).status).toBe(0);
    expect(capture([FIXTURE, "--pack", "gambling"]).status).toBe(0);
    expect(capture([]).status).toBe(2);
    expect(capture([FIXTURE, "--bogus"]).status).toBe(2);
    const missing = capture([join(HERE, "nope.json")]);
    expect(missing.status).toBe(1);
    const noPack = capture([FIXTURE, "--pack", "nothing"]);
    expect(noPack.status).toBe(1);
    expect(noPack.stderr).toContain("nothing");
  });
});
