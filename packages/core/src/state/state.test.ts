import fc from "fast-check";
import { expect, test } from "vitest";
import { worldHash } from "../hash.ts";
import {
  canonicalStringify,
  deserializeWorld,
  serializeWorld,
} from "./serialize.ts";
import type { World } from "./types.ts";
import {
  addJournalLine,
  addMoney,
  addPerson,
  createWorld,
  nextStream,
  putAsset,
  putLoan,
  putRelationship,
  setQuality,
  setStat,
} from "./world.ts";

function sample(seed = 42): World {
  let w = createWorld({
    seed,
    player: { givenName: "Ada", familyName: "Lee", age: 18 },
    packVersions: [
      { id: "core-loop", version: "1.0.0" },
      { id: "base", version: "0.1.0" },
    ],
  });
  const [w2, kid] = addPerson(w, {
    givenName: "Sam",
    familyName: "Lee",
    age: 1,
  });
  w = w2;
  w = setStat(w, w.playerId, "health", 250);
  w = setQuality(w, w.playerId, "licence", true);
  w = setQuality(w, w.playerId, "arrests", 2);
  w = addMoney(w, w.playerId, -1234);
  w = putAsset(w, w.playerId, {
    id: 90,
    kindId: "car",
    purchasePrice: 900000,
    value: 800000,
    qualities: { miles: 12 },
  });
  w = putLoan(w, w.playerId, {
    id: 91,
    kindId: "auto",
    principal: 900000,
    balance: 850000,
    rateBp: 650,
    termYears: 5,
    payment: 200000,
    securedAssetId: 90,
    missed: 1,
  });
  w = putRelationship(w, {
    from: kid,
    to: w.playerId,
    role: "parent",
    closeness: 80,
  });
  w = putRelationship(w, {
    from: w.playerId,
    to: kid,
    role: "child",
    closeness: 90,
  });
  w = addJournalLine(w, 18, "Turned 18.");
  w = addJournalLine(w, 18, "Got a car.");
  const [w3] = nextStream(w, 18, "event");
  return w3;
}

test("round-trips exactly", () => {
  const w = sample();
  const text = serializeWorld(w);
  const back = deserializeWorld(text);
  expect(back).toEqual(w);
  expect(serializeWorld(back)).toBe(text);
  expect(worldHash(back)).toBe(worldHash(w));
});

test("serialization is independent of key and insertion order", () => {
  const a = canonicalStringify({ b: 1, a: { d: true, c: "x" } });
  const b = canonicalStringify({ a: { c: "x", d: true }, b: 1 });
  expect(a).toBe(b);
  expect(a).toBe('{"a":{"c":"x","d":true},"b":1}');
  const w = sample();
  const reversed: World = { ...w, persons: new Map([...w.persons].reverse()) };
  expect(serializeWorld(reversed)).toBe(serializeWorld(w));
});

test("helpers clamp stats and keep lists sorted", () => {
  const w = sample();
  expect(w.persons.get(w.playerId)?.stats.health).toBe(100);
  expect(
    setStat(w, w.playerId, "health", -5).persons.get(w.playerId)?.stats.health,
  ).toBe(0);
  const rel = w.relationships.map((r) => `${r.from}>${r.to}`);
  expect(rel).toEqual([...rel].sort());
});

test("helpers do not mutate the input world", () => {
  const w = sample();
  const before = serializeWorld(w);
  addMoney(w, w.playerId, 5);
  addJournalLine(w, 19, "x");
  nextStream(w, 18, "event");
  expect(serializeWorld(w)).toBe(before);
});

test("floats and bad shapes are rejected", () => {
  const w = sample();
  const bad = serializeWorld(w).replace('"money":-1234', '"money":-12.5');
  expect(() => deserializeWorld(bad)).toThrow(TypeError);
  expect(() => deserializeWorld('{"persons":[]}')).toThrow(TypeError);
  expect(() => canonicalStringify({ x: 0.5 })).toThrow(TypeError);
  expect(() => canonicalStringify({ x: Number.NaN })).toThrow(TypeError);
  expect(() => addMoney(w, 99, 1)).toThrow(RangeError);
});

test("hash changes with any state change and is pinned for a fixture", () => {
  const w = sample();
  const h = worldHash(w);
  expect(h).toMatch(/^[0-9a-f]{16}$/);
  expect(worldHash(addMoney(w, w.playerId, 1))).not.toBe(h);
  expect(worldHash(sample(43))).not.toBe(h);
  expect(worldHash(addJournalLine(w, 18, "!"))).not.toBe(h);
  expect(h).toMatchInlineSnapshot(`"b56fa163a70f2742"`);
});

test("nextStream advances per-site counters only, and a save reload cannot reroll", () => {
  const w = sample();
  const [w1, s1] = nextStream(w, 30, "chance:illness");
  const [w2, s2] = nextStream(w1, 30, "chance:illness");
  const [, other] = nextStream(w2, 30, "flavour");
  expect(w2.rngCounters["30/chance:illness"]).toBe(2);
  expect(w2.rngCounters["30/flavour"]).toBeUndefined();
  expect(s1.next32()).not.toBe(s2.next32());
  // Reloading w1 from its serialization and drawing again reproduces s2.
  const [, s2b] = nextStream(
    deserializeWorld(serializeWorld(w1)),
    30,
    "chance:illness",
  );
  const [, s2c] = nextStream(w1, 30, "chance:illness");
  expect(s2b.next32()).toBe(s2c.next32());
  // Adding an unrelated roll site does not shift this one.
  const [wx] = nextStream(w, 30, "unrelated");
  const [, sA] = nextStream(wx, 30, "chance:illness");
  const [, sB] = nextStream(w, 30, "chance:illness");
  expect(sA.next32()).toBe(sB.next32());
  expect(other).toBeDefined();
});

test("round-trip holds for arbitrary integer fields", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 0xffffffff }),
      fc.integer({ min: -1e12, max: 1e12 }),
      fc.string(),
      (seed, money, name) => {
        let w = createWorld({
          seed,
          player: { givenName: name, familyName: "é☃", age: 0 },
        });
        w = addMoney(w, w.playerId, money);
        w = addJournalLine(w, 0, name);
        expect(deserializeWorld(serializeWorld(w))).toEqual(w);
      },
    ),
  );
});
