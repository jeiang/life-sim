import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compilePacks, formatDiagnostic } from "@life/pack-tools";
import { runHarness } from "./harness.ts";
import { loadMetrics } from "./metrics.ts";
import { resolveJobs, runHarnessParallel } from "./parallel.ts";
import {
  EXTRA_PROFILE_NAMES,
  PROFILE_NAMES,
  type ProfileName,
} from "./profiles.ts";
import { renderMarkdown } from "./report.ts";

const USAGE = `usage: pnpm harness --lives N [--profile random|studious|spender|idle|gambler|grinder|all|a,b] [--seed S] [--out dir] [--packs a,b] [--packs-dir dir] [--life-seed X] [--jobs N]
       pnpm harness --check-packs [--packs a,b] [--packs-dir dir]
  --lives      lives to simulate (default 100)
  --profile    simulated player profile(s); several are dealt to lives in turn (default all)
  --seed       base seed, uint32 (default 1)
  --out        write report.md and report.json here
  --packs      load only these Packs and the Packs they require (default: every Pack)
  --packs-dir  Packs directory (default: the repository's packs/)
  --jobs       worker threads (default: available cores); the report is identical for any N
  --check-packs  validate every Pack's harness/metrics.yaml against the compiled Packs, then exit (0 valid, 2 not)
  --life-seed  run one life with exactly this life seed (to replay a reported fault)
Exit status 1 when any engine fault is found.
`;

function fail(msg: string): never {
  console.error(`${msg}\n\n${USAGE}`);
  process.exit(2);
}

function int(name: string, v: string | undefined, dflt: number): number {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff)
    fail(`--${name} must be an integer in 0..4294967295`);
  return n;
}

const { values: a } = parseArgs({
  options: {
    lives: { type: "string" },
    profile: { type: "string" },
    seed: { type: "string" },
    out: { type: "string" },
    packs: { type: "string" },
    "packs-dir": { type: "string" },
    "life-seed": { type: "string" },
    jobs: { type: "string" },
    "check-packs": { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (a.help) {
  console.log(USAGE);
  process.exit(0);
}

const profiles: ProfileName[] =
  a.profile === undefined || a.profile === "all"
    ? [...PROFILE_NAMES]
    : a.profile.split(",").map((p) => {
        if (
          ![...PROFILE_NAMES, ...EXTRA_PROFILE_NAMES].includes(p as ProfileName)
        )
          fail(`unknown profile '${p}'`);
        return p as ProfileName;
      });
const lives = int("lives", a.lives, 100);
const seed = int("seed", a.seed, 1);
const lifeSeed =
  a["life-seed"] === undefined
    ? undefined
    : int("life-seed", a["life-seed"], 0);
const jobs = int("jobs", a.jobs, 0);
const packsDir = resolve(
  a["packs-dir"] ??
    join(dirname(fileURLToPath(import.meta.url)), "../../../packs"),
);

const only =
  a.packs === undefined
    ? undefined
    : a.packs.split(",").filter((p) => p !== "");
if (only?.length === 0) fail("--packs needs at least one Pack id");
const compiled = compilePacks(packsDir, only ? { only } : {});
if (!compiled.ok) {
  for (const d of compiled.diagnostics) console.error(formatDiagnostic(d));
  console.error(`The Packs in ${packsDir} do not compile.`);
  process.exit(2);
}

const loaded = loadMetrics(packsDir, compiled.bundles);
if (loaded.diagnostics.length > 0) {
  for (const d of loaded.diagnostics) console.error(formatDiagnostic(d));
  console.error(`The Pack metrics in ${packsDir} are invalid.`);
  process.exit(2);
}
if (a["check-packs"]) {
  console.log(
    `${compiled.bundles.length} Packs compile; metrics valid for ${loaded.metrics.length} (${loaded.metrics.map((m) => m.pack).join(", ")})`,
  );
  process.exit(0);
}

const run = {
  bundles: compiled.bundles,
  metrics: loaded.metrics,
  lives,
  profiles,
  seed,
  ...(lifeSeed === undefined ? {} : { lifeSeed }),
};
const { report, seconds } =
  resolveJobs(jobs) === 1
    ? runHarness(run)
    : await runHarnessParallel({
        ...run,
        packsDir,
        ...(only ? { only } : {}),
        jobs,
      });
const md = renderMarkdown(report, { seed, profiles });
if (a.out) {
  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, "report.md"), md);
  writeFileSync(
    join(a.out, "report.json"),
    `${JSON.stringify({ run: { seed, profiles }, ...report }, null, 2)}\n`,
  );
}

const nw40 = report.netWorth["40"];
console.log(
  [
    `harness: ${report.lives} lives (${profiles.join(", ")}) in ${seconds.toFixed(1)} s`,
    `faults: ${report.faults.total}${
      report.faults.total
        ? ` (${Object.entries(report.faults.byKind)
            .map(([k, n]) => `${k} ${n}`)
            .join(", ")})`
        : ""
    }`,
    `age at death: median ${report.death.age?.p50 ?? "-"}, p10 ${report.death.age?.p10 ?? "-"}, p90 ${report.death.age?.p90 ?? "-"}; ${report.death.unfinished} unfinished`,
    `net worth at 40 (median, minor units): ${nw40?.p50 ?? "-"}`,
    `events per year: mean ${report.eventsPerYear.mean}; never fired: ${report.storylets.neverFired.length}`,
  ].join("\n"),
);
for (const f of report.faults.first.slice(0, 10))
  console.error(
    `FAULT ${f.kind} [${f.profile} life-seed ${f.seed} age ${f.age}]: ${f.message}`,
  );
process.exit(report.faults.total > 0 ? 1 : 0);
