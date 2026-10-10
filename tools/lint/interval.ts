/**
 * Interval abstract interpretation of Pack expressions (the AST of ADR 0004). A value is an
 * inclusive integer interval; a boolean is 0..1, so `[0,0]` is "never true" and `[1,1]` is
 * "always true". Everything unknown is `TOP`, so a result of `[0,0]` is a proof, never a guess.
 */
import { type Expr, FUNCTIONS } from "../../packages/core/src/index.ts";

export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

export const TOP: Interval = { lo: -Infinity, hi: Infinity };
export const FALSE: Interval = { lo: 0, hi: 0 };
export const TRUE: Interval = { lo: 1, hi: 1 };
export const BOOL: Interval = { lo: 0, hi: 1 };

export const point = (n: number): Interval => ({ lo: n, hi: n });
export const isPoint = (i: Interval): boolean => i.lo === i.hi;
export const isFalse = (i: Interval): boolean => i.lo === 0 && i.hi === 0;
export const isTrue = (i: Interval): boolean => i.lo === 1 && i.hi === 1;

/** `a` and `b` overlap-intersected; null when empty. */
export function meet(a: Interval, b: Interval): Interval | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo > hi ? null : { lo, hi };
}

export const join = (a: Interval, b: Interval): Interval => ({
  lo: Math.min(a.lo, b.lo),
  hi: Math.max(a.hi, b.hi),
});

/** Where an expression's names get their range. Unknown names are `TOP`. */
export type Ranges = (name: string) => Interval;

/** Refined ranges on top of a base `Ranges`: what has to hold for an enclosing `when` to be true. */
export type Env = ReadonlyMap<string, Interval>;

const num = (a: number, b: number, f: (x: number, y: number) => number) => {
  const r = f(a, b);
  return Number.isNaN(r) ? 0 : r;
};

function mul(a: Interval, b: Interval): Interval {
  const c = [
    num(a.lo, b.lo, (x, y) => x * y),
    num(a.lo, b.hi, (x, y) => x * y),
    num(a.hi, b.lo, (x, y) => x * y),
    num(a.hi, b.hi, (x, y) => x * y),
  ];
  return { lo: Math.min(...c), hi: Math.max(...c) };
}

function div(a: Interval, b: Interval): Interval {
  if (!isPoint(b) || b.lo === 0) return TOP;
  const x = Math.trunc(a.lo / b.lo);
  const y = Math.trunc(a.hi / b.lo);
  return { lo: Math.min(x, y), hi: Math.max(x, y) };
}

function mod(a: Interval, b: Interval): Interval {
  if (isPoint(b) && b.lo !== 0 && a.lo >= 0) {
    return { lo: 0, hi: Math.min(a.hi, Math.abs(b.lo) - 1) };
  }
  return TOP;
}

/** Tri-state comparison of two intervals as a 0..1 interval. */
function cmp(op: string, a: Interval, b: Interval): Interval {
  switch (op) {
    case "<":
      return a.hi < b.lo ? TRUE : a.lo >= b.hi ? FALSE : BOOL;
    case "<=":
      return a.hi <= b.lo ? TRUE : a.lo > b.hi ? FALSE : BOOL;
    case ">":
      return a.lo > b.hi ? TRUE : a.hi <= b.lo ? FALSE : BOOL;
    case ">=":
      return a.lo >= b.hi ? TRUE : a.hi < b.lo ? FALSE : BOOL;
    case "==":
      return isPoint(a) && isPoint(b) && a.lo === b.lo
        ? TRUE
        : a.hi < b.lo || b.hi < a.lo
          ? FALSE
          : BOOL;
    default:
      return isPoint(a) && isPoint(b) && a.lo === b.lo
        ? FALSE
        : a.hi < b.lo || b.hi < a.lo
          ? TRUE
          : BOOL;
  }
}

const COMPARES = new Set(["<", "<=", ">", ">=", "==", "!="]);
const FLIP: Record<string, string> = {
  "<": ">",
  "<=": ">=",
  ">": "<",
  ">=": "<=",
  "==": "==",
  "!=": "!=",
};
const NEGATE: Record<string, string> = {
  "<": ">=",
  "<=": ">",
  ">": "<=",
  ">=": "<",
  "==": "!=",
  "!=": "==",
};

const isTuple = (e: unknown): e is readonly unknown[] => Array.isArray(e);

/** Evaluates and refines expressions against a base `Ranges`. */
export class Analyzer {
  readonly ranges: Ranges;
  constructor(ranges: Ranges) {
    this.ranges = ranges;
  }

  private read(name: string, env: Env): Interval {
    return env.get(name) ?? this.ranges(name);
  }

  /** The interval an expression can take with the names in `env` narrowed. */
  ev(e: Expr, env: Env): Interval {
    if (typeof e === "number") return point(e);
    if (typeof e === "boolean") return e ? TRUE : FALSE;
    if (!isTuple(e)) return TOP;
    const [op] = e;
    switch (op) {
      case "v":
        return this.read(e[1] as string, env);
      case "s":
      case "id":
        return TOP;
      case "neg": {
        const a = this.ev(e[1] as Expr, env);
        return { lo: -a.hi, hi: -a.lo };
      }
      case "not": {
        const a = this.ev(e[1] as Expr, env);
        return isFalse(a) ? TRUE : a.lo > 0 || a.hi < 0 ? FALSE : BOOL;
      }
      case "+":
      case "-":
      case "*":
      case "/":
      case "mod": {
        const a = this.ev(e[1] as Expr, env);
        const b = this.ev(e[2] as Expr, env);
        if (op === "+") return { lo: a.lo + b.lo, hi: a.hi + b.hi };
        if (op === "-") return { lo: a.lo - b.hi, hi: a.hi - b.lo };
        if (op === "*") return mul(a, b);
        return op === "/" ? div(a, b) : mod(a, b);
      }
      case "and": {
        const a = this.ev(e[1] as Expr, env);
        if (isFalse(a)) return FALSE;
        const env2 = this.refine(e[1] as Expr, env, true);
        if (!env2) return FALSE;
        const b = this.ev(e[2] as Expr, env2);
        return isFalse(b) ? FALSE : isTrue(a) && isTrue(b) ? TRUE : BOOL;
      }
      case "or": {
        const a = this.ev(e[1] as Expr, env);
        if (isTrue(a)) return TRUE;
        const env2 = this.refine(e[1] as Expr, env, false);
        if (!env2) return TRUE;
        const b = this.ev(e[2] as Expr, env2);
        return isTrue(b) ? TRUE : isFalse(a) && isFalse(b) ? FALSE : BOOL;
      }
      case "in": {
        const x = this.ev(e[1] as Expr, env);
        const items = (e[2] as readonly Expr[]).map((i) => this.ev(i, env));
        if (items.some((i) => !isPoint(i))) return BOOL;
        const vals = items.map((i) => i.lo);
        if (isPoint(x) && vals.includes(x.lo)) return TRUE;
        return vals.every((v) => v < x.lo || v > x.hi) ? FALSE : BOOL;
      }
      case "?": {
        const c = this.ev(e[1] as Expr, env);
        if (isTrue(c)) return this.ev(e[2] as Expr, env);
        if (isFalse(c)) return this.ev(e[3] as Expr, env);
        return join(this.ev(e[2] as Expr, env), this.ev(e[3] as Expr, env));
      }
      case "call":
        return this.call(e[1] as string, e.slice(2) as Expr[], env);
      default:
        if (COMPARES.has(op)) {
          return cmp(
            op,
            this.ev(e[1] as Expr, env),
            this.ev(e[2] as Expr, env),
          );
        }
        return TOP;
    }
  }

  private call(name: string, args: Expr[], env: Env): Interval {
    const a = args.map((x) => this.ev(x, env));
    if (name === "min" && a.length === 2) {
      const [x, y] = a as [Interval, Interval];
      return { lo: Math.min(x.lo, y.lo), hi: Math.min(x.hi, y.hi) };
    }
    if (name === "max" && a.length === 2) {
      const [x, y] = a as [Interval, Interval];
      return { lo: Math.max(x.lo, y.lo), hi: Math.max(x.hi, y.hi) };
    }
    if (name === "clamp" && a.length === 3) {
      const [x, lo, hi] = a as [Interval, Interval, Interval];
      const c = (v: number, l: number, h: number) =>
        Math.min(Math.max(v, l), h);
      return {
        lo: c(x.lo, lo.lo, hi.lo),
        hi: c(x.hi, lo.hi, hi.hi),
      };
    }
    const sig = (FUNCTIONS as Record<string, { returns: string }>)[name];
    return sig?.returns === "bool" ? BOOL : TOP;
  }

  /**
   * `env` narrowed by assuming `e` is `truth`; null when that is impossible. Only comparisons
   * of a name with an expression, bare flag names, `not`, and `and` (true) / `or` (false)
   * narrow anything; the rest leaves `env` as it is.
   */
  refine(e: Expr, env: Env, truth: boolean): Env | null {
    if (typeof e === "boolean") return e === truth ? env : null;
    if (!isTuple(e)) return env;
    const [op] = e;
    if (op === "not") return this.refine(e[1] as Expr, env, !truth);
    if (op === "and" && truth) {
      const a = this.refine(e[1] as Expr, env, true);
      return a && this.refine(e[2] as Expr, a, true);
    }
    if (op === "or" && !truth) {
      const a = this.refine(e[1] as Expr, env, false);
      return a && this.refine(e[2] as Expr, a, false);
    }
    if (op === "v")
      return this.narrow(env, e[1] as string, truth ? TRUE : FALSE);
    if (COMPARES.has(op)) {
      const l = e[1] as Expr;
      const r = e[2] as Expr;
      const eff = truth ? op : (NEGATE[op] as string);
      if (isTuple(l) && l[0] === "v") {
        return this.constrain(env, l[1] as string, eff, this.ev(r, env));
      }
      if (isTuple(r) && r[0] === "v") {
        return this.constrain(
          env,
          r[1] as string,
          FLIP[eff] as string,
          this.ev(l, env),
        );
      }
    }
    return env;
  }

  private narrow(env: Env, name: string, to: Interval): Env | null {
    const next = meet(this.read(name, env), to);
    return next ? new Map(env).set(name, next) : null;
  }

  private constrain(
    env: Env,
    name: string,
    op: string,
    c: Interval,
  ): Env | null {
    const cur = this.read(name, env);
    let to: Interval | null;
    switch (op) {
      case "<":
        to = { lo: -Infinity, hi: c.hi - 1 };
        break;
      case "<=":
        to = { lo: -Infinity, hi: c.hi };
        break;
      case ">":
        to = { lo: c.lo + 1, hi: Infinity };
        break;
      case ">=":
        to = { lo: c.lo, hi: Infinity };
        break;
      case "==":
        to = c;
        break;
      default: {
        if (!isPoint(c)) return env;
        if (c.lo === cur.lo) to = { lo: cur.lo + 1, hi: Infinity };
        else if (c.lo === cur.hi) to = { lo: -Infinity, hi: cur.hi - 1 };
        else return env;
      }
    }
    return this.narrow(env, name, to);
  }
}
