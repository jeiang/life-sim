import type { Effect, Expr } from "@life/core";
import { type CheckEnv, Checker, checkStmt } from "./check.ts";
import { type ExprError, SyntaxFailure } from "./errors.ts";
import { parseExpr, parseStmt } from "./parser.ts";

export type { CheckEnv } from "./check.ts";
export type { ExprError } from "./errors.ts";
export { formatError } from "./errors.ts";

export type ExprKind = "bool" | "int" | "effect";

export type CompileResult<A> =
  | { ok: true; ast: A }
  | { ok: false; errors: ExprError[] };

/**
 * Parse and type-check one expression (`bool` or `int`) or one effect statement against `env`.
 * Syntax errors stop at the first; type errors are all reported.
 */
export function compileExpr(
  src: string,
  env: CheckEnv,
  kind: "effect",
): CompileResult<Effect>;
export function compileExpr(
  src: string,
  env: CheckEnv,
  kind: "bool" | "int",
): CompileResult<Expr>;
export function compileExpr(
  src: string,
  env: CheckEnv,
  kind: ExprKind,
): CompileResult<Expr | Effect>;
export function compileExpr(
  src: string,
  env: CheckEnv,
  kind: ExprKind,
): CompileResult<Expr | Effect> {
  const checker = new Checker(env);
  let ast: Expr | Effect | null | undefined;
  try {
    if (kind === "effect") {
      ast = checkStmt(checker, env, parseStmt(src));
    } else {
      ast = checker.expr(parseExpr(src), kind)?.[1];
    }
  } catch (e) {
    if (e instanceof SyntaxFailure)
      return {
        ok: false,
        errors: [{ message: e.message, line: e.line, column: e.column }],
      };
    throw e;
  }
  if (checker.errors.length > 0 || ast === null || ast === undefined) {
    return { ok: false, errors: checker.errors };
  }
  return { ok: true, ast };
}
