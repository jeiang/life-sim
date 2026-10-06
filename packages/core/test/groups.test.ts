import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  getPerson,
  listActions,
  newLife,
  replay,
  runAction,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const player = (w: World) => getPerson(w, w.playerId);
const locked = (w: World, id: string) =>
  listActions(w, bundles, "occupation").find((r) => r.id === id)?.locked;
const adult = (): World => {
  const w = newLife(bundles, 4);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age: 20 }));
};

describe("group checks", () => {
  test("not in the group: false and 0 years", () => {
    const w = adult();
    expect(locked(w, "life/tenure-bonus")).toBe(true);
    expect(locked(w, "life/student-perk")).toBe(true);
  });

  test("years add up across years and across occupations in the group", () => {
    let w = startStorylet(adult(), bundles, "life/get-job").world;
    w = ageUp(w, bundles).world;
    w = ageUp(w, bundles).world; // job: 2 years
    w = startStorylet(w, bundles, "life/get-side-job").world; // job moves to history
    expect(locked(w, "life/tenure-bonus")).toBe(true); // 2 + 0 < 3
    w = ageUp(w, bundles).world; // side_job: 1 year
    expect(locked(w, "life/tenure-bonus")).toBe(false);
    expect(locked(w, "life/student-perk")).toBe(true); // other group
  });

  test("leaving the group ends membership but keeps the years", () => {
    let w = startStorylet(adult(), bundles, "life/get-job").world;
    for (let i = 0; i < 3; i++) w = ageUp(w, bundles).world;
    expect(locked(w, "life/tenure-bonus")).toBe(false);
    w = startStorylet(w, bundles, "life/quit").world;
    expect(player(w).occupations).toHaveLength(0);
    expect(locked(w, "life/tenure-bonus")).toBe(true); // in_group is false
  });

  test("group gating replays to the same world", () => {
    let w = newLife(bundles, 9);
    w = runAction(w, bundles, "life/get-job").world;
    for (let i = 0; i < 4; i++) w = ageUp(w, bundles).world;
    w = runAction(w, bundles, "life/tenure-bonus").world;
    expect(worldHash(replay(9, bundles, w.choiceLog))).toBe(worldHash(w));
  });
});
