import {
  AGGREGATE_PREFIX,
  AGGREGATES,
  ASSIGNABLE,
  assignOps,
  EFFECTS,
  type Effect,
  type Expr,
  evaluate,
  FUNCTIONS,
  GENDERS,
  isKinshipId,
  KIND_CALL,
  KINSHIP_IDS,
  type Signature,
  type Target,
  type Type,
  WILL_SET_MODES,
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
  /**
   * Container paths the aggregators `sum`, `count`, `max`, `min` accept, with the type of one
   * element (`table.<id>`, `people.quality.<id>`, `people.table.<id>.<key>`).
   */
  aggregates?: Readonly<Record<string, Type>>;
  /**
   * Content kinds `kind("<kind>", <id>).<field>` may read: kind id -> field name -> type
   * (`ref` fields are `id`). Absent: the call is unknown.
   */
  kinds?: Readonly<Record<string, Readonly<Record<string, Type>>>>;
  /** Bound person names usable in `relationship(<person>)`. */
  persons?: readonly string[];
  /**
   * Effect macros this statement may call: `<pack>.<macro>` -> number of integer parameters
   * (docs/spec/pack-format/effects.md). A macro call checks to `["do", "<pack>.<macro>", ...args]`;
   * the Pack compiler expands it before anything reaches the Core.
   */
  macros?: Readonly<Record<string, number>>;
  /** Overrides the core `FUNCTIONS` whitelist (tests only). */
  functions?: Readonly<Record<string, Signature>>;
}

const TYPE_NAME: Record<Type, string> = {
  int: "an integer",
  bool: "a boolean",
  string: "a string",
  id: "a content id",
  group: "an exclusivity group name",
  milestone: "a milestone id",
  person: "a person name",
  kinship: "a kinship id",
  will: "a will mode",
  gender: "a gender",
  target: "'player' or a person name",
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
    if (want === "person") {
      if (n.k === "name" && this.env.persons?.includes(n.v))
        return ["person", ["s", n.v]];
      return this.err(
        n,
        `expected a person name${suggest(n.k === "name" ? n.v : "", this.env.persons ?? [])}; person names are 'person' in a person-scoped storylet and names bound by spawn_person(...) as <name>`,
      );
    }
    if (want === "target") {
      if (
        n.k === "name" &&
        (n.v === "player" || this.env.persons?.includes(n.v))
      )
        return ["target", ["s", n.v]];
      return this.err(
        n,
        `expected 'player' or a person name${suggest(n.k === "name" ? n.v : "", ["player", ...(this.env.persons ?? [])])}; person names are 'person' in a person-scoped storylet and names bound by spawn_person(...) as <name>`,
      );
    }
    if (want === "gender") {
      const id = n.k === "str" || n.k === "name" ? n.v : undefined;
      if (id !== undefined && (GENDERS as readonly string[]).includes(id))
        return ["gender", ["s", id]];
      return this.err(
        n,
        `expected a gender${id === undefined ? "" : suggest(id, GENDERS)}; genders: ${GENDERS.join(", ")}`,
      );
    }
    if (want === "will") {
      const id = n.k === "str" || n.k === "name" ? n.v : undefined;
      if (
        id !== undefined &&
        (WILL_SET_MODES as readonly string[]).includes(id)
      )
        return ["will", ["s", id]];
      return this.err(
        n,
        `expected a will mode${id === undefined ? "" : suggest(id, WILL_SET_MODES)}; will modes: ${WILL_SET_MODES.join(", ")}`,
      );
    }
    if (want === "kinship") {
      const id = n.k === "str" || n.k === "name" ? n.v : undefined;
      if (id !== undefined && isKinshipId(id)) return ["kinship", ["s", id]];
      return this.err(
        n,
        `expected a kinship id${id === undefined ? "" : suggest(id, KINSHIP_IDS)}; kinship ids: ${KINSHIP_IDS.join(", ")}`,
      );
    }
    if (want === "milestone") {
      if (n.k === "str") return ["milestone", ["id", n.v]];
      if (n.k === "name" && !n.v.includes(".") && !(n.v in this.env.names))
        return ["milestone", ["id", n.v]];
      return this.err(n, "expected a milestone id, such as graduated");
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
        if (isAggregate(n)) return this.aggregate(n);
        if (n.name === KIND_CALL && this.env.kinds) return this.kind(n);
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

  /** `kind("<kind>", <id>).<field>` over a declared content kind. */
  private kind(n: Node & { k: "call" }): Checked {
    const kinds = this.env.kinds ?? {};
    const [k, id] = n.args;
    if (n.args.length !== 2 || n.field === undefined)
      return this.err(
        n,
        'a kind read is kind("<kind>", <id>).<field>, for example kind("countries", us).tax',
      );
    if (k?.k !== "str" || !Object.hasOwn(kinds, k.v))
      return this.err(
        n,
        `the first argument of 'kind' must be the quoted id of a declared content kind${
          k?.k === "str" ? suggest(k.v, Object.keys(kinds)) : ""
        }; visible: ${Object.keys(kinds).sort().join(", ") || "none"}`,
      );
    const fields = kinds[k.v] as Record<string, Type>;
    if (!Object.hasOwn(fields, n.field))
      return this.err(
        n,
        `kind '${k.v}' has no field '${n.field}'${suggest(n.field, Object.keys(fields))}; fields: ${Object.keys(fields).sort().join(", ")}`,
      );
    const idArg = id && this.param(id, "id");
    if (!idArg) return null;
    return [
      fields[n.field] as Type,
      ["call", KIND_CALL, ["s", k.v], idArg[1], ["s", n.field]],
    ];
  }

  /** `sum(src)`, `count(src)`, `max(src)`, `min(src)` over a declared container. */
  private aggregate(n: Node & { k: "call" }): Checked {
    const sources = this.env.aggregates ?? {};
    const arg = n.args[0];
    if (n.args.length !== 1)
      return this.err(
        n,
        `'${n.name}' takes one container, got ${n.args.length}`,
      );
    if (arg?.k !== "name" || !Object.hasOwn(sources, arg.v))
      return this.err(
        n,
        `'${n.name}' needs a container (table.<id>, people.quality.<id> or people.table.<id>.<key>) declared and visible to this Pack${
          arg?.k === "name" ? suggest(arg.v, Object.keys(sources)) : ""
        }`,
      );
    if (n.name !== "count" && sources[arg.v] !== "int")
      return this.err(
        arg,
        `'${n.name}' needs integer values, '${arg.v}' holds flags (use 'count')`,
      );
    return ["int", ["call", AGGREGATE_PREFIX + n.name, ["s", arg.v]]];
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

/**
 * `sum` and `count` are always aggregators. `min` and `max` are the pure two-argument
 * functions unless given one argument that looks like a container path (`table.<id>...`,
 * `people....`), so `min(1)` keeps its arity error.
 */
function isAggregate(n: Node & { k: "call" }): boolean {
  if (!(AGGREGATES as readonly string[]).includes(n.name)) return false;
  if (n.name === "sum" || n.name === "count") return true;
  const arg = n.args[0];
  return (
    n.args.length === 1 && arg?.k === "name" && /^(table|people)\./.test(arg.v)
  );
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
    const ops = assignOps(path, env.persons);
    const declared = Object.hasOwn(env.names, path)
      ? env.names[path]
      : undefined;
    if (!ops)
      return err(
        c,
        s.target,
        root === "person" || env.persons?.includes(root)
          ? `'${path}' cannot be assigned (on a person only 'money', 'quality.<id>' and 'table.<id>.<key>' can)`
          : `'${path}' cannot be assigned; assignable: ${Object.keys(ASSIGNABLE).join(", ")}`,
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
  if (s.k === "schedule") {
    const storylet = c.param(s.storylet, "id");
    if (s.from < 1 || s.to < s.from)
      err(
        c,
        s,
        `'after: ${s.from}-${s.to} years' must start at 1 year or more, and end no earlier than it starts`,
      );
    const persons = env.persons ?? [];
    if (s.person && !persons.includes(s.person.name))
      err(
        c,
        s.person,
        `unknown person '${s.person.name}'${suggest(s.person.name, persons)}`,
      );
    return (
      storylet && [
        "do",
        "schedule",
        storylet[1],
        s.from,
        s.to,
        s.person ? ["v", s.person.name] : false,
        s.lineage,
      ]
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
  if (s.name.includes(".")) {
    const macros = env.macros ?? {};
    if (!Object.hasOwn(macros, s.name))
      return err(
        c,
        s,
        `unknown effect macro '${s.name}'${suggest(s.name, Object.keys(macros))} (a macro is called as <pack>.<macro>(...) and its capability must be required)`,
      );
    if (s.as) return err(c, s.as, "'as' is only valid after spawn_person(...)");
    const arity = macros[s.name] as number;
    if (s.args.length !== arity)
      return err(
        c,
        s,
        `macro '${s.name}' takes ${arity} argument(s), got ${s.args.length}`,
      );
    const args = s.args.map((a) => c.expr(a, "int"));
    return args.some((a) => !a)
      ? null
      : ["do", s.name, ...args.map((a) => (a as [Type, Expr])[1])];
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
