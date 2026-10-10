import { describe, expect, it } from "vitest";
import { exampleSheet } from "./example-sheet.ts";
import { parseBand, parseSheet } from "./sheet.ts";

const HEAD = "# Content sheet: T\n\n- pack: p\n- packs: p\n\n";
const BODY =
  "- trigger: event\n- chance: 1%\n- text: hi\n\n### outcomes\n- outcome: 1\n  - text: ok\n";

function errorsOf(text: string): string[] {
  const r = parseSheet(text);
  if (r.ok) return [];
  return r.errors.map((e) => `${e.line}: ${e.message}`);
}

describe("parseSheet", () => {
  it("parses the worked example with line numbers", () => {
    const r = parseSheet(exampleSheet());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.sheet;
    expect(s.pack).toBe("core-loop");
    expect(s.lives).toBe(1000);
    expect(s.storylets.map((x) => x.id)).toEqual([
      "bully-at-school",
      "bully-showdown",
      "bully-aftermath",
    ]);
    const first = s.storylets[0];
    expect(first?.opens).toMatchObject({ lo: 0.6, hi: 0.95 });
    expect(first?.choices.map((c) => c.label.value)).toEqual([
      "Stand up to them",
      "Tell a teacher",
      "Keep your head down",
    ]);
    const tell = first?.choices[1]?.outcomes;
    expect(tell?.map((o) => o.weight.value)).toEqual(["70", "30"]);
    expect(tell?.[0]?.rate).toMatchObject({ lo: 65, hi: 75 });
    expect(tell?.[0]?.effects.map((e) => e.value)).toEqual([
      "stat.happiness += 2",
    ]);
    expect(s.storylets[2]?.outcomes).toHaveLength(3);
    expect(s.storylets[1]?.fields.chance?.value).toBe("0%");
    expect(first?.line).toBeGreaterThan(1);
  });

  it("ignores notes and blank lines and trailing spaces", () => {
    expect(errorsOf(`${HEAD}> note\n## a  \n${BODY}`)).toEqual([]);
  });

  it("reports a line that matches no form", () => {
    expect(errorsOf(`${HEAD}## a\n${BODY}stray line\n`)).toEqual([
      "14: line matches no form of the grammar: stray line",
    ]);
  });

  it("applies the event and action rules", () => {
    const e = (body: string) => errorsOf(`${HEAD}## a\n${body}`);
    expect(e(BODY.replace("- chance: 1%\n", ""))).toEqual([
      "6: event 'a' needs `chance` or `weight`",
    ]);
    expect(
      e(BODY.replace("chance: 1%", "chance: 1%\n- weight: 2"))[0],
    ).toContain("exactly one");
    const action = BODY.replace("event", "action").replace(
      "- chance: 1%\n",
      "",
    );
    expect(e(action).join("\n")).toContain("missing required field 'menu'");
    expect(e(action).join("\n")).toContain("missing required field 'label'");
    expect(e(BODY.replace("1%", "1.234%"))[0]).toContain("percent literal");
  });

  it("rejects a repeated key, an empty value and a missing outcome text", () => {
    expect(errorsOf(`${HEAD}## a\n- text: x\n${BODY}`)[0]).toContain(
      "appears twice",
    );
    expect(errorsOf(`${HEAD}## a\n- when:\n${BODY}`)[0]).toContain(
      "empty value",
    );
    expect(
      errorsOf(`${HEAD}## a\n${BODY.replace("  - text: ok\n", "")}`),
    ).toEqual(["12: outcome is missing required key 'text'"]);
  });

  it("requires the pack headers and a band for rates", () => {
    expect(
      errorsOf(`# Content sheet: T\n\n## a\n${BODY}`).join("\n"),
    ).toContain("missing required header 'pack'");
    expect(
      errorsOf(
        `${HEAD}## a\n${BODY.replace("- outcome: 1", "- outcome: 1\n  - rate: 50%")}`,
      )[0],
    ).toContain("must be a band");
  });

  it("parses bands", () => {
    expect(parseBand("0.5..2 per life", "per life")).toEqual({
      lo: 0.5,
      hi: 2,
    });
    expect(parseBand("100..100%", "%")).toEqual({ lo: 100, hi: 100 });
    expect(parseBand("3..2%", "%")).toBeUndefined();
    expect(parseBand("5%", "%")).toBeUndefined();
  });
});
