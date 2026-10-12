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
  godSetMoney,
  godSetStat,
  newLife,
  type PackBundle,
  replay,
  runAction,
  withGodAsk,
  type World,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", ".."), { only: ["vacations"] });
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles: readonly PackBundle[] = real.bundles;

const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];
const VAC = "vacations/vacation-tier";

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

test("a labeled destination outcome picked in god mode applies, and the life replays", () => {
  // Age up through logged steps only, so replay reproduces the same adult.
  let w = newLife(bundles, 5);
  for (let y = 0; y < 17 && !w.ended; y++) {
    w = ageUp(w, bundles).world;
    while (w.pending) w = choose(w, bundles, 0).world;
  }
  // Money and stats go through the logged god setters.
  const start = godSetStat(
    godSetStat(godSetMoney(w, 10_000_000), "happiness", 50),
    "health",
    50,
  );
  // Book the cheapest tier; the destination menu is now pending.
  const booked = choose(runAction(start, bundles, VAC).world, bundles, 0).world;
  // Choose Beach; its outcome draw is god-picked by label.
  const picked = stepWith(
    booked,
    (s) => choose(s, bundles, 0),
    (d) => {
      const i = d.options?.findIndex((o) => o.label === "Great trip") ?? -1;
      return i >= 0 ? i : d.natural;
    },
  );
  // Beach "Great trip" at tier 1: happiness += 6 + 2 * 1 = 8, health += 2.
  const me = getPerson(picked, picked.playerId);
  expect(me.stats.happiness).toBe(58);
  expect(me.stats.health).toBe(52);
  expect(worldHash(replay(picked.seed, bundles, picked.choiceLog))).toBe(
    worldHash(picked),
  );
});
