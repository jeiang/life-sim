import {
  addParentLink,
  type Gender,
  getPerson,
  type ParentKind,
  type ParentLink,
  type PersonId,
  parentLinks,
  personsInIdOrder,
  type World,
} from "../state/index.ts";

/**
 * Kinship (ADR 0006): what one person is to another, derived from the parent links in the family
 * tree (`Person.state._parents`). Only parent links are stored; every id below is computed.
 */
export const KINSHIP_IDS = [
  "parent",
  "grandparent",
  "great-grandparent",
  "child",
  "grandchild",
  "great-grandchild",
  "sibling",
  "half-sibling",
  "step-sibling",
  "adopted-sibling",
  "aunt-uncle",
  "great-aunt-uncle",
  "cousin",
  "niece-nephew",
  "step-parent",
  "step-child",
  "spouse",
  "parent-in-law",
  "sibling-in-law",
  "child-in-law",
] as const;

export type KinshipId = (typeof KINSHIP_IDS)[number];

/** Labels as `[neutral, male, female]`; lower case, for use inside a sentence. */
const LABELS: Readonly<Record<KinshipId, readonly [string, string, string]>> = {
  parent: ["parent", "father", "mother"],
  grandparent: ["grandparent", "grandfather", "grandmother"],
  "great-grandparent": [
    "great-grandparent",
    "great-grandfather",
    "great-grandmother",
  ],
  child: ["child", "son", "daughter"],
  grandchild: ["grandchild", "grandson", "granddaughter"],
  "great-grandchild": [
    "great-grandchild",
    "great-grandson",
    "great-granddaughter",
  ],
  sibling: ["sibling", "brother", "sister"],
  "half-sibling": ["half-sibling", "half-brother", "half-sister"],
  "step-sibling": ["step-sibling", "step-brother", "step-sister"],
  "adopted-sibling": ["adopted sibling", "adopted brother", "adopted sister"],
  "aunt-uncle": ["aunt or uncle", "uncle", "aunt"],
  "great-aunt-uncle": [
    "great-aunt or great-uncle",
    "great-uncle",
    "great-aunt",
  ],
  cousin: ["cousin", "cousin", "cousin"],
  "niece-nephew": ["niece or nephew", "nephew", "niece"],
  "step-parent": ["step-parent", "stepfather", "stepmother"],
  "step-child": ["step-child", "stepson", "stepdaughter"],
  spouse: ["spouse", "husband", "wife"],
  "parent-in-law": ["parent-in-law", "father-in-law", "mother-in-law"],
  "sibling-in-law": ["sibling-in-law", "brother-in-law", "sister-in-law"],
  "child-in-law": ["child-in-law", "son-in-law", "daughter-in-law"],
};

/** The player-facing label of a kinship id; gendered when the person's gender is male or female. */
export function kinshipLabel(id: KinshipId, gender?: Gender): string {
  const l = LABELS[id];
  return gender === "male" ? l[1] : gender === "female" ? l[2] : l[0];
}

export function isKinshipId(id: string): id is KinshipId {
  return (KINSHIP_IDS as readonly string[]).includes(id);
}

/** The deepest generation kinship looks at: great-grandparents and great-grandchildren. */
const MAX_DEPTH = 3;

const isBlood = (l: ParentLink): boolean => l.kind !== "step";

/** True for the marriage role: `spouse` or any pack's `.../spouse`. */
export function isSpouseRole(role: string): boolean {
  return role === "spouse" || role.endsWith("/spouse");
}

/** Spouses: both ends of a `spouse` role row. The marriage role is any pack's `.../spouse`. */
function spouseMap(world: World): Map<PersonId, PersonId[]> {
  const out = new Map<PersonId, Set<PersonId>>();
  const add = (a: PersonId, b: PersonId) => {
    const set = out.get(a) ?? new Set<PersonId>();
    out.set(a, set.add(b));
  };
  for (const r of world.relationships) {
    if (!isSpouseRole(r.role)) continue;
    add(r.from, r.to);
    add(r.to, r.from);
  }
  return new Map(
    [...out].map(([k, v]) => [k, [...v].sort((a, b) => a - b)] as const),
  );
}

/** Spouses of `id` (both ends of a `spouse` role row), ascending. */
export function spousesOf(world: World, id: PersonId): PersonId[] {
  return spouseMap(world).get(id) ?? [];
}

/**
 * One derivation pass over a world: parent links and ancestor sets are read once per person, so
 * a query over every person (`kinOf`, `countKin`) costs one tree walk each.
 */
class Tree {
  private readonly links = new Map<PersonId, readonly ParentLink[]>();
  private readonly ancs = new Map<PersonId, Map<PersonId, number>>();
  private spouses: Map<PersonId, PersonId[]> | undefined;

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  private parents(id: PersonId): readonly ParentLink[] {
    let l = this.links.get(id);
    if (!l) {
      l = parentLinks(this.world, id);
      this.links.set(id, l);
    }
    return l;
  }

  spousesOf(id: PersonId): readonly PersonId[] {
    this.spouses ??= spouseMap(this.world);
    return this.spouses.get(id) ?? [];
  }

  /** Ancestors by birth or adoption within `MAX_DEPTH` generations, `id` itself at depth 0. */
  private ancestors(id: PersonId): Map<PersonId, number> {
    const cached = this.ancs.get(id);
    if (cached) return cached;
    const out = new Map<PersonId, number>([[id, 0]]);
    let layer = [id];
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const next: PersonId[] = [];
      for (const x of layer)
        for (const l of this.parents(x))
          if (isBlood(l) && !out.has(l.id)) {
            out.set(l.id, depth);
            next.push(l.id);
          }
      layer = next;
    }
    this.ancs.set(id, out);
    return out;
  }

  private siblingKind(a: PersonId, b: PersonId): KinshipId {
    const pa = this.parents(a).filter(isBlood);
    const pb = this.parents(b).filter(isBlood);
    const shared = pa.filter((l) => pb.some((m) => m.id === l.id));
    const adopted =
      shared.some((l) => l.kind === "adopted") ||
      pb.some((m) => m.kind === "adopted" && shared.some((l) => l.id === m.id));
    if (adopted) return "adopted-sibling";
    return pa.length === shared.length && pb.length === shared.length
      ? "sibling"
      : "half-sibling";
  }

  /** Kinship through the tree alone (no in-laws): blood, adoption and step links. */
  relative(viewer: PersonId, other: PersonId): KinshipId | undefined {
    if (viewer === other) return undefined;
    const av = this.ancestors(viewer);
    const ao = this.ancestors(other);
    // Closest common ancestor: fewest generations in total, then nearest the viewer, then lowest id.
    let best: { a: number; b: number } | undefined;
    for (const [id, a] of av) {
      const b = ao.get(id);
      if (b === undefined) continue;
      if (
        !best ||
        a + b < best.a + best.b ||
        (a + b === best.a + best.b && a < best.a)
      )
        best = { a, b };
    }
    if (best) {
      const { a, b } = best;
      if (a === 0)
        return (["child", "grandchild", "great-grandchild"] as const)[b - 1];
      if (b === 0)
        return (["parent", "grandparent", "great-grandparent"] as const)[a - 1];
      if (a === 1 && b === 1) return this.siblingKind(viewer, other);
      if (b === 1) return a === 2 ? "aunt-uncle" : "great-aunt-uncle";
      if (a === 1 && b === 2) return "niece-nephew";
      if (a === 2 && b === 2) return "cousin";
      return undefined;
    }
    const vp = this.parents(viewer);
    const op = this.parents(other);
    if (vp.some((l) => l.kind === "step" && l.id === other))
      return "step-parent";
    if (op.some((l) => l.kind === "step" && l.id === viewer))
      return "step-child";
    if (vp.some((l) => op.some((m) => m.id === l.id))) return "step-sibling";
    return undefined;
  }

  /** What `other` is to `viewer`: the tree first, then marriage. */
  kinship(
    viewer: PersonId,
    other: PersonId,
    everyone: readonly PersonId[],
  ): KinshipId | undefined {
    const rel = this.relative(viewer, other);
    if (rel) return rel;
    if (viewer === other) return undefined;
    const spouses = this.spousesOf(viewer);
    if (spouses.includes(other)) return "spouse";
    for (const s of spouses) {
      const k = this.relative(s, other);
      if (k === "parent") return "parent-in-law";
      if (isSiblingKind(k)) return "sibling-in-law";
    }
    for (const p of everyone) {
      const k = this.relative(viewer, p);
      if (k === undefined || !this.spousesOf(p).includes(other)) continue;
      if (k === "child") return "child-in-law";
      if (isSiblingKind(k)) return "sibling-in-law";
    }
    return undefined;
  }
}

function isSiblingKind(k: KinshipId | undefined): boolean {
  return k === "sibling" || k === "half-sibling" || k === "adopted-sibling";
}

/**
 * What `other` is to `viewer`: the closest relation through parent links (up to
 * great-grandparents and great-grandchildren, aunts and uncles, cousins, nieces and nephews),
 * then step links, then marriage. `undefined` for the viewer themself and for anyone
 * outside those relations. Succession needs no relabelling: pass the heir as `viewer`.
 */
export function kinshipOf(
  world: World,
  viewer: PersonId,
  other: PersonId,
): KinshipId | undefined {
  getPerson(world, other);
  return new Tree(world).kinship(
    viewer,
    other,
    personsInIdOrder(world).map((p) => p.id),
  );
}

/** One relative of a viewer: the person and what they are to the viewer. */
export interface Kin {
  readonly id: PersonId;
  readonly kin: KinshipId;
}

/**
 * Everyone `viewer` has a kinship id to, in ascending person id order. `alive` keeps only the
 * living (or only the dead). The pool for guardian, heir and family choices.
 */
export function kinOf(
  world: World,
  viewer: PersonId,
  opts: { readonly alive?: boolean } = {},
): Kin[] {
  getPerson(world, viewer);
  const tree = new Tree(world);
  const people = personsInIdOrder(world);
  const everyone = people.map((p) => p.id);
  const out: Kin[] = [];
  for (const p of people) {
    if (opts.alive !== undefined && p.alive !== opts.alive) continue;
    const kin = tree.kinship(viewer, p.id, everyone);
    if (kin) out.push({ id: p.id, kin });
  }
  return out;
}

/** Living people `viewer` is `id` to, aged `[minAge, maxAge]` inclusive. */
export function countKin(
  world: World,
  viewer: PersonId,
  id: string,
  minAge: number,
  maxAge: number,
): number {
  let n = 0;
  for (const k of kinOf(world, viewer, { alive: true })) {
    if (k.kin !== id) continue;
    const age = getPerson(world, k.id).age;
    if (age >= minAge && age <= maxAge) n++;
  }
  return n;
}

/** Whether a role row is a partner (the marriage role is `spouse`; this is the unmarried one). */
const isPartnerRole = (role: string): boolean =>
  role === "partner" || role.endsWith("/partner");

/**
 * The other birth parent of a child `from` gains: the named `parent` when given, else the
 * living spouses, else the living partner with the lowest person id (exactly one).
 */
function otherParents(
  world: World,
  from: PersonId,
  parent: PersonId | undefined,
): PersonId[] {
  if (parent !== undefined) return [parent];
  const alive = (id: PersonId): boolean => getPerson(world, id).alive;
  const spouses = spousesOf(world, from).filter(alive);
  if (spouses.length > 0) return spouses;
  const partners = world.relationships
    .filter((r) => isPartnerRole(r.role))
    .flatMap((r) => (r.from === from ? [r.to] : r.to === from ? [r.from] : []))
    .filter(alive);
  return partners.length > 0 ? [Math.min(...partners)] : [];
}

/** The family role a spawned or re-roled person holds, by the last segment of the role id. */
export type FamilyRole =
  | "parent"
  | "sibling"
  | "child"
  | "grandchild"
  | "grandparent";

export function familyRoleOf(roleId: string): FamilyRole | undefined {
  const last = roleId.slice(roleId.lastIndexOf("/") + 1);
  return last === "parent" ||
    last === "sibling" ||
    last === "child" ||
    last === "grandchild" ||
    last === "grandparent"
    ? last
    : undefined;
}

/**
 * Record that `person` holds a family role toward `from` in the tree: a parent becomes a
 * parent of `from`, a sibling takes `from`'s parents, a child gets `from` (and `from`'s
 * spouses) as parent, a grandchild gets only the named `parent` (their birth parent, one of the
 * player's children), a grandparent becomes a parent of `from`'s first birth or adopted
 * parent. Other roles, and roles with no parent to hang the link on, change nothing.
 */
export function linkFamilyRole(
  world: World,
  from: PersonId,
  person: PersonId,
  roleId: string,
  opts: { parent?: PersonId; kind?: ParentKind } = {},
): World {
  switch (familyRoleOf(roleId)) {
    case "parent":
      return addParentLink(world, from, person);
    case "child":
      return [from, ...otherParents(world, from, opts.parent)].reduce(
        (w, parent) => addParentLink(w, person, parent, opts.kind),
        world,
      );
    case "grandchild":
      return opts.parent === undefined
        ? world
        : addParentLink(world, person, opts.parent, opts.kind);
    case "sibling":
      return parentLinks(world, from).reduce(
        (w, l) => addParentLink(w, person, l.id, l.kind),
        world,
      );
    case "grandparent": {
      const first = parentLinks(world, from).find(isBlood);
      return first ? addParentLink(world, first.id, person) : world;
    }
    default:
      return world;
  }
}
