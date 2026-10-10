/**
 * Pack-declared content kinds (docs/spec/pack-format/kinds.md): the lookup the Core builds from
 * the bundles and the `kind("<kind>", <id>).<field>` read. Entries are static data; an `expr`
 * field is evaluated on every read in the player-level scope (`makeEnv` in env.ts), never stored.
 */
import type { Expr, Value } from "../expr/index.ts";
import type { KindDecl, KindEntry, PackBundle } from "../pack.ts";

/** A declared kind with every instance written for it, over all Packs. */
export interface KindIndexEntry {
  readonly decl: KindDecl;
  /** Pack that declared the kind. */
  readonly owner: string;
  /** Instances by full id, in bundle order. */
  readonly entries: ReadonlyMap<string, KindEntry>;
}

/** Function name of a compiled lookup: `["call", "kind", ["s", kind], <id expr>, ["s", field]]`. */
export const KIND_CALL = "kind";

export function indexKinds(
  bundles: readonly PackBundle[],
): ReadonlyMap<string, KindIndexEntry> {
  const out = new Map<
    string,
    { decl: KindDecl; owner: string; entries: Map<string, KindEntry> }
  >();
  for (const b of bundles)
    for (const d of b.kinds) {
      const first = out.get(d.id);
      if (first)
        throw new Error(
          `kind '${d.id}' is declared by both Pack '${first.owner}' and Pack '${b.id}'`,
        );
      out.set(d.id, { decl: d, owner: b.id, entries: new Map() });
    }
  for (const b of bundles)
    for (const e of b.kindEntries) {
      const k = out.get(e.kind);
      if (!k)
        throw new Error(
          `entry '${e.id}' of Pack '${b.id}' names undeclared kind '${e.kind}'`,
        );
      if (k.entries.has(e.id))
        throw new Error(`duplicate ${e.kind} entry '${e.id}'`);
      k.entries.set(e.id, e);
    }
  return out;
}

/**
 * Read one field. An entry the id does not name (a computed id) reads as the type's zero:
 * 0, false or the empty string. `evalExpr` evaluates an `expr` field.
 */
export function kindValue(
  kinds: ReadonlyMap<string, KindIndexEntry>,
  kind: string,
  id: string,
  field: string,
  evalExpr: (e: Expr) => Value,
): Value {
  const k = kinds.get(kind);
  const f = k?.decl.fields.find((x) => x.name === field);
  if (!k || !f) throw new Error(`unknown kind field ${kind}.${field}`);
  const v = k.entries.get(id)?.values[field];
  if (f.type === "expr")
    return v === undefined
      ? f.returns === "bool"
        ? false
        : 0
      : evalExpr(v as Expr);
  if (v === undefined) return f.type === "int" ? 0 : "";
  return v as Value;
}
