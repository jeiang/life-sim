import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  ageUp,
  cellValue,
  choose,
  finishGodStep,
  GodAsk,
  type GodCategory,
  type GodDraw,
  getPerson,
  godPickRoll,
  indexBundles,
  newLife,
  type PackBundle,
  replay,
  type TableDecl,
  type World,
  withGodAsk,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["generations"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = out.bundles;
const table = indexBundles(bundles).state.get("gen_heirloom") as TableDecl;
const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];
const ATTIC = "generations/heirloom-attic-find";

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

test("a labeled attic find picked in god mode applies, and the life replays", () => {
  // The attic find is an event: fire it when offered, pick it from the event menu,
  // then pick its Quilt outcome by label. Everything runs through logged ageUp/choose steps.
  let quiltAsked = false;
  const answer = (d: GodDraw): number | boolean => {
    if (d.kind === "chance") return d.label === ATTIC ? true : d.natural;
    if (d.label === "Which event?") {
      const i = d.options?.findIndex((o) => o.label === ATTIC) ?? -1;
      return i >= 0 ? i : d.natural;
    }
    // The attic outcome draw is labeled by its storylet text (the storylet has no label), so match by options.
    const q = d.options?.findIndex((o) => o.label === "Quilt") ?? -1;
    if (q >= 0) {
      quiltAsked = true;
      return q;
    }
    return d.natural;
  };
  // The find needs age 20 or more; age up to 19 without god answers first.
  let w = newLife(bundles, 5);
  while (getPerson(w, w.playerId).age < 19 && !w.ended) {
    w = ageUp(w, bundles).world;
    while (w.pending) w = choose(w, bundles, 0).world;
  }
  let picked = w;
  for (let round = 0; round < 60 && !picked.ended; round++) {
    if (
      cellValue(getPerson(picked, picked.playerId), table, "quilt_held") === 1
    )
      break;
    picked = stepWith(
      picked,
      (s) => (s.pending ? choose(s, bundles, 0) : ageUp(s, bundles)),
      answer,
    );
  }
  expect(quiltAsked).toBe(true);
  expect(
    cellValue(getPerson(picked, picked.playerId), table, "quilt_held"),
  ).toBe(1);
  expect(worldHash(replay(picked.seed, bundles, picked.choiceLog))).toBe(
    worldHash(picked),
  );
});
