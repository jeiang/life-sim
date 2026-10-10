/**
 * Succession (docs/spec/core-loop.md#succession, ADR 0003): the dead player's life continues as
 * one of their living children. `succeed` settles the estate, moves the player pointer to the
 * heir, starts the heir's per-life state empty, runs the `on_succession` hooks and queues the
 * `trigger: succession` storylets. It is logged (`succeed` choice), so replay reproduces it.
 */
import type { PackBundle } from "../pack.ts";
import { clearMilestones } from "../state/milestones.ts";
import {
  type ScheduledEntry,
  scheduledEntries,
  setScheduled,
} from "../state/schedule.ts";
import type { Asset, Holding, Loan, PersonId, World } from "../state/types.ts";
import { clearWill, type Will, willOf } from "../state/will.ts";
import {
  addJournalLine,
  addMoney,
  getPerson,
  putRelationship,
  updatePerson,
} from "../state/world.ts";
import { appendChoice, type SimResult } from "./flow.ts";
import { runHook } from "./hooks.ts";
import { kinOf, spousesOf } from "./kinship.ts";
import { ADULT_AGE } from "./living.ts";
import { DEFAULT_FAMILY } from "./new-life.ts";
import { indexBundles, type PackIndex } from "./pack-index.ts";
import { formatMoney } from "./text.ts";

/**
 * Who may inherit the player's life: the player's living children (by birth, adoption or
 * marriage, so step-children too), in ascending person id order. Empty: the lineage ends.
 * Meaningful once the player has died, but defined at any time.
 */
export function heirsOf(
  world: World,
  player: PersonId = world.playerId,
): PersonId[] {
  return kinOf(world, player, { alive: true })
    .filter((k) => k.kin === "child" || k.kin === "step-child")
    .map((k) => k.id);
}

/** True when the player has died and a living child can carry on. */
export function canSucceed(world: World): boolean {
  return world.ended !== null && heirsOf(world).length > 0;
}

/** Share of the cash estate each beneficiary got; `charity` is the share nobody got. */
interface Split {
  readonly to: readonly (readonly [PersonId, number])[];
  readonly charity: number;
}

/**
 * Divide `cash` by the will, or by the no-will rule when there is none (or the will cannot be
 * carried out: the named person is dead, or there is no spouse to leave it to): a living spouse
 * gets half and the children split the rest evenly; with no spouse the children get all. The
 * remainder of an uneven division goes to the succeeding heir. No beneficiary at all: charity.
 */
function splitCash(
  world: World,
  dead: PersonId,
  heir: PersonId,
  will: Will | undefined,
  cash: number,
): Split {
  const children = heirsOf(world, dead);
  const spouse = spousesOf(world, dead).find((s) => getPerson(world, s).alive);
  const even = (total: number): [PersonId, number][] => {
    if (children.length === 0) return [];
    const each = Math.trunc(total / children.length);
    const rest = total - each * children.length;
    return children.map((c) => [c, each + (c === heir ? rest : 0)]);
  };
  const decided = (to: readonly (readonly [PersonId, number])[]): Split => ({
    to: to.filter(([, n]) => n > 0),
    charity: cash - to.reduce((n, [, x]) => n + x, 0),
  });
  if (will?.mode === "charity") return { to: [], charity: cash };
  if (will?.mode === "heir" && will.heir !== undefined) {
    const named = world.persons.get(will.heir);
    if (named?.alive && will.heir !== dead) return decided([[will.heir, cash]]);
  } else if (will?.mode === "spouse" && spouse !== undefined) {
    return decided([[spouse, cash]]);
  } else if (will?.mode === "even") {
    return decided(even(cash));
  }
  if (spouse === undefined) return decided(even(cash));
  const half = Math.trunc(cash / 2);
  return decided([[spouse, half], ...even(cash - half)]);
}

/** Re-base an asset's acquired age so the heir sees the same `asset.years` the dead player did. */
function carried(a: Asset, deadAge: number, heirAge: number): Asset {
  const years = deadAge - (a.acquiredAge ?? deadAge);
  return { ...a, acquiredAge: heirAge - years };
}

/** Merge the dead player's holding into the heir's: units and basis add; the older start and the earlier maturity stand. */
function mergedHolding(
  from: Holding,
  into: Holding | undefined,
  deadAge: number,
  heirAge: number,
): Holding {
  const firstAge = heirAge - (deadAge - from.firstAge);
  const matures = [from.maturesYear, into?.maturesYear].filter(
    (y): y is number => y !== undefined,
  );
  return {
    kindId: from.kindId,
    units: from.units + (into?.units ?? 0),
    basis: from.basis + (into?.basis ?? 0),
    firstAge: Math.min(firstAge, into?.firstAge ?? firstAge),
    ...(matures.length > 0 ? { maturesYear: Math.min(...matures) } : {}),
  };
}

interface Settled {
  readonly world: World;
  /** Journal lines for the heir's life (money already formatted). */
  readonly lines: readonly string[];
  /** Cash the dead player held, before debts. */
  readonly cash: number;
}

/**
 * Settle the dead player's estate (docs/spec/core-loop.md#the-estate):
 * - unsecured debts are paid from cash, a shortfall is written off;
 * - a secured loan goes with its asset to an adult heir; for a minor heir the asset is sold at
 *   its value, the loan repaid from the proceeds, any surplus joins the cash and any shortfall
 *   is written off;
 * - the other assets and the investment holdings pass whole to the heir, no forced sale;
 * - the cash left is divided by the will, or by the no-will rule (`splitCash`); no estate tax.
 * The dead player keeps nothing afterwards.
 */
function settleEstate(
  world: World,
  idx: PackIndex,
  dead: PersonId,
  heir: PersonId,
): Settled {
  const d = getPerson(world, dead);
  const h = getPerson(world, heir);
  const money = (n: number) => formatMoney(n, idx.currency);
  const lines: string[] = [];
  const atDeath = Math.max(0, d.money);
  let cash = atDeath;
  let paid = 0;
  let writtenOff = 0;
  const secured = (l: Loan): boolean =>
    l.securedAssetId !== undefined &&
    d.assets.some((a) => a.id === l.securedAssetId);
  let assets: readonly Asset[] = d.assets;
  const toHeirLoans: Loan[] = [];
  for (const l of d.loans) {
    if (secured(l)) {
      if (h.age >= ADULT_AGE) {
        toHeirLoans.push(l);
        continue;
      }
      const asset = d.assets.find((a) => a.id === l.securedAssetId) as Asset;
      const repay = Math.min(asset.value, l.balance);
      cash += asset.value - repay;
      paid += repay;
      writtenOff += l.balance - repay;
      assets = assets.filter((a) => a.id !== asset.id);
      continue;
    }
    const pay = Math.min(cash, l.balance);
    cash -= pay;
    paid += pay;
    writtenOff += l.balance - pay;
  }
  if (paid > 0)
    lines.push(`Debts of ${money(paid)} were paid from the estate.`);
  if (writtenOff > 0)
    lines.push(`${money(writtenOff)} of debt was written off.`);

  const split = splitCash(world, dead, heir, willOf(world), cash);
  let w = world;
  for (const [id, n] of split.to) w = addMoney(w, id, n);
  const got = split.to.find(([id]) => id === heir)?.[1] ?? 0;
  if (got > 0) lines.push(`You inherit ${money(got)}.`);
  const others = split.to.filter(([id]) => id !== heir);
  for (const [id, n] of others)
    lines.push(`${getPerson(w, id).givenName} inherits ${money(n)}.`);
  if (split.charity > 0) lines.push(`${money(split.charity)} goes to charity.`);

  const carriedAssets = assets.map((a) => carried(a, d.age, h.age));
  if (carriedAssets.length > 0 || d.holdings.length > 0)
    lines.push("Their property and investments pass to you.");
  w = updatePerson(w, heir, (x) => ({
    ...x,
    assets: [...x.assets, ...carriedAssets].sort((a, b) => a.id - b.id),
    loans: [...x.loans, ...toHeirLoans].sort((a, b) => a.id - b.id),
    holdings: [
      ...x.holdings.filter(
        (y) => !d.holdings.some((z) => z.kindId === y.kindId),
      ),
      ...d.holdings.map((z) =>
        mergedHolding(
          z,
          x.holdings.find((y) => y.kindId === z.kindId),
          d.age,
          h.age,
        ),
      ),
    ].sort((a, b) => (a.kindId < b.kindId ? -1 : a.kindId > b.kindId ? 1 : 0)),
  }));
  w = updatePerson(w, dead, (x) => ({
    ...x,
    money: 0,
    assets: [],
    loans: [],
    holdings: [],
  }));
  return { world: w, lines: lines.filter((l) => l !== ""), cash: atDeath };
}

/** The family role (`parent`, ...) a kinship id is held as; others are not re-seated. */
const SEAT: Readonly<
  Record<string, "parent" | "grandparent" | "sibling" | "child">
> = {
  parent: "parent",
  grandparent: "grandparent",
  sibling: "sibling",
  "half-sibling": "sibling",
  "step-sibling": "sibling",
  "adopted-sibling": "sibling",
  child: "child",
};

/** The full role id of a family role: the family's declared one, else a Pack role of that short name. */
function roleFor(
  idx: PackIndex,
  name: "parent" | "grandparent" | "sibling" | "child",
): string | undefined {
  const family = idx.family ?? DEFAULT_FAMILY;
  const declared =
    name === "parent"
      ? family.parent.role
      : name === "sibling"
        ? family.sibling.role
        : name;
  if (idx.roles.has(declared)) return declared;
  return [...idx.roles.keys()].sort().find((k) => k.endsWith(`/${declared}`));
}

/**
 * Role rows are the player's own (`from` the player), so the heir starts with none. Seat the
 * heir in the family: for each relative, a row in the family role their kinship to the heir
 * names (the other parent is a parent, the heir's siblings are siblings, the dead player is a
 * parent). Names and targets then follow from the heir's position; nothing is relabelled.
 */
function seatHeir(world: World, idx: PackIndex, heir: PersonId): World {
  let w = world;
  for (const k of kinOf(world, heir)) {
    const seat = SEAT[k.kin];
    const role = seat && roleFor(idx, seat);
    if (!role) continue;
    if (
      w.relationships.some(
        (r) => r.from === heir && r.to === k.id && r.role === role,
      )
    )
      continue;
    w = putRelationship(w, { from: heir, to: k.id, role, closeness: 50 });
  }
  return w;
}

/** Lineage entries survive a succession, except those bound to the dead player or to the heir. */
function handOffSchedule(world: World, dead: PersonId, heir: PersonId): World {
  const queue = scheduledEntries(world);
  const kept = queue.filter(
    (e) => e.lineage && e.person !== dead && e.person !== heir,
  );
  return kept.length === queue.length ? world : setScheduled(world, kept);
}

/** Queue each `trigger: succession` storylet (id order) to open at the next age-up. */
function queueSuccessionStorylets(world: World, idx: PackIndex): World {
  const opens = [...idx.storylets.values()]
    .filter((s) => s.trigger === "succession")
    .map((s) => s.id)
    .sort();
  if (opens.length === 0) return world;
  const queue = scheduledEntries(world);
  let seq = queue.reduce((n, e) => Math.max(n, e.seq), -1) + 1;
  const added: ScheduledEntry[] = [];
  for (const storyletId of opens) {
    if (queue.some((e) => e.storyletId === storyletId)) continue;
    added.push({ storyletId, wait: 0, left: 1, lineage: false, seq: seq++ });
  }
  return setScheduled(world, [...queue, ...added]);
}

/**
 * Continue the game as `heirId`, a living child of the dead player (`heirsOf`). Throws if the
 * life has not ended or the heir is not one of the player's living children.
 *
 * In order: the estate is settled (`settleEstate`); `world.deceased` records the dead player;
 * the generation index rises by one, so the heir's RNG streams differ from every earlier
 * generation's (`worldYear` is untouched); `storyletLog`, the roll-site counters, `uses`, the
 * reached milestones, the will, the journal, the open storylet and the dead player's mortal
 * schedule entries are cleared (`lineage: true` entries stay); the heir is seated in the
 * family; the `on_succession` hooks run for the heir; and every `trigger: succession`
 * storylet is queued for the next age-up. The finished life's obituary (`world.ended` before
 * the call) is the caller's to keep. The result's `lines` are the heir's first journal lines.
 */
export function succeed(
  world: World,
  bundles: readonly PackBundle[],
  heirId: PersonId,
): SimResult {
  const ended = world.ended;
  if (!ended) throw new Error("the life has not ended");
  if (heirId === world.playerId)
    throw new RangeError("the heir is already the player");
  if (!getPerson(world, heirId).alive)
    throw new RangeError(`heir ${heirId} is not alive`);
  if (!heirsOf(world).includes(heirId))
    throw new RangeError(`heir ${heirId} is not a living child of the player`);
  const idx = indexBundles(bundles);
  const dead = world.playerId;
  const deadPerson = getPerson(world, dead);
  const settled = settleEstate(world, idx, dead, heirId);
  const { journal: _old, deceased: _prev, ...rest } = settled.world;
  let w: World = {
    ...clearMilestones(clearWill(handOffSchedule(rest as World, dead, heirId))),
    playerId: heirId,
    generation: world.generation + 1,
    journal: [],
    ended: null,
    pending: null,
    storyletLog: {},
    rngCounters: {},
    uses: {},
    deceased: { person: dead, cause: ended.cause, money: settled.cash },
  };
  w = seatHeir(w, idx, heirId);
  const heir = getPerson(w, heirId);
  w = addJournalLine(
    w,
    heir.age,
    `${heir.givenName} ${heir.familyName} carries on after ${deadPerson.givenName} ${deadPerson.familyName} died at ${deadPerson.age}: ${ended.cause}.`,
  );
  for (const line of settled.lines) w = addJournalLine(w, heir.age, line);
  w = appendChoice(w, { t: "succeed", heir: heirId });
  w = queueSuccessionStorylets(runHook(w, idx, "on_succession"), idx);
  return { world: w, lines: w.journal.flatMap((e) => e.lines) };
}
