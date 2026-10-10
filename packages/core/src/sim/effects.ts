import { type Effect, type Expr, evaluate } from "../expr/index.ts";
import {
  cellValue,
  clampDecl,
  counterValue,
  setCell,
  setCounter,
} from "../state/containers.ts";
import type { World } from "../state/types.ts";
import {
  addJournalLine,
  addMoney,
  clamp,
  getPerson,
  putRelationship,
  setQuality,
  setStat,
  updatePerson,
} from "../state/world.ts";
import { enterRole } from "./careers.ts";
import { makeEnv, qualityOf, type Scope, tableRef } from "./env.ts";
import { runHook } from "./hooks.ts";
import { livesWithParents, startLivingOnOwn } from "./living.ts";
import { grantUnit, removeHolding, tradeHolding } from "./market.ts";
import {
  dropAsset,
  endLife,
  endOccupation,
  evalInt,
  grantAsset,
  killPerson,
  openLoan,
  spawnPerson,
  startOccupation,
} from "./ops.ts";
import type { PackIndex } from "./pack-index.ts";
import { scheduleEffect, unschedule } from "./schedule.ts";
import { renderText } from "./text.ts";

/**
 * Run an outcome's effects in order against the closed Core set (ADR 0002). Effects act on
 * the subject (the player), except `die` in `scope: person`, which kills that person.
 * Stops as soon as the player dies. `bound` collects `spawn_person(...) as <name>`.
 */
export function applyEffects(
  world: World,
  idx: PackIndex,
  effects: readonly Effect[],
  scope: Scope,
  bound: Map<string, number>,
): World {
  let w = world;
  for (const e of effects) {
    if (w.ended) break;
    w = applyEffect(w, idx, e, { ...scope, bound }, bound);
  }
  return w;
}

function str(
  e: Expr | undefined,
  w: World,
  idx: PackIndex,
  scope: Scope,
): string {
  if (e === undefined) throw new RangeError("missing effect argument");
  return String(evaluate(e, makeEnv(w, idx, scope)));
}

/** Replace every role row `from` holds toward `to` with one `role` row at the highest closeness. */
function setRole(
  w: World,
  idx: PackIndex,
  from: number,
  to: number,
  role: string,
): World {
  const rows = w.relationships.filter((r) => r.from === from && r.to === to);
  if (rows.length === 0) return w;
  const closeness = Math.max(...rows.map((r) => r.closeness));
  // The household state (together, merged money) belongs to the pair, not to the role.
  const household = rows.some((r) => r.household === "merged")
    ? "merged"
    : rows.find((r) => r.household)?.household;
  const next = putRelationship(
    { ...w, relationships: w.relationships.filter((r) => !rows.includes(r)) },
    { from, to, role, closeness, ...(household ? { household } : {}) },
  );
  return from === w.playerId ? enterRole(next, idx, to, role) : next;
}

function applyEffect(
  w: World,
  idx: PackIndex,
  e: Effect,
  scope: Scope,
  bound: Map<string, number>,
): World {
  const who = scope.subject;
  const age = getPerson(w, who).age;
  switch (e[0]) {
    case "set":
    case "add":
    case "sub": {
      const target = e[1];
      if (typeof target !== "string" && target[2] === "role") {
        const pid =
          bound.get(target[1]) ??
          (target[1] === "person" ? scope.person : undefined);
        const role = str(e[2], w, idx, scope);
        if (!idx.roles.has(role))
          throw new RangeError(`unknown role '${role}'`);
        return pid === undefined ? w : setRole(w, idx, who, pid, role);
      }
      const delta = evalInt(e[2], w, idx, scope);
      const sign = e[0] === "sub" ? -1 : 1;
      // Diminishing returns (repeatable actions): only positive stat and closeness deltas shrink.
      const gain = (): number => {
        const d = sign * delta;
        return d > 0 && scope.factorBp !== undefined
          ? Math.trunc((d * scope.factorBp) / 10000)
          : d;
      };
      if (typeof target !== "string") {
        const pid =
          bound.get(target[1]) ??
          (target[1] === "person" ? scope.person : undefined);
        if (pid === undefined) return w;
        let out = w;
        for (const r of w.relationships) {
          if (r.from === who && r.to === pid)
            out = putRelationship(out, {
              ...r,
              closeness: clamp(r.closeness + gain(), 0, 100),
            });
        }
        return out;
      }
      if (target === "person.money")
        return scope.person === undefined
          ? w
          : addMoney(w, scope.person, sign * delta);
      if (target === "money")
        return updatePerson(w, who, (p) => ({
          ...p,
          money: p.money + sign * delta,
        }));
      if (target.startsWith("stat.")) {
        const id = target.slice(5);
        const cur = getPerson(w, who).stats[id] ?? 0;
        return setStat(w, who, id, e[0] === "set" ? delta : cur + gain());
      }
      return assignState(w, idx, e, target, delta, sign, scope, bound);
    }
    case "spawn": {
      const role = str(e[1], w, idx, scope);
      const gen = str(e[2], w, idx, scope);
      const [w2, pid] = spawnPerson(
        w,
        idx,
        who,
        role,
        gen,
        scope.purpose === undefined ? {} : { purpose: scope.purpose },
      );
      bound.set(e[3], pid);
      return who === w2.playerId ? enterRole(w2, idx, pid, role) : w2;
    }
    case "do": {
      const args = e.slice(2) as Expr[];
      switch (e[1]) {
        case "take_loan": {
          const kind = idx.loans.get(str(args[0], w, idx, scope));
          if (!kind) throw new RangeError("unknown loan kind");
          const principal = evalInt(args[1] as Expr, w, idx, scope);
          if (principal <= 0) return w;
          return openLoan(w, who, {
            kindId: kind.id,
            principal,
            rateBp: kind.rateBp,
            termYears: kind.termYears,
          })[0];
        }
        case "trade":
          return tradeHolding(
            w,
            idx,
            who,
            str(args[0], w, idx, scope),
            evalInt(args[1] as Expr, w, idx, scope),
          )[0];
        case "grant_asset": {
          const kind = str(args[0], w, idx, scope);
          return idx.markets.has(kind)
            ? grantUnit(w, idx, who, kind)
            : grantAsset(w, idx, who, kind)[0];
        }
        case "remove_asset": {
          const kind = str(args[0], w, idx, scope);
          if (idx.markets.has(kind)) return removeHolding(w, who, kind);
          const a = getPerson(w, who).assets.find((x) => x.kindId === kind);
          return a ? dropAsset(w, who, a.id) : w;
        }
        case "start_occupation":
          return startOccupation(w, idx, who, str(args[0], w, idx, scope));
        case "end_occupation": {
          const kind = str(args[0], w, idx, scope);
          const o = getPerson(w, who).occupations.find(
            (x) => x.kindId === kind,
          );
          return o ? endOccupation(w, who, o.id) : w;
        }
        case "move_to": {
          const city = str(args[0], w, idx, scope);
          if (!idx.cities.has(city)) throw new RangeError("unknown city");
          return updatePerson(w, who, (p) => ({ ...p, cityId: city }));
        }
        case "move_out":
          return startLivingOnOwn(w, idx, who);
        case "move_in":
        case "merge_money": {
          const pid = scope.person;
          const h = idx.living?.household;
          const rel = w.relationships.find(
            (r) => r.from === who && r.to === pid && r.role === h?.partnerRole,
          );
          if (!rel || !h) return w;
          if (e[1] === "move_in")
            return rel.household === "merged"
              ? w
              : putRelationship(w, { ...rel, household: "together" });
          const partner = getPerson(w, rel.to);
          const moved = Math.max(0, partner.money);
          return putRelationship(
            updatePerson(
              updatePerson(w, rel.to, (x) => ({
                ...x,
                money: x.money - moved,
              })),
              who,
              (x) => ({ ...x, money: x.money + moved }),
            ),
            { ...rel, household: "merged" },
          );
        }
        case "set_standard": {
          const id = str(args[0], w, idx, scope);
          if (!idx.standardsById.has(id))
            throw new RangeError("unknown standard");
          return livesWithParents(getPerson(w, who))
            ? w
            : updatePerson(w, who, (p) => ({
                ...p,
                standardId: id,
                livedStandardId: id,
              }));
        }
        case "schedule":
          return scheduleEffect(
            w,
            idx,
            scope,
            bound,
            args[0] as Expr,
            args[1] as number,
            args[2] as number,
            args[3] as Expr | boolean,
            args[4] as boolean,
          );
        case "unschedule":
          return unschedule(w, str(args[0], w, idx, scope));
        case "journal":
          return addJournalLine(
            w,
            age,
            renderText(str(args[0], w, idx, scope), w, idx, scope),
          );
        case "die": {
          const cause = renderText(str(args[0], w, idx, scope), w, idx, scope);
          if (scope.person !== undefined)
            return killPerson(w, scope.person, cause);
          return runHook(endLife(w, who, cause), idx, "on_death");
        }
      }
      throw new RangeError(`unknown effect '${e[1]}'`);
    }
  }
}

/**
 * Assign a quality, world counter or table cell. A target is `quality.<id>` / `table.<id>.<key>`
 * on the subject, `world.<id>` on the world, or `quality.…` / `table.…` behind `person.` or a
 * bound person's name; with no such person in scope the effect does nothing.
 */
function assignState(
  w: World,
  idx: PackIndex,
  e: Effect,
  target: string,
  delta: number,
  sign: 1 | -1,
  scope: Scope,
  bound: Map<string, number>,
): World {
  const dot = target.indexOf(".");
  const root = target.slice(0, dot);
  const next = (cur: number): number =>
    e[0] === "set" ? delta : cur + sign * delta;
  if (root === "world") {
    const decl = idx.state.get(target.slice(dot + 1));
    if (decl?.kind !== "counter")
      throw new RangeError(`unknown world counter '${target}'`);
    if (decl.type === "flag") {
      const v = evaluate(e[2] as Expr, makeEnv(w, idx, scope));
      return setCounter(w, decl, Boolean(v));
    }
    return setCounter(w, decl, next(counterValue(w, decl) as number));
  }
  let pid = scope.subject;
  let rest = target;
  if (root !== "quality" && root !== "table") {
    const bp =
      bound.get(root) ?? (root === "person" ? scope.person : undefined);
    if (bp === undefined) return w;
    pid = bp;
    rest = target.slice(dot + 1);
  }
  const person = getPerson(w, pid);
  if (rest.startsWith("table.")) {
    const [decl, key] = tableRef(idx, rest.slice(6));
    return setCell(w, pid, decl, key, next(cellValue(person, decl, key)));
  }
  const id = rest.slice(8);
  const decl = idx.qualities.get(id);
  if (!decl) throw new RangeError(`unknown quality '${id}'`);
  if (decl.type === "flag") {
    const v = evaluate(e[2] as Expr, makeEnv(w, idx, scope));
    return setQuality(w, pid, id, Boolean(v));
  }
  return setQuality(
    w,
    pid,
    id,
    clampDecl(decl, next(qualityOf(person, idx, id) as number)),
  );
}
