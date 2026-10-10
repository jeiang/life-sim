/**
 * `pnpm tool balance-context <report.json> [--pack id]`: the dozen numbers a reviewer needs from
 * a harness `report.json` (docs/spec/tools/balance-context.md). Reads the file the harness
 * wrote; plays nothing.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Report, StatResult } from "../packages/harness/src/index.ts";
import type {
  StatRow,
  StatValue,
} from "../packages/harness/src/pack-report.ts";

export const summary =
  "condense a harness report.json to the numbers a reviewer needs (<report.json> [--pack id])";

const USAGE = `usage: pnpm tool balance-context <report.json> [--pack id]
  --pack  add the Pack's declared metrics and yearly-cap drops
`;

/** Most rows one declared metric prints before "+N more". */
const MAX_ROWS = 4;

const major = (minor: number | undefined): string =>
  minor === undefined ? "-" : String(Math.round(minor / 100));
const num = (n: number | undefined | null): string =>
  n === undefined || n === null ? "-" : String(n);
/** Percent of `part` in `whole`, one decimal. */
const pct = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "-";

function cellValue(res: StatResult, v: StatValue | undefined): string {
  const fmt = (n: number): string =>
    res.format === "percent"
      ? `${n}%`
      : res.format === "money"
        ? major(n)
        : String(n);
  if (v === undefined || v === null) return "-";
  if (typeof v === "number") return fmt(v);
  if ("value" in v) return v.value === null ? "-" : fmt(v.value);
  return fmt(v.p50);
}

function rowLabel(row: StatRow): string {
  const parts: string[] = [];
  if (row.key !== undefined) parts.push(row.key);
  if (row.age !== undefined) parts.push(`@${row.age}`);
  return parts.join(" ");
}

/** One line per declared metric: the all-lives rows only (profile splits stay in report.md). */
function statLine(id: string, res: StatResult): string {
  const rows = res.rows.filter(
    (r) => r.group === undefined || r.group === "all",
  );
  const shown = rows.slice(0, MAX_ROWS).map((r) => {
    const label = rowLabel(r);
    const v = cellValue(res, r.value);
    return label ? `${label} ${v}` : v;
  });
  const more =
    rows.length > MAX_ROWS ? ` (+${rows.length - MAX_ROWS} more)` : "";
  const unit = res.kind === "dist" ? " (median)" : "";
  return `  ${id}: ${shown.join(", ") || "-"}${more}${unit}`;
}

export function balanceContext(r: Report, pack?: string): string[] {
  const L: string[] = [];
  const faults = r.faults.total;
  L.push(
    `${r.lives} lives, ${faults === 0 ? "no engine faults" : `${faults} ENGINE FAULTS`}`,
  );
  const d = r.death.age;
  L.push(
    `death age: median ${num(d?.p50)}, p10 ${num(d?.p10)}, p90 ${num(d?.p90)} (${r.death.unfinished} unfinished)`,
  );
  L.push(
    `net worth, median (major units): at 40 ${major(r.netWorth["40"]?.p50)}, at 65 ${major(r.netWorth["65"]?.p50)}`,
  );
  L.push(`employment share (ages 25-64): ${r.rates.employment}%`);
  L.push(
    `decision slots, years with >=1 / >=2 / >=3: ${r.decisions.atLeast1}% / ${r.decisions.atLeast2}% / ${r.decisions.atLeast3}% (target 90 / 50 / 30)`,
  );
  const drops = Object.values(r.capDrops).reduce((a, b) => a + b, 0);
  L.push(
    `yearly cap hits: ${drops} chance hits dropped (${pct(drops, r.eventsPerYear.years)} of years)`,
  );
  const top = r.storylets.top10[0];
  const fires = Object.values(r.storylets.fired).reduce((a, b) => a + b, 0);
  L.push(
    top
      ? `top storylet: ${top.id}, ${pct(top.count, fires)} of ${fires} fires`
      : "top storylet: none fired",
  );
  L.push(
    `storylets never fired: ${r.storylets.neverFired.length} of ${r.storylets.total}`,
  );

  if (pack === undefined) {
    const ids = [
      ...new Set([...Object.keys(r.packMetrics), ...Object.keys(r.capDrops)]),
    ].sort();
    for (const id of ids) {
      const n = Object.keys(r.packMetrics[id]?.stats ?? {}).length;
      const cap = r.capDrops[id];
      L.push(
        `pack ${id}: ${n} declared metrics${cap === undefined ? "" : `, ${cap} cap drops`} (--pack ${id})`,
      );
    }
    return L;
  }

  const sec = r.packMetrics[pack];
  L.push(
    `pack ${pack}: ${r.capDrops[pack] ?? 0} chance hits dropped by the yearly cap`,
  );
  if (!sec) L.push("  declares no metrics in this report");
  else
    for (const [id, res] of Object.entries(sec.stats))
      L.push(statLine(id, res));
  return L;
}

export function run(argv: string[]): number {
  let parsed: { positionals: string[]; pack: string | undefined };
  try {
    const p = parseArgs({
      args: argv,
      options: { pack: { type: "string" } },
      allowPositionals: true,
    });
    parsed = { positionals: p.positionals, pack: p.values.pack };
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const [file, ...extra] = parsed.positionals;
  if (!file || extra.length > 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  let report: Report;
  try {
    report = JSON.parse(readFileSync(file, "utf8")) as Report;
  } catch (e) {
    process.stderr.write(`cannot read ${file}: ${(e as Error).message}\n`);
    return 1;
  }
  const pack = parsed.pack;
  if (
    pack !== undefined &&
    !(pack in report.packMetrics) &&
    !(pack in report.capDrops)
  ) {
    process.stderr.write(
      `report has no data for Pack ${pack} (metrics: ${Object.keys(report.packMetrics).join(", ") || "none"})\n`,
    );
    return 1;
  }
  process.stdout.write(`${balanceContext(report, pack).join("\n")}\n`);
  return 0;
}
