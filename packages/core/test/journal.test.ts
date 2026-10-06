import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  canAgeUp,
  choose,
  describePending,
  newLife,
  type World,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "..", "..", "..", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

/** Age up, answering any prompt with the first enabled choice, until the life ends or `years` pass. */
function live(seed: number, years: number, pick = 0): World {
  let w = newLife(bundles, seed);
  for (let i = 0; i < years && !w.ended; i++) {
    w = ageUp(w, bundles).world;
    while (w.pending && !w.ended) {
      const view = describePending(w, bundles);
      const c =
        view?.choices.find((x) => x.index >= pick && x.enabled) ??
        view?.choices.find((x) => x.enabled);
      if (!c) break;
      w = choose(w, bundles, c.index).world;
    }
  }
  return w;
}

describe("journal", () => {
  test("every age from 1 to the end of the life has a group", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = live(seed, 100);
      const last = w.journal.at(-1)?.age ?? 0;
      const ages = new Set(w.journal.map((e) => e.age));
      for (let a = 1; a <= last; a++)
        expect(ages.has(a), `age ${a}`).toBe(true);
      expect(last).toBeGreaterThan(1);
    }
  });

  test("a resolved choice journals the option, the outcome and its deltas", () => {
    // Find a seed whose life opens `cheat-on-test`, then take "Peek".
    for (let seed = 1; seed < 400; seed++) {
      let w = newLife(bundles, seed);
      for (let i = 0; i < 18 && !w.ended; i++) {
        w = ageUp(w, bundles).world;
        if (w.pending?.storyletId === "core-loop/cheat-on-test") {
          const peek = describePending(w, bundles)?.choices.find(
            (c) => c.label === "Peek",
          );
          expect(peek).toBeDefined();
          const lines = choose(w, bundles, peek?.index ?? 0).lines;
          expect(lines).toContain("You chose: Peek");
          const outcome = lines.find((l) =>
            /guilty stomach|teacher notices/.test(l),
          );
          expect(outcome).toMatch(/Happiness \u2212\d+\)$/);
          return;
        }
        while (w.pending && !w.ended) {
          const view = describePending(w, bundles);
          const c = view?.choices.find((x) => x.enabled);
          if (!c) break;
          w = choose(w, bundles, c.index).world;
        }
      }
    }
    throw new Error("no seed reached cheat-on-test");
  });

  test("each step of a next: chain is journaled", () => {
    for (let seed = 1; seed < 3000; seed++) {
      let w = newLife(bundles, seed);
      for (let i = 0; i < 18 && !w.ended; i++) {
        w = ageUp(w, bundles).world;
        while (w.pending && !w.ended) {
          const view = describePending(w, bundles);
          if (w.pending.storyletId === "core-loop/cheat-on-test") {
            const peek = view?.choices.find((c) => c.label === "Peek");
            const r = choose(w, bundles, peek?.index ?? 0);
            if (r.world.pending?.storyletId === "core-loop/cheat-caught") {
              expect(
                r.lines.some((l) => l.includes("The teacher notices.")),
              ).toBe(true);
              const own = describePending(r.world, bundles)?.choices.find(
                (c) => c.label === "Own up",
              );
              const r2 = choose(r.world, bundles, own?.index ?? 0);
              expect(r2.lines).toContain("You chose: Own up");
              expect(
                r2.lines.some((l) => l.startsWith("The punishment is lighter")),
              ).toBe(true);
              return;
            }
          }
          const c = view?.choices.find((x) => x.enabled);
          if (!c) break;
          w = choose(w, bundles, c.index).world;
        }
      }
    }
    throw new Error("no seed reached the cheat chain");
  });

  test("every core-loop choice outcome has text", () => {
    const missing: string[] = [];
    for (const b of bundles)
      for (const s of b.storylets)
        for (const [ci, c] of s.choices.entries())
          for (const [oi, o] of c.outcomes.entries())
            if (o.text === undefined)
              missing.push(`${s.id} choice ${ci} outcome ${oi}`);
    expect(missing).toEqual([]);
  });

  test("canAgeUp stays true after quiet years", () => {
    expect(canAgeUp(newLife(bundles, 1))).toBe(true);
  });
});
