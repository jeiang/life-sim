import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackBundle } from "@life/core";
import { type Diagnostic, parseYaml, type Source } from "@life/pack-tools";
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
  /** `random`: uniform among the candidates; `first`: the first in menu order. */
  readonly pick: "random" | "first";
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

function compileRule(
  l: Loader,
  path: Path,
  v: unknown,
  hasQuit: boolean,
  actionIds: readonly string[],
  menus: ReadonlySet<string>,
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
  let pick: "random" | "first" = "random";
  if (r.pick !== undefined) {
    if (r.pick === "random" || r.pick === "first") pick = r.pick;
    else l.err([...path, "pick"], "expected random or first");
  }
  return { when, ids, except, menu, repeatable, shop, pick };
}

/** Parse and check the profiles of one `profiles.yaml`; every problem is a diagnostic. */
export function compileProfiles(
  pack: string,
  src: Source,
  bundles: readonly PackBundle[],
): { profiles: ProfileSpec[]; diagnostics: Diagnostic[] } {
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
  const root = l.obj([], src.value, ["profiles"]);
  const profiles: ProfileSpec[] = [];
  if (root === null) return { profiles, diagnostics: l.diags };
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
    });
  }
  return { profiles, diagnostics: l.diags };
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
