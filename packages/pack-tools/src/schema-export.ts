import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILE_SCHEMAS } from "./schema.ts";

/** JSON Schema text per file name, for yaml-language-server. */
export function jsonSchemas(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, schema] of Object.entries(FILE_SCHEMAS)) {
    out[name] =
      `${JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", ...schema }, null, 2)}\n`;
  }
  return out;
}

export function writeSchemas(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(jsonSchemas()))
    writeFileSync(join(dir, name), text);
}
