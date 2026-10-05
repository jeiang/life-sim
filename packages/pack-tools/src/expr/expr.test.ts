import { type Expr, evaluate, pureFunctions, type Value } from "@life/core";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { type CheckEnv, compileExpr } from "../index.ts";

const env: CheckEnv = {
  names: {
    age: "int",
    money: "int",
    "stat.smarts": "int",
    "stat.looks": "int",
    "quality.licensed": "bool",
    "quality.title": "string",
    job: "id",
  },
  persons: ["friend"],
};

const values: Record<string, Value> = {
  age: 17,
  money: 250,
  "stat.smarts": 55,
  "stat.looks": 40,
  "quality.licensed": true,
  "quality.title": "x",
};

function ev(
  src: string,
  kind: "int" | "bool" = "int",
  vars: Record<string, Value> = values,
): Value {
  const r = compileExpr(src, env, kind);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return evaluate(r.ast, {
    get: (p) => vars[p] as Value,
    call: (n, a) =>
      (pureFunctions[n] as (...x: number[]) => number)(...(a as number[])),
  });
}

describe("precedence and associativity (int)", () => {
  test.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 - 4 - 3", 3],
    ["100 / 10 / 5", 2],
    ["2 * 3 mod 4", 2],
    ["7 mod 4 * 2", 6],
    ["-2 * 3", -6],
    ["-7 / 2", -3],
    ["7 / -2", -3],
    ["-7 mod 3", -1],
    ["- 3 - -3", 0],
    ["2 + 3 mod 2", 3],
    ["age > 16 ? 1 : 2", 1],
    ["age > 99 ? 1 : age > 10 ? 2 : 3", 2],
    ["1 ? 2 : 3 == 4", undefined],
    ["50%", 5000],
    ["2.5%", 250],
    ["0.05%", 5],
    ["100% + 1", 10001],
    ["stat.smarts / 4 - (age > 30 ? 5 : 0)", 13],
    ["clamp(10 + stat.smarts / 4, 1, 15)", 15],
    ["min(age, 3) + max(1, 2)", 5],
  ] as [string, number | undefined][])("%s", (src, want) => {
    if (want === undefined) {
      expect(compileExpr(src, env, "int").ok).toBe(false);
    } else {
      expect(ev(src)).toBe(want);
    }
  });
});

describe("precedence (bool)", () => {
  test.each([
    ["true or false and false", true],
    ["(true or false) and false", false],
    ["not true or true", true],
    ["not age == 17", false],
    ["not not true", true],
    ["age >= 16 and quality.licensed and stat.smarts < 60", true],
    ["age in [16, 17, 18]", true],
    ["age in [1, 2] or money > 100", true],
    ['quality.title in ["x", "y"]', true],
    ["age + 1 > 17 == true", true],
    ["age mod 2 == 1", true],
    ["1 + 1 in [2]", true],
  ] as [string, boolean][])("%s", (src, want) => {
    expect(ev(src, "bool")).toBe(want);
  });
});

describe("AST shape", () => {
  test("is plain JSON tuples", () => {
    const r = compileExpr(
      'age >= 16 and job/cashier in [job/cashier] and "a" == "b"',
      env,
      "bool",
    );
    expect(r).toEqual({
      ok: true,
      ast: [
        "and",
        [
          "and",
          [">=", ["v", "age"], 16],
          ["in", ["id", "job/cashier"], [["id", "job/cashier"]]],
        ],
        ["==", ["s", "a"], ["s", "b"]],
      ],
    });
  });
  test("percent literals are basis points; negative literals fold", () => {
    expect(compileExpr("-2.5%", env, "int")).toEqual({ ok: true, ast: -250 });
  });
});

describe("effect statements", () => {
  const eff = (s: string) => compileExpr(s, env, "effect");
  test.each([
    ["stat.smarts += 5", ["add", "stat.smarts", 5]],
    ["stat.smarts -= age / 2", ["sub", "stat.smarts", ["/", ["v", "age"], 2]]],
    ["stat.smarts = 50", ["set", "stat.smarts", 50]],
    ["quality.licensed = true", ["set", "quality.licensed", true]],
    ["money += 100", ["add", "money", 100]],
    ["take_loan(1000, 5%, 4)", ["do", "take_loan", 1000, 500, 4]],
    [
      "start_occupation(job/cashier)",
      ["do", "start_occupation", ["id", "job/cashier"]],
    ],
    ["grant_asset(car)", ["do", "grant_asset", ["id", "car"]]],
    ['journal("hi")', ["do", "journal", ["s", "hi"]]],
    ['die("old age")', ["do", "die", ["s", "old age"]]],
    [
      "spawn_person(role/friend, gen/teen) as pal",
      ["spawn", ["id", "role/friend"], ["id", "gen/teen"], "pal"],
    ],
    [
      "relationship(friend).closeness += 5",
      ["add", ["relationship", "friend", "closeness"], 5],
    ],
  ])("%s", (src, ast) => {
    expect(eff(src)).toEqual({ ok: true, ast });
  });

  test.each([
    ["money = 5", "'=' is not allowed on 'money'"],
    ["quality.licensed -= 1", "'-=' is not allowed on 'quality'"],
    ["age += 1", "'age' cannot be assigned"],
    ["stat.nope += 1", "unknown name 'stat.nope'"],
    ["stat.smarts += true", "expected an integer, got a boolean"],
    ["spawn_person(a, b)", "needs 'as <name>'"],
    ['journal("x") as y', "'as' is only valid"],
    ["relationship(stranger).closeness += 1", "unknown person 'stranger'"],
    ["relationship(friend).closeness = 1", "only allows '+='"],
    ["relationship(friend).trust += 1", "only 'closeness'"],
    ["explode()", "unknown effect 'explode'"],
    ["take_loan(1, 2)", "takes 3 argument(s), got 2"],
    ["quality.title += 1", "needs an integer target"],
  ])("rejects %s", (src, msg) => {
    const r = eff(src);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toContain(msg);
  });
});

describe("author errors carry line, column, and a clear message", () => {
  const errs = (src: string, kind: "int" | "bool" | "effect" = "bool") => {
    const r = compileExpr(src, env, kind);
    if (r.ok) throw new Error("expected errors");
    return r.errors;
  };

  test.each([
    ["agee > 3", 1, 1, "unknown name 'agee' (did you mean 'age'?)"],
    ['age > "x"', 1, 7, "expected an integer, got a string"],
    ["money and quality.licensed", 1, 1, "expected a boolean, got an integer"],
    ["age +", 1, 6, "expected an expression, found end of input"],
    ["age > 3 )", 1, 9, "unexpected ')'"],
    ["age ! 3", 1, 5, "use 'not' instead of '!'"],
    ["age && true", 1, 5, "use 'and' instead of '&&'"],
    ["age % 2 == 0", 1, 5, "'%' only follows a number literal"],
    ["age = 3", 1, 5, "unexpected '='"],
    ["1.5 > age", 1, 1, "decimals are only allowed in percent literals"],
    ["2.555% > age", 1, 1, "at most two decimal places"],
    ["age in 5", 1, 8, "expected a list literal"],
    ["age > 1\n  and nope", 2, 7, "unknown name 'nope'"],
    ["foo(1)", 1, 1, "unknown function 'foo'"],
    ["min(1)", 1, 1, "takes 2 argument(s), got 1"],
    ['"abc', 1, 1, "unterminated string"],
    ["age > 99999999999999999999", 1, 7, "too large"],
    ["age ? 1 : 2", 1, 1, "expected a boolean, got an integer"],
    ["has_occupation(5)", 1, 16, "expected a content id, got an integer"],
  ])("%s", (src, line, column, msg) => {
    const [e] = errs(src);
    expect(e).toMatchObject({ line, column });
    expect(e?.message).toContain(msg);
  });

  test("root kind is enforced", () => {
    expect(errs("age + 1", "bool")[0]?.message).toBe(
      "expected a boolean, got an integer",
    );
    expect(errs("age > 1", "int")[0]?.message).toBe(
      "expected an integer, got a boolean",
    );
  });

  test("all type errors are reported, not just the first", () => {
    expect(errs("nope1 > 1 and nope2 > 2")).toHaveLength(2);
  });

  test("names are looked up as own properties only", () => {
    expect(errs("constructor > 1")[0]?.message).toContain(
      "unknown name 'constructor'",
    );
    expect(errs("toString() > 1")[0]?.message).toContain(
      "unknown function 'toString'",
    );
  });
});

describe("constant zero divisors are compile errors", () => {
  test.each([
    "age / 0",
    "age mod 0",
    "age / (1 - 1)",
    "age / (2 * 0)",
    "age / -0",
    "1 / 0 + age",
    "age mod (3 mod 3)",
  ])("%s", (src) => {
    const r = compileExpr(`${src} > 1`, env, "bool");
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.some((e) => e.message.includes("division by zero"))).toBe(
        true,
      );
  });

  test("variable and non-zero constant divisors are fine; runtime guards zero", () => {
    expect(compileExpr("age / 2 > 1", env, "bool").ok).toBe(true);
    expect(compileExpr("age / money > 1", env, "bool").ok).toBe(true);
    expect(
      ev("age / stat.smarts", "int", { ...values, "stat.smarts": 0 }),
    ).toBe(0);
  });
});

describe("content ids", () => {
  test("slash joins ids; spaced slash divides", () => {
    expect(compileExpr("job/cashier == job/cashier", env, "bool").ok).toBe(
      true,
    );
    expect(compileExpr("age / 2 > 1", env, "bool").ok).toBe(true);
    expect(ev("money / age")).toBe(14);
  });
});

// ---- property tests: parse(print(tree)) agrees with an independent reference ----

type T =
  | number
  | { op: string; l: T; r: T }
  | { neg: T }
  | { cond: T; a: T; b: T };

const num = fc.integer({ min: 0, max: 50 });
const tree: fc.Arbitrary<T> = fc.letrec<{ t: T }>((tie) => ({
  t: fc.oneof(
    { depthSize: "small", maxDepth: 4 },
    num,
    fc.record({
      op: fc.constantFrom("+", "-", "*", "/", "mod"),
      l: tie("t"),
      r: tie("t"),
    }),
    fc.record({ neg: tie("t") }),
  ),
})).t;

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, mod: 2 };

/** Print with the minimum parentheses precedence and left-associativity require. */
function print(t: T, parent = 0, right = false): string {
  if (typeof t === "number") return String(t);
  if ("neg" in t) {
    const inner = print(t.neg, 9);
    return `-${inner.startsWith("-") ? `(${inner})` : inner}`;
  }
  if (!("op" in t)) return "";
  const p = PREC[t.op] as number;
  const s = `${print(t.l, p)} ${t.op} ${print(t.r, p, true)}`;
  return p < parent || (p === parent && right) ? `(${s})` : s;
}

const MAX = Number.MAX_SAFE_INTEGER;
const clamp = (x: number) => (x > MAX ? MAX : x < -MAX ? -MAX : x) + 0;
function ref(t: T): number {
  if (typeof t === "number") return t;
  if ("neg" in t) return 0 - ref(t.neg);
  if (!("op" in t)) return 0;
  const a = ref(t.l);
  const b = ref(t.r);
  switch (t.op) {
    case "+":
      return clamp(a + b);
    case "-":
      return clamp(a - b);
    case "*":
      return clamp(a * b);
    case "/":
      return b === 0 ? 0 : clamp(Math.trunc(a / b));
    default:
      return b === 0 ? 0 : clamp(a % b);
  }
}

describe("properties", () => {
  test("minimal-paren printing parses to the tree's value (precedence + associativity)", () => {
    fc.assert(
      fc.property(tree, (t) => {
        const src = print(t);
        const r = compileExpr(src, env, "int");
        if (!r.ok) {
          // Only constant zero divisors may be rejected.
          return r.errors.every((e) => e.message.includes("division by zero"));
        }
        return Object.is(
          evaluate(r.ast as Expr, { get: () => 0, call: () => 0 }),
          ref(t),
        );
      }),
      { numRuns: 500 },
    );
  });

  test("redundant parentheses never change the result", () => {
    const full = (t: T): string =>
      typeof t === "number"
        ? String(t)
        : "neg" in t
          ? `-(${full(t.neg)})`
          : "op" in t
            ? `(${full(t.l)} ${t.op} ${full(t.r)})`
            : "";
    fc.assert(
      fc.property(tree, (t) => {
        const a = compileExpr(print(t), env, "int");
        const b = compileExpr(full(t), env, "int");
        const key = (r: typeof a) => (r.ok ? JSON.stringify(r.ast) : "error");
        return key(a) === key(b);
      }),
      { numRuns: 300 },
    );
  });

  test("compiled ASTs round-trip through JSON and evaluate to safe integers", () => {
    fc.assert(
      fc.property(tree, (t) => {
        const r = compileExpr(print(t), env, "int");
        if (!r.ok) return true;
        const ast = JSON.parse(JSON.stringify(r.ast)) as Expr;
        const v = evaluate(ast, { get: () => 0, call: () => 0 }) as number;
        return Number.isSafeInteger(v);
      }),
    );
  });

  test("the compiler never throws on arbitrary input", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40 }),
        fc.constantFrom("bool", "int", "effect"),
        (s, k) => {
          compileExpr(s, env, k);
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});
