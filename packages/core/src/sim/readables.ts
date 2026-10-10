/**
 * Pack-declared readables (docs/spec/pack-format/readables.md): the lookup the Core builds from
 * the bundles, the dependency check, and the aggregators. A readable is evaluated on every
 * read (`makeEnv` in env.ts), never stored, and uses no randomness.
 */
import type { Aggregate, Expr } from "../expr/index.ts";
import type {
  ContributionDecl,
  PackBundle,
  ReadableDecl,
  TableDecl,
} from "../pack.ts";
import { cellValue } from "../state/containers.ts";
import type { Person, World } from "../state/types.ts";
import type { PackIndex } from "./pack-index.ts";

/** A readable or slot with every term contributed to it, over all Packs. */
export interface ReadableEntry {
  readonly decl: ReadableDecl;
  /** Slot terms in bundle order (the combination is commutative); empty for an expression readable. */
  readonly terms: readonly Expr[];
}

/** Names of the readables an expression reads (`["v", name]` nodes that are readable ids). */
export function exprReadables(e: Expr, ids: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const walk = (x: Expr): void => {
    if (typeof x !== "object") return;
    const tag = x[0];
    if (tag === "s" || tag === "id") return;
    if (tag === "v") {
      if (ids.has(x[1] as string)) out.push(x[1] as string);
      return;
    }
    if (tag === "in") {
      walk(x[1] as Expr);
      for (const i of x[2] as readonly Expr[]) walk(i);
      return;
    }
    const from = tag === "call" ? 2 : 1;
    for (const c of x.slice(from) as Expr[]) walk(c);
  };
  walk(e);
  return out;
}

/**
 * The first dependency cycle among readables as `a -> b -> a`, or undefined. A readable
 * depends on every readable its expression reads; a slot on every readable any of its terms
 * reads (its default is a constant).
 */
export function readableCycle(
  decls: readonly ReadableDecl[],
  contributions: readonly ContributionDecl[],
): string | undefined {
  const ids = new Set(decls.map((d) => d.id));
  const deps = new Map<string, string[]>();
  for (const d of decls)
    deps.set(d.id, d.kind === "readable" ? exprReadables(d.expr, ids) : []);
  for (const c of contributions)
    deps.get(c.slot)?.push(...exprReadables(c.expr, ids));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string | undefined => {
    if (state.get(id) === 2) return undefined;
    if (state.get(id) === 1)
      return [...stack.slice(stack.indexOf(id)), id].join(" -> ");
    state.set(id, 1);
    stack.push(id);
    for (const next of deps.get(id) ?? []) {
      const hit = visit(next);
      if (hit) return hit;
    }
    stack.pop();
    state.set(id, 2);
    return undefined;
  };
  for (const id of [...ids].sort()) {
    const hit = visit(id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Index every bundle's readables and contributions. Throws on a duplicate id, a contribution
 * to something that is not a slot, a term of the wrong type, or a dependency cycle.
 */
export function indexReadables(
  bundles: readonly PackBundle[],
  owners: Map<string, string>,
): Map<string, ReadableEntry> {
  const decls = new Map<string, ReadableDecl>();
  const terms = new Map<string, Expr[]>();
  for (const b of bundles)
    for (const d of b.readables) {
      const first = owners.get(`readable.${d.id}`);
      if (first !== undefined && first !== b.id)
        throw new Error(
          `readable '${d.id}' is declared by both Pack '${first}' and Pack '${b.id}'`,
        );
      owners.set(`readable.${d.id}`, b.id);
      decls.set(d.id, d);
      terms.set(d.id, []);
    }
  const contributions: ContributionDecl[] = [];
  for (const b of bundles)
    for (const c of b.contributions) {
      const slot = decls.get(c.slot);
      if (slot?.kind !== "slot")
        throw new Error(
          `Pack '${b.id}' contributes to '${c.slot}', which is not a declared slot`,
        );
      (terms.get(c.slot) as Expr[]).push(c.expr);
      contributions.push(c);
    }
  const cycle = readableCycle([...decls.values()], contributions);
  if (cycle !== undefined) throw new Error(`readables form a cycle: ${cycle}`);
  const out = new Map<string, ReadableEntry>();
  for (const [id, decl] of decls)
    out.set(id, { decl, terms: terms.get(id) as Expr[] });
  return out;
}

const num = (v: number | boolean): number =>
  typeof v === "boolean" ? (v ? 1 : 0) : v;

/** Combine a slot's default and evaluated terms (summed or maxed; any-true for a flag). */
export function combineSlot(
  decl: Extract<ReadableDecl, { kind: "slot" }>,
  values: readonly (number | boolean)[],
): number | boolean {
  if (decl.type === "bool") return decl.default || values.some(Boolean);
  const all = [decl.default, ...values.map(num)];
  return decl.combine === "sum"
    ? all.reduce((a, b) => a + b, 0)
    : Math.max(...all);
}

/**
 * Evaluate a compiled aggregator source over the world. `table.<id>` ranges over the keys of
 * the subject's table; `people.quality.<id>` and `people.table.<id>.<key>` over every living
 * person, the subject included. `count` is how many values are above 0 (flags: true); an
 * empty `max` / `min` is 0.
 */
export function aggregate(
  world: World,
  idx: Pick<PackIndex, "qualities" | "state">,
  subject: Person,
  op: Aggregate,
  source: string,
): number {
  const parts = source.split(".");
  const table = (id: string): TableDecl => {
    const d = idx.state.get(id);
    if (d?.kind !== "table")
      throw new RangeError(`unknown aggregate source '${source}'`);
    return d;
  };
  let values: number[];
  if (parts[0] === "table" && parts.length === 2) {
    const d = table(parts[1] as string);
    values = d.keys.map((k) => cellValue(subject, d, k));
  } else if (parts[0] === "people" && parts[1] === "quality") {
    const id = parts.slice(2).join(".");
    const d = idx.qualities.get(id);
    if (!d) throw new RangeError(`unknown aggregate source '${source}'`);
    values = [...world.persons.values()]
      .filter((p) => p.alive)
      .map((p) => num(p.qualities[id] ?? d.default));
  } else if (
    parts[0] === "people" &&
    parts[1] === "table" &&
    parts.length === 4
  ) {
    const d = table(parts[2] as string);
    const key = parts[3] as string;
    values = [...world.persons.values()]
      .filter((p) => p.alive)
      .map((p) => cellValue(p, d, key));
  } else {
    throw new RangeError(`unknown aggregate source '${source}'`);
  }
  switch (op) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "count":
      return values.filter((v) => v > 0).length;
    case "max":
      return values.length ? Math.max(...values) : 0;
    case "min":
      return values.length ? Math.min(...values) : 0;
  }
}
