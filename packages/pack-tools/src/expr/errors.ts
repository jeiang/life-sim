export interface ExprError {
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

/** Thrown by the lexer and parser; `compileExpr` converts it to an `ExprError`. */
export class SyntaxFailure extends Error {
  readonly line: number;
  readonly column: number;
  constructor(message: string, line: number, column: number) {
    super(message);
    this.line = line;
    this.column = column;
  }
}

/** `3:14: message` with the offending source line and a caret. */
export function formatError(src: string, err: ExprError): string {
  const text = src.split("\n")[err.line - 1] ?? "";
  return `${err.line}:${err.column}: ${err.message}\n  ${text}\n  ${" ".repeat(err.column - 1)}^`;
}
