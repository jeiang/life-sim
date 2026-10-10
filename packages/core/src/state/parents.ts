/**
 * Parent links (docs/adr/0006-parent-links-derived-kinship.md): the only family fact the Core
 * stores. It is a Core-owned person state container: it lives in `Person.state` under the
 * reserved id `_parents` (no Pack id can start with `_`), so the save codec, canonical
 * serializer and world hash need nothing for it, and it is absent on a person with no recorded
 * parent.
 *
 * Shape: `{ "<parent person id>": <kind code> }`, where the code is `PARENT_KIND_CODE[kind]`:
 * `birth` 1, `adopted` 2, `step` 3. Every other family term (grandparent, half-sibling, cousin,
 * in-law) is derived from these links by `sim/kinship.ts`.
 */
import type { PersonId, StateValue, World } from "./types.ts";
import { getPerson, updatePerson } from "./world.ts";

/** The reserved id of the container in `Person.state`. */
export const PARENTS_ID = "_parents";

/** How a parent is a parent: by birth, by adoption, or by a parent's marriage (step). */
export type ParentKind = "birth" | "adopted" | "step";

export const PARENT_KINDS: readonly ParentKind[] = [
  "birth",
  "adopted",
  "step",
] as const;

/** The stored integer of a kind. */
export const PARENT_KIND_CODE: Readonly<Record<ParentKind, number>> = {
  birth: 1,
  adopted: 2,
  step: 3,
};

export interface ParentLink {
  readonly id: PersonId;
  readonly kind: ParentKind;
}

function decode(v: StateValue | undefined): ParentKind | undefined {
  return typeof v === "number" ? PARENT_KINDS[v - 1] : undefined;
}

/** A person's parents (any kind), in ascending parent id order. */
export function parentLinks(world: World, id: PersonId): readonly ParentLink[] {
  const tree = getPerson(world, id).state?.[PARENTS_ID];
  if (typeof tree !== "object") return [];
  const out: ParentLink[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const kind = decode(v);
    if (kind) out.push({ id: Number(k), kind });
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * Record `parent` as a parent of `child` (default kind `birth`). Replaces an earlier link between
 * the pair; a link to oneself changes nothing. Both people must exist.
 */
export function addParentLink(
  world: World,
  child: PersonId,
  parent: PersonId,
  kind: ParentKind = "birth",
): World {
  getPerson(world, parent);
  if (child === parent) return world;
  return updatePerson(world, child, (p) => {
    const have = p.state?.[PARENTS_ID];
    return {
      ...p,
      state: {
        ...p.state,
        [PARENTS_ID]: {
          ...(typeof have === "object" ? have : {}),
          [String(parent)]: PARENT_KIND_CODE[kind],
        },
      },
    };
  });
}

/** Problems of a stored `_parents` value on person `owner`; empty when sound. */
export function checkParents(
  where: string,
  v: StateValue,
  owner: PersonId,
  world: World,
): string[] {
  if (typeof v !== "object") return [`${where}: expected a parent table`];
  const out: string[] = [];
  for (const [k, code] of Object.entries(v)) {
    const id = Number(k);
    if (!Number.isSafeInteger(id) || String(id) !== k)
      out.push(`${where}.${k}: not a person id`);
    else if (id === owner)
      out.push(`${where}.${k}: a person is not their own parent`);
    else if (!world.persons.has(id)) out.push(`${where}.${k}: no such person`);
    if (decode(code) === undefined)
      out.push(`${where}.${k}: expected a parent kind code 1-3`);
  }
  return out;
}
