import fc from "fast-check";
import { expect, test } from "vitest";
import { cyrb128, hash64 } from "./hash.ts";
import { type Rng, streamFor } from "./rng.ts";

const take = (r: Rng, n: number) => Array.from({ length: n }, () => r.next32());

test("same inputs give identical streams", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 0xffffffff }),
      fc.nat(120),
      fc.string(),
      fc.nat(50),
      (s, a, k, c) => {
        expect(take(streamFor(s, a, k, c), 8)).toEqual(
          take(streamFor(s, a, k, c), 8),
        );
      },
    ),
  );
});

test("each input component changes the stream", () => {
  const base = take(streamFor(1, 10, "event", 0), 4);
  for (const other of [
    streamFor(2, 10, "event", 0),
    streamFor(1, 11, "event", 0),
    streamFor(1, 10, "chance", 0),
    streamFor(1, 10, "event", 1),
  ]) {
    expect(take(other, 4)).not.toEqual(base);
  }
});

test("purpose key and counter cannot collide through concatenation", () => {
  expect(take(streamFor(1, 2, "3|x", 0), 3)).not.toEqual(
    take(streamFor(1, 2, "x", 3), 3),
  );
});

test("streams for different purpose keys are statistically independent", () => {
  const n = 4000;
  const a = streamFor(7, 20, "alpha", 0);
  const b = streamFor(7, 20, "beta", 0);
  let agree = 0;
  for (let i = 0; i < n; i++)
    if (a.chanceBp(5000) === b.chanceBp(5000)) agree++;
  expect(agree).toBeGreaterThan(n * 0.45);
  expect(agree).toBeLessThan(n * 0.55);
});

test("sfc32 known-answer vector (pins the algorithm and seeding)", () => {
  expect(take(streamFor(12345, 0, "kat", 0), 4)).toMatchInlineSnapshot(`
    [
      2028519651,
      1383861527,
      1798043245,
      1399362003,
    ]
  `);
  expect(cyrb128("")).toMatchInlineSnapshot(`
    [
      41608494,
      480788319,
      2264674419,
      2553211394,
    ]
  `);
});

test("int is in range and roughly uniform", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 0, max: 0xffffffff }),
      (n, s) => {
        const r = streamFor(s, 0, "int", 0);
        for (let i = 0; i < 20; i++) {
          const v = r.int(n);
          expect(Number.isInteger(v) && v >= 0 && v < n).toBe(true);
        }
      },
    ),
  );
  const r = streamFor(3, 0, "uniform", 0);
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6000; i++) (counts[r.int(6)] as number)++;
  for (const c of counts) expect(Math.abs(c - 1000)).toBeLessThan(150);
  expect(() => r.int(0)).toThrow();
  expect(() => r.int(1.5)).toThrow();
  expect(r.int(1)).toBe(0);
});

test("chanceBp extremes and frequency", () => {
  const r = streamFor(1, 1, "c", 0);
  expect(r.chanceBp(0)).toBe(false);
  expect(r.chanceBp(-5)).toBe(false);
  expect(r.chanceBp(10000)).toBe(true);
  let hits = 0;
  for (let i = 0; i < 10000; i++) if (r.chanceBp(2500)) hits++;
  expect(hits).toBeGreaterThan(2300);
  expect(hits).toBeLessThan(2700);
});

test("weightedPick honours weights and never picks zero", () => {
  const r = streamFor(5, 5, "w", 0);
  const counts = [0, 0, 0];
  for (let i = 0; i < 8000; i++)
    (counts[r.weightedPick([1, 0, 3])] as number)++;
  expect(counts[1]).toBe(0);
  expect((counts[2] as number) / (counts[0] as number)).toBeGreaterThan(2.5);
  expect((counts[2] as number) / (counts[0] as number)).toBeLessThan(3.6);
  expect(() => r.weightedPick([0, 0])).toThrow();
  expect(() => r.weightedPick([1, -1])).toThrow();
  expect(() => r.weightedPick([1.5])).toThrow();
});

test("hash64 is stable, 16 hex digits, and sensitive", () => {
  expect(hash64("")).toMatchInlineSnapshot(`"488bdcb81aee8d83"`);
  expect(hash64("life")).toMatchInlineSnapshot(`"3a1c94fda81724bf"`);
  fc.assert(
    fc.property(fc.string(), (s) => {
      expect(hash64(s)).toMatch(/^[0-9a-f]{16}$/);
      expect(hash64(s)).toBe(hash64(s));
      expect(hash64(`${s}a`)).not.toBe(hash64(`${s}b`));
    }),
  );
});
