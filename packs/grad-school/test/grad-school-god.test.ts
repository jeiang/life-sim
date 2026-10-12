import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  type PackBundle,
  runAction,
  updatePerson,
  type World,
  withGodAsk,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), { only: ["grad-school"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = real.bundles;
const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];
const APPLY = "grad-school/apply-mba";
const REVIEW = "grad-school/grad-year-review";

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

/**
 * A 24-year-old with a business degree and money; no school yet.
 * Degrees are set unlogged (there is no god setter for qualities), so this
 * setup is outside the replay log. Everything after it is a logged god step.
 */
function applicant(): World {
  const w = newLife(bundles, 5);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age: 24,
    money: 100_000_000,
    qualities: { ...p.qualities, has_degree_business: true },
  }));
}

const quality = (w: World, key: string) =>
  getPerson(w, w.playerId).qualities[key] as number;
const enrolled = (w: World) => quality(w, "grad_program") > 0;

test("a labeled grade slide picked in god mode lowers the GPA by 6", () => {
  let gradesSlideAsked = false;
  let admitGpa: number | undefined;
  const answer = (d: GodDraw): number | boolean => {
    if (d.kind === "chance") return d.label === REVIEW ? true : d.natural;
    if (d.label === "Which event?") {
      const i = d.options?.findIndex((o) => o.label === REVIEW) ?? -1;
      return i >= 0 ? i : d.natural;
    }
    const idx = (text: string) =>
      d.options?.findIndex((o) => o.label === text) ?? -1;
    const accepted = idx("Long shot, accepted");
    if (accepted >= 0) return accepted;
    const slide = idx("Grades slide");
    if (slide >= 0) {
      gradesSlideAsked = true;
      return slide;
    }
    return d.natural;
  };

  let w = applicant();
  for (let round = 0; round < 40 && !gradesSlideAsked; round++) {
    w = stepWith(
      w,
      (s) => {
        if (s.pending) return choose(s, bundles, 0);
        if (enrolled(s)) {
          admitGpa ??= quality(s, "grad_gpa");
          return ageUp(s, bundles);
        }
        return runAction(s, bundles, APPLY);
      },
      answer,
    );
  }

  expect(enrolled(w)).toBe(true);
  expect(gradesSlideAsked).toBe(true);
  expect(admitGpa).toBeDefined();
  expect(quality(w, "grad_gpa")).toBe((admitGpa as number) - 6);
});
