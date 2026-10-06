import {
  ASSIGNABLE,
  EFFECTS,
  type Effect,
  type Expr,
  evaluate,
  FUNCTIONS,
  type Signature,
  type Target,
  type Type,
} from "@life/core";
import type { ExprError } from "./errors.ts";
import type { Node, Pos, Stmt } from "./parser.ts";

/** The declared environment an expression is checked against. */
/** 18+ mode is chosen at life start and only picks text, so it is no expression name. */
const MATURE_HINT =
  " (18+ mode only picks text: use mature_text or mature_label, not an expression)";

export interface CheckEnv {
  /** Dotted name -> type, for example `{ age: "int", "stat.smarts": "int" }`. */
  names: Readonly<Record<string, Type>>;
  /** Bound person names usable in `relationship(<person>)`. */
  persons?: readonly string[];
  /** Overrides the core `FUNCTIONS` whitelist (tests only). */
  functions?: Readonly<Record<string, Signature>>;
}

const TYPE_NAME: Record<Type, string> = {
  int: "an integer",
  bool: "a boolean",
  string: "a string",
  id: "a content id",
  group: "an exclusivity group name",
};

const MAX_SUGGEST = 2;

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length] as number;
}

function suggest(name: string, candidates: Iterable<string>): string {
  let best: string | undefined;
  let bestD = MAX_SUGGEST + 1;
  for (const c of candidates) {
    const d = distance(name, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best ? ` (did you mean '${best}'?)` : "";
}

type Checked = [Type, Expr] | null;

export class Checker {
  readonly errors: ExprError[] = [];
  private readonly env: CheckEnv;
  private readonly fns: Readonly<Record<string, Signature>>;
  constructor(env: CheckEnv) {
    this.env = env;
    this.fns = env.functions ?? FUNCTIONS;
  }

  private err(pos: Pos, message: string): null {
    this.errors.push({ message, line: pos.line, column: pos.column });
    return null;
  }

  /** Check `n` and require type `want` (undefined: any). */
  expr(n: Node, want?: Type): Checked {
    const r = this.infer(n);
    if (r && want && r[0] !== want) {
      return this.err(n, `expected ${TYPE_NAME[want]}, got ${TYPE_NAME[r[0]]}`);
    }
    return r;
  }

  /**
   * Like `expr` for a parameter of type `want`: a bare undeclared word is a content id, or a
   * group name for a `group` parameter (which also takes a string literal, for `"full-time"`).
   */
  param(n: Node, want: Type): Checked {
    if (want === "group") {
      if (n.k === "str") return ["group", ["id", n.v]];
      if (n.k === "name" && !n.v.includes(".") && !(n.v in this.env.names))
        return ["group", ["id", n.v]];
      return this.err(n, "expected an exclusivity group name, such as school");
    }
    if (
      want === "id" &&
      n.k === "name" &&
      !n.v.includes(".") &&
      !(n.v in this.env.names)
    ) {
      return ["id", ["id", n.v]];
    }
    return this.expr(n, want);
  }

  private infer(n: Node): Checked {
    switch (n.k) {
      case "int":
        return ["int", n.v];
      case "bool":
        return ["bool", n.v];
      case "str":
        return ["string", ["s", n.v]];
      case "id":
        return ["id", ["id", n.v]];
      case "name": {
        const t = this.env.names[n.v];
        if (t === undefined || !Object.hasOwn(this.env.names, n.v)) {
          return this.err(
            n,
            `unknown name '${n.v}'${n.v === "mature" ? MATURE_HINT : suggest(n.v, Object.keys(this.env.names))}`,
          );
        }
        return [t, ["v", n.v]];
      }
      case "neg": {
        const e = this.expr(n.e, "int");
        return e && ["int", ["neg", e[1]]];
      }
      case "not": {
        const e = this.expr(n.e, "bool");
        return e && ["bool", ["not", e[1]]];
      }
      case "bin":
        return this.binary(n);
      case "in": {
        const l = this.expr(n.l);
        const items = n.items.map((i) => this.expr(i, l?.[0]));
        if (!l || items.some((i) => !i)) return null;
        return ["bool", ["in", l[1], items.map((i) => (i as [Type, Expr])[1])]];
      }
      case "tern": {
        const c = this.expr(n.c, "bool");
        const a = this.expr(n.a);
        const b = this.expr(n.b, a?.[0]);
        if (!c || !a || !b) return null;
        return [a[0], ["?", c[1], a[1], b[1]]];
      }
      case "call": {
        const sig = Object.hasOwn(this.fns, n.name)
          ? this.fns[n.name]
          : undefined;
        if (!sig)
          return this.err(
            n,
            `unknown function '${n.name}'${suggest(n.name, Object.keys(this.fns))}`,
          );
        const args = this.args(n, n.name, sig, n.args);
        return args && [sig.returns, ["call", n.name, ...args]];
      }
    }
  }

  args(pos: Pos, name: string, sig: Signature, nodes: Node[]): Expr[] | null {
    if (nodes.length !== sig.params.length) {
      return this.err(
        pos,
        `'${name}' takes ${sig.params.length} argument(s), got ${nodes.length}`,
      );
    }
    const out = nodes.map((a, i) => this.param(a, sig.params[i] as Type));
    return out.some((a) => !a) ? null : out.map((a) => (a as [Type, Expr])[1]);
  }

  private binary(n: Node & { k: "bin" }): Checked {
    const { op } = n;
    const logic = op === "and" || op === "or";
    const arith = ["+", "-", "*", "/", "mod"].includes(op);
    const order = ["<", "<=", ">", ">="].includes(op);
    const l = this.expr(
      n.l,
      logic ? "bool" : arith || order ? "int" : undefined,
    );
    const r = this.expr(n.r, logic ? "bool" : arith || order ? "int" : l?.[0]);
    if (!l || !r) return null;
    if (op === "/" || op === "mod") {
      const d = constant(r[1]);
      if (d === 0)
        return this.err(
          n.r,
          `division by zero: the divisor of '${op}' is the constant 0`,
        );
    }
    const type: Type = arith ? "int" : "bool";
    return [type, [op as "+", l[1], r[1]]];
  }
}

/** Constant value of a name-free, call-free integer subtree, else undefined. */
function constant(e: Expr): number | undefined {
  const pure = (x: Expr): boolean => {
    if (typeof x === "number") return true;
    if (typeof x !== "object") return false;
    if (x[0] === "neg") return pure(x[1] as Expr);
    return (
      ["+", "-", "*", "/", "mod"].includes(x[0]) &&
      pure(x[1] as Expr) &&
      pure(x[2] as Expr)
    );
  };
  if (!pure(e)) return undefined;
  return evaluate(e, {
    get: () => 0,
    call: () => 0,
    // A nested zero divisor evaluates to 0 here and is reported when that node is checked.
  }) as number;
}

export function checkStmt(c: Checker, env: CheckEnv, s: Stmt): Effect | null {
  if (s.k === "assign") {
    const path = s.target.path;
    const root = path.split(".")[0] as string;
    const ops = Object.hasOwn(ASSIGNABLE, root) ? ASSIGNABLE[root] : undefined;
    const declared = Object.hasOwn(env.names, path)
      ? env.names[path]
      : undefined;
    if (!ops)
      return err(
        c,
        s.target,
        `'${path}' cannot be assigned; assignable: ${Object.keys(ASSIGNABLE).join(", ")}`,
      );
    if (root === "person" && path !== "person.money")
      return err(
        c,
        s.target,
        `'${path}' cannot be assigned (on a person only 'person.money' can)`,
      );
    if (declared === undefined) {
      return err(
        c,
        s.target,
        `unknown name '${path}'${path === "mature" ? MATURE_HINT : suggest(path, Object.keys(env.names))}`,
      );
    }
    if (!ops.includes(s.op)) {
      return err(
        c,
        s,
        `'${s.op}' is not allowed on '${root}'; allowed: ${ops.join(" ")}`,
      );
    }
    const v = c.expr(s.value, s.op === "=" ? declared : "int");
    if (declared !== "int" && s.op !== "=")
      return err(
        c,
        s.target,
        `'${s.op}' needs an integer target, '${path}' is ${TYPE_NAME[declared]}`,
      );
    const target: Target = path;
    return (
      v && [s.op === "=" ? "set" : s.op === "+=" ? "add" : "sub", target, v[1]]
    );
  }
  if (s.k === "rel") {
    const persons = env.persons ?? [];
    if (!persons.includes(s.person.name)) {
      return err(
        c,
        s.person,
        `unknown person '${s.person.name}'${suggest(s.person.name, persons)}`,
      );
    }
    if (s.field === "role") {
      if (s.op !== "=")
        return err(c, s, "relationship(...).role only allows '='");
      const v = c.param(s.value, "id");
      return v && ["set", ["relationship", s.person.name, s.field], v[1]];
    }
    if (s.field !== "closeness")
      return err(
        c,
        s,
        `unknown relationship field '${s.field}'; only 'closeness' and 'role' can change`,
      );
    if (s.op !== "+=")
      return err(c, s, "relationship(...).closeness only allows '+='");
    const v = c.expr(s.value, "int");
    return v && ["add", ["relationship", s.person.name, s.field], v[1]];
  }
  const sig = Object.hasOwn(EFFECTS, s.name)
    ? EFFECTS[s.name as keyof typeof EFFECTS]
    : undefined;
  if (!sig)
    return err(
      c,
      s,
      `unknown effect '${s.name}'${suggest(s.name, Object.keys(EFFECTS))}`,
    );
  if (s.name === "spawn_person") {
    if (!s.as)
      return err(
        c,
        s,
        "spawn_person(...) needs 'as <name>' to bind the new person",
      );
    const args = c.args(s, s.name, sig, s.args);
    if (
      Object.hasOwn(env.names, s.as.name) ||
      env.persons?.includes(s.as.name)
    ) {
      return err(c, s.as, `name '${s.as.name}' is already declared`);
    }
    return args && ["spawn", args[0] as Expr, args[1] as Expr, s.as.name];
  }
  if (s.as) return err(c, s.as, "'as' is only valid after spawn_person(...)");
  const args = c.args(s, s.name, sig, s.args);
  return args && ["do", s.name, ...args];
}

function err(c: Checker, pos: Pos, message: string): null {
  c.errors.push({ message, line: pos.line, column: pos.column });
  return null;
}
