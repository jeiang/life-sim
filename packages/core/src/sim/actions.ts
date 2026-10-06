import type { CompiledStorylet, IconRef, PackBundle } from "../pack.ts";
import type { PersonId, ScopeRef, World } from "../state/types.ts";
import { type SimResult, startStorylet } from "./flow.ts";
import { indexBundles } from "./pack-index.ts";
import {
  type AmountRange,
  amountRange,
  hasTargetRole,
  ineligibility,
} from "./storylets.ts";

/** One row of an action menu. */
export interface ActionRow {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconRef;
  /** The menu path the action sits in (`activities`, `assets/shopping`, ...). */
  readonly menu: string;
  /** True when it cannot be run now; `reason` says why. */
  readonly locked: boolean;
  readonly reason?: string;
  /** Actions with an amount input: the range the picker offers (minor units), as of now. */
  readonly amount?: AmountRange;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Fallback label from an id: `core-loop/spend-time-with-loved-ones` -> `Spend time with loved ones`. */
export function actionLabel(id: string): string {
  const short = (id.split("/").pop() ?? id).replaceAll(/[-_]+/g, " ");
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function lockedReason(
  world: World,
  bundles: readonly PackBundle[],
  s: CompiledStorylet,
  scope: ScopeRef | undefined,
): string | null {
  if (world.ended) return "This life is over";
  if (world.pending) return "Finish the open choice first";
  return ineligibility(world, indexBundles(bundles), s, scope);
}

/**
 * Actions in a menu path (exact match: `assets` does not include `assets/shopping`; see
 * `listSubmenus`), sorted by id. Without `target`, actions that need no person; with a
 * `target` person, the `scope: person` actions whose role filter fits that person.
 */
export function listActions(
  world: World,
  bundles: readonly PackBundle[],
  menuPath: string,
  target?: PersonId,
): ActionRow[] {
  const idx = indexBundles(bundles);
  const scope: ScopeRef | undefined =
    target === undefined ? undefined : { kind: "person", id: target };
  const rows: ActionRow[] = [];
  const all = [...idx.storylets.values()].sort((a, b) => cmp(a.id, b.id));
  for (const s of all) {
    if (s.trigger !== "action" || s.menu !== menuPath) continue;
    if ((s.scope ?? undefined) !== scope?.kind) continue;
    if (scope && !hasTargetRole(world, s, scope.id)) continue;
    const reason = lockedReason(world, bundles, s, scope);
    const range = amountRange(world, idx, s, scope);
    rows.push({
      id: s.id,
      label: s.label ?? actionLabel(s.id),
      ...(s.icon ? { icon: s.icon } : {}),
      menu: menuPath,
      locked: reason !== null,
      ...(reason === null ? {} : { reason }),
      ...(range ? { amount: range } : {}),
    });
  }
  return rows;
}

/** Submenu paths (`assets/shopping`) packs placed actions under, for a top-level menu. */
export function listSubmenus(
  bundles: readonly PackBundle[],
  top: string,
): string[] {
  const out = new Set<string>();
  for (const s of indexBundles(bundles).storylets.values())
    if (s.trigger === "action" && s.menu?.startsWith(`${top}/`))
      out.add(s.menu);
  return [...out].sort(cmp);
}

/**
 * Run an action from a menu (bound to `target` for `scope: person` actions). Returns the
 * world unchanged if it is locked. With choices it becomes `world.pending`. An action with
 * `amount` needs `amount` on the grid of its listed range (else `RangeError`); any other takes none.
 */
export function runAction(
  world: World,
  bundles: readonly PackBundle[],
  actionId: string,
  target?: PersonId,
  amount?: number,
): SimResult {
  const s = indexBundles(bundles).storylets.get(actionId);
  if (s?.trigger !== "action")
    throw new RangeError(`unknown action '${actionId}'`);
  return startStorylet(world, bundles, actionId, target, amount);
}
