import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  cellValue,
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
  startStorylet,
  type TableDecl,
  updatePerson,
  withGodAsk,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["generations"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = out.bundles;
const table = indexBundles(bundles).state.get("gen_heirloom") as TableDecl;
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

/** A living player of 50 with cash. */
function life(): World {
  const w = newLife(bundles, 1);
  return updatePerson(w, w.playerId, (p) => ({
    ...p,
    age: 50,
    money: 100000,
    gender: "male",
  }));
}

test("a labeled attic find picked in god mode applies, and the life replays", () => {
  const picked = stepWith(
    life(),
    (w) => startStorylet(w, bundles, "generations/heirloom-attic-find", undefined),
    (d) => {
      const i = d.options?.findIndex((o) => o.label === "Quilt") ?? -1;
      return i >= 0 ? i : d.natural;
    },
  );
  expect(cellValue(getPerson(picked, picked.playerId), table, "quilt_held")).toBe(1);
  expect(worldHash(replay(picked.seed, bundles, picked.choiceLog))).toBe(
    worldHash(picked),
  );
});
