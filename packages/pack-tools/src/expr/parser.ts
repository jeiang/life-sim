import { SyntaxFailure } from "./errors.ts";
import { lex, type Token } from "./lexer.ts";

export interface Pos {
  line: number;
  column: number;
}

/** Parse tree with source positions; the checker turns it into the shipped JSON AST. */
export type Node = Pos &
  (
    | { k: "int"; v: number }
    | { k: "bool"; v: boolean }
    | { k: "str"; v: string }
    | { k: "id"; v: string }
    | { k: "name"; v: string }
    | { k: "neg" | "not"; e: Node }
    | { k: "bin"; op: string; l: Node; r: Node }
    | { k: "in"; l: Node; items: Node[] }
    | { k: "tern"; c: Node; a: Node; b: Node }
    | { k: "call"; name: string; args: Node[]; field?: string }
  );

export type Stmt = Pos &
  (
    | {
        k: "assign";
        op: "=" | "+=" | "-=";
        target: Pos & { path: string };
        value: Node;
      }
    | {
        k: "rel";
        person: Pos & { name: string };
        field: string;
        op: string;
        value: Node;
      }
    | { k: "call"; name: string; args: Node[]; as?: Pos & { name: string } }
  );

// Binding powers, low to high: or, and, (not = 3), comparison/in, additive, multiplicative, unary minus.
const BP: Record<string, number> = {
  or: 1,
  and: 2,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "==": 4,
  "!=": 4,
  in: 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  mod: 6,
};
const NOT_BP = 4;
const NEG_BP = 7;

class Parser {
  private i = 0;
  private readonly toks: Token[];
  constructor(toks: Token[]) {
    this.toks = toks;
  }

  peek(): Token {
    return this.toks[this.i] as Token;
  }
  private next(): Token {
    return this.toks[this.i++] as Token;
  }
  is(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }
  private describe(t: Token): string {
    return t.kind === "eof"
      ? "end of input"
      : `'${t.kind === "str" ? `"${t.value}"` : t.value}'`;
  }
  fail(msg: string, t = this.peek()): never {
    throw new SyntaxFailure(msg, t.line, t.column);
  }
  accept(kind: Token["kind"], value: string): Token | undefined {
    return this.is(kind, value) ? this.next() : undefined;
  }
  expect(kind: Token["kind"], value: string, what = `'${value}'`): Token {
    if (!this.is(kind, value))
      this.fail(`expected ${what}, found ${this.describe(this.peek())}`);
    return this.next();
  }
  ident(what: string): Token {
    if (!this.is("name") || String(this.peek().value).includes(".")) {
      this.fail(`expected ${what}, found ${this.describe(this.peek())}`);
    }
    return this.next();
  }
  end(): void {
    if (!this.is("eof")) this.fail(`unexpected ${this.describe(this.peek())}`);
  }

  expr(): Node {
    const c = this.bin(0);
    const q = this.accept("op", "?");
    if (!q) return c;
    const a = this.expr();
    this.expect("op", ":");
    const b = this.expr();
    return { k: "tern", c, a, b, line: q.line, column: q.column };
  }

  private bin(min: number): Node {
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      const bp =
        t.kind === "op" || t.kind === "kw" ? BP[t.value as string] : undefined;
      if (bp === undefined || bp < min) return left;
      this.next();
      const pos = { line: t.line, column: t.column };
      if (t.value === "in") {
        this.expect("op", "[", "a list literal '[...]'");
        const items: Node[] = [];
        if (!this.accept("op", "]")) {
          do items.push(this.expr());
          while (this.accept("op", ","));
          this.expect("op", "]");
        }
        left = { k: "in", l: left, items, ...pos };
      } else {
        left = {
          k: "bin",
          op: t.value as string,
          l: left,
          r: this.bin(bp + 1),
          ...pos,
        };
      }
    }
  }

  private prefix(): Node {
    const t = this.next();
    const pos = { line: t.line, column: t.column };
    if (t.kind === "int") return { k: "int", v: t.value as number, ...pos };
    if (t.kind === "str") return { k: "str", v: t.value as string, ...pos };
    if (t.kind === "id") return { k: "id", v: t.value as string, ...pos };
    if (t.kind === "kw" && (t.value === "true" || t.value === "false")) {
      return { k: "bool", v: t.value === "true", ...pos };
    }
    if (t.kind === "kw" && t.value === "not")
      return { k: "not", e: this.bin(NOT_BP), ...pos };
    if (t.kind === "op" && t.value === "-") {
      const e = this.bin(NEG_BP);
      return e.k === "int"
        ? { k: "int", v: 0 - e.v, ...pos }
        : { k: "neg", e, ...pos };
    }
    if (t.kind === "op" && t.value === "(") {
      const e = this.expr();
      this.expect("op", ")");
      return e;
    }
    if (t.kind === "name") {
      if (this.is("op", "(")) {
        if (String(t.value).includes("."))
          this.fail(`'${t.value}' is not a function`, t);
        const args = this.args();
        // `kind("<kind>", <id>).<field>`: the one call a field read follows.
        const field =
          t.value === "kind" && this.accept("op", ".")
            ? (this.ident("a field name").value as string)
            : undefined;
        return {
          k: "call",
          name: t.value as string,
          args,
          ...(field === undefined ? {} : { field }),
          ...pos,
        };
      }
      return { k: "name", v: t.value as string, ...pos };
    }
    return this.fail(`expected an expression, found ${this.describe(t)}`, t);
  }

  args(): Node[] {
    this.expect("op", "(");
    const args: Node[] = [];
    if (!this.accept("op", ")")) {
      do args.push(this.expr());
      while (this.accept("op", ","));
      this.expect("op", ")", "',' or ')'");
    }
    return args;
  }

  stmt(): Stmt {
    const t = this.peek();
    const pos = { line: t.line, column: t.column };
    if (t.kind !== "name")
      this.fail(`expected an effect statement, found ${this.describe(t)}`);
    this.next();
    if (t.value === "relationship") {
      this.expect("op", "(");
      const p = this.ident("a person name");
      this.expect("op", ")");
      return this.relationship(pos, {
        name: p.value as string,
        line: p.line,
        column: p.column,
      });
    }
    if (this.is("op", "(")) {
      const args = this.args();
      let as: (Pos & { name: string }) | undefined;
      if (this.accept("kw", "as")) {
        const n = this.ident("a name after 'as'");
        as = { name: n.value as string, line: n.line, column: n.column };
      }
      return {
        k: "call",
        name: t.value as string,
        args,
        ...(as ? { as } : {}),
        ...pos,
      };
    }
    const op = this.peek();
    if (op.kind !== "op" || !["=", "+=", "-="].includes(op.value as string)) {
      this.fail(
        `expected '=', '+=' or '-=' after '${t.value}', found ${this.describe(op)}`,
      );
    }
    this.next();
    return {
      k: "assign",
      op: op.value as "=" | "+=" | "-=",
      target: { path: t.value as string, ...pos },
      value: this.expr(),
      ...pos,
    };
  }

  private relationship(pos: Pos, person: Pos & { name: string }): Stmt {
    this.expect("op", ".", "'.field' after relationship(...)");
    const field = this.ident("a relationship field");
    const op = this.peek();
    if (op.kind !== "op" || !["=", "+=", "-="].includes(op.value as string)) {
      this.fail(
        `expected '+=' after relationship(...).${field.value}, found ${this.describe(op)}`,
      );
    }
    this.next();
    return {
      k: "rel",
      person,
      field: field.value as string,
      op: op.value as string,
      value: this.expr(),
      ...pos,
    };
  }
}

export function parseExpr(src: string): Node {
  const p = new Parser(lex(src));
  const e = p.expr();
  p.end();
  return e;
}

export function parseStmt(src: string): Stmt {
  const p = new Parser(lex(src));
  const s = p.stmt();
  p.end();
  return s;
}
