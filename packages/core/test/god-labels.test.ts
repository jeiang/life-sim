import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  finishGodStep,
  GodAsk,
  type GodCategory,
  type GodDraw,
  getPerson,
  godPickRoll,
  newLife,
  replay,
  type World,
  withGodAsk,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;

const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];
const WEALTH = ["Poor", "Modest", "Middle", "Comfortable", "Wealthy"];
const isWealthDraw = (d: GodDraw): boolean =>
  d.options?.map((o) => o.label).join("|") === WEALTH.join("|");

/**
 * Run one age-up the way the web driver does: ask with every category on, answer each asked
 * draw, keep the picks in the draft, retry until the step completes.
 */
function ageThrough(
  start: World,
  answer: (d: GodDraw) => number | boolean,
): { world: World; asked: GodDraw[] } {
  let draft = start;
  const asked: GodDraw[] = [];
  for (let round = 0; round < 100; round++) {
    try {
      return {
        world: finishGodStep(ageUp(withGodAsk(draft, ALL), bundles).world),
        asked,
      };
    } catch (e) {
      if (!(e instanceof GodAsk)) throw e;
      for (const d of e.draws) {
        asked.push(d);
        draft = godPickRoll(draft, {
          age: d.age,
          key: d.key,
          n: d.n,
          d: d.d,
          v: answer(d),
        });
      }
    }
  }
  throw new Error("the age-up kept asking");
}

describe("god labels: core-loop bundle", () => {
  test("labelled outcomes compile with their labels", () => {
    const roll = bundles
      .flatMap((b) => b.storylets)
      .find((s) => s.id === "core-loop/roll-family-wealth");
    expect(roll?.outcomes.map((o) => o.label)).toEqual(WEALTH);
  });

  test("labelled generators compile with their labels", () => {
    const people = bundles.flatMap((b) => b.people);
    const labelOf = (id: string) => {
      const p = people.find((x) => x.id === `core-loop/${id}`);
      return p?.type === "generator" ? p.label : undefined;
    };
    expect(labelOf("parent-gen")).toBe("Your parent");
    expect(labelOf("dog-gen")).toBe("A dog");
  });
});

describe("god labels: replay", () => {
  test("a god pick on a labelled family-wealth outcome sets that outcome and replays", () => {
    const w0 = newLife(bundles, 7);
    // A weighted pick takes an option index: the last label is the top outcome.
    const top = ageThrough(w0, (d) =>
      isWealthDraw(d) ? WEALTH.length - 1 : d.natural,
    );
    expect(top.asked.some(isWealthDraw)).toBe(true);
    expect(
      getPerson(top.world, top.world.playerId).qualities.family_wealth,
    ).toBe(5);
    expect(
      worldHash(replay(top.world.seed, bundles, top.world.choiceLog)),
    ).toBe(worldHash(top.world));
  });

  test("the first label and the last label give different outcomes", () => {
    const w0 = newLife(bundles, 7);
    const low = ageThrough(w0, (d) => (isWealthDraw(d) ? 0 : d.natural));
    const high = ageThrough(w0, (d) =>
      isWealthDraw(d) ? WEALTH.length - 1 : d.natural,
    );
    expect(
      getPerson(low.world, low.world.playerId).qualities.family_wealth,
    ).toBe(1);
    expect(worldHash(low.world)).not.toBe(worldHash(high.world));
  });
});
