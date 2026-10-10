import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  type PackBundle,
  ScriptedRng,
  type ScriptedRolls,
  setStreamOverride,
} from "@life/core";
import { type Diagnostic, parseYaml, type Source } from "@life/pack-tools";
import { isObj, Loader } from "./metrics.ts";
import { globToRegExp, type ProfileSpec } from "./profile-spec.ts";

/**
 * Forced outcomes (decision 7, docs/spec/harness.md#forced-outcomes): rolls replaced by purpose
 * key through Core's `setStreamOverride`, event choices picked by label, and scripted actions.
 * Everything here is plain data so a run's force set crosses to worker threads unchanged. The
 * overrides are module-level state in Core: this file is for the harness and for vitest, and
 * `apps/web` never imports it.
 */

/** Directory of a Pack's forced scripts, relative to the Pack. */
export const FORCE_DIR = "harness/force";

/** The built-in profile a script without a base `profile` runs as: it makes no voluntary move. */
export const SCRIPTED_ID = "scripted";
export const SCRIPTED_PROFILE: ProfileSpec = {
  id: SCRIPTED_ID,
  pack: "",
  description: "Makes only the moves a forced script lists",
  default: false,
  moves: { fixed: 0 },
  amount: "min",
  oncePerYear: false,
  quit: null,
  choice: { prefer: [], avoid: [] },
  rules: [],
  weights: [],
};

/** How a forced action picks its amount on the action's grid. */
export type ForcedAmount = "min" | "max" | number;

export type ForceEntry =
  | {
      readonly kind: "roll";
      /** The purpose key of the roll site: a chance storylet id, `outcome/<id>`, `pack/<id>/<hook>/<n>`. */
      readonly key: string;
      /** Only rolls at this player age; absent: every age. */
      readonly age?: number;
      readonly rolls: ScriptedRolls;
      readonly label: string;
    }
  | {
      readonly kind: "choose";
      /** Case-insensitive glob over the choice labels of an open event. */
      readonly pattern: string;
      readonly age?: number;
      readonly label: string;
    }
  | {
      readonly kind: "do";
      /** Full id of an action; taken once at the start of this age. */
      readonly action: string;
      readonly age: number;
      readonly amount: ForcedAmount;
      readonly label: string;
    };

/** What a run forces: the entries of a script (if any) and of `--force`, in that order. */
export interface ForceSet {
  /** `<pack>/<file>` of the script, or its path. */
  readonly script?: string;
  /** Registry profile that makes the voluntary moves (absent: the built-in `scripted`). */
  readonly profile?: string;
  readonly entries: readonly ForceEntry[];
}

export interface ForceScript {
  /** `<pack>/<file stem>`. */
  readonly name: string;
  readonly pack: string;
  readonly description: string;
  readonly profile?: string;
  readonly entries: readonly ForceEntry[];
}

const describeRolls = (r: ScriptedRolls): string => {
  const parts: string[] = [];
  if (r.chance !== undefined) parts.push(r.chance ? "hit" : "miss");
  if (r.int !== undefined) parts.push(`int:${r.int}`);
  if (r.pick !== undefined) parts.push(JSON.stringify(r.pick));
  return parts.join("+");
};

const at = (age: number | undefined): string =>
  age === undefined ? "any age" : `age ${age}`;

const CORE_KEY_PREFIXES = ["birth/", "year/", "career/", "decision-slot/"];

/** `v` as rolls: `hit`/`miss`/true/false, a number (pick index), `int:N`, any other text (pick label), or a mapping. */
export function parseRolls(v: unknown): ScriptedRolls | string {
  if (typeof v === "boolean") return { chance: v };
  if (typeof v === "number")
    return Number.isInteger(v) && v >= 0
      ? { pick: v }
      : `'${v}' is not a pick index`;
  if (typeof v === "string") {
    if (v === "hit") return { chance: true };
    if (v === "miss") return { chance: false };
    const n = /^int:(\d+)$/.exec(v);
    if (n) return { int: Number(n[1]) };
    if (/^\d+$/.test(v)) return { pick: Number(v) };
    if (v === "") return "a forced value is empty";
    return { pick: v };
  }
  if (isObj(v)) {
    const out: { chance?: boolean; int?: number; pick?: number | string } = {};
    for (const k of Object.keys(v))
      if (k !== "chance" && k !== "int" && k !== "pick")
        return `unknown key '${k}' (allowed: chance, int, pick)`;
    if (v.chance !== undefined) {
      if (typeof v.chance !== "boolean") return "chance must be true or false";
      out.chance = v.chance;
    }
    if (v.int !== undefined) {
      if (typeof v.int !== "number" || !Number.isInteger(v.int) || v.int < 0)
        return "int must be a non-negative integer";
      out.int = v.int;
    }
    if (v.pick !== undefined) {
      if (
        (typeof v.pick !== "number" && typeof v.pick !== "string") ||
        v.pick === ""
      )
        return "pick must be an index or an outcome text";
      out.pick = v.pick;
    }
    return Object.keys(out).length > 0 ? out : "no forced value given";
  }
  return "expected hit, miss, an index, int:N, an outcome text or a mapping";
}

/** Why `key` is not a roll site of the loaded Packs, or null when it could be. */
function unknownKey(
  key: string,
  bundles: readonly PackBundle[],
): string | null {
  const ids = new Set(bundles.flatMap((b) => b.storylets.map((s) => s.id)));
  const packs = new Set(bundles.map((b) => b.id));
  const plain = key.replace(/@.*$/, "");
  if (ids.has(plain)) return null;
  if (key.startsWith("outcome/")) {
    const id = key.slice("outcome/".length);
    return ids.has(id) ? null : `no storylet '${id}' in the loaded Packs`;
  }
  if (key.startsWith("pack/")) {
    const pack = key.split("/")[1] ?? "";
    return packs.has(pack) ? null : `no Pack '${pack}' in the loaded Packs`;
  }
  if (CORE_KEY_PREFIXES.some((p) => key.startsWith(p))) return null;
  return `'${key}' is no roll site: expected a storylet id, outcome/<storylet id>, pack/<pack>/<hook>/<n>, or a core key (${CORE_KEY_PREFIXES.join(" ")})`;
}

/**
 * Parse `--force [age:]key=value[,...]`. Values are those of {@link parseRolls}, except that a
 * text value cannot contain a comma here (use a script file for such labels).
 */
export function parseForceArg(
  arg: string,
  bundles: readonly PackBundle[],
): { entries: ForceEntry[]; diagnostics: Diagnostic[] } {
  const entries: ForceEntry[] = [];
  const diagnostics: Diagnostic[] = [];
  const err = (path: string, message: string): void => {
    diagnostics.push({ file: "--force", path, message });
  };
  for (const part of arg.split(",")) {
    const m = /^(?:(\d+):)?([^=]+)=(.*)$/.exec(part);
    if (!m) {
      err(part, "expected [age:]key=value");
      continue;
    }
    const key = m[2] as string;
    const rolls = parseRolls(m[3]);
    if (typeof rolls === "string") {
      err(key, rolls);
      continue;
    }
    const bad = unknownKey(key, bundles);
    if (bad) {
      err(key, bad);
      continue;
    }
    const age = m[1] === undefined ? undefined : Number(m[1]);
    entries.push({
      kind: "roll",
      key,
      ...(age === undefined ? {} : { age }),
      rolls,
      label: `roll ${key} = ${describeRolls(rolls)} (${at(age)})`,
    });
  }
  return { entries, diagnostics };
}

const STEP_KEYS = ["age", "roll", "value", "choose", "do", "amount"];

/** Parse and check one `harness/force/<name>.yaml`; every problem is a diagnostic. */
export function compileScript(
  pack: string,
  name: string,
  src: Source,
  bundles: readonly PackBundle[],
  registry: readonly ProfileSpec[],
): { script: ForceScript | null; diagnostics: Diagnostic[] } {
  const l = new Loader(src);
  const top = l.obj([], src.value, ["description", "profile", "steps"]);
  if (!top) return { script: null, diagnostics: l.diags };
  const description =
    top.description === undefined
      ? ""
      : (l.str(["description"], top.description) ?? "");
  let profile: string | undefined;
  if (top.profile !== undefined) {
    const p = l.str(["profile"], top.profile, "a profile id");
    if (p !== null) {
      if (registry.some((s) => s.id === p)) profile = p;
      else l.err(["profile"], `unknown profile '${p}'`);
    }
  }
  const entries: ForceEntry[] = [];
  const actions = new Set(
    bundles.flatMap((b) =>
      b.storylets.filter((s) => s.trigger === "action").map((s) => s.id),
    ),
  );
  if (!Array.isArray(top.steps) || top.steps.length === 0)
    l.err(["steps"], "expected a non-empty list of steps");
  else
    top.steps.forEach((raw: unknown, i: number) => {
      const path = ["steps", i];
      const s = l.obj(path, raw, STEP_KEYS);
      if (!s) return;
      const kinds = (["roll", "choose", "do"] as const).filter(
        (k) => s[k] !== undefined,
      );
      if (kinds.length !== 1) {
        l.err(path, "a step has exactly one of roll, choose, do");
        return;
      }
      const age =
        s.age === undefined
          ? undefined
          : (l.int([...path, "age"], s.age, 0, 200) ?? undefined);
      if (s.age !== undefined && age === undefined) return;
      const kind = kinds[0] as "roll" | "choose" | "do";
      if (kind === "roll") {
        const key = l.str([...path, "roll"], s.roll, "a purpose key");
        if (key === null) return;
        if (s.value === undefined) {
          l.err(path, "a roll needs a value");
          return;
        }
        if (s.amount !== undefined)
          l.err([...path, "amount"], "only a `do` step takes an amount");
        const rolls = parseRolls(s.value);
        if (typeof rolls === "string") {
          l.err([...path, "value"], rolls);
          return;
        }
        const bad = unknownKey(key, bundles);
        if (bad) {
          l.err([...path, "roll"], bad);
          return;
        }
        entries.push({
          kind,
          key,
          ...(age === undefined ? {} : { age }),
          rolls,
          label: `roll ${key} = ${describeRolls(rolls)} (${at(age)})`,
        });
        return;
      }
      if (s.value !== undefined || s.amount !== undefined) {
        if (kind === "choose" || s.value !== undefined)
          l.err(
            [...path, s.value !== undefined ? "value" : "amount"],
            `a \`${kind}\` step takes no ${s.value !== undefined ? "value" : "amount"}`,
          );
      }
      if (kind === "choose") {
        const pattern = l.str([...path, "choose"], s.choose, "a label pattern");
        if (pattern === null) return;
        entries.push({
          kind,
          pattern,
          ...(age === undefined ? {} : { age }),
          label: `choose ${JSON.stringify(pattern)} (${at(age)})`,
        });
        return;
      }
      const action = l.str([...path, "do"], s.do, "an action id");
      if (action === null) return;
      if (!actions.has(action)) {
        l.err([...path, "do"], `no action '${action}'`);
        return;
      }
      if (age === undefined) {
        l.err(path, "a `do` step needs an age");
        return;
      }
      let amount: ForcedAmount = "min";
      if (s.amount !== undefined) {
        if (s.amount === "min" || s.amount === "max") amount = s.amount;
        else {
          const n = l.int([...path, "amount"], s.amount, 0, 2 ** 31);
          if (n === null) return;
          amount = n;
        }
      }
      entries.push({
        kind,
        action,
        age,
        amount,
        label: `do ${action} (age ${age}, amount ${amount})`,
      });
    });
  return {
    script: {
      name,
      pack,
      description,
      ...(profile === undefined ? {} : { profile }),
      entries,
    },
    diagnostics: l.diags,
  };
}

/** Every Pack's `harness/force/*.yaml`, as `<pack>/<stem>` scripts in Pack load order then file name. */
export function loadScripts(
  packsDir: string,
  bundles: readonly PackBundle[],
  registry: readonly ProfileSpec[],
): { scripts: ForceScript[]; diagnostics: Diagnostic[] } {
  const scripts: ForceScript[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const b of bundles) {
    const dir = join(packsDir, b.id, FORCE_DIR);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)
      .filter((n) => n.endsWith(".yaml"))
      .sort()) {
      const name = `${b.id}/${basename(f, ".yaml")}`;
      const src = parseYaml(
        `${b.id}/${FORCE_DIR}/${f}`,
        readFileSync(join(dir, f), "utf8"),
        diagnostics,
      );
      if (!src) continue;
      const c = compileScript(b.id, name, src, bundles, registry);
      diagnostics.push(...c.diagnostics);
      if (c.script) scripts.push(c.script);
    }
  }
  return { scripts, diagnostics };
}

/** One script file by path (for scripts kept outside the Packs); its name is the path. */
export function loadScriptFile(
  path: string,
  bundles: readonly PackBundle[],
  registry: readonly ProfileSpec[],
): { script: ForceScript | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const src = parseYaml(path, readFileSync(path, "utf8"), diagnostics);
  if (!src) return { script: null, diagnostics };
  const c = compileScript("", path, src, bundles, registry);
  return { script: c.script, diagnostics: [...diagnostics, ...c.diagnostics] };
}

/** The force set of a script plus `--force` entries. */
export function forceSetOf(
  script: ForceScript | undefined,
  extra: readonly ForceEntry[],
): ForceSet {
  return {
    ...(script ? { script: script.name } : {}),
    ...(script?.profile ? { profile: script.profile } : {}),
    entries: [...(script?.entries ?? []), ...extra],
  };
}

/** Install the stream override for the roll entries (false when there are none); `fired[i]` counts the rolls entry `i` forced. */
export function installRollOverride(
  entries: readonly ForceEntry[],
  fired: number[],
): boolean {
  const rolls = entries.flatMap((e, i) => (e.kind === "roll" ? [[e, i]] : []));
  if (rolls.length === 0) return false;
  setStreamOverride((age, key) => {
    for (const [e, i] of rolls as [
      Extract<ForceEntry, { kind: "roll" }>,
      number,
    ][])
      if (e.key === key && (e.age === undefined || e.age === age)) {
        fired[i] = (fired[i] ?? 0) + 1;
        return new ScriptedRng(e.rolls);
      }
    return undefined;
  });
  return true;
}

/** Index in `labels` of the first label an entry's pattern matches, or -1. */
export function chooseIndex(
  entry: Extract<ForceEntry, { kind: "choose" }>,
  labels: readonly string[],
): number {
  const re = globToRegExp(entry.pattern, true, "i");
  return labels.findIndex((l) => re.test(l));
}

export interface ForcedReport {
  readonly script: string | null;
  readonly entries: readonly {
    readonly label: string;
    /** Rolls forced, choices made or actions taken, over all lives. */
    readonly fires: number;
    /** Lives in which it fired at least once. */
    readonly lives: number;
  }[];
  /** Labels of entries that never fired in any life: a failure. */
  readonly neverMatched: readonly string[];
}

/** Sums per-life fire counts into a {@link ForcedReport}. */
export class ForcedTally {
  private readonly set: ForceSet;
  private readonly fires: number[];
  private readonly lives: number[];

  constructor(set: ForceSet) {
    this.set = set;
    this.fires = set.entries.map(() => 0);
    this.lives = set.entries.map(() => 0);
  }

  add(life: { readonly forced?: readonly number[] }): void {
    life.forced?.forEach((n, i) => {
      if (n > 0) {
        this.fires[i] = (this.fires[i] ?? 0) + n;
        this.lives[i] = (this.lives[i] ?? 0) + 1;
      }
    });
  }

  report(): ForcedReport {
    const entries = this.set.entries.map((e, i) => ({
      label: e.label,
      fires: this.fires[i] ?? 0,
      lives: this.lives[i] ?? 0,
    }));
    return {
      script: this.set.script ?? null,
      entries,
      neverMatched: entries.filter((e) => e.fires === 0).map((e) => e.label),
    };
  }
}
