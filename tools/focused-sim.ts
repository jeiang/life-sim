/**
 * `pnpm tool focused-sim`: one command that plays a Pack's focused profile and the baseline
 * profile (and the content sheet's profile) for a bounded time, prints per-storylet fire rate
 * and outcome shares, and flags what is off (docs/spec/tools/focused-sim.md). It flags and
 * never fixes: the exit status is 0 whatever is flagged.
 */
import { existsSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { PackBundle } from "../packages/core/src/index.ts";
import {
  chainSteps,
  loadMetrics,
  loadProfiles,
  type ProfileSpec,
  type Report,
  runHarnessParallel,
  selectProfiles,
} from "../packages/harness/src/index.ts";
import {
  compilePacks,
  formatDiagnostic,
} from "../packages/pack-tools/src/index.ts";
import { formatSheetError, parseSheet, type Sheet } from "./lib/sheet.ts";

export const summary =
  "focused sim of one Pack diffed against its content sheet: fire rates, outcome shares, flags (--pack id [--sheet f.md] [--lives n] [--jobs n])";

const USAGE = `usage: pnpm tool focused-sim --pack <id> [--sheet <sheet.md>] [options]
  --pack id            the Pack to exercise (loaded with the Packs it requires)
  --sheet file         content sheet whose expected rates (opens, outcome rate) are diffed
  --lives n            lives per run (default: the sheet's lives, else 1000)
  --jobs n             worker threads (default: available cores)
  --budget seconds     wall-clock budget for all runs together (default 15; 0: no limit).
                       Runs stop early at the budget and report the lives played so far
  --seed n             base seed (default 1)
  --decision-share pct flag a choice event above this share of all choice events (default 3)
  --packs-dir dir      Packs directory (default: the repository's packs/)
  --format md|json     output format (default md)
Flags are advice: the exit status is 0 with flags, 2 on a usage error or unreadable input.
`;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Standard errors of slack on a measured mean before it counts as outside a band. */
export const SLACK_SE = 2;
export const DEFAULT_BUDGET_SECONDS = 15;
export const DEFAULT_LIVES = 1000;
export const DEFAULT_DECISION_SHARE = 3;
/** Lives per worker batch: small, so that the budget stops a run within about a second. */
const BATCH_LIVES = 4;
/** The baseline profile: the plain random player of the core Pack. */
export const BASELINE_PROFILE = "random";

// ---- model ------------------------------------------------------------------

export type Role = "baseline" | "focused" | "sheet";

export interface RunResult {
  /** What the run is for; one run may serve several roles when their profiles coincide. */
  readonly roles: readonly Role[];
  readonly profiles: readonly string[];
  readonly requested: number;
  readonly seconds: number;
  readonly report: Report;
}

export type FlagKind =
  | "off-band"
  | "never-fired"
  | "never-reached"
  | "over-decisions"
  | "not-in-pack"
  | "structure";

export interface Flag {
  readonly kind: FlagKind;
  /** Storylet id (with the Pack), and for an outcome its key. */
  readonly storylet: string;
  readonly outcome?: string;
  /** Sheet line the expectation came from. */
  readonly line?: number;
  readonly message: string;
}

export interface RateRow {
  readonly storylet: string;
  /** Fires per life, by run index (null: the run did not play). */
  readonly perLife: readonly number[];
  readonly band?: { readonly lo: number; readonly hi: number; line: number };
  readonly flagged: boolean;
}

export interface ShareRow {
  readonly storylet: string;
  /** `o<i>` or `c<j>.o<i>`, 0-based in YAML order. */
  readonly key: string;
  readonly label: string;
  /** Percent of the group's resolutions, by run index; null when the group never resolved. */
  readonly percent: readonly (number | null)[];
  readonly band?: { readonly lo: number; readonly hi: number; line: number };
  readonly flagged: boolean;
}

/** A run as the analysis reports it: what was played and how many lives. */
export interface RunSummary {
  readonly roles: readonly Role[];
  readonly profiles: readonly string[];
  readonly requested: number;
  readonly seconds: number;
  readonly lives: number;
}

export interface Analysis {
  readonly pack: string;
  readonly runs: readonly RunSummary[];
  readonly flags: readonly Flag[];
  readonly rates: readonly RateRow[];
  readonly shares: readonly ShareRow[];
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const num = (n: number, digits = 3): string =>
  String(Number(n.toFixed(digits)));

// ---- analysis ---------------------------------------------------------------

interface Input {
  readonly pack: string;
  readonly bundles: readonly PackBundle[];
  readonly runs: readonly RunResult[];
  readonly sheet?: Sheet | undefined;
  readonly decisionShare?: number;
}

/** `lo..hi` verdict for a measured mean with a standard error: "low", "high" or null. */
export function outside(
  measured: number,
  se: number,
  lo: number,
  hi: number,
): "low" | "high" | null {
  if (measured + SLACK_SE * se < lo) return "low";
  if (measured - SLACK_SE * se > hi) return "high";
  return null;
}

const factor = (measured: number, bound: number): string =>
  measured > 0 && bound > 0
    ? `${num(Math.max(measured / bound, bound / measured), 1)}x`
    : "never";

export function analyse(input: Input): Analysis {
  const { pack, bundles, runs, sheet } = input;
  const decisionShare = input.decisionShare ?? DEFAULT_DECISION_SHARE;
  const owner = bundles.find((b) => b.id === pack);
  const byId = new Map<string, PackBundle["storylets"][number]>();
  for (const b of bundles) for (const s of b.storylets) byId.set(s.id, s);
  const flags: Flag[] = [];

  // The storylets in scope: the sheet's, or every storylet of the Pack.
  const scope: string[] = [];
  if (sheet) {
    for (const s of sheet.storylets) {
      const id = `${pack}/${s.id}`;
      if (byId.has(id)) scope.push(id);
      else
        flags.push({
          kind: "not-in-pack",
          storylet: id,
          line: s.line,
          message: `sheet storylet '${s.id}' is not in Pack '${pack}' (not implemented yet, or the id differs)`,
        });
    }
  } else for (const s of owner?.storylets ?? []) scope.push(s.id);
  scope.sort(byName);

  const fired = (r: RunResult, id: string): number =>
    r.report.storylets.fired[id] ?? 0;
  const perLife = (r: RunResult, id: string): number =>
    r.report.lives > 0 ? fired(r, id) / r.report.lives : 0;

  // Never fired in any run.
  const chain = new Set(
    runs.flatMap((r) => r.report.storylets.chainStepsNeverFired),
  );
  for (const id of scope)
    if (runs.every((r) => fired(r, id) === 0)) {
      const isChain = chain.has(id);
      flags.push({
        kind: isChain ? "never-reached" : "never-fired",
        storylet: id,
        message: isChain
          ? `chain step never reached in ${describeRuns(runs)}`
          : `never fired in ${describeRuns(runs)}`,
      });
    }

  // Choice events above a share of all choice events. Chain steps are left out: a player's own
  // action leads to them, so they are not decisions the year draw dealt.
  const steps = chainSteps(bundles);
  const choiceEvents = new Set<string>();
  for (const s of byId.values())
    if (s.trigger === "event" && s.choices.length > 0 && !steps.has(s.id))
      choiceEvents.add(s.id);
  for (const r of runs) {
    let total = 0;
    for (const id of choiceEvents) total += fired(r, id);
    if (total === 0) continue;
    for (const id of scope) {
      if (!choiceEvents.has(id)) continue;
      const share = (fired(r, id) / total) * 100;
      if (share > decisionShare)
        flags.push({
          kind: "over-decisions",
          storylet: id,
          message: `${num(share, 1)}% of all choice events in the ${roleOf(r)} run (limit ${num(decisionShare, 1)}%)`,
        });
    }
  }

  // Sheet bands: opens per life and outcome shares.
  const sIdx = runs.findIndex((r) => r.roles.includes("sheet"));
  const rateBand = new Map<string, NonNullable<RateRow["band"]>>();
  const shareBand = new Map<string, NonNullable<ShareRow["band"]>>();
  const flaggedRate = new Set<string>();
  const flaggedShare = new Set<string>();
  if (sheet && sIdx >= 0) {
    const run = runs[sIdx] as RunResult;
    const lives = run.report.lives;
    for (const s of sheet.storylets) {
      const id = `${pack}/${s.id}`;
      const real = byId.get(id);
      if (!real) continue;
      if (s.opens) {
        rateBand.set(id, {
          lo: s.opens.lo,
          hi: s.opens.hi,
          line: s.opens.line,
        });
        const m = perLife(run, id);
        const v = outside(
          m,
          Math.sqrt(m / Math.max(1, lives)),
          s.opens.lo,
          s.opens.hi,
        );
        if (v) {
          flaggedRate.add(id);
          const bound = v === "low" ? s.opens.lo : s.opens.hi;
          flags.push({
            kind: "off-band",
            storylet: id,
            line: s.opens.line,
            message: `opens ${num(m, 4)} per life, expected ${num(s.opens.lo)}..${num(s.opens.hi)}: ${factor(m, bound)} too ${v}`,
          });
        }
      }
      const groups: {
        key: string;
        choice: number | null;
        so: typeof s.outcomes;
      }[] =
        s.choices.length > 0
          ? s.choices.map((c, j) => ({
              key: `c${j}`,
              choice: j,
              so: c.outcomes,
            }))
          : [{ key: "", choice: null, so: s.outcomes }];
      if (
        !s.choices.length !== !real.choices.length ||
        s.choices.length !== real.choices.length
      ) {
        if (groups.some((g) => g.so.some((o) => o.rate)))
          flags.push({
            kind: "structure",
            storylet: id,
            line: s.line,
            message: `the sheet has ${s.choices.length} choices, the Pack ${real.choices.length}: outcome rates not compared`,
          });
        continue;
      }
      for (const g of groups) {
        const realOutcomes =
          g.choice === null
            ? real.outcomes
            : (real.choices[g.choice]?.outcomes ?? []);
        if (realOutcomes.length !== g.so.length) {
          if (g.so.some((o) => o.rate))
            flags.push({
              kind: "structure",
              storylet: id,
              line: s.line,
              message: `the sheet has ${g.so.length} outcomes${g.choice === null ? "" : ` in choice ${g.choice + 1}`}, the Pack ${realOutcomes.length}: outcome rates not compared`,
            });
          continue;
        }
        const tally = run.report.storylets.outcomes[id] ?? {};
        const keyOf = (i: number): string =>
          g.choice === null ? `o${i}` : `c${g.choice}.o${i}`;
        let total = 0;
        for (let i = 0; i < g.so.length; i++) total += tally[keyOf(i)] ?? 0;
        g.so.forEach((o, i) => {
          if (!o.rate) return;
          const key = keyOf(i);
          shareBand.set(`${id}\u0000${key}`, {
            lo: o.rate.lo,
            hi: o.rate.hi,
            line: o.rate.line,
          });
          if (total === 0) return;
          const p = (tally[key] ?? 0) / total;
          const se = Math.sqrt((p * (1 - p)) / total) * 100;
          const pct = p * 100;
          const v = outside(pct, se, o.rate.lo, o.rate.hi);
          if (v) {
            flaggedShare.add(`${id}\u0000${key}`);
            flags.push({
              kind: "off-band",
              storylet: id,
              outcome: key,
              line: o.rate.line,
              message: `outcome ${key} picked ${num(pct, 1)}% of ${total} resolutions, expected ${num(o.rate.lo)}..${num(o.rate.hi)}%`,
            });
          }
        });
      }
    }
  }

  // Tables.
  const rates: RateRow[] = [];
  for (const id of scope)
    if (runs.some((r) => fired(r, id) > 0) || rateBand.has(id))
      rates.push({
        storylet: id,
        perLife: runs.map((r) => perLife(r, id)),
        ...(rateBand.has(id)
          ? { band: rateBand.get(id) as NonNullable<RateRow["band"]> }
          : {}),
        flagged: flaggedRate.has(id),
      });

  const shares: ShareRow[] = [];
  for (const id of scope) {
    const s = byId.get(id);
    if (!s) continue;
    const groups: {
      choice: number | null;
      outcomes: typeof s.outcomes;
      label: string;
    }[] =
      s.choices.length > 0
        ? s.choices.map((c, j) => ({
            choice: j,
            outcomes: c.outcomes,
            label: c.label,
          }))
        : [{ choice: null, outcomes: s.outcomes, label: "" }];
    for (const g of groups) {
      if (g.outcomes.length < 2) continue;
      const keyOf = (i: number): string =>
        g.choice === null ? `o${i}` : `c${g.choice}.o${i}`;
      const totals = runs.map((r) => {
        const t = r.report.storylets.outcomes[id] ?? {};
        let n = 0;
        for (let i = 0; i < g.outcomes.length; i++) n += t[keyOf(i)] ?? 0;
        return n;
      });
      if (
        totals.every((n) => n === 0) &&
        !g.outcomes.some((_, i) => shareBand.has(`${id}\u0000${keyOf(i)}`))
      )
        continue;
      g.outcomes.forEach((o, i) => {
        const key = keyOf(i);
        const band = shareBand.get(`${id}\u0000${key}`);
        shares.push({
          storylet: id,
          key,
          label: `${g.label ? `${g.label}: ` : ""}${shorten(o.text ?? "") || "(no text)"}`,
          percent: runs.map((r, k) =>
            (totals[k] as number) === 0
              ? null
              : ((r.report.storylets.outcomes[id]?.[key] ?? 0) /
                  (totals[k] as number)) *
                100,
          ),
          ...(band ? { band } : {}),
          flagged: flaggedShare.has(`${id}\u0000${key}`),
        });
      });
    }
  }

  return {
    pack,
    runs: runs.map(({ report, ...r }) => ({ ...r, lives: report.lives })),
    flags,
    rates,
    shares,
  };
}

const roleOf = (r: RunResult): string => r.roles.join("/");
const describeRuns = (runs: readonly RunResult[]): string =>
  runs
    .map(
      (r) => `${roleOf(r)} (${r.profiles.join(",")}, ${r.report.lives} lives)`,
    )
    .join(" and ");
const shorten = (s: string): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
};

// ---- markdown ---------------------------------------------------------------

export function renderMarkdown(a: Analysis): string {
  const L: string[] = [`# Focused sim: ${a.pack}`, ""];
  L.push("Runs:", "");
  for (const r of a.runs) {
    const cut =
      r.lives < r.requested
        ? ` (stopped at the time budget; ${r.requested} requested)`
        : "";
    L.push(
      `- ${r.roles.join(" + ")}: ${r.profiles.join(", ")}: ${r.lives} lives in ${num(r.seconds, 1)} s${cut}`,
    );
  }
  L.push("", `## Flags (${a.flags.length})`, "");
  if (a.flags.length === 0) L.push("None.");
  for (const f of a.flags)
    L.push(
      `- **${f.kind}** \`${f.storylet}\`${f.outcome ? ` ${f.outcome}` : ""}: ${f.message}${f.line ? ` (sheet line ${f.line})` : ""}`,
    );
  const head = a.runs.map((r) => r.roles.join("+"));
  const hasBand = a.rates.some((r) => r.band);
  if (a.rates.length > 0) {
    L.push(
      "",
      "## Fire rate (opens per life)",
      "",
      `| storylet | ${head.join(" | ")} |${hasBand ? " expected |" : ""} |`,
      `|---|${head.map(() => "---|").join("")}${hasBand ? "---|" : ""}---|`,
    );
    for (const r of a.rates)
      L.push(
        `| ${r.storylet} | ${r.perLife.map((n) => num(n, 4)).join(" | ")} |${hasBand ? ` ${r.band ? `${num(r.band.lo)}..${num(r.band.hi)}` : ""} |` : ""} ${r.flagged ? "**FLAG**" : ""} |`,
      );
  }
  if (a.shares.length > 0) {
    const bandCol = a.shares.some((r) => r.band);
    L.push(
      "",
      "## Outcome shares (percent of the choice's or storylet's resolutions)",
      "",
      `| storylet | outcome | ${head.join(" | ")} |${bandCol ? " expected % |" : ""} |`,
      `|---|---|${head.map(() => "---|").join("")}${bandCol ? "---|" : ""}---|`,
    );
    for (const r of a.shares)
      L.push(
        `| ${r.storylet} | ${r.key} ${r.label.replaceAll("|", "\\|")} | ${r.percent.map((p) => (p === null ? "-" : num(p, 1))).join(" | ")} |${bandCol ? ` ${r.band ? `${num(r.band.lo)}..${num(r.band.hi)}` : ""} |` : ""} ${r.flagged ? "**FLAG**" : ""} |`,
      );
  }
  return `${L.join("\n")}\n`;
}

// ---- cli --------------------------------------------------------------------

/** Profile ids a run plays for a sheet's `profile` header (`all`: the default set). */
function sheetProfiles(
  registry: readonly ProfileSpec[],
  profile: string,
): string[] {
  return selectProfiles(
    registry,
    profile === "all" ? [] : profile.split(",").map((p) => p.trim()),
  ).map((p) => p.id);
}

/** One run to play: the roles it serves and the profiles lives are dealt to. */
export interface PlannedRun {
  readonly roles: Role[];
  readonly profiles: string[];
}

/** The runs to play, de-duplicated: baseline, focused, and the sheet's. */
export function planRuns(
  registry: readonly ProfileSpec[],
  pack: string,
  sheet: Sheet | undefined,
): PlannedRun[] {
  const wanted: { role: Role; profiles: string[] }[] = [];
  const baseline = registry.some((p) => p.id === BASELINE_PROFILE)
    ? [BASELINE_PROFILE]
    : registry
        .filter((p) => p.default)
        .slice(0, 1)
        .map((p) => p.id);
  if (baseline.length > 0)
    wanted.push({ role: "baseline", profiles: baseline });
  const focused = registry.filter((p) => p.pack === pack).map((p) => p.id);
  if (focused.length > 0) wanted.push({ role: "focused", profiles: focused });
  if (sheet)
    wanted.push({
      role: "sheet",
      profiles: sheetProfiles(registry, sheet.profile),
    });
  const out: PlannedRun[] = [];
  for (const w of wanted) {
    const same = out.find((o) => o.profiles.join(",") === w.profiles.join(","));
    if (same) same.roles.push(w.role);
    else out.push({ roles: [w.role], profiles: w.profiles });
  }
  return out;
}

interface Cli {
  readonly values: {
    pack?: string;
    sheet?: string;
    lives?: string;
    jobs?: string;
    budget?: string;
    seed?: string;
    "decision-share"?: string;
    "packs-dir"?: string;
    format?: string;
    help?: boolean;
  };
}

function parse(argv: string[]): Cli {
  return parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      pack: { type: "string" },
      sheet: { type: "string" },
      lives: { type: "string" },
      jobs: { type: "string" },
      budget: { type: "string" },
      seed: { type: "string" },
      "decision-share": { type: "string" },
      "packs-dir": { type: "string" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}

function count(
  name: string,
  v: string | undefined,
  d: number,
  min = 0,
): number {
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min)
    throw new Error(`--${name}: not a number >= ${min}: ${v}`);
  return n;
}

export async function run(argv: string[]): Promise<number> {
  const start = performance.now();
  let values: Cli["values"];
  try {
    values = parse(argv).values;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const err = (m: string): number => {
    process.stderr.write(`focused-sim: ${m}\n`);
    return 2;
  };
  let lives: number;
  let jobs: number;
  let budget: number;
  let seed: number;
  let decisionShare: number;
  try {
    if (!values.pack) throw new Error("--pack is required");
    if (
      values.format !== undefined &&
      values.format !== "md" &&
      values.format !== "json"
    )
      throw new Error(`--format: ${values.format}`);
    lives = count("lives", values.lives, 0, 1);
    jobs = count("jobs", values.jobs, Math.min(8, availableParallelism()), 1);
    budget = count("budget", values.budget, DEFAULT_BUDGET_SECONDS);
    seed = count("seed", values.seed, 1);
    decisionShare = count(
      "decision-share",
      values["decision-share"],
      DEFAULT_DECISION_SHARE,
    );
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const pack = values.pack as string;
  const packsDir = resolve(values["packs-dir"] ?? join(REPO, "packs"));

  let sheet: Sheet | undefined;
  if (values.sheet !== undefined) {
    if (!existsSync(values.sheet)) return err(`no such sheet: ${values.sheet}`);
    const parsed = parseSheet(readFileSync(values.sheet, "utf8"));
    if (!parsed.ok) {
      for (const e of parsed.errors)
        process.stderr.write(`${formatSheetError(values.sheet, e)}\n`);
      return err(`${values.sheet} does not parse`);
    }
    sheet = parsed.sheet;
    if (sheet.pack !== pack)
      return err(`the sheet is for Pack '${sheet.pack}', not '${pack}'`);
  }
  if (lives === 0) lives = sheet?.lives ?? DEFAULT_LIVES;

  const compiled = compilePacks(packsDir, { only: [pack] });
  if (!compiled.ok) {
    for (const d of compiled.diagnostics)
      process.stderr.write(`${formatDiagnostic(d)}\n`);
    return err(
      `the Packs in ${packsDir} do not compile (or '${pack}' is unknown)`,
    );
  }
  if (!compiled.bundles.some((b) => b.id === pack))
    return err(`unknown Pack '${pack}'`);
  const loadedMetrics = loadMetrics(packsDir, compiled.bundles);
  const registry = loadProfiles(packsDir, compiled.bundles);
  const diagnostics = [...loadedMetrics.diagnostics, ...registry.diagnostics];
  if (diagnostics.length > 0) {
    for (const d of diagnostics)
      process.stderr.write(`${formatDiagnostic(d)}\n`);
    return err("the Pack metrics or profiles are invalid");
  }
  let plan: PlannedRun[];
  try {
    plan = planRuns(registry.profiles, pack, sheet);
  } catch (e) {
    return err((e as Error).message);
  }
  if (plan.length === 0) return err("no profile to play");

  const results: RunResult[] = [];
  for (const [i, p] of plan.entries()) {
    // Each run gets an equal share of what is left of the budget.
    const left =
      budget === 0
        ? undefined
        : Math.max(0.1, budget - (performance.now() - start) / 1000);
    const { report, seconds } = await runHarnessParallel({
      bundles: compiled.bundles,
      metrics: loadedMetrics.metrics,
      profileSpecs: registry.profiles,
      lives,
      profiles: p.profiles,
      seed,
      packsDir,
      only: [pack],
      jobs,
      batchSize: BATCH_LIVES,
      ...(left === undefined
        ? {}
        : { deadlineSeconds: left / (plan.length - i) }),
    });
    results.push({
      roles: p.roles,
      profiles: p.profiles,
      requested: lives,
      seconds,
      report,
    });
    if (report.faults.total > 0)
      for (const f of report.faults.first.slice(0, 3))
        process.stderr.write(
          `focused-sim: FAULT ${f.kind} [${f.profile} life-seed ${f.seed} age ${f.age}]: ${f.message}\n`,
        );
  }

  const analysis = analyse({
    pack,
    bundles: compiled.bundles,
    runs: results,
    sheet,
    decisionShare,
  });
  process.stdout.write(
    values.format === "json"
      ? `${JSON.stringify(analysis, null, 2)}\n`
      : renderMarkdown(analysis),
  );
  return 0;
}
