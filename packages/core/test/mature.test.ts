import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  choose,
  describePending,
  deserializeWorld,
  isMature,
  newLife,
  replay,
  runAction,
  serializeWorld,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "mature"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const play = (mature: boolean) => {
  let w = newLife(bundles, 7, mature ? { mature } : {});
  w = runAction(w, bundles, "life/night").world;
  const view = describePending(w, bundles);
  w = choose(w, bundles, 0).world;
  return { w, view };
};
const lines = (w: ReturnType<typeof newLife>) =>
  w.journal.flatMap((e) => e.lines).join("|");

describe("18+ mode text variants", () => {
  test("a plain life reads the plain text", () => {
    const { w, view } = play(false);
    expect(isMature(w)).toBe(false);
    expect(view?.text).toBe("A quiet night.");
    expect(view?.choices[0]?.label).toBe("Stay in");
    expect(lines(w)).toContain("You chose: Stay in");
    expect(lines(w)).toContain("You rest.");
  });

  test("a life begun with 18+ mode reads the variants", () => {
    const { w, view } = play(true);
    expect(isMature(w)).toBe(true);
    expect(view?.text).toBe("A wild night.");
    expect(view?.choices[0]?.label).toBe("Go out");
    expect(lines(w)).toContain("You chose: Go out");
    expect(lines(w)).toContain("You party.");
  });

  test("the flag lives in the life: it survives save and replay, not settings", () => {
    const { w } = play(true);
    const back = deserializeWorld(serializeWorld(w));
    expect(isMature(back)).toBe(true);
    const again = replay(w.seed, bundles, w.choiceLog);
    expect(isMature(again)).toBe(true);
    expect(worldHash(again)).toBe(worldHash(w));
    expect(worldHash(play(false).w)).not.toBe(worldHash(w));
  });
});

describe("18+ mode is not an expression name", () => {
  const pack = (when: string) => {
    const r = compilePacks(join(HERE, "fixtures", "mature-bad", when));
    return r.ok ? [] : r.diagnostics.map((d) => d.message);
  };
  test.each(["when", "effect"])("rejected in %s", (dir) => {
    expect(pack(dir).join("\n")).toMatch(/unknown name 'mature'.*mature_text/);
  });
});
