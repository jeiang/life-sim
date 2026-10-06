import {
  type CompiledCity,
  type CompiledGenerator,
  type CompiledItemKind,
  type CompiledLoanKind,
  type CompiledOccupationKind,
  type CompiledRole,
  type CompiledStandard,
  type CompiledStorylet,
  DEFAULT_REPEAT,
  type FamilyDecl,
  type LivingDecl,
  type PackBundle,
  type QualityDecl,
  type RepeatCurve,
  type StatDecl,
} from "../pack.ts";

/** Lookup tables over a set of bundles, built once per bundle array. */
export interface PackIndex {
  readonly bundles: readonly PackBundle[];
  readonly storylets: ReadonlyMap<string, CompiledStorylet>;
  /** Event storylets in id order. */
  readonly events: readonly CompiledStorylet[];
  readonly occupations: ReadonlyMap<string, CompiledOccupationKind>;
  readonly items: ReadonlyMap<string, CompiledItemKind>;
  /** Market kinds (items with a `market` block), a subset of `items`. */
  readonly markets: ReadonlyMap<string, CompiledItemKind>;
  readonly loans: ReadonlyMap<string, CompiledLoanKind>;
  readonly cities: ReadonlyMap<string, CompiledCity>;
  /** In ascending cost order. */
  readonly standards: readonly CompiledStandard[];
  readonly standardsById: ReadonlyMap<string, CompiledStandard>;
  readonly living: LivingDecl | undefined;
  readonly roles: ReadonlyMap<string, CompiledRole>;
  readonly generators: ReadonlyMap<string, CompiledGenerator>;
  /** Bundle order (dependencies first). */
  readonly stats: readonly StatDecl[];
  readonly qualities: ReadonlyMap<string, QualityDecl>;
  readonly currency: { readonly symbol: string; readonly digits: number };
  /** Starting family from the first manifest that declares one. */
  readonly family: FamilyDecl | undefined;
  /** Default repeat curve: the first manifest that sets one, else `DEFAULT_REPEAT`. */
  readonly repeat: RepeatCurve;
  /** Event draw settings from the first manifest that declares them. */
  readonly year: {
    readonly slots: readonly [number, number];
    readonly cap: number;
    readonly decisions?: readonly number[];
    readonly decisionsMinAge?: number;
    readonly quiet?: readonly string[];
  };
}

const cache = new WeakMap<readonly PackBundle[], PackIndex>();

/** Add `id` to `map`; two bundles declaring the same id is an error naming both. */
function declare<T>(
  map: Map<string, T>,
  owners: Map<string, string>,
  kind: string,
  id: string,
  value: T,
  bundle: string,
): void {
  const first = owners.get(`${kind}.${id}`);
  if (first !== undefined && first !== bundle)
    throw new Error(
      `${kind} '${id}' is declared by both Pack '${first}' and Pack '${bundle}'`,
    );
  owners.set(`${kind}.${id}`, bundle);
  map.set(id, value);
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function indexBundles(bundles: readonly PackBundle[]): PackIndex {
  const hit = cache.get(bundles);
  if (hit) return hit;
  const storylets = new Map<string, CompiledStorylet>();
  const occupations = new Map<string, CompiledOccupationKind>();
  const items = new Map<string, CompiledItemKind>();
  const loans = new Map<string, CompiledLoanKind>();
  const cities = new Map<string, CompiledCity>();
  const roles = new Map<string, CompiledRole>();
  const generators = new Map<string, CompiledGenerator>();
  const qualities = new Map<string, QualityDecl>();
  const stats: StatDecl[] = [];
  let currency = { symbol: "", digits: 0 };
  let year: PackIndex["year"] | undefined;
  let family: FamilyDecl | undefined;
  let living: LivingDecl | undefined;
  const standards: CompiledStandard[] = [];
  const owners = new Map<string, string>();
  let repeat: RepeatCurve | undefined;
  for (const b of bundles) {
    const put = <T>(map: Map<string, T>, kind: string, id: string, v: T) =>
      declare(map, owners, kind, id, v, b.id);
    for (const s of b.storylets) put(storylets, "storylet", s.id, s);
    for (const o of b.occupations) put(occupations, "occupation", o.id, o);
    for (const i of b.items) put(items, "item", i.id, i);
    for (const l of b.loans) put(loans, "loan", l.id, l);
    for (const c of b.cities) put(cities, "city", c.id, c);
    standards.push(...b.standards);
    if (!living && b.living) living = b.living;
    for (const p of b.people) {
      if (p.type === "role") put(roles, "role", p.id, p);
      else put(generators, "generator", p.id, p);
    }
    for (const q of b.qualities) put(qualities, "quality", q.id, q);
    for (const s of b.stats) {
      const first = owners.get(`stat.${s.id}`);
      if (first !== undefined && first !== b.id)
        throw new Error(
          `stat '${s.id}' is declared by both Pack '${first}' and Pack '${b.id}'`,
        );
      owners.set(`stat.${s.id}`, b.id);
      stats.push(s);
    }
    if (b.currency) currency = b.currency;
    if (!year && b.year) year = b.year;
    if (!family && b.family) family = b.family;
    if (!repeat && b.repeat) repeat = b.repeat;
  }
  const events = [...storylets.values()]
    .filter((s) => s.trigger === "event")
    .sort((a, b) => cmp(a.id, b.id));
  const index: PackIndex = {
    bundles,
    storylets,
    events,
    occupations,
    items,
    markets: new Map([...items].filter(([, i]) => i.market !== undefined)),
    loans,
    cities,
    standards: standards.sort((a, b) => a.cost - b.cost || cmp(a.id, b.id)),
    standardsById: new Map(standards.map((s) => [s.id, s])),
    living,
    roles,
    generators,
    stats,
    qualities,
    currency,
    family,
    repeat: repeat ?? DEFAULT_REPEAT,
    year: year ?? { slots: [0, 0], cap: Number.MAX_SAFE_INTEGER },
  };
  cache.set(bundles, index);
  return index;
}
