import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { compilePacks } from "../packages/pack-tools/src/index.ts";
import { runTool, toolNames } from "./run.ts";
import { buildVocab, renderMarkdown, run, type Vocab } from "./vocab.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures", "vocab");
const REAL = join(HERE, "..", "packs");

function vocabOf(dir: string, only?: string[]): Vocab {
  const out = compilePacks(dir, only ? { only } : {});
  expect(out.diagnostics).toEqual([]);
  return buildVocab(out.bundles, dir);
}

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

describe("vocab", () => {
  it("renders the fixture Pack set", async () => {
    await expect(renderMarkdown(vocabOf(FIXTURES))).toMatchFileSnapshot(
      join(FIXTURES, "expected.md"),
    );
  });

  it("takes the comment above or after a declaration as its meaning", () => {
    const v = vocabOf(FIXTURES);
    const q = (id: string) => v.qualities.find((x) => x.id === id);
    expect(q("luck")?.meaning).toBe(
      "Starts at 1 for everyone; luck of the draw in chance events.",
    );
    expect(q("degree")?.meaning).toBe("Finished university.");
    expect(v.personQualities.map((x) => x.id)).toEqual(["kin_grudge"]);
  });

  it("filters by Pack closure", () => {
    expect(vocabOf(FIXTURES, ["core-loop"]).packs).toEqual(["core-loop"]);
    const kin = vocabOf(FIXTURES, ["kin"]);
    expect(kin.packs).toEqual(["core-loop", "kin"]);
    expect(kin.state.map((s) => s.id)).toEqual(["kin_favours", "kin_scandals"]);
    const alone = vocabOf(FIXTURES, ["core-loop"]);
    expect(alone.state).toEqual([]);
    expect(alone.macros.map((m) => m.call)).toEqual(["core_loop.cheer"]);
  });

  it("is deterministic", () => {
    const a = renderMarkdown(vocabOf(FIXTURES));
    expect(renderMarkdown(vocabOf(FIXTURES))).toBe(a);
  });

  it("emits json with --format json", () => {
    const { status, stdout } = capture([
      "--packs-dir",
      FIXTURES,
      "--format",
      "json",
    ]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual(
      JSON.parse(JSON.stringify(vocabOf(FIXTURES))),
    );
  });

  it("rejects bad arguments", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(capture(["--format", "xml"]).status).toBe(2);
      expect(capture(["--nope"]).status).toBe(2);
    } finally {
      err.mockRestore();
    }
  });

  it("keeps the core-loop vocabulary under 600 lines", () => {
    const text = renderMarkdown(vocabOf(REAL, ["core-loop"]));
    expect(text.split("\n").length).toBeLessThan(600);
  });
});

describe("tool runner", () => {
  it("discovers tools by file, not by registry", () => {
    expect(toolNames(HERE)).toContain("vocab");
    expect(toolNames(HERE)).not.toContain("run");
  });

  it("refuses an unknown tool", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runTool(["nope"], HERE)).toBe(2);
      expect(await runTool(["../x"], HERE)).toBe(2);
    } finally {
      err.mockRestore();
    }
  });
});
