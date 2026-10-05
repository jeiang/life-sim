import { SyntaxFailure } from "./errors.ts";

export type TokenKind = "int" | "str" | "name" | "id" | "kw" | "op" | "eof";

export interface Token {
  kind: TokenKind;
  /** Integer value (percent literals already in basis points), string contents, or raw text. */
  value: string | number;
  line: number;
  column: number;
}

export const KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "mod",
  "in",
  "as",
  "true",
  "false",
]);

const ID = /[A-Za-z_][A-Za-z0-9_-]*(?:\/[A-Za-z_][A-Za-z0-9_-]*)+/y;
const NAME = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/y;
const NUM = /(\d+)(?:\.(\d+))?(%)?/y;
const OPS = [
  "+=",
  "-=",
  "<=",
  ">=",
  "==",
  "!=",
  "+",
  "-",
  "*",
  "/",
  "(",
  ")",
  "[",
  "]",
  ",",
  "?",
  ":",
  ".",
  "<",
  ">",
  "=",
];

/**
 * Content ids contain a `/` joined directly to identifier characters (`job/cashier`).
 * Write division between two names with spaces (`a / b`).
 */
export function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  function fail(msg: string, at = i): never {
    throw new SyntaxFailure(msg, line, at - lineStart + 1);
  }
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "\n") {
      line++;
      i++;
      lineStart = i;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    const column = i - lineStart + 1;
    const push = (kind: TokenKind, value: string | number, len: number) => {
      out.push({ kind, value, line, column });
      i += len;
    };
    if (/\d/.test(c)) {
      NUM.lastIndex = i;
      const m = NUM.exec(src) as RegExpExecArray;
      const [text, whole = "", frac, pct] = m;
      if (/[A-Za-z_]/.test(src[i + text.length] ?? ""))
        fail("number followed by letters");
      let value: number;
      if (pct) {
        if ((frac ?? "").length > 2)
          fail(
            "percent literals allow at most two decimal places (basis points)",
          );
        value = Number(whole) * 100 + Number((frac ?? "").padEnd(2, "0"));
      } else if (frac !== undefined) {
        fail("decimals are only allowed in percent literals, for example 2.5%");
      } else {
        value = Number(whole);
      }
      if (!Number.isSafeInteger(value)) fail("integer literal is too large");
      push("int", value, text.length);
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      for (;;) {
        const d = src[j];
        if (d === undefined || d === "\n") fail("unterminated string", i);
        if (d === '"') break;
        if (d === "\\") {
          const x = src[j + 1];
          if (x === '"' || x === "\\") s += x;
          else if (x === "n") s += "\n";
          else fail("unknown escape sequence in string", j);
          j += 2;
        } else {
          s += d;
          j++;
        }
      }
      push("str", s, j + 1 - i);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      ID.lastIndex = i;
      const id = ID.exec(src);
      if (id) {
        push("id", id[0], id[0].length);
        continue;
      }
      NAME.lastIndex = i;
      const name = (NAME.exec(src) as RegExpExecArray)[0];
      push(KEYWORDS.has(name) ? "kw" : "name", name, name.length);
      continue;
    }
    if (c === "%")
      fail("'%' only follows a number literal (2.5%); use 'mod' for modulo");
    if (c === "!" && src[i + 1] !== "=") fail("use 'not' instead of '!'");
    if ((c === "&" || c === "|") && src[i + 1] === c)
      fail(`use '${c === "&" ? "and" : "or"}' instead of '${c}${c}'`);
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) fail(`unexpected character '${c}'`);
    push("op", op as string, (op as string).length);
  }
  out.push({ kind: "eof", value: "", line, column: i - lineStart + 1 });
  return out;
}
