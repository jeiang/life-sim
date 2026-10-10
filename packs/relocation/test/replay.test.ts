import { expect, test } from "vitest";
import {
  ageUp,
  choose,
  newLife,
  replay,
  worldHash,
} from "../../../packages/core/src/index.ts";
import { bundles } from "./helpers.ts";

test("a life with the relocation Pack replays to the same world hash", () => {
  // Emigration itself is replayed by the harness (mover profile, every life's save round-trip and replay check).
  let w = newLife(bundles, 21);
  for (let i = 0; i < 25; i++) {
    let r = ageUp(w, bundles);
    while (r.world.pending && !r.world.ended) r = choose(r.world, bundles, 0);
    w = r.world;
    if (w.ended) break;
  }
  expect(worldHash(replay(21, bundles, w.choiceLog))).toBe(worldHash(w));
});
