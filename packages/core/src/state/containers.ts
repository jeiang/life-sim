/**
 * Pack-declared state containers (docs/spec/pack-format/state.md). Values live in the generic
 * `World.state` (world scope) and `Person.state` (person scope) trees, keyed by container id,
 * and only after a first write: a read of a missing value is the declared default. The save
 * codec, canonical serializer and world hash handle the trees without knowing any container,
 * so adding a container kind means a declaration type (`pack.ts`) and a branch here.
 */
import type { CounterDecl, StateDecl, TableDecl } from "../pack.ts";
import { checkMilestones, MILESTONES_ID } from "./milestones.ts";
import { checkParents, PARENTS_ID } from "./parents.ts";
import { checkSchedule, SCHEDULE_ID } from "./schedule.ts";
import type {
  Person,
  PersonId,
  StateTree,
  StateValue,
  World,
} from "./types.ts";
import { getPerson, updatePerson } from "./world.ts";

/** Where a container's values are stored. */
export function stateScopeOf(decl: StateDecl): "world" | "person" {
  return decl.kind === "counter" ? "world" : "person";
}

/** Clamp an integer to a declaration's optional `min`/`max`. */
export function clampDecl(
  decl: { readonly min?: number; readonly max?: number },
  n: number,
): number {
  let v = n;
  if (decl.min !== undefined) v = Math.max(decl.min, v);
  if (decl.max !== undefined) v = Math.min(decl.max, v);
  return v;
}

/** Current value of a world counter; the declared default until first written. */
export function counterValue(
  world: World,
  decl: CounterDecl,
): number | boolean {
  const v = world.state?.[decl.id];
  return typeof v === "number" || typeof v === "boolean" ? v : decl.default;
}

/** Write a world counter; integers are clamped to the declared range. */
export function setCounter(
  world: World,
  decl: CounterDecl,
  value: number | boolean,
): World {
  const v =
    decl.type === "flag" ? Boolean(value) : clampDecl(decl, value as number);
  return { ...world, state: { ...world.state, [decl.id]: v } };
}

function tableOf(
  person: Person,
  decl: TableDecl,
): Readonly<Record<string, StateValue>> {
  const t = person.state?.[decl.id];
  return typeof t === "object" ? t : {};
}

function checkKey(decl: TableDecl, key: string): void {
  if (!decl.keys.includes(key))
    throw new RangeError(`table '${decl.id}' has no key '${key}'`);
}

/** One cell of a person's table; the declared default until first written. */
export function cellValue(
  person: Person,
  decl: TableDecl,
  key: string,
): number {
  checkKey(decl, key);
  const v = tableOf(person, decl)[key];
  return typeof v === "number" ? v : decl.default;
}

/** Write one cell of a person's table, clamped to the declared range. */
export function setCell(
  world: World,
  id: PersonId,
  decl: TableDecl,
  key: string,
  value: number,
): World {
  checkKey(decl, key);
  getPerson(world, id);
  return updatePerson(world, id, (p) => ({
    ...p,
    state: {
      ...p.state,
      [decl.id]: { ...tableOf(p, decl), [key]: clampDecl(decl, value) },
    },
  }));
}

const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/**
 * Problems of a world's stored state against the declared containers: an id nothing declares,
 * a value of the wrong shape, or a table key the declaration lacks. Empty when sound. Run it
 * after the Pack migrations, which rename and remove container ids.
 */
export function checkWorldState(
  world: World,
  decls: ReadonlyMap<string, StateDecl>,
): string[] {
  const out: string[] = [];
  const check = (
    where: string,
    tree: StateTree | undefined,
    scope: string,
    owner?: PersonId,
  ) => {
    for (const [id, v] of Object.entries(tree ?? {})) {
      if (id === PARENTS_ID && owner !== undefined) {
        out.push(...checkParents(`${where}.${id}`, v, owner, world));
        continue;
      }
      if (id === SCHEDULE_ID && scope === "world") {
        out.push(...checkSchedule(`${where}.${id}`, v));
        continue;
      }
      if (id === MILESTONES_ID && scope === "world") {
        out.push(...checkMilestones(`${where}.${id}`, v));
        continue;
      }
      const d = decls.get(id);
      if (!d || stateScopeOf(d) !== scope) {
        out.push(
          `${where}.${id}: no ${scope} state container '${id}' is declared`,
        );
        continue;
      }
      if (d.kind === "counter") {
        if (d.type === "flag" ? typeof v !== "boolean" : !isInt(v))
          out.push(
            `${where}.${id}: expected ${d.type === "flag" ? "a flag" : "an integer"}`,
          );
      } else if (typeof v !== "object") {
        out.push(`${where}.${id}: expected a table`);
      } else {
        for (const [k, x] of Object.entries(v)) {
          if (!d.keys.includes(k))
            out.push(`${where}.${id}.${k}: unknown table key`);
          else if (!isInt(x))
            out.push(`${where}.${id}.${k}: expected an integer`);
        }
      }
    }
  };
  check("state", world.state, "world");
  for (const p of world.persons.values())
    check(`persons[${p.id}].state`, p.state, "person", p.id);
  return out;
}

/**
 * Rewrite a state tree's container ids through a Pack migration resolver (ids are
 * `state.<id>` in migration files). Removed ids drop their value; a rename whose target is not
 * a state id drops it too.
 */
export function migrateState(
  tree: StateTree | undefined,
  resolve: (id: string) => string | null,
): StateTree | undefined {
  if (!tree) return undefined;
  const out: Record<string, StateValue> = {};
  for (const [id, v] of Object.entries(tree)) {
    if (id === SCHEDULE_ID || id === MILESTONES_ID || id === PARENTS_ID) {
      out[id] = v;
      continue;
    }
    const to = resolve(`state.${id}`);
    if (to?.startsWith("state.")) out[to.slice(6)] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
