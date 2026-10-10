import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compilePacks, formatDiagnostic } from "@life/pack-tools";
import type { ForcedReport } from "./force.ts";
import {
  type ForceEntry,
  type ForceScript,
  forceSetOf,
  loadScriptFile,
  loadScripts,
  parseForceArg,
  SCRIPTED_ID,
} from "./force.ts";
import { runHarness } from "./harness.ts";
import { loadMetrics } from "./metrics.ts";
import { resolveJobs, runHarnessParallel } from "./parallel.ts";
import {
  loadProfiles,
  type ProfileSpec,
  selectProfiles,
} from "./profile-spec.ts";
import { type Report, renderMarkdown } from "./report.ts";
import {
  HEIR_POLICIES,
  type HeirPolicy,
  type LifeResult,
  type Lineage,
} from "./run.ts";
import {
  failures,
  findShardFiles,
  type Merged,
  mergeShards,
  parseFailOn,
  parseShard,
  shardRunOf,
  unionRuns,
  writeShard,
} from "./shard.ts";

/** Profile ids the loaded Packs declare, for the usage text (empty until the Packs load). */
let known: readonly ProfileSpec[] = [];

const usage =
  (): string => `usage: pnpm harness --lives N [--profile ${known.length > 0 ? `${known.map((p) => p.id).join("|")}|` : ""}all|a,b] [--seed S] [--out dir] [--packs a,b] [--packs-dir dir] [--life-seed X] [--jobs N] [--force [age:]key=value,...] [--script name|file] [--generations N] [--heir eldest|richest|random] [--shard i/n] [--fail-on faults,never-fired]
       pnpm harness --check-packs [--packs a,b] [--packs-dir dir]
       pnpm harness --list-profiles [--packs a,b] [--packs-dir dir]
       pnpm harness --list-scripts [--packs a,b] [--packs-dir dir]
       pnpm harness merge <dir> [<dir>...] [--out dir] [--fail-on faults,never-fired] [--packs a,b] [--packs-dir dir]
  --lives      lives to simulate (default 100)
  --profile    simulated player profile(s), declared by Packs; several are dealt to lives in turn (default all: every profile not marked \`default: false\`)
  --seed       base seed, uint32 (default 1)
  --out        write report.md and report.json here
  --packs      load only these Packs and the Packs they require (default: every Pack)
  --packs-dir  Packs directory (default: the repository's packs/)
  --jobs       worker threads (default: available cores); the report is identical for any N
  --force      force roll sites by purpose key: \`gambling/play-slots=hit\`, \`outcome/gambling/play-slots=2\`, \`outcome/x=Outcome text\`, \`int:N\`; \`30:key=value\` limits it to one age. Values: hit | miss | pick index | int:N | outcome text (no commas)
  --script     run a forced script (\`<pack>/<name>\` from packs/<id>/harness/force/*.yaml, or a file): per-age forced rolls, choices and actions, by the scripted profile (or the script's own \`profile\`)
  --generations  continue each life as an heir for up to N generations (default 1: one life); the report keeps the founder's life and adds the lineage measures Packs declare
  --heir       who inherits when several children survive: eldest (default), richest or random
  --list-scripts  print the forced scripts the Packs declare, then exit
  --check-packs  validate every Pack's harness/metrics.yaml, harness/profiles.yaml and harness/force/*.yaml against the compiled Packs, then exit (0 valid, 2 not)
  --list-profiles  print the profiles the Packs declare (id, Pack, whether in \`all\`), then exit
  --shard      run only shard i of n (\`2/4\`): lives whose index mod n is i-1, with the usual seeds; writes shard-i-of-n.json.gz to --out (required) for \`merge\`
  --fail-on    also exit 1 on: never-fired (content no life reached, listed per Pack); engine faults and never-matched forced entries always fail
  --life-seed  run one life with exactly this life seed (to replay a reported fault)
  merge <dir>  combine the shard-*.json.gz files found under <dir> (recursively) into one report.md/report.json (in --out, default <dir>), identical to an unsharded run. Several dirs, each a whole run (founder lives and \`--generations\` lives, say), give the first run's report where content is never fired only if no run fired it
Exit status 1 when any engine fault is found or a forced entry never matched.
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

/** Write the report files, print the summary and faults, and exit 1 when the run fails. */
function finish(
  report: Report,
  forced: ForcedReport | undefined,
  seed: number,
  profiles: readonly string[],
  seconds: number | null,
  outDir: string | undefined,
  lineage?: Lineage,
): never {
  const md = renderMarkdown(report, { seed, profiles, forced });
  const gens = lineage && lineage.generations > 1 ? { lineage } : {};
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "report.md"), md);
    writeFileSync(
      join(outDir, "report.json"),
      `${JSON.stringify(
        {
          run: { seed, profiles, ...gens },
          ...report,
          ...(forced ? { forced } : {}),
        },
        null,
        2,
      )}\n`,
    );
  }
  const nw40 = report.netWorth["40"];
  console.log(
    [
      `harness: ${report.lives} lives (${profiles.join(", ")})${seconds === null ? "" : ` in ${seconds.toFixed(1)} s`}`,
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
  const why = failures(report, forced, failOn.on);
  for (const line of why) console.error(`FAIL ${line}`);
  process.exit(why.length > 0 ? 1 : 0);
}

const { values: a, positionals } = parseArgs({
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
    "list-scripts": { type: "boolean" },
    force: { type: "string" },
    script: { type: "string" },
    generations: { type: "string" },
    heir: { type: "string" },
    help: { type: "boolean" },
    shard: { type: "string" },
    "fail-on": { type: "string" },
  },
  allowPositionals: true,
});
const failOn = parseFailOn(a["fail-on"] ?? "");
if (failOn.unknown.length > 0)
  fail(`unknown --fail-on '${failOn.unknown.join(",")}' (faults, never-fired)`);

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
const scriptSet = loadScripts(packsDir, compiled.bundles, known);
if (scriptSet.diagnostics.length > 0) {
  for (const d of scriptSet.diagnostics) console.error(formatDiagnostic(d));
  console.error(`The forced scripts in ${packsDir} are invalid.`);
  process.exit(2);
}
if (a["check-packs"]) {
  console.log(
    `${compiled.bundles.length} Packs compile; metrics valid for ${loaded.metrics.length} (${loaded.metrics.map((m) => m.pack).join(", ")}); ${known.length} profiles valid (${known.map((p) => p.id).join(", ")}); ${scriptSet.scripts.length} forced scripts valid (${scriptSet.scripts.map((x) => x.name).join(", ")})`,
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

if (a["list-scripts"]) {
  for (const x of scriptSet.scripts)
    console.log(`${x.name}\t${x.profile ?? SCRIPTED_ID}\t${x.description}`);
  process.exit(0);
}
if (positionals[0] === "merge") {
  const dirs = positionals.slice(1);
  const dir = dirs[0];
  if (!dir) fail("usage: harness merge <dir> [<dir>...]");
  let merged: Merged;
  try {
    merged = unionRuns(
      dirs.map((d) =>
        mergeShards(findShardFiles(d), compiled.bundles, loaded.metrics),
      ),
    );
  } catch (e) {
    console.error(`merge: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  finish(
    merged.report,
    merged.forced,
    merged.run.seed,
    merged.run.profiles,
    null,
    a.out ?? dir,
    merged.run.lineage,
  );
}
if (positionals.length > 0) fail(`unexpected argument '${positionals[0]}'`);
let script: ForceScript | undefined;
if (a.script !== undefined) {
  script = scriptSet.scripts.find((x) => x.name === a.script);
  if (!script && existsSync(a.script)) {
    const f = loadScriptFile(a.script, compiled.bundles, known);
    if (f.diagnostics.length > 0) {
      for (const d of f.diagnostics) console.error(formatDiagnostic(d));
      console.error(`The forced script ${a.script} is invalid.`);
      process.exit(2);
    }
    script = f.script ?? undefined;
  }
  if (!script) fail(`unknown script '${a.script}'`);
  if (a.profile !== undefined)
    fail("--script names its own profile; do not pass --profile");
}
let extra: ForceEntry[] = [];
if (a.force !== undefined) {
  const f = parseForceArg(a.force, compiled.bundles);
  if (f.diagnostics.length > 0) {
    for (const d of f.diagnostics) console.error(formatDiagnostic(d));
    console.error("--force is invalid.");
    process.exit(2);
  }
  extra = f.entries;
}
const force =
  script || extra.length > 0 ? forceSetOf(script, extra) : undefined;

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
const profiles = script
  ? [script.profile ?? SCRIPTED_ID]
  : selectProfiles(known, requested).map((p) => p.id);
if (profiles.length === 0)
  fail("no profiles: no Pack declares a default profile");

const shard = a.shard === undefined ? undefined : parseShard(a.shard);
if (a.shard !== undefined && !shard)
  fail("--shard must be i/n with 1 <= i <= n, such as 2/4");
if (shard && lifeSeed !== undefined)
  fail("--shard cannot be combined with --life-seed");

const generations = int("generations", a.generations, 1);
if (generations < 1) fail("--generations must be at least 1");
const heir = a.heir ?? "eldest";
if (!HEIR_POLICIES.includes(heir as HeirPolicy))
  fail(`--heir must be one of ${HEIR_POLICIES.join(", ")}`);
if (generations > 1 && force)
  fail("--generations cannot be combined with --force or --script");
const lineage: Lineage | undefined =
  generations > 1 ? { generations, heir: heir as HeirPolicy } : undefined;

const run = {
  bundles: compiled.bundles,
  metrics: loaded.metrics,
  profileSpecs: known,
  lives,
  profiles,
  seed,
  ...(lifeSeed === undefined ? {} : { lifeSeed }),
  ...(force ? { force } : {}),
  ...(lineage ? { lineage } : {}),
  ...(shard ? { shard } : {}),
};
const shardLives: LifeResult[] = [];
const onLife = shard ? (r: LifeResult) => void shardLives.push(r) : undefined;
const { report, forced, seconds } =
  resolveJobs(jobs) === 1
    ? runHarness(run, onLife)
    : await runHarnessParallel({
        ...run,
        packsDir,
        ...(only ? { only } : {}),
        ...(onLife ? { onLife } : {}),
        jobs,
      });
if (shard) {
  if (!a.out) fail("--shard needs --out: the shard's lives are written there");
  writeShard(
    a.out,
    shardRunOf(seed, lives, profiles, force, lineage),
    shard,
    shardLives,
  );
}
finish(report, forced, seed, profiles, seconds, a.out, lineage);
