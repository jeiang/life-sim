/**
 * `packs/<id>/lint.yaml`: the Pack's justified exceptions and its wager band.
 *
 * ```yaml
 * wager_band: [0.4, 1.0]        # closed-form return band for wager storylets (default 0.4..1)
 * allow:
 *   - code: L006                # a rule code
 *     subject: quality.foo      # storylet full id, or `quality.<id>`
 *     path: choices[0]          # optional: only findings at this path (or below it)
 *     reason: Set by the web app, not by a Pack effect.
 * ```
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type Finding, finding, RULES } from "./rules.ts";

export interface AllowEntry {
  readonly code: string;
  readonly subject: string;
  readonly path?: string;
  readonly reason: string;
}

export interface PackLint {
  readonly wagerBand?: readonly [number, number];
  readonly allow: readonly AllowEntry[];
}

const isRow = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Read `<packsDir>/<pack>/lint.yaml`; throws with the file name on a malformed file. */
export function loadPackLint(packsDir: string, pack: string): PackLint {
  const file = join(packsDir, pack, "lint.yaml");
  if (!existsSync(file)) return { allow: [] };
  const fail = (why: string): never => {
    throw new Error(`${file}: ${why}`);
  };
  let doc: unknown;
  try {
    doc = parse(readFileSync(file, "utf8"));
  } catch (e) {
    return fail((e as Error).message.split("\n")[0] ?? "not valid YAML");
  }
  if (doc === null || doc === undefined) return { allow: [] };
  if (!isRow(doc)) return fail("expected a map");
  for (const k of Object.keys(doc)) {
    if (k !== "wager_band" && k !== "allow") fail(`unknown key '${k}'`);
  }
  let wagerBand: readonly [number, number] | undefined;
  const band = doc.wager_band;
  if (band !== undefined) {
    if (
      !Array.isArray(band) ||
      band.length !== 2 ||
      typeof band[0] !== "number" ||
      typeof band[1] !== "number" ||
      band[0] > band[1]
    ) {
      fail("wager_band must be [min, max] numbers, min <= max");
    }
    wagerBand = band as [number, number];
  }
  const allow: AllowEntry[] = [];
  const list = doc.allow ?? [];
  if (!Array.isArray(list)) fail("allow must be a list");
  for (const [i, e] of (list as unknown[]).entries()) {
    if (!isRow(e)) return fail(`allow[${i}] must be a map`);
    const { code, subject, path, reason } = e;
    if (typeof code !== "string" || !(code in RULES) || code === "L000") {
      fail(`allow[${i}].code must be a rule code`);
    }
    if (typeof subject !== "string" || subject === "") {
      fail(`allow[${i}].subject is required`);
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      fail(`allow[${i}].reason is required: say why the finding is fine`);
    }
    if (path !== undefined && typeof path !== "string") {
      fail(`allow[${i}].path must be a string`);
    }
    allow.push({
      code: code as string,
      subject: subject as string,
      ...(path !== undefined ? { path: path as string } : {}),
      reason: reason as string,
    });
  }
  return { ...(wagerBand ? { wagerBand } : {}), allow };
}

const covers = (e: AllowEntry, f: Finding): boolean =>
  e.code === f.code &&
  e.subject === f.subject &&
  (e.path === undefined ||
    f.path === e.path ||
    f.path.startsWith(`${e.path}.`) ||
    f.path.startsWith(`${e.path}[`));

/** Split findings into those that stand and those an allowlist entry covers; unused entries become L000. */
export function applyAllow(
  findings: readonly Finding[],
  lints: ReadonlyMap<string, PackLint>,
): { findings: Finding[]; allowed: Finding[] } {
  const kept: Finding[] = [];
  const allowed: Finding[] = [];
  const used = new Set<AllowEntry>();
  for (const f of findings) {
    const hit = lints.get(f.pack)?.allow.find((e) => covers(e, f));
    if (hit) {
      used.add(hit);
      allowed.push(f);
    } else {
      kept.push(f);
    }
  }
  for (const [pack, l] of lints) {
    for (const e of l.allow) {
      if (!used.has(e)) {
        kept.push(
          finding(
            "L000",
            pack,
            e.subject,
            e.path ?? "",
            `allowlist entry for ${e.code} matches no finding`,
          ),
        );
      }
    }
  }
  return { findings: kept, allowed };
}
