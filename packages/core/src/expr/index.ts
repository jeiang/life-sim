export type {
  BinaryOp,
  Effect,
  Expr,
  SpawnLink,
  Target,
  Value,
} from "./ast.ts";
export type { Env as ExprEnv } from "./eval.ts";
export { evaluate } from "./eval.ts";
export type { Aggregate, AssignOp, Signature, Type } from "./functions.ts";
export {
  AGGREGATE_PREFIX,
  AGGREGATES,
  ASSIGNABLE,
  assignOps,
  EFFECTS,
  FUNCTIONS,
  pureFunctions,
} from "./functions.ts";
