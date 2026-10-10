import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { indexBundles, type PackBundle } from "@life/core";
import {
  type Diagnostic,
  formatPath,
  parseYaml,
  type Source,
} from "@life/pack-tools";

/**
 * Pack metrics (`packs/<id>/harness/metrics.yaml`, docs/spec/harness.md#pack-metrics): what a
 * Pack wants measured over a run and how the report shows it. The harness package owns this
 * schema and runs it generically; no Pack has code in `packages/harness/src`.
 */

// ---------------------------------------------------------------------------------------
// Expressions over measures: `wagered > 0 and not addicted_end`
// ---------------------------------------------------------------------------------------

type CmpOp = ">" | ">=" | "<" | "<=" | "==" | "!=";

export type Expr =
  | { readonly t: "num"; readonly v: number }
  | { readonly t: "id"; readonly id: string }
  | { readonly t: "not"; readonly e: Expr }
  | {
      readonly t: "bin";
      readonly op: "and" | "or" | CmpOp;
      readonly l: Expr;
      readonly r: Expr;
    };

const TOKEN = /\s*(>=|<=|==|!=|>|<|\(|\)|-?\d+(?:\.\d+)?|[a-z_][a-z0-9_]*)/y;

/** Parse `or` < `and` < `not` < comparison < (number | measure id | parentheses). Throws on a syntax error. */
export function parseExpr(src: string): Expr {
  const toks: string[] = [];
  TOKEN.lastIndex = 0;
  let at = 0;
  while (at < src.length) {
    if (/^\s*$/.test(src.slice(at))) break;
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(src);
    if (!m)
      throw new Error(`unexpected '${src.slice(at).trim()[0]}' in "${src}"`);
    toks.push(m[1] as string);
    at = TOKEN.lastIndex;
  }
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++] as string;
  const or = (): Expr => {
    let l = and();
    while (peek() === "or") {
      take();
      l = { t: "bin", op: "or", l, r: and() };
    }
    return l;
  };
  const and = (): Expr => {
    let l = not();
    while (peek() === "and") {
      take();
      l = { t: "bin", op: "and", l, r: not() };
    }
    return l;
  };
  const not = (): Expr => {
    if (peek() === "not") {
      take();
      return { t: "not", e: not() };
    }
    return cmp();
  };
  const cmp = (): Expr => {
    const l = atom();
    const op = peek();
    if (op && [">", ">=", "<", "<=", "==", "!="].includes(op)) {
      take();
      return { t: "bin", op: op as CmpOp, l, r: atom() };
    }
    return l;
  };
  const atom = (): Expr => {
    const t = peek();
    if (t === undefined) throw new Error(`unexpected end of "${src}"`);
    if (t === "(") {
      take();
      const e = or();
      if (take() !== ")") throw new Error(`missing ')' in "${src}"`);
      return e;
    }
    take();
    if (/^-?\d/.test(t)) return { t: "num", v: Number(t) };
    if (/^[a-z_]/.test(t) && !["and", "or", "not"].includes(t))
      return { t: "id", id: t };
    throw new Error(`unexpected '${t}' in "${src}"`);
  };
  const e = or();
  if (i < toks.length) throw new Error(`unexpected '${toks[i]}' in "${src}"`);
  return e;
}

/** Measure ids an expression reads. */
export function exprIds(e: Expr): string[] {
  if (e.t === "id") return [e.id];
  if (e.t === "not") return exprIds(e.e);
  if (e.t === "bin") return [...exprIds(e.l), ...exprIds(e.r)];
  return [];
}

/** Truth is 1, falsehood 0; a measure the life has no value for reads as 0. */
export function evalExpr(
  e: Expr,
  get: (id: string) => number | undefined,
): number {
  switch (e.t) {
    case "num":
      return e.v;
    case "id":
      return get(e.id) ?? 0;
    case "not":
      return evalExpr(e.e, get) === 0 ? 1 : 0;
    case "bin": {
      const l = evalExpr(e.l, get);
      if (e.op === "and") return l !== 0 && evalExpr(e.r, get) !== 0 ? 1 : 0;
      if (e.op === "or") return l !== 0 || evalExpr(e.r, get) !== 0 ? 1 : 0;
      const r = evalExpr(e.r, get);
      const v =
        e.op === ">"
          ? l > r
          : e.op === ">="
            ? l >= r
            : e.op === "<"
              ? l < r
              : e.op === "<="
                ? l <= r
                : e.op === "=="
                  ? l === r
                  : l !== r;
      return v ? 1 : 0;
    }
  }
}

/** What a `generation:` measure reads from a generation of the lineage (docs/spec/harness.md#pack-metrics). */
export const GENERATION_TAKES = [
  "reached",
  "died",
  "heir_available",
  "heirs",
  "death_age",
  "net_worth",
  "inheritance",
  "heir_age",
  "minor_heir",
  "insolvent_estate",
  "repeated_once",
] as const;

// ---------------------------------------------------------------------------------------
// Compiled form
// ---------------------------------------------------------------------------------------

export type Measure =
  | {
      readonly id: string;
      readonly kind: "quality";
      readonly quality: string;
      /** `end`: final value; `ever`: positive at any observation; `years`: age-ups ending positive. */
      readonly at: "end" | "ever" | "years";
    }
  | {
      readonly id: string;
      readonly kind: "life";
      readonly life: "years" | "earnings";
    }
  | { readonly id: string; readonly kind: "death"; readonly cause: string }
  | {
      readonly id: string;
      readonly kind: "fires";
      readonly storylet?: string;
      readonly tag?: string;
    }
  | {
      readonly id: string;
      readonly kind: "table";
      readonly table: string;
      readonly column: string;
    }
  | {
      readonly id: string;
      readonly kind: "snapshot";
      readonly take:
        | "net_worth"
        | "holdings"
        | { readonly stat: string }
        | { readonly quality: string }
        | { readonly holding: string };
      readonly ages: readonly number[];
    }
  | {
      readonly id: string;
      readonly kind: "market";
      /** A market kind (full item id). */
      readonly market: string;
      readonly take: MarketTake;
    }
  | {
      readonly id: string;
      readonly kind: "outcome";
      readonly storylet: string;
      /** `o<i>` or `c<j>.o<i>`, as in `report.json` storylets.outcomes. */
      readonly key: string;
    }
  | {
      readonly id: string;
      readonly kind: "generation";
      /** What to read from the generation's record (`GENERATION_TAKES`). */
      readonly generation: string;
      /** Generation index: 0 is the founder; a generation the lineage never reached reads 0. */
      readonly n: number;
    }
  | { readonly id: string; readonly kind: "when"; readonly when: Expr };

/** What a market measure reads from the kind's price series over a life (one price a world year). */
export type MarketTake =
  | "annualized_return"
  | "start_price"
  | "end_price"
  | "min_price"
  | "max_price"
  | "delistings"
  | "relistings"
  | "defaults"
  | { readonly dropYears: number };

export const MARKET_TAKES = [
  "annualized_return",
  "start_price",
  "end_price",
  "min_price",
  "max_price",
  "delistings",
  "relistings",
  "defaults",
  "drop_years",
] as const;

export type Column =
  | "count"
  | "amount"
  | { readonly delta: "money" | { readonly quality: string } };

export interface Table {
  readonly id: string;
  /** Count only actions that raised this quality. */
  readonly raises?: string;
  /** Count only actions done with an amount (the amount's grid slot is then recorded). */
  readonly withAmount: boolean;
  /** An action counted here that leaves money below this is an assertion fault. */
  readonly moneyFloor?: number;
  readonly columns: Readonly<Record<string, Column>>;
}

/** What a statistic reads: a measure, a table column summed per action, or one grid slot's count. */
export type Ref =
  | { readonly t: "measure"; readonly id: string }
  | { readonly t: "column"; readonly table: string; readonly column: string }
  | { readonly t: "slot"; readonly table: string; readonly slot: number };

export type StatKind =
  | "count"
  | "share"
  | "mean"
  | "sum"
  | "ratio"
  | "dist"
  | "median";
export type Format = "percent" | "number" | "money";

export interface Stat {
  readonly id: string;
  readonly label: string;
  readonly kind: StatKind;
  /** One result per profile and one for all lives, instead of all lives only. */
  readonly byProfile: boolean;
  /** Lives counted; default every life. */
  readonly of?: Expr;
  readonly when?: Expr;
  readonly value?: Ref;
  readonly num: readonly Ref[];
  readonly den?: Ref;
  readonly scale: number;
  readonly decimals: number;
  readonly format: Format;
  readonly ages: readonly number[];
  /** Set when the refs read a table column: one result per action. */
  readonly table?: string;
}

export type Block = (
  | { readonly text: string }
  | {
      readonly stats: readonly string[];
      /** Heading of the per-action column (default `action`). */
      readonly key: string;
    }
) & {
  /** The block appears only when some life has this measure above 0. */
  readonly visibleIfMeasure?: string;
};

export interface PackMetrics {
  readonly pack: string;
  readonly title: string;
  readonly intro?: string;
  /** The section appears only when some life did an action of this table. */
  readonly visibleIfTable?: string;
  readonly measures: readonly Measure[];
  readonly tables: readonly Table[];
  readonly stats: readonly Stat[];
  readonly blocks: readonly Block[];
}

export const METRICS_FILE = "harness/metrics.yaml";
/** The profile column of a section and the key of the all-lives result. */
export const ALL = "all";
export const SNAPSHOT_AGES = [18, 40, 65] as const;

// ---------------------------------------------------------------------------------------
// Loading and validation
// ---------------------------------------------------------------------------------------

export const IDENT = /^[a-z][a-z0-9_]*$/;
const KINDS: readonly StatKind[] = [
  "count",
  "share",
  "mean",
  "sum",
  "ratio",
  "dist",
  "median",
];
const FORMATS: readonly Format[] = ["percent", "number", "money"];

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export class Loader {
  readonly diags: Diagnostic[] = [];
  private readonly src: Source;

  constructor(src: Source) {
    this.src = src;
  }

  /** Record an error and give back null, to use as an expression. */
  fail(path: readonly (string | number)[], message: string): null {
    this.err(path, message);
    return null;
  }

  err(path: readonly (string | number)[], message: string): void {
    const loc = this.src.locate(path);
    this.diags.push({
      file: this.src.file,
      path: formatPath(path),
      message,
      ...(loc ? { line: loc.line, column: loc.column } : {}),
    });
  }

  /** `v` as an object whose keys are all in `allowed`; null (and an error) otherwise. */
  obj(
    path: readonly (string | number)[],
    v: unknown,
    allowed: readonly string[],
  ): Obj | null {
    if (!isObj(v)) {
      this.err(path, "expected a mapping");
      return null;
    }
    for (const k of Object.keys(v))
      if (!allowed.includes(k))
        this.err(
          [...path, k],
          `unknown key '${k}' (allowed: ${allowed.join(", ")})`,
        );
    return v;
  }

  /** The entries of a mapping of ids to definitions (absent: none). */
  entries(path: readonly (string | number)[], v: unknown): [string, unknown][] {
    if (v === undefined) return [];
    if (!isObj(v)) {
      this.err(path, "expected a mapping");
      return [];
    }
    return Object.entries(v);
  }

  str(
    path: readonly (string | number)[],
    v: unknown,
    what = "a string",
  ): string | null {
    if (typeof v === "string" && v.length > 0) return v;
    this.err(path, `expected ${what}`);
    return null;
  }

  ident(path: readonly (string | number)[], v: unknown): string | null {
    const s = this.str(path, v);
    if (s !== null && !IDENT.test(s)) {
      this.err(
        path,
        `'${s}' is not an id (lowercase letters, digits and underscores)`,
      );
      return null;
    }
    return s;
  }

  int(
    path: readonly (string | number)[],
    v: unknown,
    min: number,
    max: number,
  ): number | null {
    if (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max)
      return v;
    this.err(path, `expected an integer from ${min} to ${max}`);
    return null;
  }

  expr(path: readonly (string | number)[], v: unknown): Expr | null {
    const s = this.str(path, v, "an expression string");
    if (s === null) return null;
    try {
      return parseExpr(s);
    } catch (e) {
      this.err(path, (e as Error).message);
      return null;
    }
  }
}

function parseRef(
  l: Loader,
  path: readonly (string | number)[],
  v: unknown,
): Ref | null {
  const s = l.str(path, v, "a measure id, `table.column` or `table.@slot`");
  if (s === null) return null;
  let m = /^([a-z][a-z0-9_]*)\.@(\d+)$/.exec(s);
  if (m) return { t: "slot", table: m[1] as string, slot: Number(m[2]) };
  m = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(s);
  if (m) return { t: "column", table: m[1] as string, column: m[2] as string };
  if (IDENT.test(s)) return { t: "measure", id: s };
  l.err(
    path,
    `'${s}' is not a measure id, \`table.column\` or \`table.@slot\``,
  );
  return null;
}

/** Parse and check one `metrics.yaml`; every problem is a diagnostic. */
export function compileMetrics(
  pack: string,
  src: Source,
  bundles: readonly PackBundle[],
): { metrics: PackMetrics | null; diagnostics: Diagnostic[] } {
  const l = new Loader(src);
  const qualities = new Set(
    bundles.flatMap((b) => b.qualities.map((q) => q.id)),
  );
  const statIds = new Set(bundles.flatMap((b) => b.stats.map((s) => s.id)));
  const storylets = new Set(
    bundles.flatMap((b) => b.storylets.map((s) => s.id)),
  );
  const marketKinds = new Set(indexBundles(bundles).markets.keys());
  const storyletById = new Map(
    bundles.flatMap((b) => b.storylets.map((s) => [s.id, s] as const)),
  );
  const tags = new Set(
    bundles.flatMap((b) => b.storylets.flatMap((s) => s.tags)),
  );
  const quality = (
    path: readonly (string | number)[],
    v: unknown,
  ): string | null => {
    const s = l.str(path, v, "a quality id");
    if (s !== null && !qualities.has(s)) {
      l.err(path, `unknown quality '${s}'`);
      return null;
    }
    return s;
  };

  const root = l.obj([], src.value, [
    "title",
    "intro",
    "visible_if_table",
    "measures",
    "tables",
    "stats",
    "blocks",
  ]);
  if (!root) return { metrics: null, diagnostics: l.diags };
  const title = l.str(["title"], root.title);
  const intro =
    root.intro === undefined ? undefined : l.str(["intro"], root.intro);

  // Tables.
  const tables: Table[] = [];
  for (const [id, raw] of l.entries(["tables"], root.tables)) {
    const p = ["tables", id];
    if (!IDENT.test(id)) l.err(p, `'${id}' is not an id`);
    const t = l.obj(p, raw, [
      "raises",
      "with_amount",
      "money_floor",
      "columns",
    ]);
    if (!t) continue;
    const raises =
      t.raises === undefined ? undefined : quality([...p, "raises"], t.raises);
    if (t.with_amount !== undefined && typeof t.with_amount !== "boolean")
      l.err([...p, "with_amount"], "expected true or false");
    if (t.money_floor !== undefined && typeof t.money_floor !== "number")
      l.err([...p, "money_floor"], "expected a number");
    const cols: Record<string, Column> = {};
    for (const [cid, c] of l.entries([...p, "columns"], t.columns)) {
      const cp = [...p, "columns", cid];
      if (!IDENT.test(cid)) l.err(cp, `'${cid}' is not an id`);
      if (c === "count" || c === "amount") cols[cid] = c;
      else if (isObj(c)) {
        const d = l.obj(cp, c, ["delta"]);
        if (d?.delta === "money") cols[cid] = { delta: "money" };
        else if (d) {
          const q = quality([...cp, "delta"], d.delta);
          if (q !== null) cols[cid] = { delta: { quality: q } };
        }
      } else
        l.err(
          cp,
          "expected `count`, `amount` or `{ delta: money | <quality> }`",
        );
    }
    if (Object.keys(cols).length === 0)
      l.err([...p, "columns"], "declare at least one column");
    tables.push({
      id,
      ...(raises ? { raises } : {}),
      withAmount: t.with_amount === true,
      ...(typeof t.money_floor === "number"
        ? { moneyFloor: t.money_floor }
        : {}),
      columns: cols,
    });
  }
  const tableById = new Map(tables.map((t) => [t.id, t]));

  // Measures, in order; `when` measures read earlier ones.
  const measures: Measure[] = [];
  const measureIds = new Map<string, Measure>();
  for (const [id, raw] of l.entries(["measures"], root.measures)) {
    const p = ["measures", id];
    if (!IDENT.test(id)) l.err(p, `'${id}' is not an id`);
    if (!isObj(raw)) {
      l.err(p, "expected a mapping");
      continue;
    }
    const kinds = [
      "quality",
      "life",
      "death",
      "fires",
      "table",
      "snapshot",
      "market",
      "outcome",
      "generation",
      "when",
    ].filter((k) => k in raw);
    if (kinds.length !== 1) {
      l.err(
        p,
        "declare exactly one of: quality, life, death, fires, table, snapshot, market, outcome, generation, when",
      );
      continue;
    }
    let m: Measure | null = null;
    switch (kinds[0]) {
      case "quality": {
        const o = l.obj(p, raw, ["quality", "at"]);
        const q = quality([...p, "quality"], raw.quality);
        const at = o?.at;
        if (at !== "end" && at !== "ever" && at !== "years")
          l.err([...p, "at"], "expected end, ever or years");
        else if (q !== null) m = { id, kind: "quality", quality: q, at };
        break;
      }
      case "life": {
        l.obj(p, raw, ["life"]);
        if (raw.life !== "years" && raw.life !== "earnings")
          l.err([...p, "life"], "expected years or earnings");
        else m = { id, kind: "life", life: raw.life };
        break;
      }
      case "death": {
        l.obj(p, raw, ["death"]);
        const c = l.str([...p, "death"], raw.death, "a cause of death");
        if (c !== null) m = { id, kind: "death", cause: c };
        break;
      }
      case "fires": {
        l.obj(p, raw, ["fires"]);
        const f = l.obj([...p, "fires"], raw.fires, ["storylet", "tag"]);
        if (!f) break;
        if ((f.storylet === undefined) === (f.tag === undefined)) {
          l.err([...p, "fires"], "declare exactly one of storylet, tag");
          break;
        }
        if (f.storylet !== undefined) {
          const s = l.str(
            [...p, "fires", "storylet"],
            f.storylet,
            "a storylet id",
          );
          if (s !== null && !storylets.has(s))
            l.err([...p, "fires", "storylet"], `unknown storylet '${s}'`);
          else if (s !== null) m = { id, kind: "fires", storylet: s };
        } else {
          const s = l.str([...p, "fires", "tag"], f.tag, "a tag");
          if (s !== null && !tags.has(s))
            l.err([...p, "fires", "tag"], `no storylet has the tag '${s}'`);
          else if (s !== null) m = { id, kind: "fires", tag: s };
        }
        break;
      }
      case "table": {
        const o = l.obj(p, raw, ["table", "column"]);
        const tid = l.str([...p, "table"], raw.table, "a table id");
        const col = l.str([...p, "column"], o?.column, "a column id");
        const t = tid === null ? undefined : tableById.get(tid);
        if (tid !== null && !t)
          l.err([...p, "table"], `unknown table '${tid}'`);
        else if (t && col !== null && !(col in t.columns))
          l.err([...p, "column"], `table '${t.id}' has no column '${col}'`);
        else if (t && col !== null)
          m = { id, kind: "table", table: t.id, column: col };
        break;
      }
      case "snapshot": {
        const o = l.obj(p, raw, ["snapshot", "ages"]);
        const ages: number[] = [];
        if (!Array.isArray(o?.ages) || o.ages.length === 0)
          l.err([...p, "ages"], "expected a list of ages");
        else
          o.ages.forEach((a, i) => {
            const n = l.int([...p, "ages", i], a, 0, 130);
            if (n !== null) ages.push(n);
          });
        const s = raw.snapshot;
        let take: Extract<Measure, { kind: "snapshot" }>["take"] | null = null;
        if (s === "net_worth") take = "net_worth";
        else if (s === "holdings") take = "holdings";
        else if (isObj(s)) {
          const t = l.obj([...p, "snapshot"], s, [
            "stat",
            "quality",
            "holding",
          ]);
          if (t?.stat !== undefined) {
            const st = l.str([...p, "snapshot", "stat"], t.stat, "a stat id");
            if (st !== null && !statIds.has(st))
              l.err([...p, "snapshot", "stat"], `unknown stat '${st}'`);
            else if (st !== null) take = { stat: st };
          } else if (t?.quality !== undefined) {
            const q = quality([...p, "snapshot", "quality"], t.quality);
            if (q !== null) take = { quality: q };
          } else if (t?.holding !== undefined) {
            const k = l.str(
              [...p, "snapshot", "holding"],
              t.holding,
              "a market kind id",
            );
            if (k !== null && !marketKinds.has(k))
              l.err(
                [...p, "snapshot", "holding"],
                `unknown market kind '${k}'`,
              );
            else if (k !== null) take = { holding: k };
          } else l.err([...p, "snapshot"], "declare stat, quality or holding");
        } else
          l.err(
            [...p, "snapshot"],
            "expected net_worth, holdings, { stat: id }, { quality: id } or { holding: kind }",
          );
        if (take && ages.length > 0) m = { id, kind: "snapshot", take, ages };
        break;
      }
      case "market": {
        const o = l.obj(p, raw, ["market", "take", "drop_bp"]);
        const kind = l.str([...p, "market"], raw.market, "a market kind id");
        if (kind !== null && !marketKinds.has(kind))
          l.err([...p, "market"], `unknown market kind '${kind}'`);
        const take = o?.take;
        let t: MarketTake | null = null;
        if (take === "drop_years") {
          const bp = l.int([...p, "drop_bp"], o?.drop_bp, 1, 10000);
          if (bp !== null) t = { dropYears: bp };
        } else if (
          typeof take === "string" &&
          (MARKET_TAKES as readonly string[]).includes(take)
        ) {
          if (o?.drop_bp !== undefined)
            l.err([...p, "drop_bp"], "only `take: drop_years` has `drop_bp`");
          t = take as MarketTake;
        } else
          l.err([...p, "take"], `expected one of: ${MARKET_TAKES.join(", ")}`);
        if (kind !== null && marketKinds.has(kind) && t)
          m = { id, kind: "market", market: kind, take: t };
        break;
      }
      case "outcome": {
        const o = l.obj(p, raw, ["outcome"]);
        const f = l.obj([...p, "outcome"], o?.outcome, ["storylet", "key"]);
        if (!f) break;
        const sid = l.str(
          [...p, "outcome", "storylet"],
          f.storylet,
          "a storylet id",
        );
        const key = l.str([...p, "outcome", "key"], f.key, "an outcome key");
        if (sid === null || key === null) break;
        const sl = storyletById.get(sid);
        const hit = /^(?:c(\d+)\.)?o(\d+)$/.exec(key);
        if (!sl)
          l.err([...p, "outcome", "storylet"], `unknown storylet '${sid}'`);
        else if (!hit)
          l.err([...p, "outcome", "key"], "expected `o<i>` or `c<j>.o<i>`");
        else {
          const j = hit[1] === undefined ? null : Number(hit[1]);
          const list =
            j === null
              ? sl.choices.length === 0
                ? sl.outcomes
                : undefined
              : sl.choices[j]?.outcomes;
          if (!list)
            l.err(
              [...p, "outcome", "key"],
              j === null
                ? `storylet '${sid}' has choices: use c<j>.o<i>`
                : sl.choices.length === 0
                  ? `storylet '${sid}' has no choices: use o<i>`
                  : `storylet '${sid}' has no choice ${j}`,
            );
          else if (Number(hit[2]) >= list.length)
            l.err(
              [...p, "outcome", "key"],
              `'${key}' is past the ${list.length} outcome(s) there`,
            );
          else m = { id, kind: "outcome", storylet: sid, key };
        }
        break;
      }
      case "generation": {
        const o = l.obj(p, raw, ["generation", "n"]);
        const name = l.str([...p, "generation"], raw.generation, "a name");
        const n = o?.n === undefined ? 0 : l.int([...p, "n"], o.n, 0, 1000);
        if (
          name !== null &&
          !(GENERATION_TAKES as readonly string[]).includes(name)
        )
          l.err(
            [...p, "generation"],
            `expected one of: ${GENERATION_TAKES.join(", ")}`,
          );
        else if (name !== null && n !== null)
          m = { id, kind: "generation", generation: name, n };
        break;
      }
      case "when": {
        l.obj(p, raw, ["when"]);
        const e = l.expr([...p, "when"], raw.when);
        if (e) {
          let ok = true;
          for (const r of exprIds(e)) {
            const ref = measureIds.get(r);
            if (!ref || ref.kind === "snapshot") {
              l.err(
                [...p, "when"],
                `'${r}' is not an earlier measure without ages`,
              );
              ok = false;
            }
          }
          if (ok) m = { id, kind: "when", when: e };
        }
        break;
      }
    }
    if (m) {
      measures.push(m);
      measureIds.set(id, m);
    }
  }

  // Statistics.
  const stats: Stat[] = [];
  const checkRef = (path: readonly (string | number)[], r: Ref): boolean => {
    const t = r.t === "measure" ? undefined : tableById.get(r.table);
    const problem =
      r.t === "measure"
        ? measureIds.has(r.id)
          ? null
          : `unknown measure '${r.id}'`
        : !t
          ? `unknown table '${r.table}'`
          : r.t === "column" && !(r.column in t.columns)
            ? `table '${t.id}' has no column '${r.column}'`
            : r.t === "slot" && (r.slot < 1 || !t.withAmount)
              ? "slots exist only for tables with `with_amount: true`, counted from 1"
              : null;
    if (problem) l.err(path, problem);
    return problem === null;
  };
  for (const [id, raw] of l.entries(["stats"], root.stats)) {
    const p = ["stats", id];
    if (!IDENT.test(id)) l.err(p, `'${id}' is not an id`);
    const s = l.obj(p, raw, [
      "label",
      "kind",
      "by",
      "of",
      "when",
      "value",
      "num",
      "den",
      "scale",
      "decimals",
      "format",
      "ages",
    ]);
    if (!s) continue;
    const kind = s.kind as StatKind;
    if (!KINDS.includes(kind)) {
      l.err([...p, "kind"], `expected one of: ${KINDS.join(", ")}`);
      continue;
    }
    const label = s.label === undefined ? id : l.str([...p, "label"], s.label);
    if (s.by !== undefined && s.by !== "profile")
      l.err([...p, "by"], "expected `profile`");
    const of = s.of === undefined ? undefined : l.expr([...p, "of"], s.of);
    const when =
      s.when === undefined ? undefined : l.expr([...p, "when"], s.when);
    for (const [key, e] of [
      ["of", of],
      ["when", when],
    ] as const)
      for (const r of e ? exprIds(e) : []) {
        const m = measureIds.get(r);
        if (!m || m.kind === "snapshot")
          l.err([...p, key], `'${r}' is not a measure without ages`);
      }
    const value =
      s.value === undefined ? undefined : parseRef(l, [...p, "value"], s.value);
    const den =
      s.den === undefined ? undefined : parseRef(l, [...p, "den"], s.den);
    const num: Ref[] = [];
    for (const [i, n] of (Array.isArray(s.num)
      ? s.num
      : s.num === undefined
        ? []
        : [s.num]
    ).entries()) {
      const r = parseRef(l, [...p, "num", i], n);
      if (r) num.push(r);
    }
    const decimals =
      s.decimals === undefined
        ? kind === "mean"
          ? 3
          : 1
        : l.int([...p, "decimals"], s.decimals, 0, 6);
    const scale =
      s.scale === undefined
        ? 100
        : typeof s.scale === "number" && s.scale > 0
          ? s.scale
          : l.fail([...p, "scale"], "expected a positive number");
    const defaultFormat: Format =
      kind === "share" || kind === "ratio" ? "percent" : "number";
    const format =
      s.format === undefined
        ? defaultFormat
        : (FORMATS as readonly unknown[]).includes(s.format)
          ? (s.format as Format)
          : l.fail([...p, "format"], `expected one of: ${FORMATS.join(", ")}`);
    const ages: number[] = [];
    if (s.ages !== undefined) {
      if (!Array.isArray(s.ages))
        l.err([...p, "ages"], "expected a list of ages");
      else
        s.ages.forEach((a, i) => {
          const n = l.int([...p, "ages", i], a, 0, 130);
          if (n !== null) ages.push(n);
        });
    }

    // Per-kind requirements.
    const refs = [...(value ? [value] : []), ...num, ...(den ? [den] : [])];
    const need = (field: string, present: boolean): void => {
      if (!present)
        l.err([...p, field], `a ${kind} statistic needs \`${field}\``);
    };
    const forbid = (field: string, present: boolean): void => {
      if (present)
        l.err([...p, field], `a ${kind} statistic has no \`${field}\``);
    };
    need("kind", true);
    if (kind === "count") forbid("value", !!value);
    if (kind === "share") need("when", !!when);
    else forbid("when", !!when);
    if (
      kind === "mean" ||
      kind === "sum" ||
      kind === "dist" ||
      kind === "median"
    ) {
      need("value", !!value);
      forbid("num", num.length > 0);
      forbid("den", !!den);
    } else if (kind === "ratio") {
      need("num", num.length > 0);
      need("den", !!den);
      forbid("value", !!value);
    } else {
      forbid("value", !!value);
      forbid("num", num.length > 0);
      forbid("den", !!den);
    }
    let ok = true;
    for (const r of refs) ok = checkRef([...p, "value"], r) && ok;
    const tablesUsed = new Set(
      refs.flatMap((r) => (r.t === "measure" ? [] : [r.table])),
    );
    const measuresUsed = refs.filter((r) => r.t === "measure");
    if (
      tablesUsed.size > 1 ||
      (tablesUsed.size === 1 && measuresUsed.length > 0)
    )
      l.err(
        p,
        "a statistic reads either measures or the columns of one table, not both",
      );
    const snaps = measuresUsed.filter(
      (r) => measureIds.get(r.id)?.kind === "snapshot",
    );
    if (snaps.length > 0 && ages.length === 0)
      l.err([...p, "ages"], "a snapshot measure needs `ages`");
    if (snaps.length === 0 && ages.length > 0)
      l.err([...p, "ages"], "`ages` only apply to snapshot measures");
    for (const r of snaps) {
      const m = measureIds.get(r.id);
      if (m?.kind === "snapshot")
        for (const a of ages)
          if (!m.ages.includes(a))
            l.err([...p, "ages"], `measure '${r.id}' has no age ${a}`);
    }
    if (kind === "dist" && tablesUsed.size > 0)
      l.err(p, "a dist statistic reads a measure");
    if (kind === "median" && tablesUsed.size > 0)
      l.err(p, "a median statistic reads a measure");
    if (
      label === null ||
      decimals === null ||
      scale === null ||
      format === null ||
      !ok
    )
      continue;
    stats.push({
      id,
      label,
      kind,
      byProfile: s.by === "profile",
      ...(of ? { of } : {}),
      ...(when ? { when } : {}),
      ...(value ? { value } : {}),
      num,
      ...(den ? { den } : {}),
      scale,
      decimals,
      format,
      ages,
      ...(tablesUsed.size === 1 ? { table: [...tablesUsed][0] as string } : {}),
    });
  }
  const statById = new Map(stats.map((s) => [s.id, s]));

  // Blocks.
  const blocks: Block[] = [];
  const blocksRaw = root.blocks === undefined ? [] : root.blocks;
  if (!Array.isArray(blocksRaw)) l.err(["blocks"], "expected a list");
  else
    blocksRaw.forEach((raw, i) => {
      const p = ["blocks", i];
      const b = l.obj(p, raw, ["text", "stats", "key", "visible_if_measure"]);
      if (!b) return;
      let visibleIfMeasure: string | undefined;
      if (b.visible_if_measure !== undefined) {
        const t = l.str(
          [...p, "visible_if_measure"],
          b.visible_if_measure,
          "a measure id",
        );
        const ref = t === null ? undefined : measureIds.get(t);
        if (t !== null && (!ref || ref.kind === "snapshot"))
          l.err(
            [...p, "visible_if_measure"],
            `'${t}' is not a measure without ages`,
          );
        else if (t !== null) visibleIfMeasure = t;
      }
      const show = visibleIfMeasure ? { visibleIfMeasure } : {};
      if ((b.text === undefined) === (b.stats === undefined)) {
        l.err(p, "declare exactly one of text, stats");
        return;
      }
      if (b.text !== undefined) {
        const t = l.str([...p, "text"], b.text);
        if (t !== null) blocks.push({ text: t, ...show });
        return;
      }
      if (!Array.isArray(b.stats) || b.stats.length === 0) {
        l.err([...p, "stats"], "expected a list of statistic ids");
        return;
      }
      const ids: string[] = [];
      let unknown = false;
      for (const [j, sid] of b.stats.entries()) {
        const s = typeof sid === "string" ? statById.get(sid) : undefined;
        if (s) ids.push(s.id);
        else {
          unknown = true;
          l.err([...p, "stats", j], `unknown statistic '${String(sid)}'`);
        }
      }
      const chosen = ids.map((x) => statById.get(x) as Stat);
      if (
        chosen.some((s) => s.kind === "dist") &&
        chosen.some((s) => s.kind !== "dist")
      )
        l.err(
          [...p, "stats"],
          "distributions share a block only with each other",
        );
      const dims = (s: Stat) =>
        (s.byProfile ? 1 : 0) + (s.ages.length > 0 ? 1 : 0) + (s.table ? 1 : 0);
      const lead = chosen.reduce<Stat | undefined>(
        (a, s) => (!a || dims(s) > dims(a) ? s : a),
        undefined,
      );
      for (const s of chosen)
        if (
          lead &&
          ((s.byProfile && !lead.byProfile) ||
            (s.ages.length > 0 && lead.ages.length === 0) ||
            (s.table && !lead.table) ||
            (s.table && lead.table && s.table !== lead.table))
        )
          l.err(
            [...p, "stats"],
            `'${s.id}' has a split the other statistics of the block lack`,
          );
      const key = b.key === undefined ? "action" : l.str([...p, "key"], b.key);
      if (key !== null && !unknown) blocks.push({ stats: ids, key, ...show });
    });

  let visibleIfTable: string | undefined;
  if (root.visible_if_table !== undefined) {
    const t = l.str(["visible_if_table"], root.visible_if_table, "a table id");
    if (t !== null && !tableById.has(t))
      l.err(["visible_if_table"], `unknown table '${t}'`);
    else if (t !== null) visibleIfTable = t;
  }
  if (l.diags.length > 0 || title === null)
    return { metrics: null, diagnostics: l.diags };
  return {
    metrics: {
      pack,
      title,
      ...(intro ? { intro } : {}),
      ...(visibleIfTable ? { visibleIfTable } : {}),
      measures,
      tables,
      stats,
      blocks,
    },
    diagnostics: [],
  };
}

/** Load `<packsDir>/<id>/harness/metrics.yaml` of every loaded Pack that has one. */
export function loadMetrics(
  packsDir: string,
  bundles: readonly PackBundle[],
): { metrics: PackMetrics[]; diagnostics: Diagnostic[] } {
  const metrics: PackMetrics[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const b of bundles) {
    const file = join(packsDir, b.id, METRICS_FILE);
    if (!existsSync(file)) continue;
    const rel = `${b.id}/${METRICS_FILE}`;
    const src = parseYaml(rel, readFileSync(file, "utf8"), diagnostics);
    if (!src) continue;
    const c = compileMetrics(b.id, src, bundles);
    diagnostics.push(...c.diagnostics);
    if (c.metrics) metrics.push(c.metrics);
  }
  return { metrics, diagnostics };
}
