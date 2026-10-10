import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOC = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "docs",
  "pipeline",
  "content-sheet.md",
);

/** The worked example of the content sheet document. */
export function exampleSheet(): string {
  const m = /## Example[\s\S]*?```markdown\n([\s\S]*?)\n```/.exec(
    readFileSync(DOC, "utf8"),
  );
  if (!m) throw new Error("no example in docs/pipeline/content-sheet.md");
  return m[1] as string;
}
