import { type Effect, type Expr, evaluate } from "../expr/index.ts";
import type { World } from "../state/types.ts";
import {
  addJournalLine,
  clamp,
  getPerson,
  putRelationship,
  setQuality,
  setStat,
  updatePerson,
} from "../state/world.ts";
import { makeEnv, qualityOf, type Scope } from "./env.ts";
import { livesWithParents, startLivingOnOwn } from "./living.ts";
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
      const delta = evalInt(e[2], w, idx, scope);
      const sign = e[0] === "sub" ? -1 : 1;
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
              closeness: clamp(r.closeness + sign * delta, 0, 100),
            });
        }
        return out;
      }
      if (target === "money")
        return updatePerson(w, who, (p) => ({
          ...p,
          money: p.money + sign * delta,
        }));
      if (target.startsWith("stat.")) {
        const id = target.slice(5);
        const cur = getPerson(w, who).stats[id] ?? 0;
        return setStat(w, who, id, e[0] === "set" ? delta : cur + sign * delta);
      }
      const id = target.slice(8);
      const decl = idx.qualities.get(id);
      if (!decl) throw new RangeError(`unknown quality '${id}'`);
      if (decl.type === "flag") {
        const v = evaluate(e[2], makeEnv(w, idx, scope));
        return setQuality(w, who, id, Boolean(v));
      }
      const cur = qualityOf(getPerson(w, who), idx, id) as number;
      let next = e[0] === "set" ? delta : cur + sign * delta;
      if (decl.min !== undefined) next = Math.max(decl.min, next);
      if (decl.max !== undefined) next = Math.min(decl.max, next);
      return setQuality(w, who, id, next);
    }
    case "spawn": {
      const role = str(e[1], w, idx, scope);
      const gen = str(e[2], w, idx, scope);
      const [w2, pid] = spawnPerson(w, idx, who, role, gen);
      bound.set(e[3], pid);
      return w2;
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
        case "grant_asset":
          return grantAsset(w, idx, who, str(args[0], w, idx, scope))[0];
        case "remove_asset": {
          const kind = str(args[0], w, idx, scope);
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
        case "journal":
          return addJournalLine(
            w,
            age,
            renderText(str(args[0], w, idx, scope), w, idx, scope),
          );
        case "die": {
          const cause = renderText(str(args[0], w, idx, scope), w, idx, scope);
          return scope.person !== undefined
            ? killPerson(w, scope.person, cause)
            : endLife(w, who, cause);
        }
      }
      throw new RangeError(`unknown effect '${e[1]}'`);
    }
  }
}
