import type {
  CompiledGenerator,
  CompiledItemKind,
  CompiledLoanKind,
  CompiledOccupationKind,
  CompiledRole,
  CompiledStorylet,
  FamilyDecl,
  PackBundle,
  QualityDecl,
  StatDecl,
} from "../pack.ts";

/** Lookup tables over a set of bundles, built once per bundle array. */
export interface PackIndex {
  readonly bundles: readonly PackBundle[];
  readonly storylets: ReadonlyMap<string, CompiledStorylet>;
  /** Event storylets in id order. */
  readonly events: readonly CompiledStorylet[];
  readonly occupations: ReadonlyMap<string, CompiledOccupationKind>;
  readonly items: ReadonlyMap<string, CompiledItemKind>;
  readonly loans: ReadonlyMap<string, CompiledLoanKind>;
  readonly roles: ReadonlyMap<string, CompiledRole>;
  readonly generators: ReadonlyMap<string, CompiledGenerator>;
  /** Bundle order (dependencies first). */
  readonly stats: readonly StatDecl[];
  readonly qualities: ReadonlyMap<string, QualityDecl>;
  readonly currency: { readonly symbol: string; readonly digits: number };
  /** Starting family from the first manifest that declares one. */
  readonly family: FamilyDecl | undefined;
  /** Event draw settings from the first manifest that declares them. */
  readonly year: {
    readonly slots: readonly [number, number];
    readonly cap: number;
  };
}

const cache = new WeakMap<readonly PackBundle[], PackIndex>();

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function indexBundles(bundles: readonly PackBundle[]): PackIndex {
  const hit = cache.get(bundles);
  if (hit) return hit;
  const storylets = new Map<string, CompiledStorylet>();
  const occupations = new Map<string, CompiledOccupationKind>();
  const items = new Map<string, CompiledItemKind>();
  const loans = new Map<string, CompiledLoanKind>();
  const roles = new Map<string, CompiledRole>();
  const generators = new Map<string, CompiledGenerator>();
  const qualities = new Map<string, QualityDecl>();
  const stats: StatDecl[] = [];
  let currency = { symbol: "", digits: 0 };
  let year: PackIndex["year"] | undefined;
  let family: FamilyDecl | undefined;
  for (const b of bundles) {
    for (const s of b.storylets) storylets.set(s.id, s);
    for (const o of b.occupations) occupations.set(o.id, o);
    for (const i of b.items) items.set(i.id, i);
    for (const l of b.loans) loans.set(l.id, l);
    for (const p of b.people) {
      if (p.type === "role") roles.set(p.id, p);
      else generators.set(p.id, p);
    }
    for (const q of b.qualities) qualities.set(q.id, q);
    stats.push(...b.stats);
    if (b.currency) currency = b.currency;
    if (!year && b.year) year = b.year;
    if (!family && b.family) family = b.family;
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
    loans,
    roles,
    generators,
    stats,
    qualities,
    currency,
    family,
    year: year ?? { slots: [0, 0], cap: Number.MAX_SAFE_INTEGER },
  };
  cache.set(bundles, index);
  return index;
}
