import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ageUp,
  choose,
  finishGodStep,
  GodAsk,
  type GodCategory,
  getPerson,
  godPickRoll,
  newLife,
  replay,
  runAction,
  type World,
  withGodAsk,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = join(HERE, "..", "..");
const compiled = compilePacks(root, { only: ["crime"] });
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];

/**
 * Run one logged step the way the web driver does: ask with every category on,
 * answer each asked draw (by its god-mode label when `pick` names one offered
 * by that draw, otherwise its natural value), keep the picks in the draft, and
 * retry until the step completes.
 */
function stepBy(
  start: World,
  run: (w: World) => { world: World },
  pick?: string,
): World {
  let draft = start;
  for (let round = 0; round < 100; round++) {
    try {
      return finishGodStep(run(withGodAsk(draft, ALL)).world);
    } catch (e) {
      if (!(e instanceof GodAsk)) throw e;
      for (const d of e.draws) {
        const v = (d.options ?? []).findIndex((o) => o.label === pick);
        draft = godPickRoll(draft, {
          age: d.age,
          key: d.key,
          n: d.n,
          d: d.d,
          v: v >= 0 ? v : d.natural,
        });
      }
    }
  }
  throw new Error("the step kept asking");
}

/** Age one year, answering any storylet that opens with its first choice. */
function year(start: World): World {
  let w = stepBy(start, (x) => ageUp(x, bundles));
  while (w.pending) {
    if (w.pending.storyletId === "crime/arrest-pending") return w;
    w = stepBy(w, (x) => choose(x, bundles, 0));
  }
  return w;
}

describe("god mode labels: crime pack", () => {
  test("a labeled arrest outcome is picked by its label, and the life replays", () => {
    let w = newLife(bundles, 7);
    while (getPerson(w, w.playerId).age < 12) w = year(w);

    // Shoplift is a logged action; its caught outcome is unlabeled, so the pick is its text.
    w = stepBy(
      w,
      (x) => runAction(x, bundles, "crime/shoplift"),
      "A security guard grabs your arm at the door and calls the police.",
    );
    expect(getPerson(w, w.playerId).qualities.crime_pending_charge).toBe(1);

    // The next age-up opens the arrest. Choose "Run" and pick its labeled "Caught running" outcome.
    w = year(w);
    expect(w.pending?.storyletId).toBe("crime/arrest-pending");
    w = stepBy(w, (x) => choose(x, bundles, 1), "Caught running");

    const p = getPerson(w, w.playerId).qualities;
    expect(p.crime_arrests).toBe(1);
    expect(p.crime_wanted).toBe(false);
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
  });
});
