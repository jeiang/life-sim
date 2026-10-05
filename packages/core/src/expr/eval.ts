import type { Expr, Value } from "./ast.ts";

export interface Env {
  /** Resolve a dotted name. Must only return own, declared values. */
  get(path: string): Value;
  /** Call a whitelisted function (see `FUNCTIONS`). */
  call(name: string, args: Value[]): Value;
  /** Recorded assertion hook: division by zero, overflow. Dev and harness throw; production omits it. */
  onAssert?(message: string): void;
}

const MAX = Number.MAX_SAFE_INTEGER;

/** Integer-only AST evaluator. `/` and `mod` truncate toward zero; `x / 0` is 0; results clamp. */
export function evaluate(n: Expr, e: Env): Value {
  if (typeof n !== "object") return n;
  const ev = (x: Expr) => evaluate(x, e);
  const op = n[0];
  if (op === "s" || op === "id") return n[1] as string;
  if (op === "v") return e.get(n[1] as string);
  if (op === "neg") return 0 - (ev(n[1] as Expr) as number);
  if (op === "not") return !ev(n[1] as Expr);
  if (op === "?") return ev(n[1] as Expr) ? ev(n[2] as Expr) : ev(n[3] as Expr);
  if (op === "call")
    return e.call(
      n[1] as string,
      n.slice(2).map((x) => ev(x as Expr)),
    );
  const a = ev(n[1] as Expr) as number;
  if (op === "in") return (n[2] as readonly Expr[]).some((x) => ev(x) === a);
  if (op === "and") return a && ev(n[2] as Expr);
  if (op === "or") return a || ev(n[2] as Expr);
  const b = ev(n[2] as Expr) as number;
  let r: number;
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "+":
      r = a + b;
      break;
    case "-":
      r = a - b;
      break;
    case "*":
      r = a * b;
      break;
    default:
      if (!b) {
        e.onAssert?.("division by zero");
        return 0;
      }
      r = op === "/" ? Math.trunc(a / b) : a % b;
  }
  if (r > MAX || r < -MAX) {
    e.onAssert?.("integer overflow");
    return r > 0 ? MAX : -MAX;
  }
  return r + 0; // normalises -0
}
