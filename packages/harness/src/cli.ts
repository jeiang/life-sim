import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compilePacks, formatDiagnostic } from "@life/pack-tools";
import { runHarness } from "./harness.ts";
import { loadMetrics } from "./metrics.ts";
import { resolveJobs, runHarnessParallel } from "./parallel.ts";
import {
  loadProfiles,
  type ProfileSpec,
  selectProfiles,
} from "./profile-spec.ts";
import { renderMarkdown } from "./report.ts";

/** Profile ids the loaded Packs declare, for the usage text (empty until the Packs load). */
let known: readonly ProfileSpec[] = [];

const usage =
  (): string => `usage: pnpm harness --lives N [--profile ${known.length > 0 ? `${known.map((p) => p.id).join("|")}|` : ""}all|a,b] [--seed S] [--out dir] [--packs a,b] [--packs-dir dir] [--life-seed X] [--jobs N]
       pnpm harness --check-packs [--packs a,b] [--packs-dir dir]
       pnpm harness --list-profiles [--packs a,b] [--packs-dir dir]
  --lives      lives to simulate (default 100)
  --profile    simulated player profile(s), declared by Packs; several are dealt to lives in turn (default all: every profile not marked \`default: false\`)
  --seed       base seed, uint32 (default 1)
  --out        write report.md and report.json here
  --packs      load only these Packs and the Packs they require (default: every Pack)
  --packs-dir  Packs directory (default: the repository's packs/)
  --jobs       worker threads (default: available cores); the report is identical for any N
  --check-packs  validate every Pack's harness/metrics.yaml and harness/profiles.yaml against the compiled Packs, then exit (0 valid, 2 not)
  --list-profiles  print the profiles the Packs declare (id, Pack, whether in \`all\`), then exit
  --life-seed  run one life with exactly this life seed (to replay a reported fault)
Exit status 1 when any engine fault is found.
`;

function fail(msg: string): never {
  console.error(`${msg}\n\n${usage()}`);
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
    "list-profiles": { type: "boolean" },
    help: { type: "boolean" },
  },
});
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
if (a.help) {
  if (compiled.ok) known = loadProfiles(packsDir, compiled.bundles).profiles;
  console.log(usage());
  process.exit(0);
}
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
const registry = loadProfiles(packsDir, compiled.bundles);
if (registry.diagnostics.length > 0) {
  for (const d of registry.diagnostics) console.error(formatDiagnostic(d));
  console.error(`The Pack profiles in ${packsDir} are invalid.`);
  process.exit(2);
}
known = registry.profiles;
if (a["check-packs"]) {
  console.log(
    `${compiled.bundles.length} Packs compile; metrics valid for ${loaded.metrics.length} (${loaded.metrics.map((m) => m.pack).join(", ")}); ${known.length} profiles valid (${known.map((p) => p.id).join(", ")})`,
  );
  process.exit(0);
}
if (a["list-profiles"]) {
  for (const p of known)
    console.log(
      `${p.id}\t${p.pack}\t${p.default ? "default" : "opt-in"}${p.description ? `\t${p.description}` : ""}`,
    );
  process.exit(0);
}

const lives = int("lives", a.lives, 100);
const seed = int("seed", a.seed, 1);
const lifeSeed =
  a["life-seed"] === undefined
    ? undefined
    : int("life-seed", a["life-seed"], 0);
const jobs = int("jobs", a.jobs, 0);
const requested =
  a.profile === undefined || a.profile === "all" ? [] : a.profile.split(",");
for (const p of requested)
  if (!known.some((k) => k.id === p)) fail(`unknown profile '${p}'`);
const profiles = selectProfiles(known, requested).map((p) => p.id);
if (profiles.length === 0)
  fail("no profiles: no Pack declares a default profile");

const run = {
  bundles: compiled.bundles,
  metrics: loaded.metrics,
  profileSpecs: known,
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
