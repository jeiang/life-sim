import type { Gender, ParentLink, PersonId, World } from "../state/types.ts";
import { addParentLink, getPerson, personsInIdOrder } from "../state/world.ts";

/**
 * Kinship (ADR 0005): what one person is to another, derived from the parent links in the
 * family tree. Only parent links are stored; every id below is computed.
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

/** Ancestors by birth or adoption within `MAX_DEPTH` generations, `id` itself at depth 0. */
function ancestors(world: World, id: PersonId): Map<PersonId, number> {
  const out = new Map<PersonId, number>([[id, 0]]);
  let layer = [id];
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next: PersonId[] = [];
    for (const x of layer)
      for (const l of getPerson(world, x).parents)
        if (isBlood(l) && !out.has(l.id)) {
          out.set(l.id, depth);
          next.push(l.id);
        }
    layer = next;
  }
  return out;
}

/** Spouses: both ends of a `spouse` role row. The marriage role is any pack's `.../spouse`. */
export function spousesOf(world: World, id: PersonId): PersonId[] {
  const out = new Set<PersonId>();
  for (const r of world.relationships) {
    if (r.role !== "spouse" && !r.role.endsWith("/spouse")) continue;
    if (r.from === id) out.add(r.to);
    else if (r.to === id) out.add(r.from);
  }
  return [...out].sort((a, b) => a - b);
}

function siblingKind(world: World, a: PersonId, b: PersonId): KinshipId {
  const pa = getPerson(world, a).parents.filter(isBlood);
  const pb = getPerson(world, b).parents.filter(isBlood);
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
function relative(
  world: World,
  viewer: PersonId,
  other: PersonId,
): KinshipId | undefined {
  if (viewer === other) return undefined;
  const av = ancestors(world, viewer);
  const ao = ancestors(world, other);
  // Closest common ancestor: fewest generations in total, then nearest the viewer, then lowest id.
  let best: { a: number; b: number } | undefined;
  for (const [id, a] of [...av].sort((x, y) => x[0] - y[0])) {
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
    if (a === 1 && b === 1) return siblingKind(world, viewer, other);
    if (b === 1 && a <= 3) return a === 2 ? "aunt-uncle" : "great-aunt-uncle";
    if (a === 1 && b === 2) return "niece-nephew";
    if (a === 2 && b === 2) return "cousin";
    return undefined;
  }
  const v = getPerson(world, viewer);
  const o = getPerson(world, other);
  if (v.parents.some((l) => l.kind === "step" && l.id === other))
    return "step-parent";
  if (o.parents.some((l) => l.kind === "step" && l.id === viewer))
    return "step-child";
  if (v.parents.some((l) => o.parents.some((m) => m.id === l.id)))
    return "step-sibling";
  return undefined;
}

const isSiblingKind = (k: KinshipId | undefined): boolean =>
  k === "sibling" || k === "half-sibling" || k === "adopted-sibling";

/**
 * What `other` is to `viewer`: the closest relation through parent links (up to
 * great-grandparents and great-grandchildren, aunts and uncles, cousins, nieces and nephews),
 * then step links, then marriage. `undefined` for the viewer themself and for anyone
 * outside those relations.
 */
export function kinshipOf(
  world: World,
  viewer: PersonId,
  other: PersonId,
): KinshipId | undefined {
  const rel = relative(world, viewer, other);
  if (rel) return rel;
  if (viewer === other) return undefined;
  const spouses = spousesOf(world, viewer);
  if (spouses.includes(other)) return "spouse";
  for (const s of spouses) {
    const k = relative(world, s, other);
    if (k === "parent") return "parent-in-law";
    if (isSiblingKind(k)) return "sibling-in-law";
  }
  for (const p of personsInIdOrder(world)) {
    const k = relative(world, viewer, p.id);
    if (k === "child" && spousesOf(world, p.id).includes(other))
      return "child-in-law";
    if (isSiblingKind(k) && spousesOf(world, p.id).includes(other))
      return "sibling-in-law";
  }
  return undefined;
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
  for (const p of world.persons.values())
    if (
      p.alive &&
      p.age >= minAge &&
      p.age <= maxAge &&
      kinshipOf(world, viewer, p.id) === id
    )
      n++;
  return n;
}

/** The family role a spawned or re-roled person holds, by the last segment of the role id. */
export type FamilyRole = "parent" | "sibling" | "child" | "grandparent";

export function familyRoleOf(roleId: string): FamilyRole | undefined {
  const last = roleId.slice(roleId.lastIndexOf("/") + 1);
  return last === "parent" ||
    last === "sibling" ||
    last === "child" ||
    last === "grandparent"
    ? last
    : undefined;
}

/**
 * Record that `person` holds a family role toward `from` in the tree: a parent becomes a
 * parent of `from`, a sibling takes `from`'s parents, a child gets `from` as parent, a
 * grandparent becomes a parent of `from`'s first parent. Other roles, and roles with no
 * parent to hang the link on, change nothing.
 */
export function linkFamilyRole(
  world: World,
  from: PersonId,
  person: PersonId,
  roleId: string,
): World {
  const role = familyRoleOf(roleId);
  const parents = getPerson(world, from).parents;
  switch (role) {
    case "parent":
      return addParentLink(world, from, person);
    case "child":
      return addParentLink(world, person, from);
    case "sibling":
      return parents.reduce(
        (w, l) => addParentLink(w, person, l.id, l.kind),
        world,
      );
    case "grandparent": {
      const first = parents.find(isBlood);
      return first ? addParentLink(world, first.id, person) : world;
    }
    default:
      return world;
  }
}
