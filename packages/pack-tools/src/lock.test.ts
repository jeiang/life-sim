import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "./compile.ts";
import { formatDiagnostic } from "./diagnostics.ts";
import { lastReleaseTag } from "./lock.ts";

const VALID = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "valid",
);
const tmp: string[] = [];
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "tag.gpgsign=false",
      ...args,
    ],
    { cwd, stdio: "ignore" },
  );
}

/** A git repo holding a copy of the valid fixture under `packs/`. */
function repo(): { root: string; packs: string } {
  const root = mkdtempSync(join(tmpdir(), "lock-repo-"));
  tmp.push(root);
  const packs = join(root, "packs");
  cpSync(VALID, packs, { recursive: true });
  git(root, "init", "-q");
  return { root, packs };
}

function writeBaseLock(packs: string, ids: string[]): void {
  mkdirSync(join(packs, "base"), { recursive: true });
  writeFileSync(
    join(packs, "base", "ids.lock.json"),
    JSON.stringify({ pack: "base", ids }),
  );
}

function release(root: string, tag: string): void {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", `release ${tag}`);
  git(root, "tag", tag);
}

const messages = (packs: string) =>
  compilePacks(packs).diagnostics.map(formatDiagnostic);

describe("ids lock at the last release tag", () => {
  test("no v<N> tag: passes with a note, even with a stray working-tree lock", () => {
    const { root, packs } = repo();
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");
    git(root, "tag", "archive/old");
    writeBaseLock(packs, ["base/lost-job"]);
    const r = compilePacks(packs);
    expect(r.diagnostics.map(formatDiagnostic)).toEqual([]);
    expect(r.notes).toEqual([expect.stringContaining("no v<N> release tag")]);
  });

  test("a locked id removed since the tag fails", () => {
    const { root, packs } = repo();
    writeBaseLock(packs, ["base/cashier", "base/lost-job"]);
    release(root, "v1");
    const msgs = messages(packs);
    expect(msgs.some((m) => m.includes("id 'base/lost-job' shipped"))).toBe(
      true,
    );
    expect(compilePacks(packs).notes).toEqual([]);
  });

  test("a rename or removal with a migration entry passes", () => {
    const { root, packs } = repo();
    writeBaseLock(packs, [
      "base/cashier",
      "base/old-job-offer",
      "base/retired-event",
    ]);
    release(root, "v1");
    expect(messages(packs)).toEqual([]);
  });

  test("the working-tree lock is ignored once a tag exists; the tagged lock wins", () => {
    const { root, packs } = repo();
    writeBaseLock(packs, ["base/cashier"]);
    release(root, "v1");
    writeBaseLock(packs, ["base/cashier", "base/lost-job"]);
    expect(messages(packs)).toEqual([]);
  });

  test("the highest v<N> tag is the reference", () => {
    const { root, packs } = repo();
    writeBaseLock(packs, ["base/lost-job"]);
    release(root, "v2");
    writeBaseLock(packs, ["base/cashier"]);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "next");
    git(root, "tag", "v10");
    git(root, "tag", "vnext");
    expect(lastReleaseTag(packs)).toBe("v10");
    expect(messages(packs)).toEqual([]);
  });

  test("a Pack with no lock at the tag is new and passes", () => {
    const { root, packs } = repo();
    release(root, "v1");
    writeBaseLock(packs, ["base/lost-job"]);
    expect(messages(packs)).toEqual([]);
  });

  test("outside a git checkout the check is skipped with a note", () => {
    const dir = mkdtempSync(join(tmpdir(), "lock-nogit-"));
    tmp.push(dir);
    cpSync(VALID, dir, { recursive: true });
    const r = compilePacks(dir);
    expect(r.diagnostics.map(formatDiagnostic)).toEqual([]);
    expect(r.notes).toEqual([expect.stringContaining("not a git checkout")]);
  });
});
