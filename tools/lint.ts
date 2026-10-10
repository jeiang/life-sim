/**
 * `pnpm tool lint`: static content checks over compiled Packs (docs/spec/tools/lint.md). It
 * catches what inspection can (dead or unsatisfiable content, zero weights, `next` chains that
 * go nowhere, qualities read but never written, wagers whose closed-form return is out of
 * band, nominal chances past 100%) so the focused sim only has to look at the rest.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  compilePacks,
  formatDiagnostic,
} from "../packages/pack-tools/src/index.ts";
import { applyAllow, loadPackLint, type PackLint } from "./lint/allow.ts";
import { checkBundles } from "./lint/checks.ts";
import type { Finding } from "./lint/rules.ts";

export const summary =
  "static content checks: dead gates, zero weights, broken chains, unwritten qualities, wager returns (--packs a,b --format md|json)";

const USAGE = `usage: pnpm tool lint [--packs a,b] [--packs-dir dir] [--format md|json]
  --packs      report only findings in these Packs (every Pack is still analysed:
               a quality may be written by another Pack). Default: every Pack
  --packs-dir  Packs directory (default: the repository's packs/)
  --format     md (default) or json
exit: 0 clean or warnings only, 1 errors (or the Packs do not compile), 2 usage
`;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface LintReport {
  /** Packs whose findings are reported, sorted. */
  readonly packs: readonly string[];
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
    readonly allowed: number;
  };
  readonly findings: readonly Finding[];
  /** Findings an allowlist entry in `packs/<id>/lint.yaml` covers. */
  readonly allowed: readonly Finding[];
}

/** Lint the Pack sources under `packsDir`; throws when they do not compile or a lint.yaml is bad. */
export function lintPacks(
  packsDir: string,
  only?: readonly string[],
): LintReport {
  const compiled = compilePacks(packsDir, {});
  if (!compiled.ok) {
    throw new Error(
      `${compiled.diagnostics.map(formatDiagnostic).join("\n")}\n\n${compiled.diagnostics.length} error(s): the Packs in ${packsDir} do not compile`,
    );
  }
  const ids = compiled.bundles.map((b) => b.id).sort();
  for (const p of only ?? []) {
    if (!ids.includes(p)) {
      throw new UsageError(`unknown Pack '${p}' (Packs: ${ids.join(", ")})`);
    }
  }
  const lints = new Map<string, PackLint>(
    ids.map((id) => [id, loadPackLint(packsDir, id)]),
  );
  const wagerBands = new Map<string, readonly [number, number]>();
  for (const [id, l] of lints) if (l.wagerBand) wagerBands.set(id, l.wagerBand);

  const split = applyAllow(
    checkBundles(compiled.bundles, { wagerBands }),
    lints,
  );
  const keep = (f: Finding) => !only || only.includes(f.pack);
  const findings = split.findings.filter(keep);
  const allowed = split.allowed.filter(keep);
  return {
    packs: only ? [...only].sort() : ids,
    summary: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      allowed: allowed.length,
    },
    findings,
    allowed,
  };
}

class UsageError extends Error {}

const where = (f: Finding): string =>
  f.path ? `${f.subject} ${f.path}` : f.subject;

/** Short markdown: a title line, then one bullet per finding with its fix hint. */
export function renderMarkdown(r: LintReport): string {
  const { errors, warnings, allowed } = r.summary;
  const out = [
    `# Lint: ${errors} error(s), ${warnings} warning(s)${allowed > 0 ? `, ${allowed} allowed` : ""}`,
    "",
    `Packs: ${r.packs.join(", ") || "none"}`,
  ];
  if (r.findings.length > 0) out.push("");
  for (const f of r.findings) {
    out.push(
      `- ${f.severity} ${f.code} \`${where(f)}\` (${f.pack}): ${f.message}. Fix: ${f.hint}`,
    );
  }
  return `${out.join("\n")}\n`;
}

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
  let report: LintReport;
  try {
    report = lintPacks(packsDir, only);
  } catch (e) {
    console.error((e as Error).message);
    return e instanceof UsageError ? 2 : 1;
  }
  process.stdout.write(
    format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderMarkdown(report),
  );
  return report.summary.errors > 0 ? 1 : 0;
}
