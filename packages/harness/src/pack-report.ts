import type { LifeMetrics, TableCell } from "./collect.ts";
import { type Dist, dist } from "./dist.ts";
import {
  ALL,
  type Block,
  evalExpr,
  type Format,
  type PackMetrics,
  type Ref,
  type Stat,
  type StatKind,
} from "./metrics.ts";
import type { LifeResult } from "./run.ts";

/** One statistic's value: a number, a distribution, or a median with the lives it covers. */
export type StatValue =
  | number
  | Dist
  | { readonly n: number; readonly value: number | null }
  | null;

export interface StatRow {
  /** Profile name or `all`; absent for a statistic over all lives only. */
  readonly group?: string;
  readonly age?: number;
  /** Action id of a table statistic. */
  readonly key?: string;
  readonly value: StatValue;
}

export interface StatResult {
  readonly label: string;
  readonly kind: StatKind;
  readonly format: Format;
  readonly byProfile: boolean;
  readonly ages: readonly number[];
  readonly keyed: boolean;
  readonly rows: readonly StatRow[];
}

/** One Pack's section of the report (`report.json` `packMetrics.<pack>`). */
export interface PackSection {
  readonly title: string;
  readonly intro?: string;
  readonly blocks: readonly Block[];
  readonly stats: Readonly<Record<string, StatResult>>;
}

interface Entry {
  n: number;
  a: number;
  b: number;
  values: number[];
  keyed: Map<string, { a: number; b: number }>;
}

const fresh = (): Entry => ({ n: 0, a: 0, b: 0, values: [], keyed: new Map() });
const byName = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Merges the declared metrics of every life into one report section per Pack. */
export class PackMetricsAggregate {
  /** `pack:stat` -> `group\0age` -> accumulator. */
  private readonly acc = new Map<string, Map<string, Entry>>();
  /** `pack:measure` of every measure above 0 in some life that a block's `visible_if_measure` names. */
  private readonly shown = new Set<string>();
  /** `pack:table` -> every action id any life did in it. */
  private readonly keys = new Map<string, Set<string>>();
  private readonly profiles = new Set<string>();
  private lives = 0;

  private readonly packs: readonly PackMetrics[];

  constructor(packs: readonly PackMetrics[]) {
    this.packs = packs;
  }

  add(r: LifeResult): void {
    this.lives++;
    this.profiles.add(r.profile);
    for (const p of this.packs) {
      const lm = r.metrics[p.pack];
      if (!lm) continue;
      for (const b of p.blocks)
        if (b.visibleIfMeasure && (lm.measures[b.visibleIfMeasure] ?? 0) > 0)
          this.shown.add(`${p.pack}:${b.visibleIfMeasure}`);
      for (const [tid, cells] of Object.entries(lm.tables)) {
        const seen = this.keys.get(`${p.pack}:${tid}`) ?? new Set<string>();
        this.keys.set(`${p.pack}:${tid}`, seen);
        for (const id of Object.keys(cells)) seen.add(id);
      }
      for (const s of p.stats) this.addStat(p.pack, s, r.profile, lm);
    }
  }

  private addStat(
    pack: string,
    s: Stat,
    profile: string,
    lm: LifeMetrics,
  ): void {
    const get = (id: string) => lm.measures[id];
    if (s.of && evalExpr(s.of, get) === 0) return;
    const cells = s.table ? (lm.tables[s.table] ?? {}) : {};
    const tables = this.acc.get(`${pack}:${s.id}`) ?? new Map<string, Entry>();
    this.acc.set(`${pack}:${s.id}`, tables);
    for (const group of s.byProfile ? [profile, ALL] : [ALL])
      for (const age of s.ages.length > 0 ? s.ages : [undefined]) {
        const k = `${group}\0${age ?? ""}`;
        const e = tables.get(k) ?? fresh();
        tables.set(k, e);
        this.fold(s, e, lm, cells, age);
      }
  }

  private fold(
    s: Stat,
    e: Entry,
    lm: LifeMetrics,
    cells: Record<string, TableCell>,
    age: number | undefined,
  ): void {
    const scalar = (r: Ref): number | undefined =>
      r.t === "measure"
        ? ((age === undefined ? undefined : lm.measures[`${r.id}@${age}`]) ??
          lm.measures[r.id])
        : undefined;
    const cell = (r: Ref, c: TableCell): number =>
      r.t === "column"
        ? (c.cols[r.column] ?? 0)
        : r.t === "slot"
          ? (c.slots[r.slot - 1] ?? 0)
          : 0;
    if (s.kind === "count") return void e.n++;
    if (s.kind === "share") {
      e.n++;
      if (s.when && evalExpr(s.when, (id) => lm.measures[id]) !== 0) e.a++;
      return;
    }
    if (s.table) {
      e.n++;
      for (const [key, c] of Object.entries(cells)) {
        const t = e.keyed.get(key) ?? { a: 0, b: 0 };
        e.keyed.set(key, t);
        if (s.kind === "ratio") {
          for (const r of s.num) t.a += cell(r, c);
          t.b += s.den ? cell(s.den, c) : 0;
        } else t.a += cell(s.value as Ref, c);
      }
      return;
    }
    if (s.kind === "ratio") {
      const num = s.num.map(scalar);
      const den = s.den ? scalar(s.den) : undefined;
      if (den === undefined || num.some((v) => v === undefined)) return;
      e.a += num.reduce<number>((x, v) => x + (v as number), 0);
      e.b += den;
      return;
    }
    const v = scalar(s.value as Ref);
    if (v === undefined) return;
    if (s.kind === "dist" || s.kind === "median") e.values.push(v);
    else {
      e.n++;
      e.a += v;
    }
  }

  private value(s: Stat, e: Entry, key?: string): StatValue {
    const p = 10 ** s.decimals;
    const t = key === undefined ? e : (e.keyed.get(key) ?? { a: 0, b: 0 });
    switch (s.kind) {
      case "count":
        return e.n;
      case "share":
        return e.n === 0 ? 0 : Math.round((e.a / e.n) * (s.scale * p)) / p;
      case "mean":
        return e.n === 0 ? 0 : Math.round((t.a / e.n) * p) / p;
      case "sum":
        return t.a;
      case "ratio":
        return t.b === 0 ? 0 : Math.round((t.a / t.b) * (s.scale * p)) / p;
      case "dist":
        return dist(e.values);
      case "median":
        return { n: e.values.length, value: dist(e.values)?.p50 ?? null };
    }
  }

  /** One section per Pack whose metrics saw activity; empty when no Pack declares metrics. */
  report(): Record<string, PackSection> {
    const out: Record<string, PackSection> = {};
    if (this.lives === 0) return out;
    for (const p of this.packs) {
      if (
        (p.visibleIfTable &&
          (this.keys.get(`${p.pack}:${p.visibleIfTable}`)?.size ?? 0) === 0)
      )
        continue;
      const blocks = p.blocks.filter(
        (b) =>
          !b.visibleIfMeasure ||
          this.shown.has(`${p.pack}:${b.visibleIfMeasure}`),
      );
      // A statistic that only hidden blocks lay out is left out, so a run that never reaches it has no empty rows.
      const hidden = new Set<string>();
      for (const b of p.blocks)
        if (!blocks.includes(b) && "stats" in b)
          for (const id of b.stats) hidden.add(id);
      for (const b of blocks)
        if ("stats" in b) for (const id of b.stats) hidden.delete(id);
      const stats: Record<string, StatResult> = {};
      for (const s of p.stats) {
        if (hidden.has(s.id)) continue;
        const groups = s.byProfile
          ? [...this.profiles, ALL].sort(byName)
          : [ALL];
        const keys = s.table
          ? [...(this.keys.get(`${p.pack}:${s.table}`) ?? [])].sort(byName)
          : [undefined];
        const per = this.acc.get(`${p.pack}:${s.id}`);
        const rows: StatRow[] = [];
        for (const group of groups)
          for (const age of s.ages.length > 0 ? s.ages : [undefined])
            for (const key of keys) {
              const e = per?.get(`${group}\0${age ?? ""}`) ?? fresh();
              rows.push({
                ...(s.byProfile ? { group } : {}),
                ...(age === undefined ? {} : { age }),
                ...(key === undefined ? {} : { key }),
                value: this.value(s, e, key),
              });
            }
        stats[s.id] = {
          label: s.label,
          kind: s.kind,
          format: s.format,
          byProfile: s.byProfile,
          ages: s.ages,
          keyed: s.table !== undefined,
          rows,
        };
      }
      out[p.pack] = {
        title: p.title,
        ...(p.intro ? { intro: p.intro } : {}),
        blocks,
        stats,
      };
    }
    return out;
  }
}

const major = (n: number): string => String(Math.round(n / 100));

function cell(r: StatResult | undefined, v: StatValue | undefined): string {
  if (!r || v === undefined || v === null) return "-";
  const fmt = (n: number): string =>
    r.format === "percent"
      ? `${n}%`
      : r.format === "money"
        ? major(n)
        : String(n);
  if (typeof v === "number") return fmt(v);
  if ("value" in v) return `${v.value === null ? "-" : fmt(v.value)} (${v.n})`;
  return String(v.mean);
}

/** Markdown lines of a section: its heading, intro and blocks. */
export function renderPackSection(sec: PackSection): string[] {
  const L: string[] = [`## ${sec.title}`, ""];
  if (sec.intro) L.push(sec.intro, "");
  for (const b of sec.blocks) {
    if ("text" in b) {
      L.push(b.text, "");
      continue;
    }
    const stats = b.stats.map((id) => sec.stats[id] as StatResult);
    const dims = (s: StatResult) =>
      Number(s.byProfile) + Number(s.ages.length > 0) + Number(s.keyed);
    const lead = stats.reduce((a, s) => (dims(s) > dims(a) ? s : a));
    const lookup = (s: StatResult, row: StatRow): StatValue | undefined =>
      s.rows.find(
        (x) =>
          (!s.byProfile || x.group === row.group) &&
          (s.ages.length === 0 || x.age === row.age) &&
          (!s.keyed || x.key === row.key),
      )?.value;
    if (lead.kind === "dist") {
      L.push(
        "| | n | mean | min | p10 | p50 | p90 | max |",
        "|---|---|---|---|---|---|---|---|",
      );
      for (const s of stats)
        for (const row of s.rows) {
          const tag = [row.group, row.age, row.key]
            .filter((x) => x !== undefined)
            .join(", ");
          const label = tag ? `${s.label} (${tag})` : s.label;
          const d = row.value as Dist | null;
          L.push(
            d
              ? `| ${label} | ${d.n} | ${d.mean} | ${d.min} | ${d.p10} | ${d.p50} | ${d.p90} | ${d.max} |`
              : `| ${label} | 0 | | | | | | |`,
          );
        }
      L.push("");
      continue;
    }
    const head = [
      ...(lead.byProfile ? ["profile"] : []),
      ...(lead.ages.length > 0 ? ["age"] : []),
      ...(lead.keyed ? [b.key] : []),
      ...stats.map((s) => s.label),
    ];
    L.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
    for (const row of lead.rows)
      L.push(
        `| ${[
          ...(lead.byProfile ? [row.group] : []),
          ...(lead.ages.length > 0 ? [row.age] : []),
          ...(lead.keyed ? [row.key] : []),
          ...stats.map((s) => cell(s, lookup(s, row))),
        ].join(" | ")} |`,
      );
    L.push("");
  }
  if (L[L.length - 1] === "") L.pop();
  return L;
}
