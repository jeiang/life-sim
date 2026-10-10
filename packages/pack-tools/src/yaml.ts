import type { Static, TSchema } from "@sinclair/typebox";
import { type ValueError, ValueErrorType } from "@sinclair/typebox/errors";
import { Value } from "@sinclair/typebox/value";
import {
  type Document,
  isNode,
  isSeq,
  LineCounter,
  parseDocument,
  visit,
} from "yaml";
import type { Diagnostic } from "./diagnostics.ts";

export type Path = readonly (string | number)[];

/** A parsed YAML file that can map a data path back to a line and column. */
export interface Source {
  readonly file: string;
  readonly value: unknown;
  locate(path: Path): { line: number; column: number } | undefined;
}

export function formatPath(path: Path): string {
  let out = "";
  for (const p of path) {
    out += typeof p === "number" ? `[${p}]` : out ? `.${p}` : p;
  }
  return out;
}

/**
 * Strict YAML 1.2 (core schema: `yes`/`no` are strings, not booleans), duplicate keys are
 * errors, and a file holds exactly one document. With `blockListsOnly`, a flow list
 * (`[a, b]`) is an error: one entry per line keeps git merges clean.
 */
export function parseYaml(
  file: string,
  text: string,
  diags: Diagnostic[],
  blockListsOnly = false,
): Source | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    strict: true,
    lineCounter,
    prettyErrors: false,
  });
  for (const e of doc.errors) {
    const pos = e.linePos?.[0];
    diags.push({
      file,
      path: "",
      message: `YAML: ${e.message.split("\n")[0]}`,
      ...(pos ? { line: pos.line, column: pos.col } : {}),
    });
  }
  if (doc.errors.length > 0) return null;
  if (blockListsOnly) {
    let flow = false;
    visit(doc, {
      Seq(_, node) {
        if (!isSeq(node) || !node.flow || !node.range) return;
        flow = true;
        const pos = lineCounter.linePos(node.range[0]);
        diags.push({
          file,
          path: "",
          message:
            "flow list ([a, b]) is not allowed here: write a block list with one entry per line",
          line: pos.line,
          column: pos.col,
        });
      },
    });
    if (flow) return null;
  }
  return {
    file,
    value: doc.toJS({ maxAliasCount: 0 }),
    locate: locator(doc, lineCounter),
  };
}

function locator(doc: Document, lc: LineCounter): Source["locate"] {
  return (path) => {
    // Walk up until a node with a range exists (a missing key points at its parent).
    for (let n = path.length; n >= 0; n--) {
      const node = doc.getIn(path.slice(0, n) as (string | number)[], true);
      if (isNode(node) && node.range) {
        const p = lc.linePos(node.range[0]);
        return { line: p.line, column: p.col };
      }
    }
    return undefined;
  };
}

function schemaErrors(schema: TSchema, value: unknown): ValueError[] {
  const out: ValueError[] = [];
  for (const e of Value.Errors(schema, value)) {
    if (e.type === ValueErrorType.Union && Array.isArray(e.errors)) {
      const variants = e.errors.map((v) => [...v]);
      const literals = variants.map((v) =>
        v.length === 1 && v[0]?.type === ValueErrorType.Literal
          ? (v[0].schema as unknown as { const: unknown }).const
          : undefined,
      );
      if (literals.every((l) => l !== undefined)) {
        out.push({ ...e, message: `expected one of: ${literals.join(", ")}` });
        continue;
      }
      const best = variants.reduce((a, v) => (v.length < a.length ? v : a));
      if (best.length > 0) {
        out.push(...best);
        continue;
      }
    }
    out.push(e);
  }
  // A missing required field also reports a type error at the same path.
  const missing = new Set(
    out
      .filter((e) => e.type === ValueErrorType.ObjectRequiredProperty)
      .map((e) => e.path),
  );
  return out.filter(
    (e) =>
      e.type === ValueErrorType.ObjectRequiredProperty || !missing.has(e.path),
  );
}

/** Validate `value` against `schema`; push one diagnostic per violation. */
export function validate<T extends TSchema>(
  src: Source,
  schema: T,
  value: unknown,
  base: Path,
  diags: Diagnostic[],
  label: (path: Path) => string = formatPath,
): value is Static<T> {
  const errors = schemaErrors(schema, value);
  for (const e of errors) {
    const rel = e.path
      .split("/")
      .filter(Boolean)
      .map((s) =>
        /^\d+$/.test(s) ? Number(s) : s.replace(/~1/g, "/").replace(/~0/g, "~"),
      );
    const full = [...base, ...rel];
    const loc = src.locate(full);
    let message = e.message;
    if (e.type === ValueErrorType.ObjectAdditionalProperties) {
      message = `unknown field '${e.path.split("/").pop()}'`;
    } else if (e.type === ValueErrorType.ObjectRequiredProperty) {
      message = `missing required field '${e.path.split("/").pop()}'`;
    }
    diags.push({
      file: src.file,
      path: label(full),
      message,
      ...(loc ? { line: loc.line, column: loc.column } : {}),
    });
  }
  return errors.length === 0;
}
