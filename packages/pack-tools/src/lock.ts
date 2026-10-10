import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Diagnostic } from "./diagnostics.ts";

/**
 * `packs/<id>/ids.lock.json`: every id a release shipped. Only the tag workflow writes it
 * (`cli.ts lock packs`, committed with the `v<N>` tag); pull requests never edit it. The
 * compiler reads the lock as committed at the last `v<N>` tag, not from the working tree, and
 * fails if a locked id has disappeared without an entry in a `migrations/<name>.yaml`
 * (ADR 0003).
 */
export const LockSchema = Type.Object(
  {
    pack: Type.String(),
    ids: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type Lock = Static<typeof LockSchema>;

export function parseLock(
  text: string,
  file: string,
  diags: Diagnostic[],
): Lock | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
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

function git(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/** The release tag with the highest `v<N>`, if the checkout has any. */
export function lastReleaseTag(dir: string): string | undefined {
  const out = git(dir, ["tag", "--list", "v*"]);
  let best: { tag: string; n: number } | undefined;
  for (const tag of out?.split("\n") ?? []) {
    const m = /^v(\d+)$/.exec(tag.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (!best || n > best.n) best = { tag: tag.trim(), n };
  }
  return best?.tag;
}

/**
 * Shipped ids per Pack as committed at the last `v<N>` tag. Resolved once per compile. Outside a
 * git checkout (the hermetic Nix checks) or before the first tag there is nothing to compare
 * with: `note` says so and every `read` returns undefined.
 */
export class ReleaseLocks {
  readonly tag: string | undefined;
  readonly note: string | undefined;
  private readonly packsDir: string;
  private readonly prefix: string;

  constructor(packsDir: string) {
    this.packsDir = packsDir;
    const prefix = git(packsDir, ["rev-parse", "--show-prefix"]);
    if (prefix === undefined) {
      this.prefix = "";
      this.note =
        "not a git checkout: shipped-id check skipped (it compares against the last v<N> tag)";
      return;
    }
    this.prefix = prefix.trim();
    this.tag = lastReleaseTag(packsDir);
    if (!this.tag)
      this.note = "no v<N> release tag yet: shipped-id check skipped";
  }

  /** The lock committed at the tag for `packs/<dirName>`; undefined when the Pack is new. */
  read(
    dirName: string,
    diags: Diagnostic[],
  ): { lock: Lock; file: string } | undefined {
    if (!this.tag) return undefined;
    const path = `${this.prefix}${dirName}/ids.lock.json`;
    const text = git(this.packsDir, ["show", `${this.tag}:${path}`]);
    if (text === undefined) return undefined;
    const file = `${dirName}/ids.lock.json@${this.tag}`;
    const lock = parseLock(text, file, diags);
    return lock && { lock, file };
  }
}

export function writeLock(dir: string, lock: Lock): void {
  writeFileSync(
    join(dir, "ids.lock.json"),
    `${JSON.stringify({ ...lock, ids: [...lock.ids].sort() }, null, 2)}\n`,
  );
}
