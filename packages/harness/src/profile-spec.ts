import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackBundle, Expr as PackExpr, Type } from "@life/core";
import {
  compileExpr,
  type Diagnostic,
  formatPath,
  PLAYER_NAMES,
  parseYaml,
  type Source,
} from "@life/pack-tools";
import { IDENT, isObj, Loader } from "./metrics.ts";

/**
 * Pack profiles (`packs/<id>/harness/profiles.yaml`, docs/spec/harness.md#simulated-player-profiles):
 * a simulated player declared as data. The harness owns this schema and the interpreter in
 * `profiles.ts`; no Pack has code in `packages/harness/src`.
 */
export const PROFILES_FILE = "harness/profiles.yaml";

/** A compiled `ids` / `except` / `prefer` / `avoid` pattern list. */
export type Globs = readonly RegExp[];

export type Moves =
  | { readonly fixed: number }
  /** A uniform draw from `0..below-1` each year. */
  | { readonly below: number };

export type AmountPolicy = "uniform" | "min" | "max";

export interface RuleSpec {
  /** Conditions, all of which must hold for the rule to apply. */
  readonly when: {
    readonly quitting?: boolean;
    readonly ageAtLeast?: number;
  };
  /** Candidate actions are the unlocked ones whose id matches one of these (absent: all). */
  readonly ids: Globs | null;
  /** ... minus those matching one of these. */
  readonly except: Globs;
  /** ... and offered on exactly this menu. */
  readonly menu: string | null;
  /** ... and declared `repeatable`. */
  readonly repeatable: boolean;
  /** Buy something from the shop instead (cash, or a loan when one is offered). */
  readonly shop: boolean;
  /**
   * `random`: uniform among the candidates (weighted by the profile's `adjust` entries);
   * `first`: the first in menu order; `max` / `min`: the candidate with the highest / lowest
   * `by` value, the first in menu order on a tie.
   */
  readonly pick: "random" | "first" | "max" | "min";
  /** `max` / `min` only: the value each candidate is ranked by. */
  readonly by: RuleBy | null;
}

export interface ProfileSpec {
  readonly id: string;
  readonly pack: string;
  readonly description: string;
  /** In the `all` set (the default); false means only `--profile <id>` runs it. */
  readonly default: boolean;
  readonly moves: Moves;
  readonly amount: AmountPolicy;
  /** Skip actions already used this year (repeatable actions otherwise never lock). */
  readonly oncePerYear: boolean;
  /** The profile is `quitting` while `quality` is true, except for a one-in-N relapse on each move. */
  readonly quit: {
    readonly quality: string;
    readonly relapseOneIn: number;
  } | null;
  readonly choice: { readonly prefer: Globs; readonly avoid: Globs };
  /** Tried in order; the first with a candidate decides the move. None: no move. */
  readonly rules: readonly RuleSpec[];
  /** Weight multipliers other Packs (or this one) declared with `adjust`, in Pack order. */
  readonly weights: readonly WeightAdjust[];
}

/** An integer expression of the pack expression language, ranking candidate actions. */
export type RuleBy =
  /** One expression for every candidate (`person.*` names read the target of a person action). */
  | { readonly all: PackExpr; readonly usesPerson: boolean }
  /** The first entry whose glob matches the action id supplies its expression; others are not candidates. */
  | {
      readonly each: readonly {
        readonly glob: RegExp;
        readonly expr: PackExpr;
        readonly usesPerson: boolean;
      }[];
    };

/** `adjust: {profile, tags | ids, weight}` (docs/spec/harness.md#adjusting-another-packs-profile). */
export interface WeightAdjust {
  /** The Pack that declared it. */
  readonly pack: string;
  /** Actions carrying any of these tags ... */
  readonly tags: readonly string[];
  /** ... or whose id matches any of these. */
  readonly ids: Globs;
  /** Multiplies the weight of a matching candidate in a `random` pick (1 = unchanged). */
  readonly weight: number;
}

/** `*` matches within one `/` segment (`**` across them), `?` one character. */
export function globToRegExp(
  glob: string,
  anyChar = false,
  flags = "",
): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
      } else re += anyChar ? ".*" : "[^/]*";
    } else if (c === "?") re += anyChar ? "." : "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, flags);
}

const PROFILE_KEYS = [
  "description",
  "default",
  "moves",
  "amount",
  "once_per_year",
  "quit",
  "choice",
  "rules",
];
const RULE_KEYS = [
  "when",
  "ids",
  "except",
  "menu",
  "repeatable",
  "shop",
  "pick",
  "by",
];

type Path = readonly (string | number)[];

function globList(
  l: Loader,
  path: Path,
  v: unknown,
  anyChar: boolean,
  flags: string,
  known: ((re: RegExp) => boolean) | null,
): Globs | null {
  if (!Array.isArray(v) || v.length === 0) {
    l.err(path, "expected a non-empty list of patterns");
    return null;
  }
  const out: RegExp[] = [];
  v.forEach((g, i) => {
    const s = l.str([...path, i], g, "a pattern string");
    if (s === null) return;
    const re = globToRegExp(s, anyChar, flags);
    if (known && !known(re)) l.err([...path, i], `'${s}' matches no action`);
    out.push(re);
  });
  return out;
}

/** Compiles one expression string at a path (null and a diagnostic on failure). */
type ExprCompiler = (
  l: Loader,
  path: Path,
  v: unknown,
) => { expr: PackExpr; usesPerson: boolean } | null;

/** True when some node of the AST reads a `person.*` name. */
function readsPerson(n: unknown): boolean {
  if (!Array.isArray(n)) return false;
  if (n[0] === "v" && typeof n[1] === "string" && n[1].startsWith("person."))
    return true;
  return n.some(readsPerson);
}

/** First `["id", x]` node whose id is not a full `<pack>/<name>` id, if any. */
function shortId(n: unknown): string | null {
  if (!Array.isArray(n)) return null;
  if (n[0] === "id" && typeof n[1] === "string" && !n[1].includes("/"))
    return n[1];
  for (const c of n) {
    const s = shortId(c);
    if (s !== null) return s;
  }
  return null;
}

function compileRule(
  l: Loader,
  path: Path,
  v: unknown,
  hasQuit: boolean,
  actionIds: readonly string[],
  menus: ReadonlySet<string>,
  expr: ExprCompiler,
): RuleSpec | null {
  const r = l.obj(path, v, RULE_KEYS);
  if (r === null) return null;
  const when: { quitting?: boolean; ageAtLeast?: number } = {};
  if (r.when !== undefined) {
    const w = l.obj([...path, "when"], r.when, ["quitting", "age_at_least"]);
    if (w) {
      if (w.quitting !== undefined) {
        if (typeof w.quitting !== "boolean")
          l.err([...path, "when", "quitting"], "expected true or false");
        else if (!hasQuit)
          l.err(
            [...path, "when", "quitting"],
            "the profile declares no `quit` condition",
          );
        else when.quitting = w.quitting;
      }
      if (w.age_at_least !== undefined) {
        const n = l.int(
          [...path, "when", "age_at_least"],
          w.age_at_least,
          0,
          200,
        );
        if (n !== null) when.ageAtLeast = n;
      }
    }
  }
  const matchesAction = (re: RegExp) => actionIds.some((id) => re.test(id));
  const ids =
    r.ids === undefined
      ? null
      : globList(l, [...path, "ids"], r.ids, false, "", matchesAction);
  const except =
    r.except === undefined
      ? []
      : (globList(l, [...path, "except"], r.except, false, "", null) ?? []);
  let menu: string | null = null;
  if (r.menu !== undefined) {
    menu = l.str([...path, "menu"], r.menu, "a menu path");
    if (menu !== null && !menus.has(menu))
      l.err([...path, "menu"], `unknown action menu '${menu}'`);
  }
  const bool = (key: string): boolean => {
    const b = r[key];
    if (b === undefined) return false;
    if (typeof b !== "boolean") {
      l.err([...path, key], "expected true or false");
      return false;
    }
    return b;
  };
  const repeatable = bool("repeatable");
  const shop = bool("shop");
  if (shop && (ids || except.length > 0 || menu || repeatable))
    l.err(path, "a `shop` rule takes only `when`");
  let pick: RuleSpec["pick"] = "random";
  if (r.pick !== undefined) {
    if (
      r.pick === "random" ||
      r.pick === "first" ||
      r.pick === "max" ||
      r.pick === "min"
    )
      pick = r.pick;
    else l.err([...path, "pick"], "expected random, first, max or min");
  }
  let by: RuleBy | null = null;
  const ranked = pick === "max" || pick === "min";
  if (r.by !== undefined && !ranked)
    l.err([...path, "by"], "`by` needs `pick: max` or `pick: min`");
  else if (ranked && r.by === undefined)
    l.err([...path, "by"], `required with \`pick: ${pick}\``);
  else if (ranked && isObj(r.by)) {
    const each: { glob: RegExp; expr: PackExpr; usesPerson: boolean }[] = [];
    const entries = Object.entries(r.by);
    if (entries.length === 0)
      l.err(
        [...path, "by"],
        "expected at least one `<action glob>: <expression>`",
      );
    for (const [glob, src] of entries) {
      const at = [...path, "by", glob];
      const re = globToRegExp(glob);
      if (!actionIds.some((id) => re.test(id)))
        l.err(at, `'${glob}' matches no action`);
      const e = expr(l, at, src);
      if (e) each.push({ glob: re, ...e });
    }
    by = { each };
  } else if (ranked) {
    const e = expr(l, [...path, "by"], r.by);
    if (e) by = { all: e.expr, usesPerson: e.usesPerson };
  }
  return { when, ids, except, menu, repeatable, shop, pick, by };
}

interface AdjustDecl extends WeightAdjust {
  /** A profile id, or a glob (`*`, `?`) matching every registered profile id. */
  readonly profile: string;
  /** Profile ids or globs the adjust skips; names no profile carries are ignored. */
  readonly except: readonly string[];
  /** A diagnostic for a problem with the entry's `profile`. */
  readonly at: (message: string) => Diagnostic;
}

/** Parse and check the profiles of one `profiles.yaml`; every problem is a diagnostic. */
export function compileProfiles(
  pack: string,
  src: Source,
  bundles: readonly PackBundle[],
): {
  profiles: ProfileSpec[];
  adjusts: AdjustDecl[];
  diagnostics: Diagnostic[];
} {
  const l = new Loader(src);
  const qualities = new Set(
    bundles.flatMap((b) => b.qualities.map((q) => q.id)),
  );
  const actionIds = bundles.flatMap((b) =>
    b.storylets.filter((s) => s.trigger === "action").map((s) => s.id),
  );
  const menus = new Set(
    bundles.flatMap((b) =>
      b.storylets.flatMap((s) =>
        s.trigger === "action" && s.menu !== undefined ? [s.menu] : [],
      ),
    ),
  );
  const names: Record<string, Type> = { ...PLAYER_NAMES };
  for (const b of bundles) {
    for (const s of b.stats) {
      names[`stat.${s.id}`] = "int";
      names[`person.stat.${s.id}`] = "int";
    }
    for (const q of b.qualities) {
      const t = q.type === "flag" ? "bool" : "int";
      names[`quality.${q.id}`] = t;
      if (q.scope === "person") names[`person.quality.${q.id}`] = t;
    }
    for (const r of b.readables) names[r.id] = r.type;
    for (const s of b.state) {
      if (s.kind === "table")
        for (const k of s.keys) names[`table.${s.id}.${k}`] = "int";
      else names[`world.${s.id}`] = s.type === "flag" ? "bool" : "int";
    }
  }
  Object.assign(names, {
    "person.age": "int",
    "person.alive": "bool",
    "person.closeness": "int",
    "person.money": "int",
    "person.income_tier": "int",
  });
  const expr: ExprCompiler = (l, path, v) => {
    const text = l.str(path, v, "an integer expression string");
    if (text === null) return null;
    const r = compileExpr(text, { names, persons: ["person"] }, "int");
    if (!r.ok) {
      for (const e of r.errors)
        l.err(path, `${e.message} (in '${text}', column ${e.column})`);
      return null;
    }
    const bare = shortId(r.ast);
    if (bare !== null) {
      l.err(path, `write the full content id for '${bare}' (<pack>/<id>)`);
      return null;
    }
    return { expr: r.ast, usesPerson: readsPerson(r.ast) };
  };
  const tags = new Set(
    bundles.flatMap((b) =>
      b.storylets.filter((s) => s.trigger === "action").flatMap((s) => s.tags),
    ),
  );
  const root = l.obj([], src.value, ["profiles", "adjust"]);
  const profiles: ProfileSpec[] = [];
  const adjusts: AdjustDecl[] = [];
  if (root === null) return { profiles, adjusts, diagnostics: l.diags };
  if (root.adjust !== undefined) {
    if (!Array.isArray(root.adjust)) l.err(["adjust"], "expected a list");
    else
      root.adjust.forEach((a, i) => {
        const path: Path = ["adjust", i];
        const o = l.obj(path, a, [
          "profile",
          "except",
          "tags",
          "ids",
          "weight",
        ]);
        if (o === null) return;
        const profile = l.str([...path, "profile"], o.profile, "a profile id");
        const except: string[] = [];
        if (o.except !== undefined) {
          if (!Array.isArray(o.except) || o.except.length === 0)
            l.err([...path, "except"], "expected a non-empty list of profiles");
          else
            o.except.forEach((e, j) => {
              const s = l.str([...path, "except", j], e, "a profile id");
              if (s !== null) except.push(s);
            });
        }
        const tagList: string[] = [];
        if (o.tags !== undefined) {
          if (!Array.isArray(o.tags) || o.tags.length === 0)
            l.err([...path, "tags"], "expected a non-empty list of tags");
          else
            o.tags.forEach((t, j) => {
              const s = l.str([...path, "tags", j], t, "a tag");
              if (s === null) return;
              if (!tags.has(s))
                l.err([...path, "tags", j], `no action carries the tag '${s}'`);
              tagList.push(s);
            });
        }
        const ids =
          o.ids === undefined
            ? []
            : (globList(l, [...path, "ids"], o.ids, false, "", (re) =>
                actionIds.some((id) => re.test(id)),
              ) ?? []);
        if (o.tags === undefined && o.ids === undefined)
          l.err(path, "expected `tags` or `ids`");
        let weight = 1;
        if (
          typeof o.weight === "number" &&
          Number.isFinite(o.weight) &&
          o.weight > 0 &&
          o.weight <= 100
        )
          weight = o.weight;
        else l.err([...path, "weight"], "expected a number above 0, up to 100");
        if (profile === null) return;
        adjusts.push({
          pack,
          profile,
          except,
          tags: tagList,
          ids,
          weight,
          at: (message) => {
            const at = [...path, "profile"];
            const loc = src.locate(at);
            return {
              file: src.file,
              path: formatPath(at),
              message,
              ...(loc ? { line: loc.line, column: loc.column } : {}),
            };
          },
        });
      });
  }
  for (const [id, def] of l.entries(["profiles"], root.profiles)) {
    const path: Path = ["profiles", id];
    if (!IDENT.test(id)) {
      l.err(
        path,
        `'${id}' is not an id (lowercase letters, digits and underscores)`,
      );
      continue;
    }
    const p = l.obj(path, def, PROFILE_KEYS);
    if (p === null) continue;

    let moves: Moves = { fixed: 0 };
    if (p.moves === undefined) l.err([...path, "moves"], "required");
    else if (isObj(p.moves)) {
      const m = l.obj([...path, "moves"], p.moves, ["below"]);
      const n = m ? l.int([...path, "moves", "below"], m.below, 1, 1000) : null;
      if (n !== null) moves = { below: n };
    } else {
      const n = l.int([...path, "moves"], p.moves, 0, 1000);
      if (n !== null) moves = { fixed: n };
    }

    let amount: AmountPolicy = "uniform";
    if (p.amount !== undefined) {
      if (p.amount === "uniform" || p.amount === "min" || p.amount === "max")
        amount = p.amount;
      else l.err([...path, "amount"], "expected uniform, min or max");
    }

    const flag = (key: string, dflt: boolean): boolean => {
      const b = p[key];
      if (b === undefined) return dflt;
      if (typeof b !== "boolean") {
        l.err([...path, key], "expected true or false");
        return dflt;
      }
      return b;
    };

    let quit: ProfileSpec["quit"] = null;
    if (p.quit !== undefined) {
      const q = l.obj([...path, "quit"], p.quit, ["quality", "relapse_one_in"]);
      if (q) {
        const quality = l.str(
          [...path, "quit", "quality"],
          q.quality,
          "a quality id",
        );
        if (quality !== null && !qualities.has(quality))
          l.err([...path, "quit", "quality"], `unknown quality '${quality}'`);
        const n = l.int(
          [...path, "quit", "relapse_one_in"],
          q.relapse_one_in,
          2,
          1000,
        );
        if (quality !== null && n !== null) quit = { quality, relapseOneIn: n };
      }
    }

    let choice: ProfileSpec["choice"] = { prefer: [], avoid: [] };
    if (p.choice !== undefined) {
      const c = l.obj([...path, "choice"], p.choice, ["prefer", "avoid"]);
      if (c)
        choice = {
          prefer:
            c.prefer === undefined
              ? []
              : (globList(
                  l,
                  [...path, "choice", "prefer"],
                  c.prefer,
                  true,
                  "i",
                  null,
                ) ?? []),
          avoid:
            c.avoid === undefined
              ? []
              : (globList(
                  l,
                  [...path, "choice", "avoid"],
                  c.avoid,
                  true,
                  "i",
                  null,
                ) ?? []),
        };
    }

    const rules: RuleSpec[] = [];
    if (p.rules === undefined)
      l.err([...path, "rules"], "required (a list, possibly empty)");
    else if (!Array.isArray(p.rules))
      l.err([...path, "rules"], "expected a list");
    else
      p.rules.forEach((r, i) => {
        const rule = compileRule(
          l,
          [...path, "rules", i],
          r,
          quit !== null,
          actionIds,
          menus,
          expr,
        );
        if (rule) rules.push(rule);
      });

    const description =
      p.description === undefined
        ? ""
        : (l.str([...path, "description"], p.description) ?? "");
    profiles.push({
      id,
      pack,
      description,
      default: flag("default", true),
      moves,
      amount,
      oncePerYear: flag("once_per_year", false),
      quit,
      choice,
      rules,
      weights: [],
    });
  }
  return { profiles, adjusts, diagnostics: l.diags };
}

/**
 * Every Pack's `harness/profiles.yaml`, in Pack load order then file order: the profile
 * registry. Profile ids are global; a repeated id is a diagnostic.
 */
export function loadProfiles(
  packsDir: string,
  bundles: readonly PackBundle[],
): { profiles: ProfileSpec[]; diagnostics: Diagnostic[] } {
  const profiles: ProfileSpec[] = [];
  const adjusts: AdjustDecl[] = [];
  const diagnostics: Diagnostic[] = [];
  const owner = new Map<string, string>();
  for (const b of bundles) {
    const file = join(packsDir, b.id, PROFILES_FILE);
    if (!existsSync(file)) continue;
    const rel = `${b.id}/${PROFILES_FILE}`;
    const src = parseYaml(rel, readFileSync(file, "utf8"), diagnostics);
    if (!src) continue;
    const c = compileProfiles(b.id, src, bundles);
    diagnostics.push(...c.diagnostics);
    adjusts.push(...c.adjusts);
    for (const p of c.profiles) {
      const prior = owner.get(p.id);
      if (prior !== undefined) {
        diagnostics.push({
          file: rel,
          path: `profiles.${p.id}`,
          message: `profile '${p.id}' is already declared by Pack '${prior}'`,
        });
        continue;
      }
      owner.set(p.id, b.id);
      profiles.push(p);
    }
  }
  // Pack order, then file order: multipliers of one profile compose by multiplication.
  // A glob `profile` resolves here, against every Pack's profiles; an `except` naming nothing is ignored.
  for (const a of adjusts) {
    const { pack, tags, ids, weight } = a;
    const entry = { pack, tags, ids, weight };
    if (/[*?]/.test(a.profile)) {
      const re = globToRegExp(a.profile, true);
      const skip = a.except.map((e) => globToRegExp(e, true));
      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i] as ProfileSpec;
        if (!re.test(p.id) || skip.some((s) => s.test(p.id))) continue;
        profiles[i] = { ...p, weights: [...p.weights, entry] };
      }
      continue;
    }
    const i = profiles.findIndex((p) => p.id === a.profile);
    const p = profiles[i];
    if (p === undefined) {
      diagnostics.push(
        a.at(
          `unknown profile '${a.profile}' (profiles: ${profiles.map((q) => q.id).join(", ")})`,
        ),
      );
      continue;
    }
    if (a.except.includes(p.id)) continue;
    profiles[i] = { ...p, weights: [...p.weights, entry] };
  }
  return { profiles, diagnostics };
}

/** The profiles a run deals lives to: `names` in order, or the default set when none are named. */
export function selectProfiles(
  registry: readonly ProfileSpec[],
  names: readonly string[],
): ProfileSpec[] {
  if (names.length === 0) return registry.filter((p) => p.default);
  return names.map((n) => {
    const p = registry.find((s) => s.id === n);
    if (!p) throw new Error(`unknown profile '${n}'`);
    return p;
  });
}
