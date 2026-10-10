/**
 * `pnpm tool scaffold <sheet.md> --pack <id>`: a content sheet (docs/pipeline/content-sheet.md)
 * into a storylet YAML skeleton, `packs/<id>/storylets/<topic>.yaml`. Every name the sheet's
 * expressions use is checked against the Pack vocabulary (`buildVocab`) first; one unknown name
 * and nothing is written (docs/spec/tools/scaffold.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  compilePacks,
  formatDiagnostic,
} from "../packages/pack-tools/src/index.ts";
import {
  formatSheetError,
  type Located,
  parseSheet,
  type Sheet,
  type SheetError,
  type SheetOutcome,
  type SheetStorylet,
  splitList,
} from "./lib/sheet.ts";
import { buildVocab, type Vocab } from "./vocab.ts";

export const summary =
  "scaffold a content sheet into packs/<id>/storylets/<topic>.yaml (--pack id [--topic t] [--stdout])";

const USAGE = `usage: pnpm tool scaffold <sheet.md> --pack <id> [--topic name] [--packs-dir dir] [--force] [--stdout]
  --pack       the owner Pack; must equal the sheet's \`pack\` header
  --topic      file name under packs/<id>/storylets/ (default: the sheet title as a slug)
  --packs-dir  Packs directory (default: the repository's packs/)
  --force      overwrite an existing file
  --stdout     print the YAML instead of writing it
`;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- vocabulary check -------------------------------------------------------

const SEGMENT = "[A-Za-z_]\\w*(?:-[A-Za-z_]\\w*)*";
const TOKEN = new RegExp(`${SEGMENT}(?:\\.${SEGMENT})*(?:/${SEGMENT})*`, "g");

/** Names the checker accepts without a vocabulary entry: what the sheet's `needs` lines declare. */
type Needed = ReadonlySet<string>;

/** `name(` of a function or effect signature `name(params) -> returns`. */
const callName = (signature: string): string =>
  signature.split("(")[0] as string;

interface Names {
  readonly stats: ReadonlySet<string>;
  readonly qualities: ReadonlySet<string>;
  readonly counters: ReadonlySet<string>;
  /** Table id to its keys (empty: any key). */
  readonly tables: ReadonlyMap<string, readonly string[]>;
  readonly functions: ReadonlySet<string>;
  readonly effects: ReadonlySet<string>;
  readonly macros: ReadonlySet<string>;
}

function namesOf(v: Vocab): Names {
  return {
    stats: new Set(v.stats.map((s) => s.id)),
    qualities: new Set([...v.qualities, ...v.personQualities].map((q) => q.id)),
    counters: new Set(
      v.state.filter((s) => s.kind === "counter").map((s) => s.id),
    ),
    tables: new Map(
      v.state
        .filter((s) => s.kind === "table")
        .map((s) => [s.id, s.keys ?? []]),
    ),
    functions: new Set(v.functions.map(callName)),
    effects: new Set(v.effects.map(callName)),
    macros: new Set(v.macros.map((m) => m.call)),
  };
}

/**
 * The names in `expr` that the vocabulary does not have, as messages. It checks what the
 * vocabulary lists by name: `stat.`, `quality.` (also `person.quality.`), `world.` and `table.`
 * references, function and effect calls, and effect macros. A bare word is an id literal or a
 * readable and is left to `pack-tools validate`.
 */
export function unknownNames(
  expr: string,
  names: Names,
  needed: Needed,
  effect = false,
): string[] {
  const code = expr.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const out: string[] = [];
  const bad = (what: string, tok: string, name: string): void => {
    if (!needed.has(name)) out.push(`unknown ${what} '${tok}'`);
  };
  for (const m of code.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index as number;
    if (at > 0 && code[at - 1] === ".") continue;
    if (tok.includes("/")) continue;
    const segs = tok.split(".");
    if (code[at + tok.length] === "(") {
      if (segs.length === 1) {
        // Effect calls (`take_loan(...)`, `relationship(p).closeness += n`) only start an effect statement.
        if (!names.functions.has(tok) && !(effect && names.effects.has(tok)))
          bad(effect ? "function or effect" : "function", tok, tok);
      } else if (!names.macros.has(tok)) {
        bad("effect macro", tok, segs[segs.length - 1] as string);
      }
      continue;
    }
    // `person.quality.x`, `<bound>.table.x.k`: the container word after the bound name.
    const q = segs.indexOf("quality");
    const t = segs.indexOf("table");
    const [head, id] = segs;
    if (head === "stat" && segs.length === 2) {
      if (!names.stats.has(id as string)) bad("stat", tok, id as string);
    } else if (q >= 0 && q < segs.length - 1 && (q === 0 || head !== "stat")) {
      const name = segs[q + 1] as string;
      if (!names.qualities.has(name)) bad("quality", tok, name);
    } else if (head === "world" && segs.length === 2) {
      if (!names.counters.has(id as string)) bad("counter", tok, id as string);
    } else if (t >= 0 && t < segs.length - 1) {
      const name = segs[t + 1] as string;
      const keys = names.tables.get(name);
      const k = segs[t + 2];
      if (keys === undefined) bad("table", tok, name);
      else if (k !== undefined && keys.length > 0 && !keys.includes(k)) {
        bad(`key of table '${name}'`, tok, k);
      }
    }
  }
  return out;
}

// ---- checking a sheet -------------------------------------------------------

/** Every name and reference in `sheet` against `vocab`; `existing` are the full ids (`pack/id`) of the loaded Packs' storylets. */
export function checkSheet(
  sheet: Sheet,
  vocab: Vocab,
  existing: readonly string[],
): SheetError[] {
  const errors: SheetError[] = [];
  const names = namesOf(vocab);
  const needed: Needed = new Set(
    sheet.storylets.flatMap((s) => s.needs.map((n) => n.name)),
  );
  const expr = (
    what: string,
    at: Located | undefined,
    effect = false,
  ): void => {
    if (!at) return;
    for (const message of unknownNames(at.value, names, needed, effect)) {
      errors.push({
        line: at.line,
        message: `${message} in ${what}; it is not in the vocabulary of ${sheet.packs.join(", ")} (add a \`needs\` line to declare it)`,
      });
    }
  };

  const own = new Set(sheet.storylets.map((s) => s.id));
  const all = new Set(existing);
  const taken = (id: string): boolean => all.has(`${sheet.pack}/${id}`);

  const roles = new Set(vocab.roles.map((r) => r.id));
  const outcomeChecks = (o: SheetOutcome): void => {
    expr("outcome weight", o.weight);
    expr("outcome when", o.when);
    for (const e of o.effects) expr("effect", e, true);
    if (
      o.next &&
      !own.has(o.next.value) &&
      !taken(o.next.value) &&
      !all.has(o.next.value)
    ) {
      errors.push({
        line: o.next.line,
        message: `next '${o.next.value}' is neither a storylet of this sheet nor an existing storylet of ${sheet.pack}`,
      });
    }
  };

  for (const s of sheet.storylets) {
    if (taken(s.id)) {
      errors.push({
        line: s.line,
        message: `storylet id '${s.id}' already exists in Pack ${sheet.pack}`,
      });
    }
    for (const key of [
      "when",
      "weight",
      "amount.min",
      "amount.max",
      "amount.step",
    ]) {
      expr(key, s.fields[key]);
    }
    const target = s.fields.target;
    if (target) {
      for (const r of splitList(target.value)) {
        if (!roles.has(r) && !roles.has(`${sheet.pack}/${r}`)) {
          errors.push({
            line: target.line,
            message: `unknown role '${r}' in target`,
          });
        }
      }
    }
    for (const o of s.outcomes) outcomeChecks(o);
    for (const c of s.choices) {
      expr("choice when", c.when);
      for (const o of c.outcomes) outcomeChecks(o);
    }
  }
  return errors.sort((a, b) => a.line - b.line);
}

// ---- YAML -------------------------------------------------------------------

const RESERVED = /^(true|false|null|yes|no|on|off|y|n)$/i;

/** A YAML scalar: plain when that is unambiguous, double-quoted otherwise. */
function scalar(v: string): string {
  if (/^-?\d+$/.test(v)) return v;
  const numeric = /^[\d._+-]+(e[+-]?\d+)?$|^0[xo]/i.test(v);
  const safe =
    /^[A-Za-z0-9\u{80}-\u{10ffff}][A-Za-z0-9 .,!?'()/+\-=<>%*\u{80}-\u{10ffff}]*$/u.test(
      v,
    );
  return safe && !numeric && !RESERVED.test(v) ? v : JSON.stringify(v);
}

function outcomeYaml(o: SheetOutcome, indent: string): string[] {
  const out = [`${indent}- weight: ${scalar(o.weight.value)}`];
  const pad = `${indent}  `;
  if (o.when) out.push(`${pad}when: ${scalar(o.when.value)}`);
  out.push(`${pad}text: ${scalar(o.text.value)}`);
  if (o.effects.length > 0) {
    out.push(`${pad}effects:`);
    for (const e of o.effects) out.push(`${pad}  - ${scalar(e.value)}`);
  }
  if (o.next) out.push(`${pad}next: ${o.next.value}`);
  return out;
}

/** Field order of a storylet, as the Pack files write it. */
const HEAD_FIELDS = ["trigger", "menu", "label"] as const;
const AFTER_TRIGGER = [
  "scope",
  "chance",
  "weight",
  "when",
  "once",
  "repeatable",
  "cooldown",
  "max_per_life",
] as const;

/** Boolean storylet fields: the sheet's `true` is written as a YAML boolean, not a string. */
const BOOLEAN_FIELDS: Record<string, true> = { once: true, repeatable: true };

function storyletYaml(s: SheetStorylet): string[] {
  const f = s.fields;
  const out = [`- id: ${s.id}`];
  const put = (key: string): void => {
    const v = f[key];
    if (!v) return;
    out.push(`  ${key}: ${BOOLEAN_FIELDS[key] ? v.value : scalar(v.value)}`);
  };
  put("icon");
  for (const k of HEAD_FIELDS) put(k);
  if (f.tags) out.push(`  tags: [${splitList(f.tags.value).join(", ")}]`);
  for (const k of AFTER_TRIGGER) {
    put(k);
    if (k === "scope" && f.target) {
      out.push(`  target: [${splitList(f.target.value).join(", ")}]`);
    }
  }
  const sub = (group: string, keys: readonly string[]): void => {
    const present = keys.filter((k) => f[`${group}.${k}`]);
    if (present.length === 0) return;
    out.push(`  ${group}:`);
    for (const k of present) {
      out.push(`    ${k}: ${scalar((f[`${group}.${k}`] as Located).value)}`);
    }
  };
  sub("repeat", ["full", "reduced", "factor"]);
  sub("amount", ["min", "max", "step"]);
  put("text");
  if (s.choices.length > 0) {
    out.push("  choices:");
    for (const c of s.choices) {
      out.push(`    - label: ${scalar(c.label.value)}`);
      if (c.when) out.push(`      when: ${scalar(c.when.value)}`);
      out.push("      outcomes:");
      for (const o of c.outcomes) out.push(...outcomeYaml(o, "        "));
    }
  } else {
    out.push("  outcomes:");
    for (const o of s.outcomes) out.push(...outcomeYaml(o, "    "));
  }
  return out;
}

/** The YAML file text for `sheet`. `schema`: the relative path of the storylet JSON Schema, when it applies. */
export function renderYaml(sheet: Sheet, schema?: string): string {
  const head = [
    ...(schema ? [`# yaml-language-server: $schema=${schema}`] : []),
    `# Scaffolded by \`pnpm tool scaffold\` from the content sheet "${sheet.title.value}".`,
    "",
  ];
  return `${[
    ...head,
    ...sheet.storylets
      .map((s) => storyletYaml(s).join("\n"))
      .join("\n\n")
      .split("\n"),
  ].join("\n")}\n`;
}

/** `School bully` -> `school-bully`. */
export function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- command ----------------------------------------------------------------

export function run(argv: string[]): number {
  let a: {
    values: Record<string, string | boolean | undefined>;
    positionals: string[];
  };
  try {
    a = parseArgs({
      args: argv,
      options: {
        pack: { type: "string" },
        topic: { type: "string" },
        "packs-dir": { type: "string" },
        force: { type: "boolean" },
        stdout: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const v = a.values;
  if (v.help) {
    console.log(USAGE);
    return 0;
  }
  const file = a.positionals[0];
  if (
    a.positionals.length !== 1 ||
    file === undefined ||
    typeof v.pack !== "string"
  ) {
    console.error(USAGE);
    return 2;
  }
  if (!existsSync(file)) {
    console.error(`cannot read ${file}`);
    return 1;
  }
  const packsDir = resolve(
    typeof v["packs-dir"] === "string" ? v["packs-dir"] : join(REPO, "packs"),
  );

  const parsed = parseSheet(readFileSync(file, "utf8"));
  const fail = (errors: readonly SheetError[]): number => {
    for (const e of errors) console.error(formatSheetError(file, e));
    console.error(
      `\n${errors.length} error(s) in ${basename(file)}; nothing written`,
    );
    return 1;
  };
  if (!parsed.ok) return fail(parsed.errors);
  const sheet = parsed.sheet;
  if (sheet.pack !== v.pack) {
    return fail([
      {
        line: sheet.headers.pack?.line ?? 1,
        message: `the sheet's pack '${sheet.pack}' is not --pack ${v.pack}`,
      },
    ]);
  }
  if (!existsSync(join(packsDir, sheet.pack))) {
    console.error(`no Pack '${sheet.pack}' in ${packsDir}`);
    return 1;
  }

  const compiled = compilePacks(packsDir, { only: [...sheet.packs] });
  if (!compiled.ok) {
    for (const d of compiled.diagnostics) console.error(formatDiagnostic(d));
    console.error(
      `\n${compiled.diagnostics.length} error(s): the Packs in ${packsDir} do not compile`,
    );
    return 1;
  }
  const vocab = buildVocab(compiled.bundles, packsDir);
  const errors = checkSheet(
    sheet,
    vocab,
    compiled.bundles.flatMap((b) => b.storylets.map((s) => s.id)),
  );
  if (errors.length > 0) return fail(errors);

  const topic = typeof v.topic === "string" ? v.topic : slug(sheet.title.value);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(topic)) {
    console.error(
      `topic '${topic}' must be a lowercase file name (use --topic)`,
    );
    return 2;
  }
  const outFile = join(packsDir, sheet.pack, "storylets", `${topic}.yaml`);
  const rel = relative(
    dirname(outFile),
    join(REPO, "packages/pack-tools/schema/storylets.schema.json"),
  );
  const text = renderYaml(
    sheet,
    rel.startsWith("../../../packages") ? rel : undefined,
  );
  if (v.stdout) {
    process.stdout.write(text);
  } else {
    if (existsSync(outFile) && !v.force) {
      console.error(`${outFile} exists; pick another --topic or pass --force`);
      return 1;
    }
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, text);
    console.log(`wrote ${outFile} (${sheet.storylets.length} storylet(s))`);
  }
  const needs = sheet.storylets.flatMap((s) => s.needs.map((n) => ({ s, n })));
  if (needs.length > 0) {
    console.log(
      `\nDeclare in Pack ${sheet.pack} before \`pack-tools validate\` passes:`,
    );
    for (const { s, n } of needs) {
      console.log(
        `- ${n.kind} ${n.name}: ${n.type}: ${n.meaning} (${s.id}, line ${n.line})`,
      );
    }
  }
  return 0;
}
