/**
 * JSON AST for the pack expression language (ADR 0004).
 *
 * Nodes are plain JSON: integers and booleans stand for themselves, everything else is a
 * tagged tuple. The pack compiler produces this at build time; the phone only evaluates it.
 */

/** Runtime value of an expression. Content ids evaluate to their string form. */
export type Value = number | boolean | string;

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "mod"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "and"
  | "or";

export type Expr =
  | number
  | boolean
  | readonly ["s", string] // string literal
  | readonly ["id", string] // content id literal, e.g. job/cashier
  | readonly ["v", string] // name, dotted path, e.g. stat.smarts
  | readonly ["neg", Expr]
  | readonly ["not", Expr]
  | readonly [BinaryOp, Expr, Expr]
  | readonly ["in", Expr, readonly Expr[]] // x in [a, b, c]
  | readonly ["?", Expr, Expr, Expr] // c ? a : b
  | readonly ["call", string, ...Expr[]]; // whitelisted function

/** Assignment target: a dotted path (`stat.health`, `money`) or `relationship(p).field`. */
export type Target = string | readonly ["relationship", string, string];

export type Effect =
  | readonly ["set" | "add" | "sub", Target, Expr] // `=`, `+=`, `-=`
  | readonly ["do", string, ...Expr[]] // effect call, e.g. take_loan(...)
  | readonly ["spawn", Expr, Expr, string, SpawnLink?]; // spawn_person(role, generator[, parent: p][, link: k]) as name

/**
 * The optional family-tree arguments of a child or grandchild `spawn_person`: `parent` names the other birth
 * parent (a person in scope; the spouses are then not linked) and `link` the kind of the links
 * (default birth).
 */
export interface SpawnLink {
  readonly parent?: string;
  readonly link?: "adopted" | "step";
}
