import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Diagnostic } from "./diagnostics.ts";

/**
 * `packs/<id>/ids.lock.json`: every id the previous release shipped. A maintainer rewrites it
 * with `cli.ts lock packs` when cutting a release. The build fails if a locked id has
 * disappeared without an entry in a `migrations/<name>.yaml` (ADR 0003).
 */
export const LockSchema = Type.Object(
  {
    pack: Type.String(),
    ids: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type Lock = Static<typeof LockSchema>;

export function readLock(
  path: string,
  file: string,
  diags: Diagnostic[],
): Lock | undefined {
  if (!existsSync(path)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    diags.push({
      file,
      path: "",
      message: `invalid JSON: ${(e as Error).message}`,
    });
    return undefined;
  }
  if (!Value.Check(LockSchema, value)) {
    diags.push({
      file,
      path: "",
      message: "lock must be { pack, ids[] }",
    });
    return undefined;
  }
  return value;
}

export function writeLock(dir: string, lock: Lock): void {
  writeFileSync(
    join(dir, "ids.lock.json"),
    `${JSON.stringify({ ...lock, ids: [...lock.ids].sort() }, null, 2)}\n`,
  );
}
