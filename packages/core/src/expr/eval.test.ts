import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Expr, Value } from "./ast.ts";
import { type Env, evaluate } from "./eval.ts";
import { pureFunctions } from "./functions.ts";

const MAX = Number.MAX_SAFE_INTEGER;

function run(n: Expr, vars: Record<string, Value> = {}) {
  const asserts: string[] = [];
  const env: Env = {
    get: (p) => vars[p] as Value,
    call: (name, args) =>
      (pureFunctions[name] as (...a: number[]) => number)(
        ...(args as number[]),
      ),
    onAssert: (m) => asserts.push(m),
  };
  return { value: evaluate(n, env), asserts };
}

describe("integer semantics", () => {
  test.each([
    [["/", 7, 2], 3],
    [["/", -7, 2], -3],
    [["/", 7, -2], -3],
    [["mod", 7, 3], 1],
    [["mod", -7, 3], -1],
    [["mod", 7, -3], 1],
    [["/", 1, 0], 0],
    [["mod", 5, 0], 0],
    [["neg", 0], 0],
    [["/", -1, 2], 0],
    [["mod", -4, 2], 0],
  ] as [Expr, number][])("%j = %d", (n, want) => {
    expect(Object.is(run(n).value, want)).toBe(true);
  });

  test("division by zero records an assertion", () => {
    expect(run(["/", 1, 0]).asserts).toEqual(["division by zero"]);
    expect(run(["mod", 1, 0]).asserts).toEqual(["division by zero"]);
  });

  test("overflow clamps and records an assertion", () => {
    expect(run(["+", MAX, 1])).toEqual({
      value: MAX,
      asserts: ["integer overflow"],
    });
    expect(run(["-", -MAX, 1])).toEqual({
      value: -MAX,
      asserts: ["integer overflow"],
    });
    expect(run(["*", MAX, MAX]).value).toBe(MAX);
    expect(run(["*", MAX, -MAX]).value).toBe(-MAX);
  });

  test("onAssert is optional and may throw", () => {
    const env: Env = { get: () => 0, call: () => 0 };
    expect(evaluate(["/", 1, 0], env)).toBe(0);
    const strict: Env = {
      ...env,
      onAssert: (m) => {
        throw new Error(m);
      },
    };
    expect(() => evaluate(["/", 1, 0], strict)).toThrow("division by zero");
  });

  test("and/or/ternary short-circuit", () => {
    const env: Env = {
      get: () => {
        throw new Error("evaluated");
      },
      call: () => 0,
    };
    expect(evaluate(["and", false, ["v", "x"]], env)).toBe(false);
    expect(evaluate(["or", true, ["v", "x"]], env)).toBe(true);
    expect(evaluate(["?", true, 1, ["v", "x"]], env)).toBe(1);
  });

  test("in, strings, ids, calls, names", () => {
    expect(run(["in", ["v", "age"], [1, 2, 3]], { age: 2 }).value).toBe(true);
    expect(run(["in", ["s", "a"], [["s", "b"]]]).value).toBe(false);
    expect(run(["==", ["id", "job/x"], ["id", "job/x"]]).value).toBe(true);
    expect(run(["call", "clamp", ["+", 10, 100], 1, 50]).value).toBe(50);
  });
});

const safe = fc.integer({ min: -MAX, max: MAX });
const small = fc.integer({ min: -1000, max: 1000 });

describe("properties", () => {
  test("results are always safe integers, never NaN or -0", () => {
    for (const op of ["+", "-", "*", "/", "mod"] as const) {
      fc.assert(
        fc.property(safe, safe, (a, b) => {
          const v = run([op, a, b]).value as number;
          return Number.isSafeInteger(v) && !Object.is(v, -0);
        }),
      );
    }
  });

  test("/ and mod satisfy (a / b) * b + (a mod b) = a for non-zero b", () => {
    fc.assert(
      fc.property(
        small,
        small.filter((b) => b !== 0),
        (a, b) => {
          const q = run(["/", a, b]).value as number;
          const r = run(["mod", a, b]).value as number;
          return (
            q * b + r === a &&
            Math.abs(r) < Math.abs(b) &&
            (r === 0 || Math.sign(r) === Math.sign(a))
          );
        },
      ),
    );
  });

  test("/ truncates toward zero", () => {
    fc.assert(
      fc.property(
        small,
        small.filter((b) => b !== 0),
        (a, b) => {
          const q = run(["/", a, b]).value as number;
          return Math.abs(q) === Math.floor(Math.abs(a) / Math.abs(b));
        },
      ),
    );
  });

  test("clamp stays within bounds", () => {
    fc.assert(
      fc.property(small, small, small, (x, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const v = run(["call", "clamp", x, lo, hi]).value as number;
        return v >= lo && v <= hi;
      }),
    );
  });
});
