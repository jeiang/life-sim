import type { Effect } from "../expr/index.ts";
import type { HookPhase } from "../pack.ts";
import type { World } from "../state/types.ts";
import { applyEffects } from "./effects.ts";
import type { PackIndex } from "./pack-index.ts";

/**
 * Run every Pack's statements for a lifecycle phase (docs/spec/pack-format/hooks.md), Packs in
 * bundle order (dependencies first, then id). Effects act on the player. Statement `n` of Pack
 * `<id>` rolls under the purpose key `pack/<id>/<hook>/<n>`, so adding a subscriber moves no
 * other stream. `milestone` selects the `on_milestone` entry and is part of the key. Nothing
 * is logged: hooks are a pure function of the world, so replay and saves are unchanged.
 */
export function runHook(
  world: World,
  idx: PackIndex,
  phase: HookPhase | "on_milestone",
  milestone?: string,
): World {
  let w = world;
  for (const b of idx.bundles) {
    const hooks = b.hooks;
    if (!hooks) continue;
    const statements =
      phase === "on_milestone"
        ? hooks.on_milestone?.[milestone as string]
        : hooks[phase];
    if (!statements) continue;
    const name = phase === "on_milestone" ? `on_milestone/${milestone}` : phase;
    w = runStatements(w, idx, b.id, name, statements, phase === "on_death");
  }
  return w;
}

function runStatements(
  world: World,
  idx: PackIndex,
  packId: string,
  name: string,
  statements: readonly (readonly Effect[])[],
  dead: boolean,
): World {
  // One binding table per Pack and run: `spawn_person(...) as pal` lasts for the later statements.
  const bound = new Map<string, number>();
  const ended = world.ended;
  // The player is already dead when `on_death` runs; effects still apply, and the obituary stays as written.
  let w = dead ? { ...world, ended: null } : world;
  for (const [n, effects] of statements.entries()) {
    if (w.ended) break;
    w = applyEffects(
      w,
      idx,
      effects,
      { subject: w.playerId, purpose: `pack/${packId}/${name}/${n}` },
      bound,
    );
  }
  return dead ? { ...w, ended } : w;
}
