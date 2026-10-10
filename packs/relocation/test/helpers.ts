import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPerson,
  indexBundles,
  newLife,
  type PersonId,
  ScriptedRng,
  setQuality,
  setStreamOverride,
  startOccupation,
  updatePerson,
  type World,
} from "../../../packages/core/src/index.ts";
import { applyEffects } from "../../../packages/core/src/sim/effects.ts";
import { evalBool, evalInt } from "../../../packages/core/src/sim/ops.ts";
import { scopeFor } from "../../../packages/core/src/sim/storylets.ts";
import { compilePacks } from "../../../packages/pack-tools/src/index.ts";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = compilePacks(PACKS, { only: ["relocation"] });
if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
export const bundles = out.bundles;
export const idx = indexBundles(bundles);

export const R = (id: string) => `relocation/${id}`;
export const me = (w: World) => getPerson(w, w.playerId);
export const q = (w: World, id: string) => me(w).qualities[id];
export const qn = (w: World, id: string) => q(w, id) as number;

/** An adult of `age` in `city` (full id) with `money` and qualities set. */
export function life(
  opts: {
    seed?: number;
    age?: number;
    money?: number;
    city?: string;
    smarts?: number;
    withParents?: boolean;
    q?: Record<string, number | boolean>;
  } = {},
): World {
  const w0 = newLife(bundles, opts.seed ?? 7);
  let w = updatePerson(w0, w0.playerId, (p) => ({
    ...p,
    age: opts.age ?? 30,
    money: opts.money ?? 1000000,
    withParents: opts.withParents ?? false,
    ...(opts.city === undefined ? {} : { cityId: opts.city }),
    stats: { ...p.stats, smarts: opts.smarts ?? 50 },
  }));
  for (const [k, v] of Object.entries(opts.q ?? {}))
    w = setQuality(w, w.playerId, k, v);
  return w;
}

export const story = (id: string) => {
  const s = idx.storylets.get(id.includes("/") ? id : R(id));
  if (!s) throw new Error(`no storylet ${id}`);
  return s;
};

/** Give the player an occupation (`core-loop/cashier`, `core-loop/junior-analyst`, ...). */
export function hire(w: World, kind: string): World {
  return startOccupation(w, idx, w.playerId, kind);
}

/** Outcomes of a storylet (or of one choice) that can be drawn now, with integer weights. */
export function eligible(
  w: World,
  id: string,
  choice?: number,
  person?: PersonId,
) {
  const s = story(id);
  const scope = scopeFor(
    w,
    person === undefined ? undefined : { kind: "person", id: person },
    s.id,
  );
  const outs = choice === undefined ? s.outcomes : s.choices[choice]?.outcomes;
  return (outs ?? [])
    .filter((o) => evalBool(o.when, w, idx, scope))
    .map((o) => ({ o, weight: evalInt(o.weight, w, idx, scope) }));
}

/** Force the weighted pick of storylets' outcomes by index, keyed by full storylet id. */
export function forcePicks(picks: Record<string, number | string>) {
  setStreamOverride((_a, key) => {
    const id = key.startsWith("outcome/") ? key.slice(8) : undefined;
    return id !== undefined && id in picks
      ? new ScriptedRng({ pick: picks[id] as number | string })
      : undefined;
  });
}
export const forcePick = (storyletId: string, pick: number | string) =>
  forcePicks({ [storyletId]: pick });
export const unforce = () => setStreamOverride(null);

export { applyEffects, evalBool, evalInt, scopeFor };

/** The player's relationship rows toward people holding `role` (`parent`, `sibling`, `friend`). */
export function rows(w: World, role: string) {
  return w.relationships.filter(
    (r) => r.from === w.playerId && r.role.endsWith(`/${role}`),
  );
}
export const closeness = (w: World, person: PersonId): number =>
  Math.max(
    ...w.relationships
      .filter((r) => r.from === w.playerId && r.to === person)
      .map((r) => r.closeness),
  );
/** Set the closeness of every row toward `person`. */
export function withCloseness(w: World, person: PersonId, n: number): World {
  return {
    ...w,
    relationships: w.relationships.map((r) =>
      r.from === w.playerId && r.to === person ? { ...r, closeness: n } : r,
    ),
  };
}
export const stat = (w: World, id: string): number => me(w).stats[id] ?? 0;
