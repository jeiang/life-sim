import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
  Effect,
  Expr,
  Type as ExprType,
  FamilyDecl,
  Gender,
  LivingDecl,
  PackBundle,
  PackMigrations,
  QualityDecl,
  RepeatCurve,
  StatDecl,
} from "@life/core";
import {
  DEFAULT_GENDER_WEIGHTS,
  DEFAULT_REPEAT,
  GENDERS,
  PACK_BUNDLE_FORMAT,
  PRONOUN_FIELDS,
} from "@life/core";
import type { TSchema } from "@sinclair/typebox";
import { buildCredits, type CreditsManifest } from "./credits.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { type CheckEnv, compileExpr } from "./expr/index.ts";
import { resolveIcon } from "./icons.ts";
import { readLock } from "./lock.ts";
import {
  CitySchema,
  type CitySrc,
  ItemSchema,
  type ItemSrc,
  LoanSchema,
  type LoanSrc,
  type Manifest,
  ManifestSchema,
  OccupationSchema,
  type OccupationSrc,
  PeopleSchema,
  type PeopleSrc,
  StandardSchema,
  type StandardSrc,
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

/** The one Pack allowed to declare the singleton `year` and `family` blocks. */
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
  | "generator";

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
}

interface LoadedPack {
  id: string;
  dir: string;
  manifest: Manifest;
  manifestSrc: Source;
  items: LoadedItem[];
}

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
};

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

const PLAYER_NAMES: Record<string, ExprType> = {
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

export function compilePacks(packsDir: string): CompileOutput {
  return new Compiler(packsDir).run();
}

class Compiler {
  readonly diags: Diagnostic[] = [];
  readonly packs = new Map<string, LoadedPack>();
  /** `<pack>` -> full id -> kind. */
  readonly index = new Map<string, Map<string, Kind>>();
  readonly icons = new Map<string, IconUse>();
  readonly ids = new Map<string, string[]>();

  readonly packsDir: string;
  constructor(packsDir: string) {
    this.packsDir = packsDir;
  }

  run(): CompileOutput {
    this.load();
    this.checkCrossPackDeclarations();
    const order = this.order();
    const bundles: PackBundle[] = [];
    for (const id of order) {
      const pack = this.packs.get(id) as LoadedPack;
      bundles.push(new PackCompiler(this, pack).compile());
    }
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
    };
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
    for (const d of dirs) {
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
  }

  private loadPack(d: string, dir: string, manifestFile: string): void {
    const file = this.rel(d, "pack.yaml");
    const src = parseYaml(file, readFileSync(manifestFile, "utf8"), this.diags);
    if (!src) return;
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
    // Stat and quality ids share the expression namespace `stat.<id>` / `quality.<id>`.
    const idx = new Map<string, Kind>();
    for (const it of items) idx.set(`${manifest.id}/${it.id}`, it.kind);
    this.index.set(manifest.id, idx);
    this.packs.set(manifest.id, {
      id: manifest.id,
      dir,
      manifest,
      manifestSrc: src,
      items,
    });
  }

  /** Stats and qualities are bare ids shared by every Pack, so two Packs may not declare the same one. */
  private checkCrossPackDeclarations(): void {
    const owner = new Map<string, string>();
    for (const id of [...this.packs.keys()].sort()) {
      const pack = this.packs.get(id) as LoadedPack;
      for (const [kind, key] of [
        ["stat", "stats"],
        ["quality", "qualities"],
      ] as const) {
        for (const [i, d] of (pack.manifest[key] ?? []).entries()) {
          const first = owner.get(`${kind}.${d.id}`);
          if (first === undefined) owner.set(`${kind}.${d.id}`, id);
          else if (first !== id)
            this.diag(
              pack.manifestSrc,
              [key, i, "id"],
              `${kind} '${d.id}' is declared by both Pack '${first}' and Pack '${id}'; prefix Pack-specific ids with the Pack name`,
            );
        }
      }
    }
  }

  /** Topological order; reports unknown dependencies and cycles. */
  private order(): string[] {
    const out: string[] = [];
    const state = new Map<string, 1 | 2>();
    const visit = (id: string, stack: string[]): void => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        const pack = this.packs.get(id) as LoadedPack;
        this.diag(
          pack.manifestSrc,
          ["depends"],
          `dependency cycle: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`,
        );
        return;
      }
      state.set(id, 1);
      const pack = this.packs.get(id) as LoadedPack;
      for (const [i, dep] of (pack.manifest.depends ?? []).entries()) {
        if (dep === id) {
          this.diag(
            pack.manifestSrc,
            ["depends", i],
            "a Pack cannot depend on itself",
          );
        } else if (!this.packs.has(dep)) {
          this.diag(
            pack.manifestSrc,
            ["depends", i],
            `unknown dependency '${dep}': no such Pack in ${this.packsDir}`,
          );
        } else visit(dep, [...stack, id]);
      }
      state.set(id, 2);
      out.push(id);
    };
    for (const id of [...this.packs.keys()].sort()) visit(id, []);
    return out;
  }
}

type Names = Record<string, ExprType>;

class PackCompiler {
  readonly depends: Set<string>;
  readonly baseNames: Names = { ...PLAYER_NAMES };
  readonly groups = new Set<string>();
  /** Declared stat and quality names usable as `stat.x`/`quality.x`. */
  readonly declared = new Set<string>();
  readonly statIds = new Set<string>();
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
    this.depends = new Set(pack.manifest.depends ?? []);
  }

  /** Add stat/quality/exclusivity declarations of this Pack or a dependency. */
  private addDecls(m: Manifest): void {
    for (const s of m.stats ?? []) {
      this.baseNames[`stat.${s.id}`] = "int";
      this.declared.add(`stat.${s.id}`);
      this.statIds.add(s.id);
    }
    for (const q of m.qualities ?? []) {
      this.baseNames[`quality.${q.id}`] = q.type === "flag" ? "bool" : "int";
      this.declared.add(`quality.${q.id}`);
    }
    for (const g of m.exclusivity ?? []) this.groups.add(g);
  }

  compile(): PackBundle {
    const { pack, c } = this;
    const m = pack.manifest;
    // Declarations: own Pack, then direct dependencies only.
    this.addDecls(m);
    this.checkDeclarations(m);
    for (const dep of this.depends) {
      const dp = c.packs.get(dep);
      if (dp) this.addDecls(dp.manifest);
    }

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
    const qualities = (m.qualities ?? []).map((q) => ({
      ...q,
    })) as QualityDecl[];
    const migrations = this.migrations(m);
    this.idLock(m, migrations);
    return {
      format: PACK_BUNDLE_FORMAT,
      id: pack.id,
      version: m.version,
      depends: [...this.depends].sort(),
      ...(m.currency ? { currency: m.currency } : {}),
      stats,
      qualities,
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
      migrations,
      ...bundle,
    };
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
    for (const [i, q] of (m.qualities ?? []).entries()) {
      if (seen.has(`quality.${q.id}`))
        this.err(["qualities", i, "id"], `duplicate quality '${q.id}'`);
      seen.add(`quality.${q.id}`);
      if (q.type === "int") {
        if (q.min !== undefined && q.max !== undefined && q.min > q.max)
          this.err(["qualities", i], "min exceeds max");
        if (
          (q.min !== undefined && q.default < q.min) ||
          (q.max !== undefined && q.default > q.max)
        )
          this.err(["qualities", i, "default"], "default is outside min/max");
      }
    }
    if (this.pack.id !== CORE_LOOP)
      for (const key of ["year", "family"] as const)
        if (m[key])
          this.err(
            [key],
            `only Pack '${CORE_LOOP}' may declare '${key}' (the first declaration would silently replace its own)`,
          );
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
    for (const [i, dep] of (m.depends ?? []).entries()) {
      if ((m.depends ?? []).indexOf(dep) !== i)
        this.err(["depends", i], `duplicate dependency '${dep}'`);
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
          `'${raw}' refers to Pack '${packId}', which is not declared in depends`,
        );
      else this.err(path, `dangling reference '${raw}': no Pack '${packId}'`);
      return undefined;
    }
    const kind = this.c.index.get(packId)?.get(full);
    if (!kind) {
      const what = kinds ? kinds.join(" or ") : "content item";
      this.err(path, `dangling reference '${raw}': no ${what} with that id`);
      return undefined;
    }
    if (kinds && !kinds.includes(kind)) {
      this.err(path, `'${raw}' is a ${kind}, expected ${kinds.join(" or ")}`);
      return undefined;
    }
    return full;
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
    persons: readonly string[] = [],
  ): Expr | undefined {
    const text = String(srcValue);
    const env: CheckEnv = {
      names: { ...this.baseNames, ...extra },
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
    if (tag === "call" && GROUP_FUNCTIONS.has(e[1] as string)) {
      const g = (e[2] as unknown as readonly string[])[1] as string;
      if (!this.groups.has(g)) {
        this.err(
          path,
          `undeclared exclusivity group '${g}'; declared: ${[...this.groups].sort().join(", ") || "none"}`,
        );
        return undefined;
      }
      return e;
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
        "person.alive": "bool",
        "person.closeness": "int",
      };
      for (const s of this.statIds) n[`person.stat.${s}`] = "int";
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
    if (s.trigger === "event") {
      if (s.menu !== undefined)
        this.err(["menu"], "'menu' is only valid on action storylets");
      const both = s.chance !== undefined && s.weight !== undefined;
      if (both || (s.chance === undefined && s.weight === undefined))
        this.err([], "an event must have exactly one of 'chance' or 'weight'");
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
    let failed = false;
    const effects: Effect[] = [];
    for (const [ei, src] of (o.effects ?? []).entries()) {
      const epath = [...path, "effects", ei];
      const r = compileExpr(
        src,
        {
          names: { ...this.baseNames, ...scopeNames, ...bound },
          persons,
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
      if (resolved[0] === "spawn") {
        const name = resolved[3];
        if (TOP_RESERVED.has(name)) {
          this.err(
            epath,
            `'${name}' is reserved and cannot name a spawned person`,
          );
          failed = true;
          continue;
        }
        bound[`${name}.first_name`] = "string";
        bound[`${name}.last_name`] = "string";
        Object.assign(bound, pronounNames(name));
        bound[`${name}.age`] = "int";
        bound[`${name}.closeness`] = "int";
        persons.push(name);
      }
      this.effectText(
        resolved,
        { ...this.baseNames, ...scopeNames, ...bound },
        epath,
      );
      effects.push(resolved);
    }
    out.effects = effects;
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

  private effectText(e: Effect, names: Names, path: Path): void {
    if (e[0] === "do" && (e[1] === "journal" || e[1] === "die")) {
      const arg = e[2] as Expr | undefined;
      if (Array.isArray(arg) && arg[0] === "s")
        this.text(arg[1] as string, names, path);
    }
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
    } satisfies CompiledGenerator;
  }

  // ---- migrations and id lock ---------------------------------------------

  /** Normalise a migration id to a full id (`<pack>/<id>`) or a declared name (`stat.x`). */
  private migId(raw: string, path: Path): string | undefined {
    if (/^(stat|quality)\./.test(raw)) return raw;
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
    for (const q of m.qualities ?? []) ids.add(`quality.${q.id}`);
    return ids;
  }

  private migrations(m: Manifest): PackMigrations {
    const current = this.currentIds(m);
    const renamed: Record<string, string> = {};
    const removed: Record<string, string | null> = {};
    for (const [i, r] of (m.migrations?.rename ?? []).entries()) {
      const from = this.migId(r.from, ["migrations", "rename", i, "from"]);
      const to = this.migId(r.to, ["migrations", "rename", i, "to"]);
      if (!from || !to) continue;
      if (current.has(from))
        this.err(
          ["migrations", "rename", i, "from"],
          `'${r.from}' is renamed but still exists`,
        );
      if (!current.has(to))
        this.err(
          ["migrations", "rename", i, "to"],
          `rename target '${r.to}' does not exist`,
        );
      renamed[from] = to;
    }
    for (const [i, r] of (m.migrations?.remove ?? []).entries()) {
      const id = this.migId(r.id, ["migrations", "remove", i, "id"]);
      if (!id) continue;
      if (current.has(id))
        this.err(
          ["migrations", "remove", i, "id"],
          `'${r.id}' is removed but still exists`,
        );
      let fallback: string | null = null;
      if (r.fallback !== undefined) {
        fallback =
          /^(stat|quality)\./.test(r.fallback) && current.has(r.fallback)
            ? r.fallback
            : (this.ref(r.fallback, undefined, [
                "migrations",
                "remove",
                i,
                "fallback",
              ]) ?? null);
      }
      removed[id] = fallback;
    }
    const sorted = <T>(o: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    return { renamed: sorted(renamed), removed: sorted(removed) };
  }

  private idLock(m: Manifest, mig: PackMigrations): void {
    const current = this.currentIds(m);
    this.c.ids.set(this.pack.id, [...current].sort());
    const lock = readLock(
      join(this.pack.dir, "ids.lock.json"),
      `${this.pack.id}/ids.lock.json`,
      this.c.diags,
    );
    if (!lock) return;
    if (lock.pack !== this.pack.id)
      this.c.diags.push({
        file: `${this.pack.id}/ids.lock.json`,
        path: "pack",
        message: `lock is for Pack '${lock.pack}'`,
      });
    if (m.version < lock.version)
      this.err(
        ["version"],
        `version ${m.version} is lower than the released version ${lock.version}`,
      );
    for (const id of lock.ids) {
      if (current.has(id)) continue;
      if (id in mig.renamed || id in mig.removed) continue;
      this.err(
        ["migrations"],
        `id '${id}' shipped in release v${lock.version} but is gone; add a rename or remove entry to 'migrations' in pack.yaml`,
      );
    }
  }
}
