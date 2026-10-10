/**
 * `pnpm tool vocab`: the state vocabulary of a Pack set, as markdown small enough for an
 * agent prompt (docs/spec/tools/vocab.md). Typed facts come from the compiled bundles; what a
 * bundle does not keep (the comment that says what a quality means, effect macros, the
 * source of a readable, milestone and tag ids) is read from the Pack sources.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMap, isNode, isSeq, LineCounter, parseDocument } from "yaml";
import {
  AGGREGATES,
  ASSIGNABLE,
  assignOps,
  EFFECTS,
  FUNCTIONS,
  HOOK_PHASES,
  type PackBundle,
  type Signature,
} from "../packages/core/src/index.ts";
import {
  compilePacks,
  formatDiagnostic,
} from "../packages/pack-tools/src/index.ts";

export const summary =
  "print the state vocabulary of the Packs for an agent prompt (--packs a,b --format md|json)";

const USAGE = `usage: pnpm tool vocab [--packs a,b] [--packs-dir dir] [--format md|json]
  --packs      only these Packs and the Packs they require (default: every Pack)
  --packs-dir  Packs directory (default: the repository's packs/)
  --format     md (default) or json
`;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- model ------------------------------------------------------------------

export interface VocabStat {
  readonly id: string;
  readonly pack: string;
  readonly label: string;
  readonly start: readonly [number, number];
}

export interface VocabQuality {
  readonly id: string;
  readonly pack: string;
  readonly type: "int" | "flag";
  readonly min?: number;
  readonly max?: number;
  readonly default: number | boolean;
  readonly scope?: "person";
  readonly meaning?: string;
}

export interface VocabState {
  readonly id: string;
  readonly pack: string;
  readonly kind: "counter" | "table";
  readonly type?: "int" | "flag";
  readonly keys?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly default: number | boolean;
  readonly meaning?: string;
}

export interface VocabReadable {
  readonly id: string;
  readonly pack: string;
  readonly kind: "readable" | "slot";
  readonly type: "int" | "bool";
  /** Readable: the source expression. */
  readonly expr?: string;
  /** Slot: how terms combine and the value with none. */
  readonly combine?: "sum" | "max";
  readonly default?: number | boolean;
  /** Slot: the terms Packs add, as `{ pack, expr }`. */
  readonly terms?: readonly { readonly pack: string; readonly expr: string }[];
  readonly meaning?: string;
}

export interface VocabMacro {
  /** The call: `<pack with _>.<macro>`. */
  readonly call: string;
  readonly pack: string;
  readonly params: readonly string[];
  readonly meaning?: string;
}

export interface VocabKind {
  readonly id: string;
  readonly pack: string;
  readonly label?: string;
  readonly fields: readonly string[];
  /** Full ids of the entries every loaded Pack wrote. */
  readonly entries: readonly string[];
}

export interface VocabOwned {
  readonly id: string;
  readonly pack: string;
}

export interface VocabHook {
  readonly pack: string;
  /** `on_birth`, `on_milestone/<id>`, ... */
  readonly phase: string;
  readonly statements: number;
}

export interface VocabSettlement {
  readonly id: string;
  readonly pack: string;
  readonly kind: "income" | "cost";
  readonly label: string;
}

export interface Vocab {
  /** Dependency order. */
  readonly packs: readonly string[];
  readonly stats: readonly VocabStat[];
  readonly qualities: readonly VocabQuality[];
  readonly personQualities: readonly VocabQuality[];
  readonly state: readonly VocabState[];
  readonly readables: readonly VocabReadable[];
  readonly macros: readonly VocabMacro[];
  readonly kinds: readonly VocabKind[];
  readonly roles: readonly (VocabOwned & { readonly label: string })[];
  readonly groups: readonly VocabOwned[];
  readonly tags: readonly VocabOwned[];
  readonly milestones: readonly VocabOwned[];
  readonly hooks: readonly VocabHook[];
  readonly settlement: readonly VocabSettlement[];
  readonly functions: readonly string[];
  readonly effects: readonly string[];
  readonly assignable: readonly string[];
  readonly aggregators: readonly string[];
}

// ---- Pack sources -----------------------------------------------------------

type Row = Record<string, unknown>;

interface Item {
  readonly value: Row;
  /** The comment above the item and after it on its first line, joined. */
  readonly comment: string;
}

const isRow = (v: unknown): v is Row =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `# text` lines directly above 1-based `line` (no blank line between), as one string. */
function commentAbove(lines: readonly string[], line: number): string {
  const out: string[] = [];
  for (let i = line - 2; i >= 0; i--) {
    const t = (lines[i] ?? "").trim();
    if (!t.startsWith("#")) break;
    if (!t.includes("yaml-language-server")) out.push(t.replace(/^#+\s?/, ""));
  }
  return out.reverse().join(" ").trim();
}

/** The `# text` that ends a line, ignoring a `#` inside a quoted string. */
function commentAfter(text: string): string {
  const bare = text.replace(/"[^"]*"|'[^']*'/g, "");
  const m = /\s#\s?(.*)$/.exec(bare);
  return m?.[1]?.trim() ?? "";
}

/** The items of every `<dir>/*.yaml` list, files in name order, each with its comments. */
function loadItems(dir: string): Item[] {
  if (!existsSync(dir)) return [];
  const out: Item[] = [];
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".yaml"))
    .sort()) {
    const text = readFileSync(join(dir, f), "utf8");
    const lc = new LineCounter();
    const doc = parseDocument(text, {
      version: "1.2",
      schema: "core",
      lineCounter: lc,
    });
    if (!isSeq(doc.contents)) continue;
    const lines = text.split("\n");
    for (const node of doc.contents.items) {
      if (!isNode(node) || !node.range) continue;
      const value: unknown = node.toJSON();
      const start = node.range[0];
      if (!isRow(value)) continue;
      const line = lc.linePos(start).line;
      const comment = [
        commentAbove(lines, line),
        commentAfter(lines[line - 1] ?? ""),
      ]
        .filter((c) => c !== "")
        .join(" ");
      out.push({ value, comment });
    }
  }
  return out;
}

/** `<dir>/*.yaml`, each a map, as plain values (kinds, capabilities). */
function loadMaps(dir: string): { name: string; value: Row }[] {
  if (!existsSync(dir)) return [];
  const out: { name: string; value: Row }[] = [];
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".yaml"))
    .sort()) {
    const doc = parseDocument(readFileSync(join(dir, f), "utf8"), {
      version: "1.2",
      schema: "core",
    });
    if (isMap(doc.contents) && isRow(doc.toJS())) {
      out.push({ name: f.slice(0, -5), value: doc.toJS() as Row });
    }
  }
  return out;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const byId = <T extends { id: string; pack: string }>(a: T, b: T): number =>
  a.id < b.id
    ? -1
    : a.id > b.id
      ? 1
      : a.pack < b.pack
        ? -1
        : a.pack > b.pack
          ? 1
          : 0;

const sig = (name: string, s: Signature): string =>
  `${name}(${s.params.join(", ")}) -> ${s.returns}`;

// ---- build ------------------------------------------------------------------

/** The vocabulary of compiled `bundles` (dependency order) whose sources live under `packsDir`. */
export function buildVocab(
  bundles: readonly PackBundle[],
  packsDir: string,
): Vocab {
  const stats: VocabStat[] = [];
  const qualities: VocabQuality[] = [];
  const state: VocabState[] = [];
  const readables: VocabReadable[] = [];
  const macros: VocabMacro[] = [];
  const kinds: VocabKind[] = [];
  const roles: (VocabOwned & { label: string })[] = [];
  const groups: VocabOwned[] = [];
  const hooks: VocabHook[] = [];
  const settlement: VocabSettlement[] = [];
  const tags = new Map<string, string>();
  const milestones = new Map<string, string>();

  const entries = new Map<string, string[]>();
  for (const b of bundles) {
    for (const e of b.kindEntries) {
      const list = entries.get(e.kind) ?? [];
      list.push(e.id);
      entries.set(e.kind, list);
    }
  }
  /** Every `contribute` term, by slot id. */
  const terms = new Map<string, { pack: string; expr: string }[]>();

  for (const b of bundles) {
    const dir = join(packsDir, b.id);
    const meaning = (items: Item[]) =>
      new Map(items.map((i) => [str(i.value.id), i.comment]));

    for (const s of b.stats) {
      stats.push({ id: s.id, pack: b.id, label: s.label, start: s.start });
    }

    const qm = meaning(loadItems(join(dir, "qualities")));
    for (const q of b.qualities) {
      qualities.push({
        id: q.id,
        pack: b.id,
        type: q.type,
        ...(q.type === "int" && q.min !== undefined ? { min: q.min } : {}),
        ...(q.type === "int" && q.max !== undefined ? { max: q.max } : {}),
        default: q.default,
        ...(q.scope ? { scope: q.scope } : {}),
        ...(qm.get(q.id) ? { meaning: qm.get(q.id) as string } : {}),
      });
    }

    const sm = meaning(loadItems(join(dir, "state")));
    for (const s of b.state) {
      state.push({
        id: s.id,
        pack: b.id,
        kind: s.kind,
        ...(s.kind === "counter" ? { type: s.type } : { keys: s.keys }),
        ...("min" in s && s.min !== undefined ? { min: s.min } : {}),
        ...("max" in s && s.max !== undefined ? { max: s.max } : {}),
        default: s.default,
        ...(sm.get(s.id) ? { meaning: sm.get(s.id) as string } : {}),
      });
    }

    const rItems = loadItems(join(dir, "readables"));
    const rm = meaning(rItems.filter((i) => i.value.kind !== "contribute"));
    const exprOf = new Map(
      rItems.map((i) => [str(i.value.id), str(i.value.expr)]),
    );
    for (const i of rItems) {
      if (i.value.kind !== "contribute") continue;
      const list = terms.get(str(i.value.slot)) ?? [];
      list.push({ pack: b.id, expr: str(i.value.expr) });
      terms.set(str(i.value.slot), list);
    }
    for (const r of b.readables) {
      readables.push({
        id: r.id,
        pack: b.id,
        kind: r.kind,
        type: r.type,
        ...(r.kind === "readable" ? { expr: exprOf.get(r.id) ?? "" } : {}),
        ...(r.kind === "slot"
          ? {
              ...(r.type === "int" ? { combine: r.combine } : {}),
              default: r.default,
            }
          : {}),
        ...(rm.get(r.id) ? { meaning: rm.get(r.id) as string } : {}),
      });
    }

    const prefix = b.id.replaceAll("-", "_");
    for (const i of loadItems(join(dir, "effects"))) {
      macros.push({
        call: `${prefix}.${str(i.value.id)}`,
        pack: b.id,
        params: strings(i.value.params),
        ...(i.comment ? { meaning: i.comment } : {}),
      });
    }

    for (const k of b.kinds) {
      kinds.push({
        id: k.id,
        pack: b.id,
        ...(k.label ? { label: k.label } : {}),
        fields: k.fields.map((f) =>
          f.type === "ref"
            ? `${f.name}: ref ${f.to}`
            : f.type === "expr"
              ? `${f.name}: expr ${f.returns}`
              : `${f.name}: ${f.type}`,
        ),
        entries: [...(entries.get(k.id) ?? [])].sort(),
      });
    }

    for (const p of b.people) {
      if (p.type === "role")
        roles.push({ id: p.id, pack: b.id, label: p.label });
    }
    for (const g of b.exclusivity) groups.push({ id: g, pack: b.id });

    for (const c of loadMaps(join(dir, "capabilities"))) {
      const provides = isRow(c.value.provides) ? c.value.provides : {};
      for (const t of strings(provides.tags)) tags.set(t, tags.get(t) ?? b.id);
      for (const m of strings(provides.milestones)) {
        milestones.set(m, milestones.get(m) ?? b.id);
      }
    }
    for (const s of b.storylets) {
      for (const t of s.tags) if (!tags.has(t)) tags.set(t, b.id);
    }

    if (b.hooks) {
      for (const phase of HOOK_PHASES) {
        const list = b.hooks[phase];
        if (list) hooks.push({ pack: b.id, phase, statements: list.length });
      }
      for (const [id, list] of Object.entries(b.hooks.on_milestone ?? {})) {
        hooks.push({
          pack: b.id,
          phase: `on_milestone/${id}`,
          statements: list.length,
        });
        if (!milestones.has(id)) milestones.set(id, b.id);
      }
    }
    for (const l of b.settlement ?? []) {
      settlement.push({ id: l.id, pack: b.id, kind: l.kind, label: l.label });
    }
  }

  const withTerms = readables.map((r) => {
    const t = r.kind === "slot" ? terms.get(r.id) : undefined;
    return t ? { ...r, terms: t } : r;
  });

  const owned = (m: Map<string, string>): VocabOwned[] =>
    [...m].map(([id, pack]) => ({ id, pack })).sort(byId);

  return {
    packs: bundles.map((b) => b.id),
    stats: stats.sort(byId),
    qualities: qualities.filter((q) => !q.scope).sort(byId),
    personQualities: qualities.filter((q) => q.scope).sort(byId),
    state: state.sort(byId),
    readables: withTerms.sort(byId),
    macros: macros.sort((a, b) => (a.call < b.call ? -1 : 1)),
    kinds: kinds.sort(byId),
    roles: roles.sort(byId),
    groups: groups.sort(byId),
    tags: owned(tags),
    milestones: owned(milestones),
    hooks,
    settlement,
    functions: Object.entries(FUNCTIONS as Record<string, Signature>).map(
      ([n, s]) => sig(n, s),
    ),
    effects: [
      ...Object.entries(EFFECTS as Record<string, Signature>).map(([n, s]) =>
        sig(n, s),
      ),
      // Own syntax, so not in EFFECTS (docs/spec/pack-format/storylets.md#scheduled-consequences).
      "schedule(id, after: <a>-<b> years[, person][, lineage: true]) -> bool",
      // Own syntax too: optional named arguments on a child or grandchild spawn (parseSpawn in pack-tools expr/parser.ts).
      "spawn_person(id, id[, parent: <person>][, link: <birth|adopted|step>]) as <name> -> bool",
      // Own syntax too: a bound person's relationship (checkStmt `rel` in pack-tools expr/check.ts).
      "relationship(<person>).closeness += <int>",
      "relationship(<person>).role = <id>",
    ],
    // `person` and a bound person's name (`<bound>.money`, ...) take only these (assignOps in core expr/functions.ts).
    assignable: Object.entries(ASSIGNABLE).flatMap(([root, ops]) =>
      root === "person"
        ? ["money", "quality.<id>", "table.<id>.<key>"].map(
            (t) =>
              `person.${t} ${(assignOps(`person.${t.split(".")[0]}`) ?? []).join(" ")}`,
          )
        : [`${root} ${ops.join(" ")}`],
    ),
    aggregators: [...AGGREGATES],
  };
}

// ---- markdown ---------------------------------------------------------------

const range = (q: { min?: number; max?: number }): string =>
  q.min === undefined && q.max === undefined
    ? ""
    : ` ${q.min ?? ""}..${q.max ?? ""}`;

const tail = (meaning: string | undefined): string =>
  meaning ? `: ${meaning}` : "";

function section(
  out: string[],
  title: string,
  intro: string,
  lines: string[],
): void {
  if (lines.length === 0) return;
  out.push("", `## ${title}`, intro, ...lines);
}

/** Deterministic markdown, one line per name; sections with nothing in them are left out. */
export function renderMarkdown(v: Vocab): string {
  const out: string[] = [`# Vocabulary: ${v.packs.join(", ") || "no Packs"}`];
  out.push(
    "",
    "Packs in dependency order. `(pack)` is the owner; ids are bare unless a full id is shown.",
  );

  const quality = (q: VocabQuality, root: string): string =>
    `- \`${root}${q.id}\` (${q.pack}) ${q.type}${range(q)} = ${q.default}${tail(q.meaning)}`;

  section(
    out,
    "Stats",
    "Read `stat.<id>`; assign `+= -= =`. Range 0-100.",
    v.stats.map(
      (s) =>
        `- \`stat.${s.id}\` (${s.pack}) ${s.label}, start ${s.start[0]}-${s.start[1]}`,
    ),
  );
  section(
    out,
    "Qualities",
    "Read `quality.<id>`; assign `+= =` (flags `=`), clamped to the range.",
    v.qualities.map((q) => quality(q, "quality.")),
  );
  section(
    out,
    "Person qualities",
    "Also on a scoped or bound person: `person.quality.<id>`, `<bound>.quality.<id>`.",
    v.personQualities.map((q) => quality(q, "quality.")),
  );
  section(
    out,
    "State",
    "Counter `world.<id>` (whole world); table `table.<id>.<key>` (per person; `person.table...` for another).",
    v.state.map((s) =>
      s.kind === "counter"
        ? `- \`world.${s.id}\` (${s.pack}) ${s.type}${range(s)} = ${s.default}${tail(s.meaning)}`
        : `- \`table.${s.id}.<key>\` (${s.pack}) keys ${(s.keys ?? []).join(", ")}${range(s)} = ${s.default}${tail(s.meaning)}`,
    ),
  );
  section(
    out,
    "Readables",
    "A bare name in any expression; read-only. A slot sums or maxes its default and the terms Packs add.",
    v.readables.map((r) => {
      const head = `- \`${r.id}\` (${r.pack}) ${r.kind} ${r.type}`;
      if (r.kind === "readable")
        return `${head} = \`${r.expr}\`${tail(r.meaning)}`;
      const how = r.type === "int" ? `${r.combine ?? "sum"}, ` : "any, ";
      const terms = (r.terms ?? [])
        .map((t) => `${t.pack} \`${t.expr}\``)
        .join(", ");
      return `${head} (${how}default ${r.default})${tail(r.meaning)}${terms ? ` [terms: ${terms}]` : ""}`;
    }),
  );
  section(
    out,
    "Effect macros",
    "An effect statement: `<pack>.<macro>(args)`, integer arguments.",
    v.macros.map(
      (m) =>
        `- \`${m.call}(${m.params.join(", ")})\` (${m.pack})${tail(m.meaning)}`,
    ),
  );
  section(
    out,
    "Kinds",
    'Read `kind("<kind>", <id>).<field>`.',
    v.kinds.flatMap((k) => [
      `- \`${k.id}\` (${k.pack})${k.label ? ` ${k.label}` : ""}: ${k.fields.join("; ")}`,
      ...(k.entries.length > 0 ? [`  - entries: ${k.entries.join(", ")}`] : []),
    ]),
  );
  section(
    out,
    "Roles",
    "Ids of people roles (`has`, `role_closeness`, `count_role`, `spawn_person`).",
    v.roles.map((r) => `- \`${r.id}\` ${r.label}`),
  );
  section(
    out,
    "Groups",
    "Exclusivity groups (`in_group`, `years_in_group`): an occupation of a group excludes another of it.",
    v.groups.map((g) => `- \`${g.id}\` (${g.pack})`),
  );
  section(
    out,
    "Tags",
    "Storylet tags.",
    [v.tags.map((t) => `\`${t.id}\``).join(", ")].filter((l) => l !== ""),
  );
  section(
    out,
    "Milestones",
    "Ids for `on_milestone` hooks.",
    v.milestones.map((m) => `- \`${m.id}\` (${m.pack})`),
  );
  section(
    out,
    "Hooks",
    "Statements per lifecycle phase, run in Pack order.",
    v.hooks.map((h) => `- ${h.pack}: \`${h.phase}\` x${h.statements}`),
  );
  section(
    out,
    "Settlement lines",
    "Yearly lines Packs add after the Core lines.",
    v.settlement.map((l) => `- \`${l.pack}/${l.id}\` ${l.kind}: ${l.label}`),
  );
  section(
    out,
    "Functions",
    "Expression functions.",
    v.functions.map((f) => `- \`${f}\``),
  );
  section(
    out,
    "Effects",
    `Effect calls. Assign targets (a bound person's name works like \`person\`): ${v.assignable.map((a) => `\`${a}\``).join(", ")}. Aggregators over containers: ${v.aggregators.map((a) => `\`${a}\``).join(", ")}.`,
    v.effects.map((f) => `- \`${f}\``),
  );
  return `${out.join("\n")}\n`;
}

// ---- command ----------------------------------------------------------------

export function run(argv: string[]): number {
  let a: Record<string, string | boolean | undefined>;
  try {
    a = parseArgs({
      args: argv,
      options: {
        packs: { type: "string" },
        "packs-dir": { type: "string" },
        format: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    }).values;
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  const format = a.format ?? "md";
  if (format !== "md" && format !== "json") {
    console.error(`--format must be md or json\n\n${USAGE}`);
    return 2;
  }
  const packsDir = resolve(
    typeof a["packs-dir"] === "string" ? a["packs-dir"] : join(REPO, "packs"),
  );
  const only =
    typeof a.packs === "string"
      ? a.packs.split(",").filter((p) => p !== "")
      : undefined;
  if (only?.length === 0) {
    console.error("--packs needs at least one Pack id");
    return 2;
  }
  const compiled = compilePacks(packsDir, only ? { only } : {});
  if (!compiled.ok) {
    for (const d of compiled.diagnostics) console.error(formatDiagnostic(d));
    console.error(
      `\n${compiled.diagnostics.length} error(s): the Packs in ${packsDir} do not compile`,
    );
    return 1;
  }
  const vocab = buildVocab(compiled.bundles, packsDir);
  process.stdout.write(
    format === "json"
      ? `${JSON.stringify(vocab, null, 2)}\n`
      : renderMarkdown(vocab),
  );
  return 0;
}
