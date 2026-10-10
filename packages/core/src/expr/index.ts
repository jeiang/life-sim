export type { BinaryOp, Effect, Expr, Target, Value } from "./ast.ts";
export type { Env as ExprEnv } from "./eval.ts";
export { evaluate } from "./eval.ts";
export type { AssignOp, Signature, Type } from "./functions.ts";
export {
  ASSIGNABLE,
  assignOps,
  EFFECTS,
  FUNCTIONS,
  pureFunctions,
} from "./functions.ts";
