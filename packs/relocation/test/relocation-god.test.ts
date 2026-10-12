import { expect, test } from "vitest";
import {
  finishGodStep,
  GodAsk,
  type GodCategory,
  type GodDraw,
  godPickRoll,
  replay,
  startStorylet,
  withGodAsk,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { bundles, life, qn, R } from "./helpers.ts";

const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];

/** Run one god-mode step: answer each asked draw, keep the picks, retry until the step completes. */
function stepWith(
  start: World,
  step: (w: World) => { world: World },
  answer: (d: GodDraw) => number,
): World {
  let draft = start;
  for (let round = 0; round < 100; round++) {
    try {
      return finishGodStep(step(withGodAsk(draft, ALL)).world);
    } catch (e) {
      if (!(e instanceof GodAsk)) throw e;
      for (const d of e.draws)
        draft = godPickRoll(draft, {
          age: d.age,
          key: d.key,
          n: d.n,
          d: d.d,
          v: answer(d),
        });
    }
  }
  throw new Error("the step kept asking");
}

test("a labeled Japanese lesson picked in god mode applies, and the life replays", () => {
  const start = life({
    age: 30,
    money: 1000000,
    city: R("tokyo"),
    q: { reloc_abroad: true, reloc_lang_japanese: 10 },
  });
  const picked = stepWith(
    start,
    (w) => startStorylet(w, bundles, R("abroad-language-growth"), undefined),
    (d) => {
      const i = d.options?.findIndex((o) => o.label === "Japanese dinner") ?? -1;
      return i >= 0 ? i : d.natural;
    },
  );
  expect(qn(picked, "reloc_lang_japanese")).toBe(13);
  expect(worldHash(replay(picked.seed, bundles, picked.choiceLog))).toBe(
    worldHash(picked),
  );
});
