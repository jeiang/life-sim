import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePacks } from "./compile.ts";
import { formatDiagnostic } from "./diagnostics.ts";
import { writeLock } from "./lock.ts";
import { writeOutput } from "./output.ts";
import { writeSchemas } from "./schema-export.ts";

const USAGE = `usage:
  cli.ts validate <packs-dir>            compile and report errors, write nothing
  cli.ts build <packs-dir> <out-dir>     validate, then write bundles, icons and credits
  cli.ts lock <packs-dir>                rewrite ids.lock.json (tag workflow only; PRs never edit locks)
  cli.ts schema [out-dir]                write JSON Schemas (default: packages/pack-tools/schema)
`;

function main(argv: string[]): number {
  const [cmd, a, b] = argv;
  if (cmd === "schema") {
    const dir = a ?? fileURLToPath(new URL("../schema", import.meta.url));
    writeSchemas(dir);
    console.log(`wrote JSON Schemas to ${dir}`);
    return 0;
  }
  if (
    (cmd !== "validate" && cmd !== "lock" && cmd !== "build") ||
    !a ||
    (cmd === "build" && !b)
  ) {
    console.error(USAGE);
    return 2;
  }
  const result = compilePacks(a);
  for (const note of result.notes) console.log(`note: ${note}`);
  if (!result.ok) {
    for (const d of result.diagnostics) console.error(formatDiagnostic(d));
    console.error(`\n${result.diagnostics.length} error(s)`);
    return 1;
  }
  if (cmd === "lock") {
    for (const bundle of result.bundles) {
      writeLock(join(a, bundle.id), {
        pack: bundle.id,
        ids: [...(result.ids.get(bundle.id) ?? [])],
      });
      console.log(`locked ${bundle.id}`);
    }
    return 0;
  }
  if (cmd === "build") writeOutput(result, resolve(b as string));
  const n = result.bundles.length;
  console.log(
    `${cmd === "build" ? "built" : "validated"} ${n} pack(s)${n === 0 ? " (no packs with a pack.yaml found)" : ""}`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
