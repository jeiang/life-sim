import { expect, test } from "vitest";
import {
  ageUp,
  choose,
  finishGodStep,
  GodAsk,
  type GodCategory,
  type GodDraw,
  getPerson,
  godPickRoll,
  newLife,
  replay,
  runAction,
  withGodAsk,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { bundles, qn } from "./helpers.ts";

const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];
const STUDY = "relocation/study-a-language";

/** Run one god-mode step: answer each asked draw, keep the picks, retry until the step completes. */
function stepWith(
  start: World,
  step: (w: World) => { world: World },
  answer: (d: GodDraw) => number | boolean,
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

test("a labeled study session picked in god mode applies, and the life replays", () => {
  // Age through logged steps only, so replay reproduces the same adult.
  let w = newLife(bundles, 5);
  while (getPerson(w, w.playerId).age < 6 && !w.ended) {
    w = ageUp(w, bundles).world;
    while (w.pending) w = choose(w, bundles, 0).world;
  }
  // Book the session; the language menu is now pending. Spanish is the first choice.
  const menu = runAction(w, bundles, STUDY).world;
  let found = false;
  const picked = stepWith(
    menu,
    (s) => choose(s, bundles, 0),
    (d) => {
      const i = d.options?.findIndex((o) => o.label === "Good session") ?? -1;
      if (i >= 0) found = true;
      return i >= 0 ? i : d.natural;
    },
  );
  expect(found).toBe(true);
  expect(qn(picked, "reloc_lang_spanish")).toBeGreaterThan(0);
  expect(worldHash(replay(picked.seed, bundles, picked.choiceLog))).toBe(
    worldHash(picked),
  );
});
