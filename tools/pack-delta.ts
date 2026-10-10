/**
 * `pnpm tool pack-delta`: what a change did to the harness numbers, from two `report.json`
 * files (docs/spec/tools/pack-delta.md). Per-storylet fire rate, death-cause shares and Pack
 * metrics, each flagged when it moved past a threshold, grouped by the Pack that owns it.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export const summary =
  "diff two harness report.json files: fire rates, outcome shares, Pack metrics (--pack id, thresholds)";

const USAGE = `usage: pnpm tool pack-delta <base-report.json> <new-report.json> [options]
  --pack id               only this Pack's storylets and metrics
  --format md|json        output format (default md)
  --rate-threshold pct    flag a fire rate that moved by this relative percent (default 10)
  --min-rate n            ignore fire-rate moves under n fires per life (default 0.001)
  --share-threshold pp    flag an outcome share that moved by this many percentage points (default 2)
  --metric-threshold pct  flag a Pack metric that moved by this relative percent (default 10)
  --fail-on-breach        exit 1 when anything is flagged
`;

// ---- model ------------------------------------------------------------------

export interface Thresholds {
  readonly ratePct: number;
  readonly minRate: number;
  readonly sharePp: number;
  readonly metricPct: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  ratePct: 10,
  minRate: 0.001,
  sharePp: 2,
  metricPct: 10,
};

export interface Change {
  readonly key: string;
  readonly base: number | null;
  readonly next: number | null;
  readonly delta: number;
  /** Relative change in percent; null when the base is 0 or absent. */
  readonly pct: number | null;
  readonly flagged: boolean;
}

export interface PackDelta {
  readonly pack: string;
  readonly fireRates: readonly Change[];
  readonly metrics: readonly Change[];
}

export interface Delta {
  readonly baseLives: number;
  readonly newLives: number;
  readonly thresholds: Thresholds;
  readonly packs: readonly PackDelta[];
  /** Death-cause shares, percent of finished lives. */
  readonly outcomes: readonly Change[];
  readonly flagged: number;
}

/** The parts of a harness `report.json` this tool reads. */
interface ReportJson {
  lives?: number;
  storylets?: { fired?: Record<string, number> };
  death?: { ended?: number; causes?: Record<string, number> };
  packMetrics?: Record<string, { stats?: Record<string, StatJson> }>;
}
interface StatJson {
  label?: string;
  rows?: { group?: string; age?: number; key?: string; value: unknown }[];
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** The Pack a storylet id belongs to (`pack/name`); ids without a Pack go under `(none)`. */
export function packOfStorylet(id: string): string {
  const i = id.indexOf("/");
  return i > 0 ? id.slice(0, i) : "(none)";
}

function change(
  key: string,
  base: number | null,
  next: number | null,
  flag: (b: number, n: number, pct: number | null) => boolean,
): Change {
  const b = base ?? 0;
  const n = next ?? 0;
  const pct =
    base === null || base === 0 ? null : ((n - b) / Math.abs(b)) * 100;
  return {
    key,
    base,
    next,
    delta: round(n - b),
    pct: pct === null ? null : round(pct),
    flagged: n !== b && flag(b, n, pct),
  };
}

function merged(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
  flag: (b: number, n: number, pct: number | null) => boolean,
): Change[] {
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort(byName)
    .map((k) => change(k, a.get(k) ?? null, b.get(k) ?? null, flag));
}

/** Fires per life, by storylet id. */
function rates(r: ReportJson): Map<string, number> {
  const lives = r.lives && r.lives > 0 ? r.lives : 1;
  return new Map(
    Object.entries(r.storylets?.fired ?? {}).map(([id, n]) => [id, n / lives]),
  );
}

/** Percent of finished lives per cause of death. */
function shares(r: ReportJson): Map<string, number> {
  const causes = r.death?.causes ?? {};
  const total =
    r.death?.ended ?? Object.values(causes).reduce((a, b) => a + b, 0);
  return new Map(
    Object.entries(causes).map(([c, n]) => [
      c,
      total > 0 ? (n / total) * 100 : 0,
    ]),
  );
}

/** The numbers a stat row carries: a number, a median's value, a distribution's mean and p50. */
function numbersOf(value: unknown): [string, number][] {
  if (typeof value === "number") return [["", value]];
  if (value === null || typeof value !== "object") return [];
  const v = value as Record<string, unknown>;
  if ("mean" in v || "p50" in v) {
    const out: [string, number][] = [];
    if (typeof v.mean === "number") out.push([".mean", v.mean]);
    if (typeof v.p50 === "number") out.push([".p50", v.p50]);
    return out;
  }
  return typeof v.value === "number" ? [[".median", v.value]] : [];
}

/** Pack metric values by `<stat id>[group/age/key]`, per Pack. */
function metricsOf(r: ReportJson, pack: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, s] of Object.entries(r.packMetrics?.[pack]?.stats ?? {}))
    for (const row of s.rows ?? []) {
      const where = [row.group, row.age, row.key]
        .filter((x) => x !== undefined)
        .join("/");
      for (const [suffix, n] of numbersOf(row.value))
        out.set(`${id}${suffix}${where ? `[${where}]` : ""}`, n);
    }
  return out;
}

export function buildDelta(
  base: ReportJson,
  next: ReportJson,
  opts: { pack?: string | undefined; thresholds?: Thresholds } = {},
): Delta {
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const rateFlag = (b: number, n: number, pct: number | null): boolean =>
    Math.abs(n - b) >= t.minRate &&
    (pct === null || Math.abs(pct) >= t.ratePct);
  const metricFlag = (_b: number, _n: number, pct: number | null): boolean =>
    pct === null || Math.abs(pct) >= t.metricPct;
  const shareFlag = (b: number, n: number): boolean =>
    Math.abs(n - b) >= t.sharePp;

  const rateChanges = merged(rates(base), rates(next), rateFlag).filter(
    (c) => c.delta !== 0,
  );
  const names = new Set<string>();
  for (const c of rateChanges) names.add(packOfStorylet(c.key));
  for (const r of [base, next])
    for (const p of Object.keys(r.packMetrics ?? {})) names.add(p);

  const packs: PackDelta[] = [];
  for (const pack of [...names].sort(byName)) {
    if (opts.pack !== undefined && pack !== opts.pack) continue;
    const fireRates = rateChanges.filter((c) => packOfStorylet(c.key) === pack);
    const metrics = merged(
      metricsOf(base, pack),
      metricsOf(next, pack),
      metricFlag,
    ).filter((c) => c.delta !== 0);
    if (fireRates.length > 0 || metrics.length > 0)
      packs.push({ pack, fireRates, metrics });
  }
  const outcomes = merged(shares(base), shares(next), shareFlag).filter(
    (c) => c.delta !== 0,
  );
  const flagged =
    packs.reduce(
      (n, p) =>
        n +
        p.fireRates.filter((c) => c.flagged).length +
        p.metrics.filter((c) => c.flagged).length,
      0,
    ) + outcomes.filter((c) => c.flagged).length;
  return {
    baseLives: base.lives ?? 0,
    newLives: next.lives ?? 0,
    thresholds: t,
    packs,
    outcomes,
    flagged,
  };
}

// ---- markdown ---------------------------------------------------------------

const fmt = (n: number | null, digits = 4): string =>
  n === null ? "-" : String(Number(n.toFixed(digits)));
const sign = (n: number, digits = 4): string =>
  `${n > 0 ? "+" : ""}${fmt(n, digits)}`;

function table(
  heading: string,
  unit: string,
  rows: readonly Change[],
  digits: number,
): string[] {
  if (rows.length === 0) return [];
  const L = [
    heading,
    "",
    `| key | base${unit} | new${unit} | delta | % | |`,
    "|---|---|---|---|---|---|",
  ];
  for (const c of rows)
    L.push(
      `| ${c.key} | ${fmt(c.base, digits)} | ${fmt(c.next, digits)} | ${sign(c.delta, digits)} | ${c.pct === null ? "new/zero base" : `${sign(c.pct, 1)}%`} | ${c.flagged ? "**FLAG**" : ""} |`,
    );
  L.push("");
  return L;
}

export function renderMarkdown(d: Delta): string {
  const t = d.thresholds;
  const L = [
    "# Pack delta",
    "",
    `Lives: base ${d.baseLives}, new ${d.newLives}. Flagged: ${d.flagged} (fire rate >= ${t.ratePct}% and >= ${t.minRate} per life; outcome share >= ${t.sharePp} points; metric >= ${t.metricPct}%).`,
    "",
  ];
  if (d.packs.length === 0 && d.outcomes.length === 0)
    L.push("No differences.", "");
  for (const p of d.packs) {
    L.push(`## ${p.pack}`, "");
    L.push(...table("### Fire rate per life", "", p.fireRates, 4));
    L.push(...table("### Pack metrics", "", p.metrics, 3));
  }
  L.push(
    ...table(
      "## Outcome shares (cause of death, % of lives)",
      " %",
      d.outcomes,
      2,
    ).map((l) => l),
  );
  return `${L.join("\n").trimEnd()}\n`;
}

// ---- cli --------------------------------------------------------------------

function load(path: string): ReportJson {
  return JSON.parse(readFileSync(path, "utf8")) as ReportJson;
}

export function run(argv: string[]): number {
  let parsed: Cli;
  try {
    parsed = parse(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const format = values.format ?? "md";
  const num = (v: string | undefined, d: number, name: string): number => {
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0)
      throw new Error(`--${name}: not a number: ${v}`);
    return n;
  };
  let thresholds: Thresholds;
  try {
    if (positionals.length !== 2 || (format !== "md" && format !== "json"))
      throw new Error(
        positionals.length !== 2
          ? "expected two report.json paths"
          : `--format: ${format}`,
      );
    thresholds = {
      ratePct: num(
        values["rate-threshold"],
        DEFAULT_THRESHOLDS.ratePct,
        "rate-threshold",
      ),
      minRate: num(values["min-rate"], DEFAULT_THRESHOLDS.minRate, "min-rate"),
      sharePp: num(
        values["share-threshold"],
        DEFAULT_THRESHOLDS.sharePp,
        "share-threshold",
      ),
      metricPct: num(
        values["metric-threshold"],
        DEFAULT_THRESHOLDS.metricPct,
        "metric-threshold",
      ),
    };
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  let base: ReportJson;
  let next: ReportJson;
  try {
    base = load(positionals[0] as string);
    next = load(positionals[1] as string);
  } catch (e) {
    process.stderr.write(`pack-delta: ${(e as Error).message}\n`);
    return 2;
  }
  const delta = buildDelta(base, next, { pack: values.pack, thresholds });
  process.stdout.write(
    format === "json"
      ? `${JSON.stringify(delta, null, 2)}\n`
      : renderMarkdown(delta),
  );
  return values["fail-on-breach"] && delta.flagged > 0 ? 1 : 0;
}

interface Cli {
  readonly values: {
    pack?: string;
    format?: string;
    "rate-threshold"?: string;
    "min-rate"?: string;
    "share-threshold"?: string;
    "metric-threshold"?: string;
    "fail-on-breach"?: boolean;
    help?: boolean;
  };
  readonly positionals: string[];
}

function parse(argv: string[]): Cli {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      pack: { type: "string" },
      format: { type: "string" },
      "rate-threshold": { type: "string" },
      "min-rate": { type: "string" },
      "share-threshold": { type: "string" },
      "metric-threshold": { type: "string" },
      "fail-on-breach": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
}
