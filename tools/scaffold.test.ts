import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compilePacks } from "../packages/pack-tools/src/index.ts";
import { exampleSheet } from "./lib/example-sheet.ts";
import { parseSheet } from "./lib/sheet.ts";
import { renderYaml, run, slug } from "./scaffold.ts";

const REAL = join(dirname(fileURLToPath(import.meta.url)), "..", "packs");

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
  const l = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    stdout += `${a.join(" ")}\n`;
  });
  const e = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    stderr += `${a.join(" ")}\n`;
  });
  try {
    return { status: run(args), stdout, stderr };
  } finally {
    o.mockRestore();
    l.mockRestore();
    e.mockRestore();
  }
}

let work: string;
let packs: string;
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "scaffold-"));
  packs = join(work, "packs");
  cpSync(REAL, packs, { recursive: true });
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

function sheetFile(name: string, text: string): string {
  const f = join(work, name);
  writeFileSync(f, text);
  return f;
}

describe("scaffold", () => {
  it("slugs the title", () => {
    expect(slug("School bully!")).toBe("school-bully");
  });

  it("writes YAML for the worked example that passes validate", () => {
    // The example's ids exist in core-loop; rename them so the copy accepts the new ones.
    const f = join(work, "bully.md");
    writeFileSync(f, exampleSheet().replaceAll("bully-", "scuffle-"));
    const r = capture([f, "--pack", "core-loop", "--packs-dir", packs]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const out = join(packs, "core-loop", "storylets", "school-bully.yaml");
    expect(existsSync(out)).toBe(true);
    const yaml = readFileSync(out, "utf8");
    expect(yaml).toContain("- id: scuffle-at-school");
    expect(yaml).toContain("chance: 0%");
    expect(yaml).toContain("    - label: Tell a teacher");
    expect(yaml).toContain("- stat.happiness += 2");
    expect(yaml).toContain(
      'text: "{player.first_name} squares up and the whole corridor goes quiet."',
    );
    expect(yaml).not.toContain("opens");
    expect(yaml).not.toContain("rate");
    const compiled = compilePacks(packs);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.ok).toBe(true);
    const ids = compiled.bundles.flatMap((b) => b.storylets.map((s) => s.id));
    expect(ids).toContain("core-loop/scuffle-aftermath");
    // A second run refuses to overwrite.
    expect(
      capture([f, "--pack", "core-loop", "--packs-dir", packs]).status,
    ).toBe(1);
  });

  it("matches the original bully entries structurally", () => {
    const parsed = parseSheet(exampleSheet());
    if (!parsed.ok) throw new Error("example must parse");
    const orig = compilePacks(REAL)
      .bundles.find((b) => b.id === "core-loop")
      ?.storylets.find((s) => s.id === "core-loop/bully-at-school");
    expect(orig?.trigger).toBe("event");
    expect(renderYaml(parsed.sheet)).toContain(
      "- id: bully-at-school\n  icon: 😠\n  trigger: event\n  weight: 12\n  when: age >= 8 and age <= 16\n  cooldown: 4\n",
    );
  });

  it("refuses the example's own ids against the real Pack, with line numbers", () => {
    const f = sheetFile("dup.md", exampleSheet());
    const r = capture([f, "--pack", "core-loop", "--stdout"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(
      "dup.md:11: storylet id 'bully-at-school' already exists",
    );
  });

  it("refuses an unknown quality, stat, counter and macro with the line", () => {
    const f = sheetFile(
      "bad.md",
      `# Content sheet: Bad

- pack: core-loop
- packs: core-loop

## odd-day
- trigger: event
- weight: 5
- when: quality.nonesuch > 3 and stat.charm >= 1
- text: Odd.

### outcomes
- outcome: 1
  - text: Fine.
  - effect: quality.heat += 2
  - effect: world.nothing += 1
  - effect: core_loop.nope(1)
  - effect: stat.happiness += 1
  - next: missing-step
`,
    );
    const r = capture([f, "--pack", "core-loop", "--packs-dir", packs]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("bad.md:9: unknown quality 'quality.nonesuch'");
    expect(r.stderr).toContain("bad.md:9: unknown stat 'stat.charm'");
    expect(r.stderr).toContain("bad.md:15: unknown quality 'quality.heat'");
    expect(r.stderr).toContain("bad.md:16: unknown counter 'world.nothing'");
    expect(r.stderr).toContain(
      "bad.md:17: unknown effect macro 'core_loop.nope'",
    );
    expect(r.stderr).toContain("bad.md:19: next 'missing-step'");
    expect(r.stderr).not.toContain("stat.happiness");
    expect(existsSync(join(packs, "core-loop", "storylets", "bad.yaml"))).toBe(
      false,
    );
  });

  it("accepts a name the sheet declares in `needs`", () => {
    const f = sheetFile(
      "needs.md",
      `# Content sheet: Heat

- pack: core-loop
- packs: core-loop

## raid
- trigger: event
- weight: 5
- needs: quality heat: integer 0..100, default 0: police attention
- text: Raid.

### outcomes
- outcome: 1
  - text: Fine.
  - effect: quality.heat += 2
`,
    );
    const r = capture([
      f,
      "--pack",
      "core-loop",
      "--packs-dir",
      packs,
      "--stdout",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("- id: raid");
    expect(r.stdout).toContain(
      "quality heat: integer 0..100, default 0: police attention",
    );
  });

  it("usage errors", () => {
    expect(capture([]).status).toBe(2);
    const f = sheetFile("p.md", exampleSheet());
    expect(
      capture([f, "--pack", "gambling", "--packs-dir", packs]).status,
    ).toBe(1);
  });
});
