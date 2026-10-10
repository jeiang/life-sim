import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  CompiledChoice,
  CompiledCity,
  CompiledGenerator,
  CompiledItemKind,
  CompiledLoanKind,
  CompiledMarket,
  CompiledOccupationKind,
  CompiledOutcome,
  CompiledPeopleItem,
  CompiledStandard,
  CompiledStorylet,
  ContributionDecl,
  Effect,
  Expr,
  Type as ExprType,
  FamilyDecl,
  Gender,
  HooksDecl,
  KindDecl,
  KindEntry,
  KindFieldDecl,
  LivingDecl,
  NpcCareersDecl,
  PackBundle,
  PackMigration,
  QualityDecl,
  ReadableDecl,
  RepeatCurve,
  SettlementLine,
  StatDecl,
  StateDecl,
} from "@life/core";
import {
  CORE_MILESTONES,
  DEFAULT_GENDER_WEIGHTS,
  DEFAULT_REPEAT,
  GENDERS,
  HOOK_PHASES,
  isKinshipId,
  KIND_CALL,
  PACK_BUNDLE_FORMAT,
  PRONOUN_FIELDS,
  readableCycle,
} from "@life/core";
import type { TSchema } from "@sinclair/typebox";
import { buildCredits, type CreditsManifest } from "./credits.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { type CheckEnv, compileExpr } from "./expr/index.ts";
import { resolveIcon } from "./icons.ts";
import { ReleaseLocks } from "./lock.ts";
import {
  type Capability,
  CapabilitySchema,
  CitySchema,
  type CitySrc,
  ItemSchema,
  type ItemSrc,
  KIND_RESERVED_FIELDS,
  KindSchema,
  type KindSrc,
  kindEntrySchema,
  LoanSchema,
  type LoanSrc,
  type Macro,
  MacroSchema,
  type Manifest,
  ManifestSchema,
  type Migration,
  MigrationSchema,
  OccupationSchema,
  type OccupationSrc,
  PeopleSchema,
  type PeopleSrc,
  type Quality,
  QualitySchema,
  type Readable,
  ReadableSchema,
  SINGLETONS,
  StandardSchema,
  type StandardSrc,
  type State,
  StateSchema,
  StoryletSchema,
  type StoryletSrc,
} from "./schema.ts";
import {
  formatPath,
  type Path,
  parseYaml,
  type Source,
  validate,
} from "./yaml.ts";

/** `"12.5%"` to basis points out of 10,000 (the schema already checked the shape). */
function percentBp(text: string): number {
  const [whole, frac = ""] = text.slice(0, -1).split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** `"-2.5%"` to signed basis points. */
function signedPercentBp(text: string): number {
  return text.startsWith("-") ? -percentBp(text.slice(1)) : percentBp(text);
}

/** The base Pack: exempt from the `namespace` id prefix rule. */
const CORE_LOOP = "core-loop";

export type Kind =
  | "storylet"
  | "occupation"
  | "item"
  | "market"
  | "loan"
  | "city"
  | "standard"
  | "role"
  | "generator"
  /** An instance of the pack-declared kind `<id>` (docs/spec/pack-format/kinds.md). */
  | `kind:${string}`;

/** A content kind as authors say it: `kind:countries` is a `countries entry`. */
const kindName = (k: Kind): string =>
  k.startsWith("kind:") ? `${k.slice(5)} entry` : k;

/** Content kinds a kind field's `ref` may point at, by the `to` name. */
const REF_TARGETS: Record<string, readonly Kind[]> = {
  storylet: ["storylet"],
  occupation: ["occupation"],
  item: ["item", "market"],
  market: ["market"],
  loan: ["loan"],
  city: ["city"],
  standard: ["standard"],
  role: ["role"],
  generator: ["generator"],
};

/**
 * Directory names a Pack already uses; a declared kind's entries live in a directory named
 * after the kind, so a kind may not take one of these ids.
 */
const RESERVED_KIND_IDS = new Set([
  "storylets",
  "occupations",
  "items",
  "loans",
  "cities",
  "standards",
  "people",
  "qualities",
  "state",
  "readables",
  "effects",
  "capabilities",
  "migrations",
  "kinds",
  "hooks",
  "harness",
  "test",
  "docs",
]);

/** Content directories inside a Pack and what each holds. */
export const CONTENT_DIRS = {
  storylets: "storylet",
  occupations: "occupation",
  items: "item",
  loans: "loan",
  cities: "city",
  standards: "standard",
  people: "people",
} as const;

export interface IconUse {
  readonly kind: "twemoji" | "gameicons";
  readonly ref: string;
  readonly stem?: string;
  readonly emoji?: string;
  readonly author?: string;
  readonly name?: string;
  readonly usedBy: Set<string>;
}

export interface CompileOutput {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /** In dependency order (dependencies first). */
  readonly bundles: readonly PackBundle[];
  readonly icons: ReadonlyMap<string, IconUse>;
  readonly credits: CreditsManifest;
  /** Full content ids and declared names per Pack, as written to `ids.lock.json`. */
  readonly ids: ReadonlyMap<string, readonly string[]>;
  /** Non-error remarks, for example that the shipped-id check was skipped. */
  readonly notes: readonly string[];
}

interface LoadedPack {
  id: string;
  dir: string;
  manifest: Manifest;
  manifestSrc: Source;
  /** Declared by `qualities/*.yaml`, in file order. */
  qualities: LoadedQuality[];
  /** Declared by `state/*.yaml`, in file order. */
  state: LoadedState[];
  /** Declared by `readables/*.yaml`, in file order. */
  readables: LoadedReadable[];
  /** Declared by `effects/*.yaml`, in file order. */
  macros: LoadedMacro[];
  /** Declared by `kinds/<kind>.yaml`, in file order. */
  kinds: LoadedKind[];
  /** Entries of visible kinds, from `<kind>/*.yaml`; filled once every Pack is loaded. */
  kindEntries: LoadedKindEntry[];
  items: LoadedItem[];
  capabilities: LoadedCapability[];
  migrations: LoadedMigration[];
}

/** One `migrations/<name>.yaml`; its id is `<pack>/<name>`. */
interface LoadedMigration {
  id: string;
  src: Source;
  rename: NonNullable<Migration["rename"]>;
  remove: NonNullable<Migration["remove"]>;
}

/** One quality declaration and where it was written, for diagnostics. */
interface LoadedQuality {
  decl: Quality;
  src: Source;
  index: number;
}

/** One state container declaration and where it was written, for diagnostics. */
interface LoadedState {
  decl: State;
  src: Source;
  index: number;
}

/** One readables entry (a readable, a slot or a contribution) and where it was written. */
interface LoadedReadable {
  decl: Readable;
  src: Source;
  index: number;
}

/** One effect macro and where it was written. */
interface LoadedMacro {
  decl: Macro;
  src: Source;
  index: number;
}

/**
 * A compiled effect macro: its body is already resolved in the owning Pack and holds only
 * closed primitives. `params` appear in the body as `["v", <param>]` and are substituted at
 * each call; names bound by a body `spawn_person(...) as n` are renamed per expansion.
 */
interface CompiledMacro {
  readonly params: readonly string[];
  readonly body: readonly Effect[];
  /** Nesting depth: 1 for a body of primitives, else 1 + the deepest macro it called. */
  readonly depth: number;
}

/** Deepest macro-in-macro nesting a build accepts. */
const MAX_MACRO_DEPTH = 8;

/** The name a Pack's macros are called by: its id with hyphens as underscores (`core_loop.x(...)`). */
const macroPrefix = (packId: string): string => packId.replaceAll("-", "_");

/** A resolved effect that calls a macro: `["do", "<pack>.<macro>", ...args]`. */
const isMacroCall = (e: Effect): boolean =>
  e[0] === "do" && (e[1] as string).includes(".");

/**
 * The body of macro `m` for one call: `args` replace the parameters, and every person the
 * body spawns gets a name unique to this expansion (`m<seq>_<name>`), so two calls, or a call
 * and the caller's own spawns, never share a binding.
 */
function instantiate(
  m: CompiledMacro,
  args: readonly Expr[],
  seq: number,
): Effect[] {
  const rename = new Map<string, string>();
  for (const e of m.body)
    if (e[0] === "spawn") rename.set(e[3], `m${seq}_${e[3]}`);
  const rooted = (path: string): string => {
    const dot = path.indexOf(".");
    const root = dot < 0 ? path : path.slice(0, dot);
    const to = rename.get(root);
    return to === undefined ? path : to + path.slice(root.length);
  };
  const subst = (e: Expr): Expr => {
    if (typeof e !== "object") return e;
    const tag = e[0];
    if (tag === "s" || tag === "id") return e;
    if (tag === "v") {
      const i = m.params.indexOf(e[1] as string);
      return i >= 0 ? (args[i] as Expr) : ["v", rooted(e[1] as string)];
    }
    if (tag === "in")
      return [
        "in",
        subst(e[1] as Expr),
        (e[2] as readonly Expr[]).map(subst),
      ] as unknown as Expr;
    if (tag === "call")
      return [
        "call",
        e[1],
        ...(e.slice(2) as Expr[]).map(subst),
      ] as unknown as Expr;
    return [tag, ...(e.slice(1) as Expr[]).map(subst)] as unknown as Expr;
  };
  return m.body.map((e): Effect => {
    switch (e[0]) {
      case "set":
      case "add":
      case "sub": {
        const t = e[1];
        return [
          e[0],
          typeof t === "string"
            ? rooted(t)
            : ["relationship", rename.get(t[1]) ?? t[1], t[2]],
          subst(e[2]),
        ];
      }
      case "do":
        return ["do", e[1], ...(e.slice(2) as Expr[]).map(subst)] as Effect;
      default:
        return ["spawn", subst(e[1]), subst(e[2]), rename.get(e[3]) as string];
    }
  });
}

/** One `kinds/<kind>.yaml`; the kind id is the file stem. */
interface LoadedKind {
  id: string;
  decl: KindSrc;
  src: Source;
}

/** One entry of a kind, and where it was written. */
interface LoadedKindEntry {
  /** Id of the kind. */
  kind: string;
  /** Bare id in the writing Pack. */
  id: string;
  data: Record<string, unknown>;
  src: Source;
  index: number;
}

/** A readable or slot declaration (not a contribution), narrowed. */
type ReadableDeclSrc = Exclude<Readable, { kind: "contribute" }>;
const declaresReadable = (
  r: LoadedReadable,
): r is LoadedReadable & {
  decl: ReadableDeclSrc;
} => r.decl.kind !== "contribute";

/** One `capabilities/<feature>.yaml`; its id is `<pack>/<feature>`. */
interface LoadedCapability {
  id: string;
  pack: string;
  src: Source;
  file: string;
  provides: Capability["provides"] & object;
  requires: readonly string[];
}

/** Which `provides` key exports which content kinds. */
const PROVIDES_KINDS: Record<string, readonly Kind[]> = {
  storylets: ["storylet"],
  occupations: ["occupation"],
  items: ["item", "market"],
  loans: ["loan"],
  cities: ["city"],
  standards: ["standard"],
  roles: ["role"],
  generators: ["generator"],
};

interface LoadedItem {
  kind: Kind;
  id: string;
  src: Source;
  /** Index in its file's list. */
  index: number;
  data: Record<string, unknown>;
}

const TOP_RESERVED = new Set([
  "age",
  "money",
  "stat",
  "quality",
  "loan",
  "city",
  "living",
  "player",
  "person",
  "asset",
  "portfolio",
  "world",
  "table",
]);

/**
 * Names a readable id may not take: every root of an expression name, and the bare names some
 * scopes bind (`uses_this_year`, `amount`).
 */
const READABLE_RESERVED = new Set([
  ...TOP_RESERVED,
  "uses_this_year",
  "amount",
  "confined",
  "mature",
  "people",
]);

/** Kinds each id-typed function parameter accepts; `undefined` accepts any content id. */
const CALL_KINDS: Record<string, Kind[][] | undefined> = {
  has_occupation: [["occupation"]],
  years_in: [["occupation"]],
  count_role: [["role"]],
  owns: [["item"]],
  start_occupation: [["occupation"]],
  end_occupation: [["occupation"]],
  take_loan: [["loan"]],
  move_to: [["city"]],
  set_standard: [["standard"]],
  standard_cost: [["standard"]],
  role_closeness: [["role"]],
  grant_asset: [["item", "market"]],
  remove_asset: [["item", "market"]],
  trade: [["market"]],
  price: [["market"]],
  change: [["market"]],
  units: [["market"]],
  holding_value: [["market"]],
  cost_basis: [["market"]],
  holding_years: [["market"]],
  forecast: [["market"]],
  spawn_person: [["role"], ["generator"]],
  schedule: [["storylet"]],
  unschedule: [["storylet"]],
};

/** Functions and effects whose one argument is a milestone id, not a content id. */
const MILESTONE_FUNCTIONS = new Set(["milestone_reached", "reach_milestone"]);

/** Functions whose one argument names an exclusivity group, not a content id. */
const GROUP_FUNCTIONS = new Set(["in_group", "years_in_group"]);

/** `<prefix>.subject`, `<prefix>.Subject`, ... as string names. */
function pronounNames(prefix: string): Record<string, ExprType> {
  return Object.fromEntries(
    [...PRONOUN_FIELDS, "gender"].map((f) => [
      `${prefix}.${f}`,
      "string" as const,
    ]),
  );
}

export const PLAYER_NAMES: Record<string, ExprType> = {
  age: "int",
  money: "int",
  "city.cost_index": "int",
  "city.id": "id",
  "city.label": "string",
  "city.wage_index": "int",
  "living.cost": "int",
  "living.standard": "id",
  "living.risk": "int",
  "city.country": "string",
  "living.with_parents": "bool",
  confined: "bool",
  "living.with_guardian": "bool",
  "living.dependents": "int",
  portfolio: "int",
  "player.first_name": "string",
  "player.last_name": "string",
  ...pronounNames("player"),
};

export interface CompileOptions {
  /** Compile only these Packs and the Packs their capabilities require, transitively. */
  readonly only?: readonly string[];
}

export function compilePacks(
  packsDir: string,
  options: CompileOptions = {},
): CompileOutput {
  return new Compiler(packsDir, options.only).run();
}

class Compiler {
  readonly diags: Diagnostic[] = [];
  readonly packs = new Map<string, LoadedPack>();
  /** `<pack>` -> full id -> kind. */
  readonly index = new Map<string, Map<string, Kind>>();
  readonly icons = new Map<string, IconUse>();
  readonly ids = new Map<string, string[]>();
  readonly releaseLocks: ReleaseLocks;

  readonly packsDir: string;
  readonly only: readonly string[] | undefined;
  constructor(packsDir: string, only?: readonly string[]) {
    this.packsDir = packsDir;
    this.only = only;
    this.releaseLocks = new ReleaseLocks(packsDir);
  }

  run(): CompileOutput {
    this.load();
    this.indexCapabilities();
    this.loadKindEntries();
    this.checkCapabilities();
    this.checkCrossPackDeclarations();
    this.checkNamespaces();
    this.checkSingletons();
    this.checkMacroPrefixes();
    const order = this.order();
    const bundles: PackBundle[] = [];
    for (const id of order) {
      const pack = this.packs.get(id) as LoadedPack;
      const pc = new PackCompiler(this, pack);
      this.compilers.set(id, pc);
      bundles.push(pc.compile());
    }
    this.checkReadableCycle(bundles);
    this.checkSchedules(bundles);
    let twemoji = 0;
    const authors = new Map<string, number>();
    for (const u of this.icons.values()) {
      if (u.kind === "twemoji") twemoji++;
      else
        authors.set(
          u.author as string,
          (authors.get(u.author as string) ?? 0) + 1,
        );
    }
    return {
      ok: this.diags.length === 0,
      diagnostics: this.diags,
      bundles: this.diags.length === 0 ? bundles : [],
      icons: this.icons,
      credits: buildCredits(twemoji, authors),
      ids: this.ids,
      notes: this.releaseLocks.note ? [this.releaseLocks.note] : [],
    };
  }

  /** Pack compilers by id, filled in dependency order so a Pack finds the macros of those it requires. */
  readonly compilers = new Map<string, PackCompiler>();
  /** Counter that makes the person names a macro expansion binds unique. */
  macroSeq = 0;

  /** Two Pack ids that differ only in `-` versus `_` would share a macro call prefix. */
  private checkMacroPrefixes(): void {
    const seen = new Map<string, string>();
    for (const id of [...this.packs.keys()].sort()) {
      const pack = this.packs.get(id) as LoadedPack;
      if (pack.macros.length === 0) continue;
      const prefix = macroPrefix(id);
      const first = seen.get(prefix);
      if (first === undefined) seen.set(prefix, id);
      else
        this.diag(
          pack.manifestSrc,
          ["id"],
          `Packs '${first}' and '${id}' both call their effect macros '${prefix}.<macro>'`,
        );
    }
  }

  /**
   * `schedule(...)` binds a person exactly when its storylet is `scope: person`, and a `scope: loan`
   * storylet cannot be scheduled. Storylets of other Packs are known only once all are compiled.
   */
  private checkSchedules(bundles: readonly PackBundle[]): void {
    const scopes = new Map(
      bundles.flatMap((b) => b.storylets.map((s) => [s.id, s.scope] as const)),
    );
    for (const b of bundles) {
      const src = (this.packs.get(b.id) as LoadedPack).manifestSrc;
      const owned: (readonly [string, readonly Effect[]])[] = b.storylets.map(
        (s) =>
          [
            `storylet '${s.id}'`,
            [...s.outcomes, ...s.choices.flatMap((c) => c.outcomes)].flatMap(
              (o) => o.effects,
            ),
          ] as const,
      );
      for (const [phase, groups] of Object.entries(b.hooks ?? {}))
        owned.push([
          `hook '${phase}'`,
          (Array.isArray(groups)
            ? groups
            : Object.values(groups).flat()
          ).flat(),
        ]);
      for (const [owner, effects] of owned) {
        for (const e of effects) {
          if (e[0] !== "do" || e[1] !== "schedule") continue;
          const target = (e[2] as readonly [string, string])[1];
          const scope = scopes.get(target);
          const person = e[5] !== false;
          const where = `${owner} schedules '${target}'`;
          const bad =
            scope === "loan"
              ? "which is scope: loan and cannot be scheduled"
              : scope === "person" && !person
                ? `which is scope: person: name the person, as in schedule(${target}, after: 1-2 years, person)`
                : scope !== "person" && person
                  ? "which has no scope: schedule takes a person only for a scope: person storylet"
                  : undefined;
          if (bad) this.diag(src, ["id"], `${where}, ${bad}`);
        }
      }
    }
  }

  /** A cycle among readables, across Packs, through slot contributions included. */
  private checkReadableCycle(bundles: readonly PackBundle[]): void {
    const cycle = readableCycle(
      bundles.flatMap((b) => b.readables),
      bundles.flatMap((b) => b.contributions),
    );
    if (cycle === undefined) return;
    const first = cycle.split(" -> ")[0] as string;
    for (const pack of this.packs.values())
      for (const r of pack.readables)
        if (declaresReadable(r) && r.decl.id === first) {
          this.diag(
            r.src,
            [r.index],
            `readables form a cycle: ${cycle}`,
            first,
          );
          return;
        }
  }

  diag(
    src: Source,
    path: Path,
    message: string,
    label: string = formatPath(path),
  ): void {
    const loc = src.locate(path);
    this.diags.push({
      file: src.file,
      path: label,
      message,
      ...(loc ? { line: loc.line, column: loc.column } : {}),
    });
  }

  private rel(...parts: string[]): string {
    return parts.join("/");
  }

  private listYaml(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .sort();
  }

  private load(): void {
    if (!existsSync(this.packsDir)) {
      this.diags.push({
        file: this.packsDir,
        path: "",
        message: "packs directory does not exist",
      });
      return;
    }
    const dirs = readdirSync(this.packsDir)
      .filter((d) => statSync(join(this.packsDir, d)).isDirectory())
      .filter((d) => d !== "node_modules")
      .sort();
    const wanted = this.only === undefined ? undefined : this.closure(dirs);
    for (const d of dirs) {
      if (wanted && !wanted.has(d)) continue;
      const dir = join(this.packsDir, d);
      const manifestFile = join(dir, "pack.yaml");
      const hasContent = Object.keys(CONTENT_DIRS).some((c) =>
        existsSync(join(dir, c)),
      );
      if (!existsSync(manifestFile)) {
        // A placeholder directory without content is skipped; content without a manifest is an error.
        if (hasContent)
          this.diags.push({
            file: this.rel(d, "pack.yaml"),
            path: "",
            message:
              "missing manifest: the directory has content but no pack.yaml",
          });
        continue;
      }
      this.loadPack(d, dir, manifestFile);
    }
    for (const id of this.only ?? [])
      if (!this.packs.has(id) && !dirs.includes(id))
        this.diags.push({
          file: this.packsDir,
          path: "",
          message: `only: no Pack '${id}'`,
        });
  }

  /**
   * The Pack directories `only` selects plus those their capabilities require, transitively.
   * Reads only the capability files' `requires` lists, so a broken sibling Pack is never parsed;
   * problems in the closure's own files are reported when they are loaded.
   */
  private closure(dirs: readonly string[]): Set<string> {
    const keep = new Set<string>();
    const visit = (id: string): void => {
      if (keep.has(id) || !dirs.includes(id)) return;
      keep.add(id);
      const capDir = join(this.packsDir, id, "capabilities");
      for (const f of this.listYaml(capDir)) {
        const src = parseYaml(
          this.rel(id, "capabilities", f),
          readFileSync(join(capDir, f), "utf8"),
          [],
          true,
        );
        const requires = (src?.value as { requires?: unknown } | null)
          ?.requires;
        if (!Array.isArray(requires)) continue;
        for (const req of requires)
          if (typeof req === "string" && req.includes("/"))
            visit(req.slice(0, req.indexOf("/")));
      }
    };
    for (const id of this.only ?? []) visit(id);
    return keep;
  }

  private loadPack(d: string, dir: string, manifestFile: string): void {
    const file = this.rel(d, "pack.yaml");
    const src = parseYaml(file, readFileSync(manifestFile, "utf8"), this.diags);
    if (!src) return;
    if (
      src.value !== null &&
      typeof src.value === "object" &&
      "qualities" in src.value
    ) {
      this.diag(
        src,
        ["qualities"],
        `'qualities' is no longer allowed in pack.yaml; move the list into ${d}/qualities/<topic>.yaml`,
      );
      return;
    }
    if (!validate(src, ManifestSchema, src.value, [], this.diags)) return;
    const manifest = src.value as Manifest;
    if (manifest.id !== d) {
      this.diag(
        src,
        ["id"],
        `pack id '${manifest.id}' must equal its directory name '${d}'`,
      );
      return;
    }
    const items: LoadedItem[] = [];
    const seen = new Map<string, string>();
    const schemas: Record<
      string,
      [TSchema, (d: Record<string, unknown>) => Kind]
    > = {
      storylets: [StoryletSchema, () => "storylet"],
      occupations: [OccupationSchema, () => "occupation"],
      items: [ItemSchema, (x) => (x.market ? "market" : "item")],
      loans: [LoanSchema, () => "loan"],
      cities: [CitySchema, () => "city"],
      standards: [StandardSchema, () => "standard"],
      people: [PeopleSchema, (x) => (x.kind === "role" ? "role" : "generator")],
    };
    for (const [sub, [schema, kindOf]] of Object.entries(schemas)) {
      const subdir = join(dir, sub);
      for (const f of this.listYaml(subdir)) {
        const fileRel = this.rel(d, sub, f);
        const fsrc = parseYaml(
          fileRel,
          readFileSync(join(subdir, f), "utf8"),
          this.diags,
        );
        if (!fsrc) continue;
        if (fsrc.value === null || fsrc.value === undefined) continue;
        if (!Array.isArray(fsrc.value)) {
          this.diag(fsrc, [], "a content file must be a list of items");
          continue;
        }
        fsrc.value.forEach((raw: unknown, i: number) => {
          const label = (p: Path): string => {
            const first = p[0];
            const rest = p.slice(1);
            const id =
              typeof first === "number" &&
              typeof (fsrc.value as { id?: unknown }[])[first]?.id === "string"
                ? ((fsrc.value as { id: string }[])[first] as { id: string }).id
                : `[${first}]`;
            return `${id}${formatPath(rest) ? (typeof rest[0] === "number" ? "" : ".") + formatPath(rest) : ""}`;
          };
          if (!validate(fsrc, schema, raw, [i], this.diags, label)) return;
          const data = raw as Record<string, unknown>;
          const id = data.id as string;
          const prev = seen.get(id);
          if (prev) {
            this.diag(
              fsrc,
              [i, "id"],
              `duplicate id '${id}' (already defined in ${prev})`,
              id,
            );
            return;
          }
          seen.set(id, fileRel);
          items.push({ kind: kindOf(data), id, src: fsrc, index: i, data });
        });
      }
    }
    const qualities = this.loadQualities(d, dir);
    const state = this.loadState(d, dir);
    const readables = this.loadReadables(d, dir);
    const macros = this.loadMacros(d, dir);
    const kinds = this.loadKinds(d, dir);
    const capabilities = this.loadCapabilities(d, dir);
    const migrations = this.loadMigrations(d, dir);
    // Stat and quality ids share the expression namespace `stat.<id>` / `quality.<id>`.
    const idx = new Map<string, Kind>();
    for (const it of items) idx.set(`${manifest.id}/${it.id}`, it.kind);
    this.index.set(manifest.id, idx);
    this.packs.set(manifest.id, {
      id: manifest.id,
      dir,
      manifest,
      manifestSrc: src,
      qualities,
      state,
      readables,
      macros,
      kinds,
      kindEntries: [],
      items,
      capabilities,
      migrations,
    });
  }

  /** `qualities/<topic>.yaml`: a list of quality declarations, merged across files like `storylets/*.yaml`. */
  private loadQualities(d: string, dir: string): LoadedQuality[] {
    const out: LoadedQuality[] = [];
    const seen = new Map<string, string>();
    const qDir = join(dir, "qualities");
    for (const f of this.listYaml(qDir)) {
      const file = this.rel(d, "qualities", f);
      const src = parseYaml(
        file,
        readFileSync(join(qDir, f), "utf8"),
        this.diags,
      );
      if (!src || src.value === null || src.value === undefined) continue;
      if (!Array.isArray(src.value)) {
        this.diag(
          src,
          [],
          "a qualities file must be a list of quality declarations",
        );
        continue;
      }
      src.value.forEach((raw: unknown, i: number) => {
        const id = (raw as { id?: unknown } | null)?.id;
        const label = (p: Path): string =>
          `${typeof id === "string" ? id : `[${i}]`}${p.length > 1 ? `.${formatPath(p.slice(1))}` : ""}`;
        if (!validate(src, QualitySchema, raw, [i], this.diags, label)) return;
        const q = raw as Quality;
        const prev = seen.get(q.id);
        if (prev) {
          this.diag(
            src,
            [i, "id"],
            `duplicate quality '${q.id}' (already defined in ${prev})`,
            q.id,
          );
          return;
        }
        seen.set(q.id, file);
        if (q.type === "int") {
          if (q.min !== undefined && q.max !== undefined && q.min > q.max)
            this.diag(src, [i], "min exceeds max", q.id);
          if (
            (q.min !== undefined && q.default < q.min) ||
            (q.max !== undefined && q.default > q.max)
          )
            this.diag(
              src,
              [i, "default"],
              "default is outside min/max",
              `${q.id}.default`,
            );
        }
        out.push({ decl: q, src, index: i });
      });
    }
    return out;
  }

  /** `state/<topic>.yaml`: a list of state container declarations (docs/spec/pack-format/state.md). */
  private loadState(d: string, dir: string): LoadedState[] {
    const out: LoadedState[] = [];
    const seen = new Map<string, string>();
    const sDir = join(dir, "state");
    for (const f of this.listYaml(sDir)) {
      const file = this.rel(d, "state", f);
      const src = parseYaml(
        file,
        readFileSync(join(sDir, f), "utf8"),
        this.diags,
      );
      if (!src || src.value === null || src.value === undefined) continue;
      if (!Array.isArray(src.value)) {
        this.diag(
          src,
          [],
          "a state file must be a list of container declarations",
        );
        continue;
      }
      src.value.forEach((raw: unknown, i: number) => {
        const id = (raw as { id?: unknown } | null)?.id;
        const label = (p: Path): string =>
          `${typeof id === "string" ? id : `[${i}]`}${p.length > 1 ? `.${formatPath(p.slice(1))}` : ""}`;
        if (!validate(src, StateSchema, raw, [i], this.diags, label)) return;
        const s = raw as State;
        const prev = seen.get(s.id);
        if (prev) {
          this.diag(
            src,
            [i, "id"],
            `duplicate state container '${s.id}' (already defined in ${prev})`,
            s.id,
          );
          return;
        }
        seen.set(s.id, file);
        if (s.kind === "table" || (s.kind === "counter" && s.type === "int")) {
          if (s.min !== undefined && s.max !== undefined && s.min > s.max)
            this.diag(src, [i], "min exceeds max", s.id);
          if (
            (s.min !== undefined && s.default < s.min) ||
            (s.max !== undefined && s.default > s.max)
          )
            this.diag(
              src,
              [i, "default"],
              "default is outside min/max",
              `${s.id}.default`,
            );
        }
        out.push({ decl: s, src, index: i });
      });
    }
    return out;
  }

  /** `kinds/<kind>.yaml`: one declared content kind per file (docs/spec/pack-format/kinds.md). */
  private loadKinds(d: string, dir: string): LoadedKind[] {
    const out: LoadedKind[] = [];
    const kDir = join(dir, "kinds");
    for (const f of this.listYaml(kDir)) {
      const file = this.rel(d, "kinds", f);
      const id = f.replace(/\.ya?ml$/, "");
      const src = parseYaml(
        file,
        readFileSync(join(kDir, f), "utf8"),
        this.diags,
      );
      if (!src) continue;
      if (!/^[a-z][a-z0-9_]*$/.test(id)) {
        this.diag(
          src,
          [],
          `kind file name '${id}' must match ^[a-z][a-z0-9_]*$`,
        );
        continue;
      }
      if (id in REF_TARGETS) {
        this.diag(
          src,
          [],
          `'${id}' is a built-in content kind and cannot name a declared kind`,
        );
        continue;
      }
      if (RESERVED_KIND_IDS.has(id)) {
        this.diag(
          src,
          [],
          `'${id}' names a Pack directory and cannot name a kind; its entries would live in ${d}/${id}/`,
        );
        continue;
      }
      if (!validate(src, KindSchema, src.value ?? {}, [], this.diags)) continue;
      const decl = src.value as KindSrc;
      const bad = Object.keys(decl.fields).filter((n) =>
        (KIND_RESERVED_FIELDS as readonly string[]).includes(n),
      );
      for (const n of bad)
        this.diag(
          src,
          ["fields", n],
          `'${n}' is reserved and cannot name a field`,
        );
      if (bad.length === 0) out.push({ id, decl, src });
    }
    return out;
  }

  /**
   * Entries of every kind a Pack sees: its own, and those a capability it requires exports
   * (`provides: kinds`). Read from `<pack>/<kind>/*.yaml`, validated against a schema built
   * from the kind's fields, and indexed so other Packs can reference them.
   */
  private loadKindEntries(): void {
    for (const pack of this.packs.values()) {
      const visible = this.visibleKinds(pack);
      const seen = new Map<string, string>();
      for (const [kindId, { decl }] of [...visible].sort(([a], [b]) =>
        a < b ? -1 : 1,
      )) {
        const eDir = join(pack.dir, kindId);
        for (const f of this.listYaml(eDir)) {
          const file = this.rel(pack.id, kindId, f);
          const src = parseYaml(
            file,
            readFileSync(join(eDir, f), "utf8"),
            this.diags,
          );
          if (!src || src.value === null || src.value === undefined) continue;
          if (!Array.isArray(src.value)) {
            this.diag(src, [], `a ${kindId} file must be a list of entries`);
            continue;
          }
          const schema = kindEntrySchema(decl.fields);
          src.value.forEach((raw: unknown, i: number) => {
            const id = (raw as { id?: unknown } | null)?.id;
            const label = (p: Path): string =>
              `${typeof id === "string" ? id : `[${i}]`}${p.length > 1 ? `.${formatPath(p.slice(1))}` : ""}`;
            if (!validate(src, schema, raw, [i], this.diags, label)) return;
            const data = raw as Record<string, unknown>;
            const eid = data.id as string;
            const prev = seen.get(`${kindId}/${eid}`);
            if (prev) {
              this.diag(
                src,
                [i, "id"],
                `duplicate ${kindId} entry '${eid}' (already defined in ${prev})`,
                eid,
              );
              return;
            }
            const clash = this.index.get(pack.id)?.get(`${pack.id}/${eid}`);
            if (clash !== undefined && clash !== `kind:${kindId}`) {
              this.diag(
                src,
                [i, "id"],
                `id '${eid}' is already used by a ${clash} of Pack '${pack.id}'; ids are unique within a Pack`,
                eid,
              );
              return;
            }
            seen.set(`${kindId}/${eid}`, file);
            pack.kindEntries.push({
              kind: kindId,
              id: eid,
              data,
              src,
              index: i,
            });
            this.index.get(pack.id)?.set(`${pack.id}/${eid}`, `kind:${kindId}`);
          });
        }
      }
    }
  }

  /** Kinds `pack` sees: those it declares, and those its required capabilities provide. */
  visibleKinds(
    pack: LoadedPack,
  ): Map<string, { decl: KindSrc; owner: string }> {
    const out = new Map<string, { decl: KindSrc; owner: string }>();
    for (const k of pack.kinds) out.set(k.id, { decl: k.decl, owner: pack.id });
    for (const req of pack.capabilities.flatMap((c) => c.requires)) {
      const cap = this.capabilities.get(req);
      const owner = cap && this.packs.get(cap.pack);
      if (!cap || !owner || owner === pack) continue;
      for (const id of cap.provides.kinds ?? []) {
        const k = owner.kinds.find((x) => x.id === id);
        if (k) out.set(id, { decl: k.decl, owner: owner.id });
      }
    }
    return out;
  }

  /** `readables/<topic>.yaml`: readables, slots and slot contributions (docs/spec/pack-format/readables.md). */
  private loadReadables(d: string, dir: string): LoadedReadable[] {
    const out: LoadedReadable[] = [];
    const seen = new Map<string, string>();
    const rDir = join(dir, "readables");
    for (const f of this.listYaml(rDir)) {
      const file = this.rel(d, "readables", f);
      const src = parseYaml(
        file,
        readFileSync(join(rDir, f), "utf8"),
        this.diags,
      );
      if (!src || src.value === null || src.value === undefined) continue;
      if (!Array.isArray(src.value)) {
        this.diag(
          src,
          [],
          "a readables file must be a list of readable, slot and contribute entries",
        );
        continue;
      }
      src.value.forEach((raw: unknown, i: number) => {
        const id = (raw as { id?: unknown } | null)?.id;
        const label = (p: Path): string =>
          `${typeof id === "string" ? id : `[${i}]`}${p.length > 1 ? `.${formatPath(p.slice(1))}` : ""}`;
        if (!validate(src, ReadableSchema, raw, [i], this.diags, label)) return;
        const r = raw as Readable;
        if (r.kind !== "contribute") {
          if (READABLE_RESERVED.has(r.id)) {
            this.diag(
              src,
              [i, "id"],
              `'${r.id}' is a reserved name and cannot name a readable`,
              r.id,
            );
            return;
          }
          const prev = seen.get(r.id);
          if (prev) {
            this.diag(
              src,
              [i, "id"],
              `duplicate readable '${r.id}' (already defined in ${prev})`,
              r.id,
            );
            return;
          }
          seen.set(r.id, file);
        }
        out.push({ decl: r, src, index: i });
      });
    }
    return out;
  }

  /** `effects/<topic>.yaml`: effect macros (docs/spec/pack-format/effects.md). */
  private loadMacros(d: string, dir: string): LoadedMacro[] {
    const out: LoadedMacro[] = [];
    const seen = new Map<string, string>();
    const eDir = join(dir, "effects");
    for (const f of this.listYaml(eDir)) {
      const file = this.rel(d, "effects", f);
      const src = parseYaml(
        file,
        readFileSync(join(eDir, f), "utf8"),
        this.diags,
      );
      if (!src || src.value === null || src.value === undefined) continue;
      if (!Array.isArray(src.value)) {
        this.diag(src, [], "an effects file must be a list of effect macros");
        continue;
      }
      src.value.forEach((raw: unknown, i: number) => {
        const id = (raw as { id?: unknown } | null)?.id;
        const label = (p: Path): string =>
          `${typeof id === "string" ? id : `[${i}]`}${p.length > 1 ? `.${formatPath(p.slice(1))}` : ""}`;
        if (!validate(src, MacroSchema, raw, [i], this.diags, label)) return;
        const m = raw as Macro;
        const prev = seen.get(m.id);
        if (prev) {
          this.diag(
            src,
            [i, "id"],
            `duplicate effect macro '${m.id}' (already defined in ${prev})`,
            m.id,
          );
          return;
        }
        seen.set(m.id, file);
        for (const [pi, p] of (m.params ?? []).entries())
          if (READABLE_RESERVED.has(p))
            this.diag(
              src,
              [i, "params", pi],
              `'${p}' is a reserved name and cannot name a macro parameter`,
              `${m.id}.params`,
            );
        out.push({ decl: m, src, index: i });
      });
    }
    return out;
  }

  private loadCapabilities(d: string, dir: string): LoadedCapability[] {
    const out: LoadedCapability[] = [];
    const capDir = join(dir, "capabilities");
    for (const f of this.listYaml(capDir)) {
      const file = this.rel(d, "capabilities", f);
      const stem = f.replace(/\.ya?ml$/, "");
      if (!/^[a-z][a-z0-9_-]*$/.test(stem)) {
        this.diags.push({
          file,
          path: "",
          message: `capability file name '${stem}' must match ^[a-z][a-z0-9_-]*$`,
        });
        continue;
      }
      const src = parseYaml(
        file,
        readFileSync(join(capDir, f), "utf8"),
        this.diags,
        true,
      );
      if (!src) continue;
      const value = src.value ?? {};
      if (!validate(src, CapabilitySchema, value, [], this.diags)) continue;
      out.push({
        id: `${d}/${stem}`,
        pack: d,
        src,
        file,
        provides: (value as Capability).provides ?? {},
        requires: (value as Capability).requires ?? [],
      });
    }
    return out;
  }

  private loadMigrations(d: string, dir: string): LoadedMigration[] {
    const out: LoadedMigration[] = [];
    const migDir = join(dir, "migrations");
    for (const f of this.listYaml(migDir)) {
      const file = this.rel(d, "migrations", f);
      const stem = f.replace(/\.ya?ml$/, "");
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(stem)) {
        this.diags.push({
          file,
          path: "",
          message: `migration file name '${stem}' must match ^[a-z0-9][a-z0-9_-]*$`,
        });
        continue;
      }
      const src = parseYaml(
        file,
        readFileSync(join(migDir, f), "utf8"),
        this.diags,
        true,
      );
      if (!src) continue;
      const value = src.value ?? {};
      if (!validate(src, MigrationSchema, value, [], this.diags)) continue;
      out.push({
        id: `${d}/${stem}`,
        src,
        rename: (value as Migration).rename ?? [],
        remove: (value as Migration).remove ?? [],
      });
    }
    return out;
  }

  /** Capability id -> loaded capability, over every loaded Pack. */
  readonly capabilities = new Map<string, LoadedCapability>();

  /**
   * Every `requires` names a capability some loaded Pack provides; every `provides` entry
   * names something that Pack declares; no two features of a Pack export the same id.
   */
  private indexCapabilities(): void {
    for (const pack of this.packs.values())
      for (const cap of pack.capabilities) this.capabilities.set(cap.id, cap);
  }

  private checkCapabilities(): void {
    const milestoneOwners = new Map<string, string>();
    for (const id of [...this.packs.keys()].sort()) {
      const pack = this.packs.get(id) as LoadedPack;
      const exported = new Map<string, string>();
      for (const cap of pack.capabilities) {
        const at = (path: Path, message: string) =>
          this.diag(cap.src, path, message, formatPath(path));
        for (const [i, req] of cap.requires.entries()) {
          if (this.capabilities.has(req)) continue;
          const reqPack = req.slice(0, req.indexOf("/"));
          at(
            ["requires", i],
            this.packs.has(reqPack)
              ? `Pack '${id}' requires capability '${req}', but Pack '${reqPack}' has no capabilities/${req.slice(reqPack.length + 1)}.yaml`
              : `Pack '${id}' requires capability '${req}', but no Pack '${reqPack}' is loaded`,
          );
        }
        for (const [key, ids] of Object.entries(cap.provides)) {
          for (const [i, name] of ((ids ?? []) as string[]).entries()) {
            const slot = `${key}:${name}`;
            const first = exported.get(slot);
            if (first !== undefined)
              at(
                ["provides", key, i],
                `${key} '${name}' is provided by both '${first}' and '${cap.id}'`,
              );
            exported.set(slot, cap.id);
            if (key === "milestones") {
              const other = milestoneOwners.get(name);
              if (other !== undefined && other !== id)
                at(
                  ["provides", key, i],
                  `milestone '${name}' is provided by both Pack '${other}' and Pack '${id}'`,
                );
              else milestoneOwners.set(name, id);
              continue;
            }
            if (key === "tags") continue;
            if (!this.provided(pack, key, name))
              at(
                ["provides", key, i],
                `'${cap.id}' provides ${key} '${name}', but Pack '${id}' declares none`,
              );
          }
        }
      }
    }
  }

  /** Does `pack` declare `name` of the `provides` category `key`? */
  private provided(pack: LoadedPack, key: string, name: string): boolean {
    if (key === "stats")
      return (pack.manifest.stats ?? []).some((s) => s.id === name);
    if (key === "qualities")
      return pack.qualities.some((q) => q.decl.id === name);
    if (key === "state") return pack.state.some((s) => s.decl.id === name);
    if (key === "readables")
      return pack.readables.some(
        (r) => declaresReadable(r) && r.decl.id === name,
      );
    if (key === "kinds")
      return (
        pack.kinds.some((k) => k.id === name) ||
        pack.kindEntries.some((e) => e.kind === name)
      );
    if (key === "effects") return pack.macros.some((m) => m.decl.id === name);
    if (key === "groups")
      return (pack.manifest.exclusivity ?? []).includes(name);
    if (key === "singletons")
      return (SINGLETONS as readonly string[]).includes(name)
        ? (pack.manifest as Record<string, unknown>)[name] !== undefined
        : false;
    const kind = this.index.get(pack.id)?.get(`${pack.id}/${name}`);
    return kind !== undefined && (PROVIDES_KINDS[key] ?? []).includes(kind);
  }

  /** Packs whose capabilities `pack` requires, excluding itself. */
  requiredPacks(pack: LoadedPack): Set<string> {
    const out = new Set<string>();
    for (const cap of pack.capabilities)
      for (const req of cap.requires) {
        const p = req.slice(0, req.indexOf("/"));
        if (p !== pack.id && this.packs.has(p)) out.add(p);
      }
    return out;
  }

  /** Stats and qualities are bare ids shared by every Pack, so two Packs may not declare the same one. */
  private checkCrossPackDeclarations(): void {
    const owner = new Map<string, string>();
    for (const id of [...this.packs.keys()].sort()) {
      const pack = this.packs.get(id) as LoadedPack;
      for (const [kind, key] of [
        ["stat", "stats"],
        ["quality", "qualities"],
        ["state", "state"],
        ["readable", "readables"],
        ["kind", "kinds"],
      ] as const) {
        const decls =
          key === "stats"
            ? (pack.manifest.stats ?? []).map((d, i) => ({
                d,
                src: pack.manifestSrc,
                at: [key, i, "id"] as Path,
              }))
            : key === "kinds"
              ? pack.kinds.map((k) => ({
                  d: { id: k.id },
                  src: k.src,
                  at: [] as Path,
                }))
              : key === "readables"
                ? pack.readables.filter(declaresReadable).map((q) => ({
                    d: q.decl,
                    src: q.src,
                    at: [q.index, "id"] as Path,
                  }))
                : (key === "qualities" ? pack.qualities : pack.state).map(
                    (q) => ({
                      d: q.decl,
                      src: q.src,
                      at: [q.index, "id"] as Path,
                    }),
                  );
        for (const { d, src, at } of decls) {
          const first = owner.get(`${kind}.${d.id}`);
          if (first === undefined) owner.set(`${kind}.${d.id}`, id);
          else if (first !== id)
            this.diag(
              src,
              at,
              `${kind} '${d.id}' is declared by both Pack '${first}' and Pack '${id}'; prefix Pack-specific ids with the Pack name`,
            );
        }
      }
    }
  }

  /** A Pack with a `namespace` prefixes every stat and quality id it declares; namespaces are unique. */
  private checkNamespaces(): void {
    const owner = new Map<string, string>();
    for (const id of [...this.packs.keys()].sort()) {
      const pack = this.packs.get(id) as LoadedPack;
      const ns = pack.manifest.namespace;
      if (ns === undefined || id === CORE_LOOP) continue;
      const first = owner.get(ns);
      if (first !== undefined)
        this.diag(
          pack.manifestSrc,
          ["namespace"],
          `namespace '${ns}' is used by both Pack '${first}' and Pack '${id}'`,
        );
      else owner.set(ns, id);
      const prefix = `${ns}_`;
      const bad = (what: string, name: string, src: Source, at: Path) => {
        if (!name.startsWith(prefix))
          this.diag(
            src,
            at,
            `${what} '${name}' of Pack '${id}' must start with its namespace '${prefix}'`,
          );
      };
      for (const [i, s] of (pack.manifest.stats ?? []).entries())
        bad("stat", s.id, pack.manifestSrc, ["stats", i, "id"]);
      for (const q of pack.qualities)
        bad("quality", q.decl.id, q.src, [q.index, "id"]);
      for (const s of pack.state)
        bad("state container", s.decl.id, s.src, [s.index, "id"]);
      for (const r of pack.readables.filter(declaresReadable))
        bad("readable", r.decl.id, r.src, [r.index, "id"]);
      for (const k of pack.kinds) bad("kind", k.id, k.src, []);
    }
  }

  /**
   * A singleton manifest block may be declared by one Pack only, and that Pack must own it
   * through a capability `provides: singletons`; there is no implicit first-wins owner.
   */
  private checkSingletons(): void {
    const ids = [...this.packs.keys()].sort();
    for (const name of SINGLETONS) {
      const declarers = ids.filter(
        (id) =>
          (
            (this.packs.get(id) as LoadedPack).manifest as Record<
              string,
              unknown
            >
          )[name] !== undefined,
      );
      for (const [n, id] of declarers.entries()) {
        const pack = this.packs.get(id) as LoadedPack;
        if (n > 0)
          this.diag(
            pack.manifestSrc,
            [name],
            `singleton '${name}' is declared by both Pack '${declarers[0]}' and Pack '${id}'; only one Pack may declare it`,
          );
        const owns = pack.capabilities.some((cap) =>
          (cap.provides.singletons ?? []).includes(name),
        );
        if (!owns)
          this.diag(
            pack.manifestSrc,
            [name],
            `Pack '${id}' declares singleton '${name}' but no capability of it provides it; add 'singletons: [${name}]' under provides in a capability file`,
          );
      }
    }
  }

  /** Topological order over capability requirements; reports cycles. */
  private order(): string[] {
    const out: string[] = [];
    const state = new Map<string, 1 | 2>();
    const visit = (id: string, stack: string[]): void => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        const pack = this.packs.get(id) as LoadedPack;
        this.diag(
          pack.manifestSrc,
          [],
          `capability cycle between Packs: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`,
        );
        return;
      }
      state.set(id, 1);
      const pack = this.packs.get(id) as LoadedPack;
      for (const dep of [...this.requiredPacks(pack)].sort())
        visit(dep, [...stack, id]);
      state.set(id, 2);
      out.push(id);
    };
    for (const id of [...this.packs.keys()].sort()) visit(id, []);
    return out;
  }
}

type Names = Record<string, ExprType>;

class PackCompiler {
  /** Packs whose capabilities this Pack requires. */
  readonly depends: Set<string>;
  /** Capabilities this Pack requires (every `requires` of its capability files). */
  readonly required = new Set<string>();
  readonly baseNames: Names = { ...PLAYER_NAMES };
  readonly groups = new Set<string>();
  /** Declared stat and quality names usable as `stat.x`/`quality.x`. */
  readonly declared = new Set<string>();
  readonly statIds = new Set<string>();
  /** Person-addressable qualities and state tables visible to this Pack (`person.quality.x`, `person.table.x.k`). */
  readonly personQualities = new Map<string, ExprType>();
  readonly tables = new Map<string, readonly string[]>();
  /** Container paths the aggregators accept, with the element type. */
  readonly aggregates: Names = {};
  /** Slots visible to this Pack (its own and required ones) by id, with their type. */
  readonly slots = new Map<string, "int" | "bool">();
  /** Macro call name (`<pack>.<macro>`) -> parameter count, for every macro this Pack may call. */
  readonly macroArity: Record<string, number> = {};
  private readonly macroTargets = new Map<
    string,
    { pc: PackCompiler; id: string }
  >();
  /** This Pack's compiled macros by id; null: it failed (already reported). */
  private readonly macros = new Map<string, CompiledMacro | null>();
  /** Kinds this Pack sees (its own and those required capabilities provide), by id. */
  kinds = new Map<string, { decl: KindSrc; owner: string }>();
  /** Field types of the visible kinds, for the expression checker. */
  private kindFields: Record<string, Record<string, ExprType>> = {};
  /** Readable ids visible to this Pack; kind entry expressions may not read them. */
  private readonly readableIds = new Set<string>();
  /**
   * While true, expressions are those of kind entries: no readables and no `kind(...)` reads,
   * so a kind read can never loop back to itself.
   */
  private entryMode = false;
  owner = "";

  readonly c: Compiler;
  readonly pack: LoadedPack;
  private src: Source;
  /** Index of the item being compiled in its file; undefined for the manifest. */
  private itemIndex: number | undefined;

  constructor(c: Compiler, pack: LoadedPack) {
    this.c = c;
    this.pack = pack;
    this.src = pack.manifestSrc;
    this.depends = c.requiredPacks(pack);
    for (const cap of pack.capabilities)
      for (const req of cap.requires) this.required.add(req);
  }

  /**
   * Add stat/quality/exclusivity declarations of this Pack (all of them, `only` undefined)
   * or those another Pack exports through a capability this Pack requires.
   */
  private addDecls(pack: LoadedPack, only?: Capability["provides"]): void {
    const m = pack.manifest;
    const has = (
      key: "stats" | "qualities" | "state" | "readables" | "groups",
      id: string,
    ) => only === undefined || (only[key] ?? []).includes(id);
    for (const s of m.stats ?? []) {
      if (!has("stats", s.id)) continue;
      this.baseNames[`stat.${s.id}`] = "int";
      this.declared.add(`stat.${s.id}`);
      this.statIds.add(s.id);
    }
    for (const { decl: q } of pack.qualities) {
      if (!has("qualities", q.id)) continue;
      const type = q.type === "flag" ? "bool" : "int";
      this.baseNames[`quality.${q.id}`] = type;
      this.declared.add(`quality.${q.id}`);
      if (q.scope === "person") {
        this.personQualities.set(q.id, type);
        this.aggregates[`people.quality.${q.id}`] = type;
      }
    }
    for (const r of pack.readables) {
      if (!declaresReadable(r) || !has("readables", r.decl.id)) continue;
      this.baseNames[r.decl.id] = r.decl.type;
      this.readableIds.add(r.decl.id);
      if (r.decl.kind === "slot") this.slots.set(r.decl.id, r.decl.type);
    }
    for (const { decl: s } of pack.state) {
      if (!has("state", s.id)) continue;
      if (s.kind === "table") {
        this.tables.set(s.id, s.keys);
        this.aggregates[`table.${s.id}`] = "int";
        for (const k of s.keys) {
          this.aggregates[`people.table.${s.id}.${k}`] = "int";
          this.baseNames[`table.${s.id}.${k}`] = "int";
          this.declared.add(`table.${s.id}.${k}`);
        }
      } else {
        this.baseNames[`world.${s.id}`] = s.type === "flag" ? "bool" : "int";
        this.declared.add(`world.${s.id}`);
      }
    }
    for (const g of m.exclusivity ?? [])
      if (has("groups", g)) this.groups.add(g);
  }

  /** `<prefix>.quality.<id>` and `<prefix>.table.<id>.<key>` names of a person in scope. */
  private personStateNames(prefix: string): Names {
    const n: Names = {};
    for (const [id, type] of this.personQualities)
      n[`${prefix}.quality.${id}`] = type;
    for (const [id, keys] of this.tables)
      for (const k of keys) n[`${prefix}.table.${id}.${k}`] = "int";
    return n;
  }

  compile(): PackBundle {
    const { pack, c } = this;
    const m = pack.manifest;
    this.kinds = c.visibleKinds(pack);
    this.kindFields = Object.fromEntries(
      [...this.kinds].map(([id, { decl }]) => [
        id,
        Object.fromEntries(
          Object.entries(decl.fields).map(([name, f]) => [
            name,
            f.type === "ref"
              ? "id"
              : f.type === "expr"
                ? f.returns
                : f.type === "int"
                  ? "int"
                  : "string",
          ]),
        ),
      ]),
    ) as Record<string, Record<string, ExprType>>;
    // Declarations: own Pack, then what required capabilities export.
    this.addDecls(pack);
    this.checkDeclarations(m);
    for (const req of [...this.required].sort()) {
      const cap = c.capabilities.get(req);
      const dp = cap && c.packs.get(cap.pack);
      if (cap && dp && dp !== pack) this.addDecls(dp, cap.provides);
    }

    this.addMacros(pack);
    for (const req of [...this.required].sort()) {
      const cap = c.capabilities.get(req);
      const dp = cap && c.packs.get(cap.pack);
      if (cap && dp && dp !== pack)
        this.addMacros(dp, cap.provides.effects ?? []);
    }
    for (const lm of pack.macros) this.compileMacro(lm.decl.id, []);

    const bundle = {
      storylets: [] as CompiledStorylet[],
      occupations: [] as CompiledOccupationKind[],
      items: [] as CompiledItemKind[],
      loans: [] as CompiledLoanKind[],
      cities: [] as CompiledCity[],
      standards: [] as CompiledStandard[],
      people: [] as CompiledPeopleItem[],
    };
    for (const it of pack.items) {
      this.src = it.src;
      this.itemIndex = it.index;
      this.owner = `${pack.id}/${it.id}`;
      switch (it.kind) {
        case "storylet":
          bundle.storylets.push(
            this.storylet(it, it.data as unknown as StoryletSrc),
          );
          break;
        case "occupation":
          bundle.occupations.push(
            this.occupation(it, it.data as unknown as OccupationSrc),
          );
          break;
        case "item":
        case "market":
          bundle.items.push(this.item(it, it.data as unknown as ItemSrc));
          break;
        case "loan":
          bundle.loans.push(this.loan(it, it.data as unknown as LoanSrc));
          break;
        case "city":
          bundle.cities.push(this.city(it.data as unknown as CitySrc));
          break;
        case "standard":
          bundle.standards.push(
            this.standard(it.data as unknown as StandardSrc),
          );
          break;
        default:
          bundle.people.push(this.people(it, it.data as unknown as PeopleSrc));
      }
    }
    for (const k of Object.keys(bundle) as (keyof typeof bundle)[]) {
      (bundle[k] as { id: string }[]).sort((a, b) => (a.id < b.id ? -1 : 1));
    }

    this.src = pack.manifestSrc;
    this.itemIndex = undefined;
    this.owner = pack.id;
    const stats: StatDecl[] = (m.stats ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      ...(s.icon
        ? this.iconField(s.icon, ["stats", (m.stats ?? []).indexOf(s), "icon"])
        : {}),
      start: s.start as [number, number],
    }));
    const qualities = this.pack.qualities.map(
      (q) => ({ ...q.decl }) as QualityDecl,
    );
    const state = this.pack.state
      .map((s) => ({ ...s.decl }) as StateDecl)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const { readables, contributions } = this.readables();
    const { kinds, kindEntries } = this.compileKinds();
    const migrations = this.migrations(pack, m);
    this.idLock(m, migrations);
    return {
      format: PACK_BUNDLE_FORMAT,
      id: pack.id,
      depends: [...this.depends].sort(),
      capabilities: pack.capabilities.map((x) => x.id).sort(),
      requires: [...this.required].sort(),
      ...(m.currency ? { currency: m.currency } : {}),
      stats,
      qualities,
      state,
      readables,
      contributions,
      kinds,
      kindEntries,
      exclusivity: [...(m.exclusivity ?? [])],
      ...(m.year
        ? {
            year: {
              slots: m.year.slots as [number, number],
              cap: m.year.cap,
              ...(m.year.decisions
                ? { decisions: m.year.decisions.map(percentBp) }
                : {}),
              ...(m.year.decisions_min_age !== undefined
                ? { decisionsMinAge: m.year.decisions_min_age }
                : {}),
              ...(m.year.quiet ? { quiet: [...m.year.quiet] } : {}),
            },
          }
        : {}),
      ...(m.repeat ? { repeat: this.manifestRepeat(m.repeat) } : {}),
      ...(m.family ? { family: this.family(m.family) } : {}),
      ...(m.living ? { living: this.living(m.living) } : {}),
      ...(m.npc_careers ? { npcCareers: this.npcCareers(m.npc_careers) } : {}),
      ...(m.hooks ? { hooks: this.hooks(m.hooks) } : {}),
      ...(m.settlement ? { settlement: this.settlement(m.settlement) } : {}),
      migrations,
      ...bundle,
    };
  }

  // ---- effect macros ------------------------------------------------------

  /** Make `pack`'s macros (all, or those in `only`) callable from this Pack. */
  private addMacros(pack: LoadedPack, only?: readonly string[]): void {
    const pc = this.c.compilers.get(pack.id);
    if (!pc) return;
    for (const { decl } of pack.macros) {
      if (only !== undefined && !only.includes(decl.id)) continue;
      const name = `${macroPrefix(pack.id)}.${decl.id}`;
      this.macroArity[name] = (decl.params ?? []).length;
      this.macroTargets.set(name, { pc, id: decl.id });
    }
  }

  /**
   * Compile one of this Pack's macros: check and resolve each body statement here, with its
   * parameters as integer names, and inline the macros it calls. Diagnostics point at the
   * macro's own file. `stack` holds the macros being compiled above this one.
   */
  private compileMacro(
    id: string,
    stack: readonly string[],
  ): CompiledMacro | null {
    const done = this.macros.get(id);
    if (done !== undefined) return done;
    const lm = this.pack.macros.find((m) => m.decl.id === id) as LoadedMacro;
    const saved = [this.src, this.itemIndex, this.owner] as const;
    this.src = lm.src;
    this.itemIndex = lm.index;
    this.owner = `${this.pack.id}/${id}`;
    const params = lm.decl.params ?? [];
    const paramNames: Names = {};
    let failed = false;
    for (const [pi, p] of params.entries()) {
      if (Object.hasOwn(this.baseNames, p)) {
        this.err(
          ["params", pi],
          `'${p}' is already a declared name and cannot name a parameter`,
        );
        failed = true;
      }
      paramNames[p] = "int";
    }
    const bound: Names = {};
    const persons: string[] = [];
    const body: Effect[] = [];
    const nested = [...stack, id];
    let depth = 1;
    for (const [ei, src] of lm.decl.effects.entries()) {
      const epath = ["effects", ei];
      const r = compileExpr(
        src,
        {
          names: { ...this.baseNames, ...paramNames, ...bound },
          persons,
          kinds: this.kindFields,
          macros: this.macroArity,
        },
        "effect",
      );
      if (!r.ok) {
        failed = true;
        for (const e of r.errors)
          this.err(epath, `${e.message} (in '${src}', column ${e.column})`);
        continue;
      }
      const resolved = this.resolveEffect(r.ast, epath);
      if (!resolved) {
        failed = true;
        continue;
      }
      if (isMacroCall(resolved)) {
        const x = this.expandMacroCall(resolved, nested, epath);
        if (!x) failed = true;
        else {
          body.push(...x.effects);
          depth = Math.max(depth, x.depth + 1);
        }
        continue;
      }
      if (resolved[0] === "spawn") {
        if (!this.bindSpawn(resolved[3], bound, persons, epath)) {
          failed = true;
          continue;
        }
      }
      this.effectText(resolved, { ...this.baseNames, ...bound }, epath);
      body.push(resolved);
    }
    if (depth > MAX_MACRO_DEPTH) {
      this.err(
        ["id"],
        `macro '${id}' nests macros ${depth} deep; the limit is ${MAX_MACRO_DEPTH}`,
      );
      failed = true;
    }
    [this.src, this.itemIndex, this.owner] = saved;
    const out = failed ? null : { params, body, depth };
    this.macros.set(id, out);
    return out;
  }

  /**
   * Replace a resolved macro call `["do", "<pack>.<macro>", ...args]` with the macro's body,
   * arguments substituted. Undefined when the macro or the call is invalid (already reported).
   */
  private expandMacroCall(
    call: Effect,
    stack: readonly string[],
    path: Path,
  ): { effects: Effect[]; depth: number } | undefined {
    const t = this.macroTargets.get(call[1] as string) as {
      pc: PackCompiler;
      id: string;
    };
    let m: CompiledMacro | null | undefined;
    if (t.pc === this) {
      const at = stack.indexOf(t.id);
      if (at >= 0) {
        this.err(
          path,
          `effect macros form a cycle: ${[...stack.slice(at), t.id].join(" -> ")}`,
        );
        return undefined;
      }
      m = this.compileMacro(t.id, stack);
    } else m = t.pc.macros.get(t.id);
    if (!m) return undefined;
    return {
      effects: instantiate(m, call.slice(2) as Expr[], ++this.c.macroSeq),
      depth: m.depth,
    };
  }

  /** Declare the names of a person bound by `spawn_person(...) as <name>`. */
  private bindSpawn(
    name: string,
    bound: Names,
    persons: string[],
    path: Path,
  ): boolean {
    if (TOP_RESERVED.has(name)) {
      this.err(path, `'${name}' is reserved and cannot name a spawned person`);
      return false;
    }
    bound[`${name}.first_name`] = "string";
    bound[`${name}.last_name`] = "string";
    Object.assign(bound, pronounNames(name));
    bound[`${name}.age`] = "int";
    bound[`${name}.closeness`] = "int";
    bound[`${name}.kin`] = "string";
    Object.assign(bound, this.personStateNames(name));
    persons.push(name);
    return true;
  }

  // ---- readables ----------------------------------------------------------

  /** Compile this Pack's readables, slots and slot contributions. */
  private readables(): {
    readables: ReadableDecl[];
    contributions: ContributionDecl[];
  } {
    const readables: ReadableDecl[] = [];
    const contributions: ContributionDecl[] = [];
    for (const { decl: r, src, index } of this.pack.readables) {
      this.src = src;
      this.itemIndex = index;
      this.owner = `${this.pack.id}/${r.kind === "contribute" ? r.slot : r.id}`;
      if (r.kind === "readable") {
        const expr = this.expr(r.expr, r.type, ["expr"]);
        if (expr !== undefined)
          readables.push({ kind: "readable", id: r.id, type: r.type, expr });
      } else if (r.kind === "slot") {
        readables.push(
          r.type === "int"
            ? {
                kind: "slot",
                id: r.id,
                type: "int",
                combine: r.combine ?? "sum",
                default: r.default,
              }
            : { kind: "slot", id: r.id, type: "bool", default: r.default },
        );
      } else {
        const type = this.slots.get(r.slot);
        if (type === undefined) {
          this.err(
            ["slot"],
            `unknown slot '${r.slot}': it must be a slot this Pack declares or one a required capability provides under 'readables'; slots in reach: ${[...this.slots.keys()].sort().join(", ") || "none"}`,
          );
          continue;
        }
        const expr = this.expr(r.expr, type, ["expr"]);
        if (expr !== undefined) contributions.push({ slot: r.slot, expr });
      }
    }
    this.src = this.pack.manifestSrc;
    this.itemIndex = undefined;
    this.owner = this.pack.id;
    readables.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { readables, contributions };
  }

  // ---- content kinds ------------------------------------------------------

  /** Compile the kinds this Pack declares and the entries it wrote for any visible kind. */
  private compileKinds(): { kinds: KindDecl[]; kindEntries: KindEntry[] } {
    const kinds: KindDecl[] = [];
    for (const k of this.pack.kinds) {
      this.src = k.src;
      this.itemIndex = undefined;
      this.owner = `${this.pack.id}/${k.id}`;
      const fields: KindFieldDecl[] = [];
      let ok = true;
      for (const [name, f] of Object.entries(k.decl.fields)) {
        if (
          f.type === "ref" &&
          !(f.to in REF_TARGETS) &&
          !this.kinds.has(f.to)
        ) {
          this.err(
            ["fields", name, "to"],
            `unknown ref target '${f.to}': use a content kind (${Object.keys(REF_TARGETS).join(", ")}) or a kind this Pack can see (${[...this.kinds.keys()].sort().join(", ")})`,
          );
          ok = false;
        } else fields.push({ name, ...f } as KindFieldDecl);
      }
      if (ok)
        kinds.push({
          id: k.id,
          ...(k.decl.label === undefined ? {} : { label: k.decl.label }),
          fields,
        });
    }
    kinds.sort((a, b) => (a.id < b.id ? -1 : 1));

    const kindEntries: KindEntry[] = [];
    this.entryMode = true;
    for (const e of this.pack.kindEntries) {
      this.src = e.src;
      this.itemIndex = e.index;
      this.owner = `${this.pack.id}/${e.id}`;
      const decl = (this.kinds.get(e.kind) as { decl: KindSrc }).decl;
      const values: Record<string, number | string | Expr> = {};
      let ok = true;
      for (const [name, f] of Object.entries(decl.fields)) {
        const raw = e.data[name];
        if (f.type === "int" || f.type === "string") {
          values[name] = raw as number | string;
        } else if (f.type === "ref") {
          const full = this.ref(
            raw as string,
            f.to in REF_TARGETS ? REF_TARGETS[f.to] : [`kind:${f.to}`],
            [name],
          );
          if (full === undefined) ok = false;
          else values[name] = full;
        } else {
          const x = this.expr(raw as string | number | boolean, f.returns, [
            name,
          ]);
          if (x === undefined) ok = false;
          else values[name] = x;
        }
      }
      if (ok)
        kindEntries.push({
          kind: e.kind,
          id: `${this.pack.id}/${e.id}`,
          ...(typeof e.data.label === "string" ? { label: e.data.label } : {}),
          values,
        });
    }
    this.entryMode = false;
    this.src = this.pack.manifestSrc;
    this.itemIndex = undefined;
    this.owner = this.pack.id;
    kindEntries.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { kinds, kindEntries };
  }

  // ---- manifest -----------------------------------------------------------

  private family(f: NonNullable<Manifest["family"]>): FamilyDecl {
    const at = (key: string, sub: string, raw: string, kind: Kind) =>
      this.ref(raw, [kind], ["family", key, sub].filter(Boolean)) ?? raw;
    if (f.sibling.count[0] > f.sibling.count[1])
      this.err(
        ["family", "sibling", "count"],
        "count range minimum exceeds maximum",
      );
    return {
      ...(f.player ? { player: at("player", "", f.player, "generator") } : {}),
      parent: {
        role: at("parent", "role", f.parent.role, "role"),
        generator: at("parent", "generator", f.parent.generator, "generator"),
        count: f.parent.count,
      },
      sibling: {
        role: at("sibling", "role", f.sibling.role, "role"),
        generator: at("sibling", "generator", f.sibling.generator, "generator"),
        count: f.sibling.count as [number, number],
      },
    };
  }

  private npcCareers(n: NonNullable<Manifest["npc_careers"]>): NpcCareersDecl {
    const at = (raw: string, kind: Kind, ...path: (string | number)[]) =>
      this.ref(raw, [kind], ["npc_careers", ...path]) ?? raw;
    const flag = (q: string, ...path: (string | number)[]): string => {
      if (this.baseNames[`quality.${q}`] !== "bool")
        this.err(
          ["npc_careers", ...path],
          `'${q}' is not a declared flag quality`,
        );
      return q;
    };
    if (!this.groups.has(n.group))
      this.err(
        ["npc_careers", "group"],
        `undeclared exclusivity group '${n.group}'`,
      );
    if (n.start_age >= n.retire_age)
      this.err(
        ["npc_careers", "retire_age"],
        "retire_age must exceed start_age",
      );
    for (const [i, t] of n.tiers.entries())
      if (i > 0 && t <= (n.tiers[i - 1] as number))
        this.err(["npc_careers", "tiers", i], "tiers must be ascending");
    return {
      roles: n.roles.map((r, i) => at(r, "role", "roles", i)),
      startAge: n.start_age,
      retireAge: n.retire_age,
      group: n.group,
      ...(n.retired ? { retired: at(n.retired, "occupation", "retired") } : {}),
      hireBp: percentBp(n.hire),
      promotionBp: percentBp(n.promotion),
      jobLossBp: percentBp(n.job_loss),
      tiers: [...n.tiers],
      education: (n.education ?? []).map((e, i) => ({
        quality: flag(e.quality, "education", i, "quality"),
        chanceBp: percentBp(e.chance),
        ...(e.needs ? { needs: flag(e.needs, "education", i, "needs") } : {}),
      })),
    };
  }

  private living(l: NonNullable<Manifest["living"]>): LivingDecl {
    const role = (key: string | (string | number)[], raw: string) =>
      this.ref(
        raw,
        ["role"],
        ["living", "household", ...(Array.isArray(key) ? key : [key])],
      ) ?? raw;
    return {
      defaultStandard:
        this.ref(l.default, ["standard"], ["living", "default"]) ?? l.default,
      housingShareBp: percentBp(l.housing_share),
      homeCategory: l.home_category,
      ...(l.household
        ? {
            household: {
              dependentRole: role("dependent_role", l.household.dependent_role),
              dependentCost: l.household.dependent_cost,
              partnerRole: role("partner_role", l.household.partner_role),
              partnerShareBp: percentBp(l.household.partner_share),
              guardianRoles: l.household.guardian_roles.map((r, i) =>
                role(["guardian_roles", i], r),
              ),
            },
          }
        : {}),
    };
  }

  private checkDeclarations(m: Manifest): void {
    const seen = new Set<string>();
    for (const [i, s] of (m.stats ?? []).entries()) {
      if (seen.has(`stat.${s.id}`))
        this.err(["stats", i, "id"], `duplicate stat '${s.id}'`);
      seen.add(`stat.${s.id}`);
      if (s.start[0] > s.start[1])
        this.err(["stats", i, "start"], "start range minimum exceeds maximum");
    }
    if (m.year && m.year.slots[0] > m.year.slots[1])
      this.err(["year", "slots"], "slot range minimum exceeds maximum");
    if (m.year?.decisions) {
      const bps = m.year.decisions.map(percentBp);
      for (const [i, bp] of bps.entries())
        if (i > 0 && bp > (bps[i - 1] as number))
          this.err(
            ["year", "decisions", i],
            "decision slot probabilities must not increase",
          );
    }
  }

  // ---- errors, ids, icons, expressions -----------------------------------

  err(path: Path, message: string): void {
    const short = this.owner.slice(this.pack.id.length + 1);
    const rest = formatPath(path);
    const label =
      this.itemIndex === undefined
        ? rest
        : `${short}${rest && typeof path[0] !== "number" ? "." : ""}${rest}`;
    const full =
      this.itemIndex === undefined ? path : [this.itemIndex, ...path];
    this.c.diag(this.src, full, message, label);
  }

  /** Resolve a source reference to a full id of one of `kinds`. */
  ref(
    raw: string,
    kinds: readonly Kind[] | undefined,
    path: Path,
  ): string | undefined {
    const slash = raw.indexOf("/");
    const packId = slash < 0 ? this.pack.id : raw.slice(0, slash);
    const full = slash < 0 ? `${this.pack.id}/${raw}` : raw;
    if (packId !== this.pack.id && !this.depends.has(packId)) {
      if (this.c.packs.has(packId))
        this.err(
          path,
          `'${raw}' refers to Pack '${packId}', but no capability of Pack '${this.pack.id}' requires one of its capabilities`,
        );
      else this.err(path, `dangling reference '${raw}': no Pack '${packId}'`);
      return undefined;
    }
    const kind = this.c.index.get(packId)?.get(full);
    if (!kind) {
      const what = kinds ? kinds.map(kindName).join(" or ") : "content item";
      this.err(path, `dangling reference '${raw}': no ${what} with that id`);
      return undefined;
    }
    if (kinds && !kinds.includes(kind)) {
      this.err(
        path,
        `'${raw}' is a ${kindName(kind)}, expected ${kinds.map(kindName).join(" or ")}`,
      );
      return undefined;
    }
    if (packId !== this.pack.id && !this.exported(packId, full, kind)) {
      this.err(
        path,
        `'${raw}' is not exported by any capability that Pack '${this.pack.id}' requires; require a '${packId}' capability that provides it`,
      );
      return undefined;
    }
    return full;
  }

  /**
   * Check a milestone id: one the Core emits, or one a capability of this Pack or of a required
   * capability provides (`provides: milestones`). `fire` is for the `reach_milestone` effect,
   * which cannot name a Core milestone (the Core fires those itself).
   */
  milestoneId(raw: string, path: Path, fire = false): string | undefined {
    if ((CORE_MILESTONES as readonly string[]).includes(raw)) {
      if (!fire) return raw;
      this.err(
        path,
        `milestone '${raw}' is emitted by the Core; reach_milestone only fires Pack-declared milestones`,
      );
      return undefined;
    }
    const owners: string[] = [];
    for (const cap of this.c.capabilities.values())
      if ((cap.provides.milestones ?? []).includes(raw)) owners.push(cap.id);
    if (owners.length === 0) {
      const known = [
        ...CORE_MILESTONES,
        ...[...this.c.capabilities.values()].flatMap(
          (c) => c.provides.milestones ?? [],
        ),
      ];
      this.err(
        path,
        `undeclared milestone '${raw}'; declared: ${[...new Set(known)].sort().join(", ")}`,
      );
      return undefined;
    }
    const visible = owners.some(
      (o) =>
        (this.c.capabilities.get(o) as LoadedCapability).pack ===
          this.pack.id || this.required.has(o),
    );
    if (!visible) {
      this.err(
        path,
        `milestone '${raw}' is not exported by any capability that Pack '${this.pack.id}' requires; require ${owners.map((o) => `'${o}'`).join(" or ")}`,
      );
      return undefined;
    }
    return raw;
  }

  /** Does a capability this Pack requires export content item `full` of kind `kind`? */
  private exported(packId: string, full: string, kind: Kind): boolean {
    const bare = full.slice(packId.length + 1);
    for (const req of this.required) {
      const cap = this.c.capabilities.get(req);
      if (!cap || cap.pack !== packId) continue;
      if (kind.startsWith("kind:")) {
        if ((cap.provides.kinds ?? []).includes(kind.slice(5))) return true;
        continue;
      }
      for (const [key, kinds] of Object.entries(PROVIDES_KINDS))
        if (
          kinds.includes(kind) &&
          (
            (cap.provides as Record<string, string[] | undefined>)[key] ?? []
          ).includes(bare)
        )
          return true;
    }
    return false;
  }

  iconField(raw: string, path: Path): { icon?: string } {
    const r = resolveIcon(raw);
    if (!r.ok) {
      this.err(path, r.message);
      return {};
    }
    let use = this.c.icons.get(r.ref);
    if (!use) {
      use =
        r.kind === "twemoji"
          ? {
              kind: "twemoji",
              ref: r.ref,
              stem: r.stem,
              emoji: r.emoji,
              usedBy: new Set(),
            }
          : {
              kind: "gameicons",
              ref: r.ref,
              author: r.author,
              name: r.name,
              usedBy: new Set(),
            };
      this.c.icons.set(r.ref, use);
    }
    use.usedBy.add(this.owner);
    return { icon: r.ref };
  }

  /** Compile an expression and resolve its content ids. `names` extends the base environment. */
  expr(
    srcValue: string | number | boolean,
    kind: "bool" | "int",
    path: Path,
    extra: Names = {},
    persons: readonly string[] = extra["person.age"] ? ["person"] : [],
  ): Expr | undefined {
    const text = String(srcValue);
    const names = { ...this.baseNames, ...extra };
    if (this.entryMode)
      for (const id of this.readableIds)
        if (names[id] === this.baseNames[id]) delete names[id];
    const env: CheckEnv = {
      names,
      aggregates: this.aggregates,
      ...(this.entryMode ? {} : { kinds: this.kindFields }),
      persons,
    };
    const r = compileExpr(text, env, kind);
    if (!r.ok) {
      for (const e of r.errors)
        this.err(path, `${e.message} (in '${text}', column ${e.column})`);
      return undefined;
    }
    return this.resolveExpr(r.ast, undefined, path);
  }

  resolveExpr(
    e: Expr,
    kinds: Kind[] | undefined,
    path: Path,
  ): Expr | undefined {
    if (typeof e !== "object") return e;
    const tag = e[0];
    if (tag === "s" || tag === "v") return e;
    if (tag === "id") {
      const full = this.ref(e[1] as string, kinds, path);
      return full ? ["id", full] : undefined;
    }
    if (tag === "call" && e[1] === KIND_CALL) {
      const k = (e[2] as unknown as readonly [string, string])[1];
      const id = this.resolveExpr(e[3] as Expr, [`kind:${k}`], path);
      return id === undefined
        ? undefined
        : (["call", KIND_CALL, e[2], id, e[4]] as unknown as Expr);
    }
    if (tag === "call" && MILESTONE_FUNCTIONS.has(e[1] as string)) {
      const m = (e[2] as unknown as readonly string[])[1] as string;
      return this.milestoneId(m, path) === undefined ? undefined : e;
    }
    if (tag === "call" && GROUP_FUNCTIONS.has(e[1] as string)) {
      const g = (e[2] as unknown as readonly string[])[1] as string;
      return this.groupDeclared(g, path) ? e : undefined;
    }
    if (tag === "call") {
      const args = (e.slice(2) as Expr[]).map((a, i) =>
        this.resolveExpr(a, CALL_KINDS[e[1] as string]?.[i], path),
      );
      return args.some((a) => a === undefined)
        ? undefined
        : (["call", e[1], ...args] as unknown as Expr);
    }
    if (tag === "in") {
      const l = this.resolveExpr(e[1] as Expr, undefined, path);
      const items = (e[2] as readonly Expr[]).map((i) =>
        this.resolveExpr(i, undefined, path),
      );
      return l === undefined || items.some((i) => i === undefined)
        ? undefined
        : (["in", l, items as Expr[]] as unknown as Expr);
    }
    const parts = (e.slice(1) as Expr[]).map((a) =>
      this.resolveExpr(a, undefined, path),
    );
    return parts.some((p) => p === undefined)
      ? undefined
      : ([tag, ...parts] as unknown as Expr);
  }

  /** Check `{placeholder}` names in text against `names`; `{{` and `}}` are literal braces. */
  text(value: string, names: Names, path: Path): void {
    const stripped = value.replace(/\{\{|\}\}/g, "");
    for (const m of stripped.matchAll(/\{([^{}]*)\}/g)) {
      const name = (m[1] as string).trim();
      if (!Object.hasOwn(names, name)) {
        this.err(
          path,
          `unknown placeholder '{${name}}'; in scope: ${Object.keys(names).sort().join(", ")}`,
        );
      }
    }
    if (/[{}]/.test(stripped.replace(/\{[^{}]*\}/g, ""))) {
      this.err(
        path,
        "unbalanced brace in text (write '{{' or '}}' for a literal brace)",
      );
    }
  }

  // ---- storylets ----------------------------------------------------------

  private scopeNames(scope: "loan" | "person" | undefined): Names {
    if (scope === "loan")
      return {
        "loan.balance": "int",
        "loan.payment": "int",
        "loan.missed": "int",
      };
    if (scope === "person") {
      const n: Names = {
        "person.age": "int",
        "person.first_name": "string",
        "person.last_name": "string",
        ...pronounNames("person"),
        "person.role": "id",
        "person.kin": "string",
        "person.alive": "bool",
        "person.closeness": "int",
        "person.money": "int",
        "person.income_tier": "int",
      };
      for (const s of this.statIds) n[`person.stat.${s}`] = "int";
      Object.assign(n, this.personStateNames("person"));
      return n;
    }
    return {};
  }

  /** Manifest curve: missing fields take the Core defaults. */
  private manifestRepeat(c: {
    full?: number;
    reduced?: number;
    factor?: string;
  }): RepeatCurve {
    const curve = { ...DEFAULT_REPEAT, ...this.repeatCurve(c, ["repeat"]) };
    if (
      curve.reduced < curve.full &&
      !(c.full !== undefined && c.reduced !== undefined)
    )
      this.err(["repeat"], "'reduced' must not be below 'full'");
    return curve;
  }

  /** Field-wise compile of a (partial) repeat curve; checks the ordering of the fields present. */
  private repeatCurve(
    c: { full?: number; reduced?: number; factor?: string },
    path: Path,
  ): Partial<RepeatCurve> {
    if (c.full !== undefined && c.reduced !== undefined && c.reduced < c.full)
      this.err([...path, "reduced"], "'reduced' must not be below 'full'");
    return {
      ...(c.full !== undefined ? { full: c.full } : {}),
      ...(c.reduced !== undefined ? { reduced: c.reduced } : {}),
      ...(c.factor !== undefined ? { factorBp: percentBp(c.factor) } : {}),
    };
  }

  /** True when the storylet with this full id declares `amount` (it cannot be a `next:` target). */
  private declaresAmount(full: string): boolean {
    const [packId = ""] = full.split("/");
    return (
      this.c.packs
        .get(packId)
        ?.items.some(
          (i) =>
            i.kind === "storylet" &&
            `${packId}/${i.id}` === full &&
            i.data.amount !== undefined,
        ) ?? false
    );
  }

  private storylet(it: LoadedItem, s: StoryletSrc): CompiledStorylet {
    void it;
    const scopeNames: Names = {
      ...this.scopeNames(s.scope),
      uses_this_year: "int",
    };
    // `amount` is bound only in choices and outcomes of a storylet that declares one.
    const bodyNames: Names = s.amount
      ? { ...scopeNames, amount: "int" }
      : scopeNames;
    const out: {
      -readonly [K in keyof CompiledStorylet]: CompiledStorylet[K];
    } = {
      id: this.owner,
      tags: [...(s.tags ?? [])],
      trigger: s.trigger,
      once: s.once ?? false,
      choices: [],
      outcomes: [],
    };
    if (s.icon) Object.assign(out, this.iconField(s.icon, ["icon"]));
    if (s.label !== undefined) {
      if (s.trigger !== "action")
        this.err(["label"], "'label' is only valid on action storylets");
      else out.label = s.label;
    }
    if (s.scope) out.scope = s.scope;
    if (s.trigger !== "milestone" && s.milestone !== undefined)
      this.err(
        ["milestone"],
        "'milestone' is only valid on milestone storylets",
      );
    if (s.trigger === "event") {
      if (s.menu !== undefined)
        this.err(["menu"], "'menu' is only valid on action storylets");
      const both = s.chance !== undefined && s.weight !== undefined;
      if (both || (s.chance === undefined && s.weight === undefined))
        this.err([], "an event must have exactly one of 'chance' or 'weight'");
    } else if (s.trigger === "milestone") {
      if (s.milestone === undefined)
        this.err([], "a milestone storylet needs a 'milestone'");
      else {
        const m = this.milestoneId(s.milestone, ["milestone"]);
        if (m !== undefined) out.milestone = m;
      }
      for (const k of ["menu", "chance", "weight", "scope", "target"] as const)
        if (s[k] !== undefined)
          this.err([k], `'${k}' is not valid on milestone storylets`);
    } else {
      if (s.menu === undefined)
        this.err([], "an action storylet needs a 'menu'");
      if (s.chance !== undefined)
        this.err(["chance"], "'chance' is only valid on events");
      if (s.weight !== undefined)
        this.err(["weight"], "'weight' is only valid on events");
      if (s.scope === "loan")
        this.err(["scope"], "actions can only use 'scope: person'");
    }
    if (s.target !== undefined) {
      if (s.scope !== "person")
        this.err(["target"], "'target' needs 'scope: person'");
      const roles: string[] = [];
      for (const [i, r] of s.target.entries()) {
        // A bare kinship id is a kinship target unless this Pack declares an item with that id
        // (a role named `parent` keeps meaning the role). Compiled roles always hold a `/`.
        if (
          isKinshipId(r) &&
          !this.c.index.get(this.pack.id)?.has(`${this.pack.id}/${r}`)
        ) {
          roles.push(r);
          continue;
        }
        const full = this.ref(r, ["role"], ["target", i]);
        if (full) roles.push(full);
      }
      out.target = roles;
    }
    if (s.menu) out.menu = s.menu;
    if (s.amount) {
      if (s.trigger !== "action")
        this.err(["amount"], "'amount' is only valid on action storylets");
      const range = (["min", "max", "step"] as const).map((k) => {
        const v = s.amount?.[k];
        return v === undefined && k === "step"
          ? 1
          : this.expr(
              v as string | number | boolean,
              "int",
              ["amount", k],
              scopeNames,
            );
      });
      const [min, max, step] = range;
      if (min !== undefined && max !== undefined && step !== undefined) {
        out.amount = { min, max, step };
        if (typeof min === "number" && typeof max === "number" && min > max)
          this.err(["amount"], "amount minimum exceeds maximum");
        if (typeof min === "number" && min < 0)
          this.err(["amount", "min"], "amount minimum cannot be negative");
        if (typeof step === "number" && step < 1)
          this.err(["amount", "step"], "amount step must be at least 1");
      }
    }
    if (s.when !== undefined) {
      const w = this.expr(s.when, "bool", ["when"], scopeNames);
      if (w !== undefined) out.when = w;
    }
    if (s.chance !== undefined) {
      const w = this.expr(s.chance, "int", ["chance"], scopeNames);
      if (w !== undefined) out.chance = w;
    }
    if (s.weight !== undefined) {
      const w = this.expr(s.weight, "int", ["weight"], scopeNames);
      if (w !== undefined) out.weight = w;
    }
    if (s.cooldown !== undefined) out.cooldown = s.cooldown;
    if (s.max_per_life !== undefined) out.maxPerLife = s.max_per_life;
    if (s.repeatable) {
      if (s.trigger !== "action")
        this.err(
          ["repeatable"],
          "'repeatable' is only valid on action storylets",
        );
      if (s.cooldown !== undefined)
        this.err(["cooldown"], "a repeatable action has no 'cooldown'");
      out.repeatable = true;
    }
    if (s.repeat !== undefined) {
      if (!s.repeatable)
        this.err(["repeat"], "'repeat' needs 'repeatable: true'");
      const curve = this.repeatCurve(s.repeat, ["repeat"]);
      if (Object.keys(curve).length > 0) out.repeat = curve;
    }
    const names = { ...this.baseNames, ...scopeNames };
    if (s.text !== undefined) {
      out.text = s.text;
      this.text(s.text, names, ["text"]);
    }
    if (s.mature_text !== undefined) {
      out.matureText = s.mature_text;
      this.text(s.mature_text, names, ["mature_text"]);
    }
    if (s.choices && s.outcomes)
      this.err(
        ["outcomes"],
        "a storylet has either 'choices' or 'outcomes', not both",
      );
    out.choices = (s.choices ?? []).map((ch, ci) => {
      const choice: {
        -readonly [K in keyof CompiledChoice]: CompiledChoice[K];
      } = {
        label: ch.label,
        outcomes: [],
      };
      this.text(ch.label, names, ["choices", ci, "label"]);
      if (ch.mature_label !== undefined) {
        choice.matureLabel = ch.mature_label;
        this.text(ch.mature_label, names, ["choices", ci, "mature_label"]);
      }
      if (ch.when !== undefined) {
        const w = this.expr(
          ch.when,
          "bool",
          ["choices", ci, "when"],
          bodyNames,
        );
        if (w !== undefined) choice.when = w;
      }
      choice.outcomes = (ch.outcomes ?? []).map((o, oi) =>
        this.outcome(o, ["choices", ci, "outcomes", oi], bodyNames),
      );
      return choice;
    });
    out.outcomes = (s.outcomes ?? []).map((o, oi) =>
      this.outcome(o, ["outcomes", oi], bodyNames),
    );
    return out;
  }

  private outcome(
    o: NonNullable<StoryletSrc["outcomes"]>[number],
    path: Path,
    scopeNames: Names,
  ): CompiledOutcome {
    const out: { -readonly [K in keyof CompiledOutcome]: CompiledOutcome[K] } =
      {
        weight: 1,
        effects: [],
      };
    if (o.weight !== undefined) {
      const w = this.expr(o.weight, "int", [...path, "weight"], scopeNames);
      if (w !== undefined) out.weight = w;
    }
    if (o.when !== undefined) {
      const w = this.expr(o.when, "bool", [...path, "when"], scopeNames);
      if (w !== undefined) out.when = w;
    }
    // Effects run in order; `spawn_person(...) as n` binds `n` for later effects and this outcome's text.
    const bound: Names = {};
    const persons: string[] = scopeNames["person.age"] ? ["person"] : [];
    const { groups, failed } = this.effectStatements(
      o.effects ?? [],
      [...path, "effects"],
      scopeNames,
      persons,
      bound,
    );
    out.effects = groups.flat();
    if (o.text !== undefined) {
      out.text = o.text;
      if (!failed)
        this.text(o.text, { ...this.baseNames, ...scopeNames, ...bound }, [
          ...path,
          "text",
        ]);
    }
    if (o.mature_text !== undefined) {
      out.matureText = o.mature_text;
      if (!failed)
        this.text(
          o.mature_text,
          { ...this.baseNames, ...scopeNames, ...bound },
          [...path, "mature_text"],
        );
    }
    if (o.next !== undefined) {
      const full = this.ref(o.next, ["storylet"], [...path, "next"]);
      if (full && this.declaresAmount(full))
        this.err(
          [...path, "next"],
          `'${o.next}' needs an amount, and 'next' does not carry one`,
        );
      else if (full) out.next = full;
    }
    return out;
  }

  /**
   * Compile effect statements in order: one group of closed effects per source statement (a
   * macro call expands to several). `spawn_person(...) as n` binds `n` in `bound` for the
   * later statements. A statement that fails is reported and leaves an empty group.
   */
  private effectStatements(
    sources: readonly string[],
    path: Path,
    scopeNames: Names,
    persons: string[],
    bound: Names,
  ): { groups: Effect[][]; failed: boolean } {
    const groups: Effect[][] = [];
    let failed = false;
    for (const [ei, src] of sources.entries()) {
      const epath = [...path, ei];
      const group: Effect[] = [];
      groups.push(group);
      const r = compileExpr(
        src,
        {
          names: { ...this.baseNames, ...scopeNames, ...bound },
          persons,
          kinds: this.kindFields,
          macros: this.macroArity,
        },
        "effect",
      );
      if (!r.ok) {
        failed = true;
        for (const e of r.errors)
          this.err(epath, `${e.message} (in '${src}', column ${e.column})`);
        continue;
      }
      const resolved = this.resolveEffect(r.ast, epath);
      if (!resolved) {
        failed = true;
        continue;
      }
      if (isMacroCall(resolved)) {
        const x = this.expandMacroCall(resolved, [], epath);
        if (x) group.push(...x.effects);
        else failed = true;
        continue;
      }
      if (resolved[0] === "spawn") {
        if (!this.bindSpawn(resolved[3], bound, persons, epath)) {
          failed = true;
          continue;
        }
      }
      this.effectText(
        resolved,
        { ...this.baseNames, ...scopeNames, ...bound },
        epath,
      );
      group.push(resolved);
    }
    return { groups, failed };
  }

  /** Lifecycle hooks of the manifest (docs/spec/pack-format/hooks.md): player-scope effect statements per phase. */
  private hooks(h: NonNullable<Manifest["hooks"]>): HooksDecl {
    const run = (sources: readonly string[], path: Path, phase: string) => {
      const { groups } = this.effectStatements(sources, path, {}, [], {});
      if (phase === "on_death")
        for (const [i, g] of groups.entries())
          if (g.some((e) => e[0] === "do" && e[1] === "die"))
            this.err(
              [...path, i],
              "'die' is not allowed in on_death: the player has already died",
            );
      return groups;
    };
    const out: { -readonly [K in keyof HooksDecl]: HooksDecl[K] } = {};
    for (const phase of HOOK_PHASES) {
      const src = h[phase];
      if (src) out[phase] = run(src, ["hooks", phase], phase);
    }
    if (h.on_milestone) {
      const byId: Record<string, readonly (readonly Effect[])[]> = {};
      for (const id of Object.keys(h.on_milestone).sort()) {
        this.milestoneId(id, ["hooks", "on_milestone", id]);
        byId[id] = run(
          h.on_milestone[id] as string[],
          ["hooks", "on_milestone", id],
          "on_milestone",
        );
      }
      out.on_milestone = byId;
    }
    return out;
  }

  /** Settlement lines of the manifest (docs/spec/pack-format/settlement.md): player-scope amounts and conditions. */
  private settlement(
    lines: NonNullable<Manifest["settlement"]>,
  ): SettlementLine[] {
    const out: SettlementLine[] = [];
    const seen = new Set<string>();
    for (const [i, l] of lines.entries()) {
      if (seen.has(l.id))
        this.err(
          ["settlement", i, "id"],
          `duplicate settlement line '${l.id}'`,
        );
      seen.add(l.id);
      const amount = this.expr(l.amount, "int", ["settlement", i, "amount"]);
      const when =
        l.when === undefined
          ? undefined
          : this.expr(l.when, "bool", ["settlement", i, "when"]);
      if (amount === undefined || (l.when !== undefined && when === undefined))
        continue;
      out.push({
        id: l.id,
        kind: l.kind,
        label: l.label,
        amount,
        ...(when !== undefined ? { when } : {}),
      });
    }
    return out;
  }

  private effectText(e: Effect, names: Names, path: Path): void {
    if (e[0] === "do" && (e[1] === "journal" || e[1] === "die")) {
      const arg = e[2] as Expr | undefined;
      if (Array.isArray(arg) && arg[0] === "s")
        this.text(arg[1] as string, names, path);
    }
  }

  /** True when `g` is an exclusivity group this Pack or a required capability declares. */
  private groupDeclared(g: string, path: Path): boolean {
    if (this.groups.has(g)) return true;
    this.err(
      path,
      `undeclared exclusivity group '${g}'; declared: ${[...this.groups].sort().join(", ") || "none"}`,
    );
    return false;
  }

  private resolveEffect(e: Effect, path: Path): Effect | undefined {
    switch (e[0]) {
      case "set":
      case "add":
      case "sub": {
        const isRole = typeof e[1] !== "string" && e[1][2] === "role";
        const v = this.resolveExpr(e[2], isRole ? ["role"] : undefined, path);
        return v === undefined ? undefined : ([e[0], e[1], v] as Effect);
      }
      case "do": {
        if (e[1] === "reach_milestone") {
          const m = (e[2] as unknown as readonly string[])[1] as string;
          return this.milestoneId(m, path, true) === undefined ? undefined : e;
        }
        if (e[1] === "end_group") {
          const g = (e[2] as unknown as readonly string[])[1] as string;
          return this.groupDeclared(g, path) ? e : undefined;
        }
        const args = (e.slice(2) as Expr[]).map((a, i) =>
          this.resolveExpr(a, CALL_KINDS[e[1]]?.[i], path),
        );
        return args.some((a) => a === undefined)
          ? undefined
          : (["do", e[1], ...(args as Expr[])] as unknown as Effect);
      }
      case "spawn": {
        const role = this.resolveExpr(e[1], ["role"], path);
        const gen = this.resolveExpr(e[2], ["generator"], path);
        return role === undefined || gen === undefined
          ? undefined
          : ["spawn", role, gen, e[3]];
      }
    }
  }

  // ---- other content kinds ------------------------------------------------

  private occupation(
    _it: LoadedItem,
    o: OccupationSrc,
  ): CompiledOccupationKind {
    const out: {
      -readonly [K in keyof CompiledOccupationKind]: CompiledOccupationKind[K];
    } = {
      id: this.owner,
      label: o.label,
      group: o.group,
      pay: 0,
    };
    if (o.icon) Object.assign(out, this.iconField(o.icon, ["icon"]));
    if (!this.groups.has(o.group))
      this.err(
        ["group"],
        `undeclared exclusivity group '${o.group}'; declared: ${[...this.groups].sort().join(", ") || "none"}`,
      );
    if (o.ladder !== undefined) out.ladder = o.ladder;
    if (o.requires !== undefined) {
      const r = this.expr(o.requires, "bool", ["requires"]);
      if (r !== undefined) out.requires = r;
    }
    const pay = this.expr(o.pay, "int", ["pay"]);
    if (pay !== undefined) out.pay = pay;
    if (o.duration_years !== undefined) out.durationYears = o.duration_years;
    if (o.provides_housing) out.providesHousing = true;
    if (o.remote) out.remote = true;
    if (o.npc === false) out.npc = false;
    if (o.confines) {
      const menus = o.confines.menus === true;
      const events = o.confines.events === true;
      if (!menus && !events)
        this.err(["confines"], "'confines' must lock 'menus' or 'events'");
      out.confines = { menus, events };
    }
    if (o.promotes_to !== undefined) {
      const r = this.ref(o.promotes_to, ["occupation"], ["promotes_to"]);
      if (r) out.promotesTo = r;
    }
    if (o.promotion_years !== undefined) {
      out.promotionYears = o.promotion_years;
      if (o.promotes_to === undefined)
        this.err(["promotion_years"], "'promotion_years' needs 'promotes_to'");
    }
    if (o.loan !== undefined) {
      const r = this.ref(o.loan, ["loan"], ["loan"]);
      if (r) out.loan = r;
    }
    return out;
  }

  private item(_it: LoadedItem, i: ItemSrc): CompiledItemKind {
    const out: {
      -readonly [K in keyof CompiledItemKind]: CompiledItemKind[K];
    } = {
      id: this.owner,
      label: i.label,
      category: i.category,
      price: 0,
      value: 0,
    };
    if (i.icon) Object.assign(out, this.iconField(i.icon, ["icon"]));
    if (i.requires !== undefined) {
      const r = this.expr(i.requires, "bool", ["requires"]);
      if (r !== undefined) out.requires = r;
    }
    if (i.market) {
      for (const f of ["price", "value", "loan"] as const)
        if (i[f] !== undefined)
          this.err([f], `a market kind has no '${f}' (it is traded by amount)`);
      out.market = this.market(i.market);
      return out;
    }
    if (i.price === undefined || i.value === undefined) {
      this.err(
        [],
        "an item kind needs 'price' and 'value' (or a 'market' block)",
      );
      return out;
    }
    const price = this.expr(i.price, "int", ["price"]);
    if (price !== undefined) out.price = price;
    const value = this.expr(i.value, "int", ["value"], {
      "asset.purchase_price": "int",
      "asset.value": "int",
      "asset.years": "int",
    });
    if (value !== undefined) out.value = value;
    if (i.loan !== undefined) {
      const r = this.ref(i.loan, ["loan"], ["loan"]);
      if (r) out.loan = r;
    }
    return out;
  }

  private market(src: NonNullable<ItemSrc["market"]>): CompiledMarket {
    const out: { -readonly [K in keyof CompiledMarket]: CompiledMarket[K] } = {
      start: src.start,
      driftBp: signedPercentBp(src.drift),
      volBp: percentBp(src.vol),
    };
    if (src.beta) {
      const of = this.ref(src.beta.of, ["market"], ["market", "beta", "of"]);
      if (of) {
        out.beta = { of, factorBp: signedPercentBp(src.beta.factor) };
        // Same-Pack chains are the only ones that can loop (dependencies never point back).
        const items = new Map(
          this.pack.items.map((x) => [`${this.pack.id}/${x.id}`, x]),
        );
        let cur: string | undefined = of;
        for (let n = 0; cur !== undefined && n <= items.size; n++) {
          if (cur === this.owner) {
            this.err(
              ["market", "beta", "of"],
              "beta chain loops back to this kind",
            );
            break;
          }
          const raw: string | undefined = (
            items.get(cur)?.data.market as { beta?: { of: string } } | undefined
          )?.beta?.of;
          cur =
            raw === undefined
              ? undefined
              : raw.includes("/")
                ? raw
                : `${this.pack.id}/${raw}`;
        }
      }
    }
    if (src.crash)
      out.crash = {
        chanceBp: percentBp(src.crash.chance),
        dropBp: percentBp(src.crash.drop),
      };
    if (src.jump)
      out.jump = {
        chanceBp: percentBp(src.jump.chance),
        multiple: src.jump.multiple,
      };
    if (src.delist !== undefined) out.delistBp = percentBp(src.delist);
    if (src.relist_after !== undefined) {
      if (src.delist === undefined)
        this.err(["market", "relist_after"], "'relist_after' needs 'delist'");
      else out.relistAfterYears = src.relist_after;
    }
    if (src.bond) {
      const lossBp = percentBp(src.bond.loss ?? "100%");
      if (lossBp > 10000 || percentBp(src.bond.default) > 10000)
        this.err(["market", "bond"], "'default' and 'loss' are at most 100%");
      out.bond = {
        termYears: src.bond.term,
        couponBp: percentBp(src.bond.coupon),
        defaultBp: percentBp(src.bond.default),
        lossBp,
      };
    }
    return out;
  }

  private loan(_it: LoadedItem, l: LoanSrc): CompiledLoanKind {
    const out: {
      -readonly [K in keyof CompiledLoanKind]: CompiledLoanKind[K];
    } = {
      id: this.owner,
      label: l.label,
      rateBp: 0,
      termYears: l.term_years,
      downPaymentBp: 0,
      secured: l.secured ?? false,
    };
    if (l.icon) Object.assign(out, this.iconField(l.icon, ["icon"]));
    const r = compileExpr(l.rate, { names: {} }, "int");
    if (r.ok && typeof r.ast === "number") out.rateBp = r.ast;
    else this.err(["rate"], `invalid rate '${l.rate}'`);
    if (l.down_payment !== undefined) {
      const d = compileExpr(l.down_payment, { names: {} }, "int");
      if (d.ok && typeof d.ast === "number" && d.ast <= 10000)
        out.downPaymentBp = d.ast;
      else
        this.err(["down_payment"], `invalid down payment '${l.down_payment}'`);
    }
    return out;
  }

  private city(c: CitySrc): CompiledCity {
    const out: {
      -readonly [K in keyof CompiledCity]: CompiledCity[K];
    } = {
      id: this.owner,
      label: c.label,
      costIndexBp: 0,
      wageIndexBp: 10000,
      weight: c.weight,
    };
    if (c.icon) Object.assign(out, this.iconField(c.icon, ["icon"]));
    if (c.country !== undefined) out.country = c.country;
    if (c.wage_index !== undefined) {
      const wage = percentBp(c.wage_index);
      if (wage > 0) out.wageIndexBp = wage;
      else this.err(["wage_index"], "wage_index must be above 0%");
    }
    const bp = percentBp(c.cost_index);
    if (bp > 0) out.costIndexBp = bp;
    else this.err(["cost_index"], "cost_index must be above 0%");
    return out;
  }

  private standard(s: StandardSrc): CompiledStandard {
    const out: {
      -readonly [K in keyof CompiledStandard]: CompiledStandard[K];
    } = {
      id: this.owner,
      label: s.label,
      cost: s.cost,
      happiness: s.happiness,
      health: s.health,
      cap: s.cap ?? 100,
      riskBp: 0,
    };
    if (s.icon) Object.assign(out, this.iconField(s.icon, ["icon"]));
    const risk = percentBp(s.risk);
    if (risk > 0) out.riskBp = risk;
    else this.err(["risk"], "risk must be above 0%");
    return out;
  }

  private people(_it: LoadedItem, p: PeopleSrc): CompiledPeopleItem {
    if (p.kind === "role")
      return { type: "role", id: this.owner, label: p.label };
    if (p.age[0] > p.age[1])
      this.err(["age"], "age range minimum exceeds maximum");
    const firstNames: Record<Gender, readonly string[]> = Array.isArray(
      p.first_names,
    )
      ? { male: p.first_names, female: p.first_names, nonbinary: p.first_names }
      : {
          male: p.first_names.male,
          female: p.first_names.female,
          nonbinary: [...p.first_names.male, ...p.first_names.female],
        };
    const genderWeights: Record<Gender, number> = { ...DEFAULT_GENDER_WEIGHTS };
    if (typeof p.gender === "string") {
      for (const g of GENDERS) genderWeights[g] = g === p.gender ? 1 : 0;
    } else if (p.gender) {
      for (const g of GENDERS) genderWeights[g] = p.gender[g] ?? 0;
      if (GENDERS.every((g) => genderWeights[g] === 0))
        this.err(["gender"], "gender weights need at least one above 0");
    }
    const stats: Record<string, [number, number]> = {};
    for (const [k, v] of Object.entries(p.stats ?? {})) {
      if (!this.statIds.has(k))
        this.err(
          ["stats", k],
          `undeclared stat '${k}'; declared: ${[...this.statIds].sort().join(", ") || "none"}`,
        );
      if (v[0] > v[1] || v[0] < 0 || v[1] > 100)
        this.err(
          ["stats", k],
          "stat range must satisfy 0 <= min <= max <= 100",
        );
      stats[k] = [v[0], v[1]];
    }
    return {
      type: "generator",
      id: this.owner,
      firstNames,
      genderWeights,
      lastNames: p.last_names,
      age: p.age as [number, number],
      stats,
      ...(p.jobs
        ? { jobs: p.jobs.map((j) => ({ label: j.label, tier: j.tier })) }
        : {}),
    } satisfies CompiledGenerator;
  }

  // ---- migrations and id lock ---------------------------------------------

  /** Normalise a migration id to a full id (`<pack>/<id>`) or a declared name (`stat.x`). */
  private migId(raw: string, path: Path): string | undefined {
    if (/^(stat|quality|state|readable|kind)\./.test(raw)) return raw;
    const slash = raw.indexOf("/");
    if (slash >= 0 && raw.slice(0, slash) !== this.pack.id) {
      this.err(
        path,
        `migration id '${raw}' must belong to this Pack ('${this.pack.id}')`,
      );
      return undefined;
    }
    return slash >= 0 ? raw : `${this.pack.id}/${raw}`;
  }

  private currentIds(m: Manifest): Set<string> {
    const ids = new Set<string>();
    for (const full of this.c.index.get(this.pack.id)?.keys() ?? [])
      ids.add(full);
    for (const s of m.stats ?? []) ids.add(`stat.${s.id}`);
    for (const q of this.pack.qualities) ids.add(`quality.${q.decl.id}`);
    for (const s of this.pack.state) ids.add(`state.${s.decl.id}`);
    for (const k of this.pack.kinds) ids.add(`kind.${k.id}`);
    for (const r of this.pack.readables)
      if (declaresReadable(r)) ids.add(`readable.${r.decl.id}`);
    return ids;
  }

  private migrations(pack: LoadedPack, m: Manifest): PackMigration[] {
    const current = this.currentIds(m);
    const sorted = <T>(o: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    const out: PackMigration[] = [];
    for (const mig of pack.migrations) {
      this.src = mig.src;
      const renamed: Record<string, string> = {};
      const removed: Record<string, string | null> = {};
      for (const [i, r] of mig.rename.entries()) {
        const from = this.migId(r.from, ["rename", i, "from"]);
        const to = this.migId(r.to, ["rename", i, "to"]);
        if (!from || !to) continue;
        if (current.has(from))
          this.err(
            ["rename", i, "from"],
            `'${r.from}' is renamed but still exists`,
          );
        if (!current.has(to))
          this.err(
            ["rename", i, "to"],
            `rename target '${r.to}' does not exist`,
          );
        renamed[from] = to;
      }
      for (const [i, r] of mig.remove.entries()) {
        const id = this.migId(r.id, ["remove", i, "id"]);
        if (!id) continue;
        if (current.has(id))
          this.err(
            ["remove", i, "id"],
            `'${r.id}' is removed but still exists`,
          );
        let fallback: string | null = null;
        if (r.fallback !== undefined) {
          fallback =
            /^(stat|quality|state|readable|kind)\./.test(r.fallback) &&
            current.has(r.fallback)
              ? r.fallback
              : (this.ref(r.fallback, undefined, ["remove", i, "fallback"]) ??
                null);
        }
        removed[id] = fallback;
      }
      out.push({
        id: mig.id,
        renamed: sorted(renamed),
        removed: sorted(removed),
      });
    }
    this.src = pack.manifestSrc;
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  private idLock(m: Manifest, migs: readonly PackMigration[]): void {
    const current = this.currentIds(m);
    this.c.ids.set(this.pack.id, [...current].sort());
    const shipped = this.c.releaseLocks.read(
      basename(this.pack.dir),
      this.c.diags,
    );
    if (!shipped) return;
    const { lock, file } = shipped;
    if (lock.pack !== this.pack.id)
      this.c.diags.push({
        file,
        path: "pack",
        message: `lock is for Pack '${lock.pack}'`,
      });
    for (const id of lock.ids) {
      if (current.has(id)) continue;
      if (migs.some((x) => id in x.renamed || id in x.removed)) continue;
      this.err(
        [],
        `id '${id}' shipped in the last release but is gone; add a rename or remove entry in a new migrations/<name>.yaml`,
      );
    }
  }
}
