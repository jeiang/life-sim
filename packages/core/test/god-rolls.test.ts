import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  checkSaveVersion,
  type DrawInfo,
  deserializeWorld,
  finishGodStep,
  GodAsk,
  type GodCategory,
  type GodDraw,
  GodRng,
  godEditPerson,
  godPickRoll,
  godSetMarket,
  newLife,
  nextStream,
  replay,
  runAction,
  serializeWorld,
  type World,
  withGodAsk,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;

const ALL: GodCategory[] = ["outcome", "event", "person", "npc"];
const info: DrawInfo = { cat: "event", label: "test draw" };

type Answer = (d: GodDraw) => number | boolean;

/**
 * Run one step the way the web driver does (DESIGN.md §1.4): ask with every category on,
 * answer each asked draw, keep the picks in the draft, retry until the step completes.
 */
function stepWith(
  start: World,
  step: (w: World) => { world: World },
  answer: Answer = (d) => d.natural,
): { world: World; asks: number } {
  let draft = start;
  let asks = 0;
  for (let round = 0; round < 100; round++) {
    try {
      return {
        world: finishGodStep(step(withGodAsk(draft, ALL)).world),
        asks,
      };
    } catch (e) {
      if (!(e instanceof GodAsk)) throw e;
      asks++;
      for (const d of e.draws) {
        draft = godPickRoll(draft, {
          age: d.age,
          key: d.key,
          n: d.n,
          d: d.d,
          v: answer(d),
        });
      }
    }
  }
  throw new Error("the step kept asking");
}

describe("god rolls: streams", () => {
  test("a plain world gets a bare Rng, not a GodRng", () => {
    const [, rng] = nextStream(newLife(bundles, 1), 0, "test/plain");
    expect(rng).not.toBeInstanceOf(GodRng);
  });

  test("a pick replaces its draw, and later draws stay on the natural stream", () => {
    const w0 = newLife(bundles, 4);
    const [, plain] = nextStream(w0, 0, "test/site");
    const natural = [plain.int(10, info), plain.int(10, info)];
    const picked = godPickRoll(w0, {
      age: 0,
      key: "test/site",
      n: 0,
      d: 0,
      v: 7,
    });
    const [, rng] = nextStream(picked, 0, "test/site");
    expect(rng.int(10, info)).toBe(7);
    expect(rng.int(10, info)).toBe(natural[1]);
  });

  test("a chance draw at an extreme still takes an ordinal", () => {
    const picked = godPickRoll(newLife(bundles, 4), {
      age: 0,
      key: "test/ordinal",
      n: 0,
      d: 1,
      v: 3,
    });
    const [, rng] = nextStream(picked, 0, "test/ordinal");
    expect(rng.chanceBp(0, { cat: "event", label: "never" })).toBe(false);
    expect(rng.int(10, info)).toBe(3);
  });

  test("form mode collects asked draws without throwing", () => {
    const w0 = withGodAsk(newLife(bundles, 4), ["event"]);
    const [, rng] = nextStream(w0, 0, "test/form", "form");
    rng.int(10, info);
    rng.int(10, info);
    expect(rng.pendingDraws()).toHaveLength(2);
  });

  test("a non-form ask throws GodAsk carrying the natural value", () => {
    const w0 = withGodAsk(newLife(bundles, 4), ["event"]);
    const [, rng] = nextStream(w0, 0, "test/ask");
    const plain = nextStream(newLife(bundles, 4), 0, "test/ask")[1];
    const natural = plain.int(10, info);
    let caught: unknown;
    try {
      rng.int(10, { cat: "event", label: "Which?" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GodAsk);
    expect((caught as GodAsk).draws[0]).toMatchObject({
      cat: "event",
      label: "Which?",
      natural,
    });
  });
});

describe("god rolls: live steps", () => {
  test("a spawn form asks, and every asked draw carries a value", () => {
    const w0 = withGodAsk(newLife(bundles, 11), ALL);
    let caught: GodAsk | undefined;
    try {
      runAction(w0, bundles, "life/meet");
    } catch (e) {
      if (!(e instanceof GodAsk)) throw e;
      caught = e;
    }
    expect(caught).toBeInstanceOf(GodAsk);
    expect(caught?.form).toBe(true);
    expect(caught?.draws.length).toBeGreaterThan(0);
    for (const d of caught?.draws ?? [])
      expect(["number", "boolean"]).toContain(typeof d.natural);
  });

  test("the first-name ask carries the generator's pool for each gender, and a readable title", () => {
    const w0 = withGodAsk(newLife(bundles, 11), ALL);
    let caught: GodAsk | undefined;
    try {
      runAction(w0, bundles, "life/meet");
    } catch (e) {
      if (!(e instanceof GodAsk)) throw e;
      caught = e;
    }
    const first = caught?.draws.find((d) => d.label === "First name");
    expect(first?.names?.male.length).toBeGreaterThan(0);
    expect(first?.names?.female.length).toBeGreaterThan(0);
    expect(caught?.title).toBeTruthy();
    expect(caught?.title).not.toContain("/");
  });

  test("answering every ask with its natural value leaves the life as an unasked life, and it replays", () => {
    const w0 = newLife(bundles, 11);
    const plain = runAction(w0, bundles, "life/meet").world;
    const asked = stepWith(w0, (w) => runAction(w, bundles, "life/meet"));
    expect(asked.asks).toBeGreaterThan(0);
    expect(worldHash({ ...asked.world, choiceLog: [] })).toBe(
      worldHash({ ...plain, choiceLog: [] }),
    );
    expect(
      worldHash(replay(asked.world.seed, bundles, asked.world.choiceLog)),
    ).toBe(worldHash(asked.world));
  });

  test("a first-name roll pick sets the spawned name, and the life replays", () => {
    // The roll maps onto the pool once the gender is known: 0 takes the first slot, the top value the last.
    const pick = (v: number): World =>
      stepWith(
        newLife(bundles, 11),
        (w) => runAction(w, bundles, "life/meet"),
        (d) => (d.label === "First name" ? v : d.natural),
      ).world;
    const givenNames = (w: World): (string | undefined)[] =>
      [...w.persons.values()].map((p) => p.givenName);
    const low = pick(0);
    const high = pick(2 ** 32 - 1);
    expect(givenNames(low)).not.toEqual(givenNames(high));
    expect(worldHash(replay(high.seed, bundles, high.choiceLog))).toBe(
      worldHash(high),
    );
  });

  test("a pick that is never drawn fails the step instead of being dropped", () => {
    const picked = godPickRoll(newLife(bundles, 4), {
      age: 0,
      key: "never",
      n: 0,
      d: 0,
      v: 1,
    });
    expect(() => finishGodStep(picked)).toThrow(/was never drawn/);
  });
});

describe("god rolls: validation", () => {
  const w = newLife(bundles, 4);

  test("godPickRoll rejects malformed picks", () => {
    expect(() =>
      godPickRoll(w, { age: -1, key: "k", n: 0, d: 0, v: 1 }),
    ).toThrow(/age must be a non-negative integer/);
    expect(() => godPickRoll(w, { age: 0, key: "", n: 0, d: 0, v: 1 })).toThrow(
      /key must not be empty/,
    );
    expect(() =>
      godPickRoll(w, { age: 0, key: "k", n: 0, d: 0, v: Number.NaN }),
    ).toThrow(/finite number or a boolean/);
  });

  test("godSetMarket needs an existing price series", () => {
    expect(() => godSetMarket(w, "nokind", { next: 5 })).toThrow(
      /no price series for 'nokind' yet/,
    );
  });

  test("godEditPerson rejects unknown people and empty names", () => {
    expect(() => godEditPerson(w, 999 as never, { givenName: "X" })).toThrow(
      /unknown person 999/,
    );
    expect(() => godEditPerson(w, w.playerId, { givenName: "" })).toThrow(
      /name must not be empty/,
    );
  });
});

describe("god rolls: saves", () => {
  test("a world with a filled god table serializes like one without", () => {
    const w = newLife(bundles, 4);
    expect(serializeWorld({ ...w, god: {} as never })).toBe(serializeWorld(w));
  });

  test("a plain schema-6 save passes the version check and loads with its hash", () => {
    const w = newLife(bundles, 4);
    const text = serializeWorld(w);
    expect(() => checkSaveVersion(JSON.parse(text))).not.toThrow();
    expect(text).not.toContain('"god-roll"');
    expect(worldHash(deserializeWorld(text))).toBe(worldHash(w));
  });

  test("a pending market event round-trips, and a series without one gains no field", () => {
    const w = newLife(bundles, 4);
    const pending = {
      ...w,
      market: {
        ...w.market,
        stock: {
          from: 0,
          prices: [100],
          next: 5,
          nextEvent: "delisted" as const,
        },
      },
    };
    expect(deserializeWorld(serializeWorld(pending)).market.stock).toEqual(
      pending.market.stock,
    );
    const plain = {
      ...w,
      market: { ...w.market, stock: { from: 0, prices: [100], next: 5 } },
    };
    expect(
      deserializeWorld(serializeWorld(plain)).market.stock,
    ).not.toHaveProperty("nextEvent");
  });
});
