// Renders the PR comment / job summary from the harness report.json.
// usage: node harness-summary.mjs <report.json> [<baseline report.json>|""] <seconds> <exit status> <run url>
import { readFileSync } from "node:fs";

const [reportPath, basePath, seconds, status, runUrl] = process.argv.slice(2);
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const r = load(reportPath);
const b = basePath ? load(basePath) : undefined;

const major = (minor) => (minor === undefined ? "-" : Math.round(minor / 100));
const rows = [
  ["median age at death", (x) => x.death.age?.p50],
  [
    "p10 / p90 age at death",
    (x) => `${x.death.age?.p10 ?? "-"} / ${x.death.age?.p90 ?? "-"}`,
  ],
  ["median net worth at 18", (x) => major(x.netWorth["18"]?.p50)],
  ["median net worth at 40", (x) => major(x.netWorth["40"]?.p50)],
  ["median net worth at 65", (x) => major(x.netWorth["65"]?.p50)],
  ["degree rate %", (x) => x.rates.degree],
  ["employment rate %", (x) => x.rates.employment],
  ["retirement rate %", (x) => x.rates.retirement],
  ["loan default rate %", (x) => x.loans.defaultRate],
  ["repossessions", (x) => x.loans.repossessions],
  ["moved out %", (x) => x.housing.movedOut],
  ["kicked out %", (x) => x.housing.kickedOut],
  ["with parents at 30 %", (x) => x.housing.withParents30],
  ["homeless share of own years %", (x) => x.living.homelessYearShare],
  ["events per year (mean)", (x) => x.eventsPerYear.mean],
  ["storylets never fired", (x) => x.storylets.neverFired.length],
];

const out = [];
const ok = r.faults.total === 0 && status === "0";
out.push(`### Harness, ${r.lives} lives: ${ok ? "pass" : "FAIL"}`);
out.push("");
out.push(
  `Seed ${r.run.seed}, profiles ${r.run.profiles.join(", ")}. Run time ${seconds} s. [Run and full report artifact](${runUrl}).`,
);
out.push("");
if (r.faults.total > 0) {
  out.push(
    `**${r.faults.total} engine faults** (${Object.entries(r.faults.byKind)
      .map(([k, n]) => `${k} ${n}`)
      .join(", ")}). First:`,
  );
  for (const f of r.faults.first.slice(0, 10))
    out.push(
      `- \`${f.kind}\` [${f.profile}, life-seed ${f.seed}, age ${f.age}]: ${f.message}`,
    );
  out.push("");
} else if (status !== "0") {
  out.push(
    `The harness exited with status ${status} without reporting faults (see the job log).`,
  );
  out.push("");
} else {
  out.push("No engine faults.");
  out.push("");
}
out.push(b ? "| metric | this run | main |" : "| metric | this run |");
out.push(b ? "|---|---|---|" : "|---|---|");
for (const [name, f] of rows)
  out.push(`| ${name} | ${f(r) ?? "-"} |${b ? ` ${f(b) ?? "-"} |` : ""}`);
out.push("");
out.push(
  b
    ? `Compared with the last successful run on main (${b.lives} lives).`
    : "No report from main available to compare with.",
);
console.log(out.join("\n"));
