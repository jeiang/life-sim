/**
 * `pnpm tool <name> [args...]`: run `tools/<name>.ts`. A tool is any file in this directory
 * that exports `summary` (one line) and `run(argv)` (an exit status, or a promise of one);
 * the directory is the registry, so a new tool is one new file and no edit here.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = /^[a-z][a-z0-9-]*$/;
/** Files in this directory that are not tools. */
const NOT_TOOLS = new Set(["run"]);

interface ToolModule {
  readonly summary: string;
  run(argv: string[]): number | Promise<number>;
}

/** Tool names, sorted. */
export function toolNames(dir: string = HERE): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => f.slice(0, -3))
    .filter((n) => NAME.test(n) && !NOT_TOOLS.has(n))
    .sort();
}

async function load(dir: string, name: string): Promise<ToolModule> {
  // The tool is chosen by name at run time (the directory is the registry): a static import cannot work.
  const mod = (await import(
    pathToFileURL(join(dir, `${name}.ts`)).href
  )) as Partial<ToolModule>;
  if (typeof mod.run !== "function" || typeof mod.summary !== "string") {
    throw new Error(`tools/${name}.ts must export 'summary' and 'run(argv)'`);
  }
  return mod as ToolModule;
}

/** Run a tool by name; the exit status (2: usage error, unknown tool). */
export async function runTool(
  argv: string[],
  dir: string = HERE,
): Promise<number> {
  const [name, ...rest] = argv;
  const names = toolNames(dir);
  if (name === undefined || name === "--help" || name === "-h") {
    console.error("usage: pnpm tool <name> [args...]\n\ntools:");
    for (const n of names) {
      console.error(`  ${n.padEnd(12)}${(await load(dir, n)).summary}`);
    }
    return name === undefined ? 2 : 0;
  }
  if (!names.includes(name)) {
    console.error(
      `unknown tool '${name}' (tools: ${names.join(", ") || "none"})`,
    );
    return 2;
  }
  return (await load(dir, name)).run(rest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runTool(process.argv.slice(2));
}
