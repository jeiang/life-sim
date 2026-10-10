import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { Analyzer, BOOL, point } from "./lint/interval.ts";
import { RULES } from "./lint/rules.ts";
import { lintPacks, renderMarkdown, run } from "./lint.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures", "lint");
const REAL = join(HERE, "..", "packs");

const report = lintPacks(FIXTURES);
/** `code subject path`, for comparing findings without their prose. */
const keys = (r = report) =>
  r.findings.map((f) => `${f.code} ${f.subject}${f.path ? ` ${f.path}` : ""}`);

function capture(args: string[]): { status: number; stdout: string } {
  let stdout = "";
  const out = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    });
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return { status: run(args), stdout };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

describe("lint fixtures: one bug per rule", () => {
  it("finds exactly the planted bugs and nothing in the controls", () => {
    expect(keys()).toEqual([
      "L008 lintfix/big-chance chance",
      "L004 lintfix/chain-into-dead outcomes[0].next",
      "L001 lintfix/dead-contradiction when",
      "L001 lintfix/dead-range when",
      "L002 lintfix/ghost-gate when",
      "L009 lintfix/loop-a",
      "L009 lintfix/loop-b",
      "L007 lintfix/money-printer",
      "L003 lintfix/orphan-chain",
      "L007 lintfix/stingy-wager",
      "L005 lintfix/zero-chance chance",
      "L005 lintfix/zero-outcome outcomes[1].weight",
      "L006 quality.ghost",
      "L006 quality.orphan",
      "L000 lintfix/nothing-here",
    ]);
  });

  it("covers every rule code", () => {
    const codes = new Set(report.findings.map((f) => f.code));
    expect([...codes].sort()).toEqual(Object.keys(RULES).sort());
  });

  it("gives each finding a rule name, a severity and a one-line hint", () => {
    for (const f of report.findings) {
      expect(f.rule).toBe(RULES[f.code]?.name);
      expect(f.hint).not.toContain("\n");
      expect(f.hint.length).toBeGreaterThan(0);
    }
  });

  it("grades wagers: above the band is an error, below it a warning", () => {
    const w = (s: string) => report.findings.find((f) => f.subject === s);
    expect(w("lintfix/money-printer")?.severity).toBe("error");
    expect(w("lintfix/money-printer")?.message).toContain("200.0%");
    expect(w("lintfix/stingy-wager")?.severity).toBe("warning");
    expect(w("lintfix/stingy-wager")?.message).toContain("20.0%");
    expect(keys()).not.toContain("L007 lintfix/fair-wager");
  });

  it("names the gate quality that nothing writes", () => {
    const f = report.findings.find((x) => x.code === "L002");
    expect(f?.message).toContain("quality.ghost");
  });

  it("applies lint.yaml: allowed findings leave the list, unused entries are stale", () => {
    expect(report.allowed.map((f) => f.subject)).toEqual([
      "lintfix/allowed-dead",
    ]);
    expect(keys()).not.toContain("L001 lintfix/allowed-dead when");
    expect(report.findings.find((f) => f.code === "L000")?.severity).toBe(
      "warning",
    );
  });

  it("counts errors and warnings", () => {
    expect(report.summary).toEqual({ errors: 10, warnings: 5, allowed: 1 });
  });

  it("filters by Pack without losing cross-Pack analysis", () => {
    expect(lintPacks(FIXTURES, ["lintfix"]).findings).toEqual(report.findings);
  });
});

describe("output", () => {
  it("renders short markdown, one bullet per finding with its fix", () => {
    const md = renderMarkdown(report);
    expect(
      md.startsWith("# Lint: 10 error(s), 5 warning(s), 1 allowed\n"),
    ).toBe(true);
    expect(md.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(15);
    expect(md).toContain("- error L002 `lintfix/ghost-gate when`");
    expect(md).toContain("Fix: add the effect that sets the gate quality");
  });

  it("emits json with --format json and exits 1 on errors", () => {
    const { status, stdout } = capture([
      "--packs-dir",
      FIXTURES,
      "--format",
      "json",
    ]);
    expect(status).toBe(1);
    expect(JSON.parse(stdout)).toEqual(JSON.parse(JSON.stringify(report)));
  });

  it("is deterministic", () => {
    expect(renderMarkdown(lintPacks(FIXTURES))).toBe(renderMarkdown(report));
  });

  it("rejects bad arguments with status 2", () => {
    expect(capture(["--format", "xml"]).status).toBe(2);
    expect(capture(["--nope"]).status).toBe(2);
    expect(capture(["--packs", "nope", "--packs-dir", FIXTURES]).status).toBe(
      2,
    );
  });
});

describe("the real Packs", () => {
  it("lint without errors or warnings", () => {
    const r = lintPacks(REAL);
    expect(keys(r)).toEqual([]);
    expect(capture([]).status).toBe(0);
  });
});

describe("interval analysis", () => {
  const a = new Analyzer((n) =>
    n === "x"
      ? { lo: 0, hi: 10 }
      : n === "f"
        ? BOOL
        : { lo: -Infinity, hi: Infinity },
  );
  const ev = (e: Parameters<Analyzer["ev"]>[0]) => a.ev(e, new Map());

  it("proves comparisons from ranges", () => {
    expect(ev([">", ["v", "x"], 10])).toEqual(point(0));
    expect(ev([">=", ["v", "x"], 0])).toEqual(point(1));
    expect(ev(["<", ["v", "x"], 5])).toEqual(BOOL);
  });

  it("narrows through and, so contradictions are proved", () => {
    expect(ev(["and", [">", ["v", "x"], 5], ["<", ["v", "x"], 3]])).toEqual(
      point(0),
    );
    expect(ev(["and", ["v", "f"], ["not", ["v", "f"]]])).toEqual(point(0));
    expect(ev(["or", ["v", "f"], ["not", ["v", "f"]]])).toEqual(point(1));
  });

  it("does not prove what it cannot", () => {
    expect(ev([">", ["v", "unknown"], 5])).toEqual(BOOL);
    expect(ev(["/", ["v", "x"], ["v", "unknown"]])).toEqual({
      lo: -Infinity,
      hi: Infinity,
    });
  });
});
