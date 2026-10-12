import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  finishGodStep,
  GodAsk,
  type GodCategory,
  type GodDraw,
  getPerson,
  godPickRoll,
  newLife,
  type PackBundle,
  replay,
  startStorylet,
  updatePerson,
  withGodAsk,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), { only: ["grad-school"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = real.bundles;
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

/** A enrolled grad student of 24 with a 60 GPA. */
function student(): World {
  const w = newLife(bundles, 5);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age: 24,
    money: 100_000_000,
    occupations: [],
    qualities: { ...p.qualities, grad_enrolled: true, grad_gpa: 60 },
  }));
}

const gpa = (w: World) =>
  getPerson(w, w.playerId).qualities.grad_gpa as number;

test("a labeled year-end transcript picked in god mode applies, and the life replays", () => {
  const picked = stepWith(
    student(),
    (w) => startStorylet(w, bundles, "grad-school/grad-year-review", undefined),
    (d) => {
      const i = d.options?.findIndex((o) => o.label === "Grades slide") ?? -1;
      return i >= 0 ? i : d.natural;
    },
  );
  expect(gpa(picked)).toBe(54);
  expect(worldHash(replay(picked.seed, bundles, picked.choiceLog))).toBe(
    worldHash(picked),
  );
});
