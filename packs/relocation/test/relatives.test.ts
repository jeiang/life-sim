import { afterEach, describe, expect, test } from "vitest";
import {
  listActions,
  type PersonId,
  runAction,
  startStorylet,
  type World,
} from "../../../packages/core/src/index.ts";
import {
  bundles,
  closeness,
  forcePick,
  life,
  me,
  R,
  rows,
  stat,
  story,
  unforce,
  withCloseness,
} from "./helpers.ts";

afterEach(unforce);

const abroad = (extra: Record<string, number | boolean> = {}) =>
  life({
    age: 35,
    city: R("tokyo"),
    seed: 11,
    q: { reloc_abroad: true, reloc_home_city: 4, ...extra },
  });

/** First relative with `role`, set to closeness 50. */
function relative(w: World, role: string): { w: World; id: PersonId } {
  const r = rows(w, role)[0];
  if (!r) throw new Error(`no ${role}`);
  return { w: withCloseness(w, r.to, 50), id: r.to };
}

describe("drift", () => {
  const ID = R("relatives-drift");
  test("a mover with relatives loses 6 closeness; the stayer loses nothing", () => {
    const { w, id } = relative(abroad(), "parent");
    const after = startStorylet(w, bundles, ID, id).world;
    expect(closeness(after, id)).toBe(44);
    const home = relative(life({ age: 35, seed: 11 }), "parent");
    const same = startStorylet(home.w, bundles, ID, home.id).world;
    expect(closeness(same, home.id)).toBe(50);
  });

  test("it targets parents, siblings and friends only, with all three texts at -6", () => {
    for (const o of story(ID).outcomes) {
      const { w, id } = relative(abroad(), "parent");
      forcePick(ID, o.text as string);
      expect(closeness(startStorylet(w, bundles, ID, id).world, id)).toBe(44);
      unforce();
    }
  });
});

describe("call home", () => {
  const ID = R("call-home");
  const row = (w: World) =>
    listActions(w, bundles, "relationships", rows(w, "parent")[0]?.to).find(
      (r) => r.id === ID,
    );

  test("open abroad to adults, locked at home", () => {
    expect(row(abroad())?.locked).toBe(false);
    expect(row(life({ age: 35 }))?.locked).toBe(true);
    expect(row(life({ age: 17, q: { reloc_abroad: true } }))?.locked).toBe(
      true,
    );
  });

  test("a long call gives +4 closeness and +2 happiness, a short one +1 and +1", () => {
    const [long, short] = story(ID).outcomes;
    for (const [o, c, h] of [
      [long, 4, 2],
      [short, 1, 1],
    ] as const) {
      const { w, id } = relative(abroad(), "sibling");
      forcePick(ID, o?.text as string);
      const after = runAction(w, bundles, ID, id).world;
      unforce();
      expect(closeness(after, id)).toBe(50 + c);
      expect(stat(after, "happiness")).toBe(stat(w, "happiness") + h);
    }
  });
});

describe("visit home", () => {
  const ID = R("visit-home");
  const row = (w: World) =>
    listActions(w, bundles, "relationships", rows(w, "parent")[0]?.to).find(
      (r) => r.id === ID,
    );

  test("costs $1,200 to afford, and is offered every other year", () => {
    expect(
      row(life({ age: 35, money: 119999, q: { reloc_abroad: true } }))?.locked,
    ).toBe(true);
    expect(row(abroad())?.locked).toBe(false);
    const { w, id } = relative(abroad(), "parent");
    const done = runAction(w, bundles, ID, id).world;
    expect(row(done)?.locked).toBe(true);
  });

  test("warm visit +8 closeness +2 happiness, stilted +3; both cost the fare", () => {
    const [warm, stilted] = story(ID).outcomes;
    for (const [o, c, h] of [
      [warm, 8, 2],
      [stilted, 3, 0],
    ] as const) {
      const { w, id } = relative(abroad(), "sibling");
      forcePick(ID, o?.text as string);
      const after = runAction(w, bundles, ID, id).world;
      unforce();
      expect(closeness(after, id)).toBe(50 + c);
      expect(me(after).money).toBe(me(w).money - 120000);
      expect(stat(after, "happiness")).toBe(stat(w, "happiness") + h);
    }
  });

  test("a visit is not a return", () => {
    const { w, id } = relative(abroad(), "parent");
    const done = runAction(w, bundles, ID, id).world;
    expect(me(done).qualities.reloc_return_age).toBe(0);
    expect(me(done).qualities.reloc_abroad).toBe(true);
  });
});

describe("reunion", () => {
  const ID = R("relatives-reunion");
  const back = (age: number, returnAge: number) =>
    life({
      age,
      q: { reloc_returns: 1, reloc_return_age: returnAge, reloc_abroad: false },
    });

  test("opens after the age-up that follows the return, once per person", () => {
    const sameYear = relative(back(40, 40), "parent");
    expect(startStorylet(sameYear.w, bundles, ID, sameYear.id).world).toBe(
      sameYear.w,
    );
    const later = relative(back(41, 40), "parent");
    const after = startStorylet(later.w, bundles, ID, later.id).world;
    expect(closeness(after, later.id)).toBe(60);
    expect(stat(after, "happiness")).toBe(stat(later.w, "happiness") + 3);
    // Once: a second opening for the same person does nothing.
    expect(startStorylet(after, bundles, ID, later.id).world).toBe(after);
  });

  test("never while abroad or without a return", () => {
    const abroadAgain = relative(
      life({
        age: 41,
        q: { reloc_returns: 1, reloc_return_age: 40, reloc_abroad: true },
      }),
      "parent",
    );
    expect(
      startStorylet(abroadAgain.w, bundles, ID, abroadAgain.id).world,
    ).toBe(abroadAgain.w);
    const never = relative(life({ age: 41 }), "parent");
    expect(startStorylet(never.w, bundles, ID, never.id).world).toBe(never.w);
  });
});
