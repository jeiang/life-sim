import { DEFAULT_REPEAT, type PackBundle, type RepeatCurve } from "@life/core";
import { type Dist, dist, pct } from "./dist.ts";
import type { ForcedReport } from "./force.ts";
import type { PackMetrics } from "./metrics.ts";
import {
  PackMetricsAggregate,
  type PackSection,
  renderPackSection,
} from "./pack-report.ts";
import type { Fault, LifeResult } from "./run.ts";

export type { Dist };
export { dist };

export interface Report {
  readonly lives: number;
  readonly profiles: Record<
    string,
    {
      lives: number;
      faults: number;
      deathAge: Dist | null;
      netWorth40: Dist | null;
    }
  >;
  readonly faults: {
    readonly total: number;
    readonly byKind: Record<string, number>;
    /** The first 50. */
    readonly first: readonly Fault[];
  };
  readonly storylets: {
    readonly total: number;
    readonly fired: Record<string, number>;
    /**
     * Resolved outcomes per storylet: `o<i>` (no choices) or `c<j>.o<i>` (outcome i of choice j),
     * 0-based in YAML order, to the times it was picked. Sorted by id, then key; a storylet or
     * outcome never picked is absent.
     */
    readonly outcomes: Record<string, Record<string, number>>;
    readonly top10: readonly { id: string; count: number }[];
    readonly neverFired: readonly string[];
    /** `chance: 0%` storylets reached only through `next`; never counted as dead content. */
    readonly chainStepsNeverFired: readonly string[];
  };
  readonly eventsPerYear: {
    readonly mean: number;
    readonly years: number;
    readonly distribution: Record<string, number>;
  };
  /** Choice events: event storylets that ask the player to pick (chain steps included). */
  readonly choices: {
    /** Choice events per life, all ages. */
    readonly perLife: Dist | null;
    /** Choice events per life from age 5 onward. */
    readonly perLifeFrom5: Dist | null;
    /** Years (age-ups to age 5 or later) with at least one choice event, per life. */
    readonly yearsWithChoiceFrom5: Dist | null;
    /** Of age-ups to age 5 or later: share with at least one choice event, percent. */
    readonly yearShareFrom5: number;
    /** Mean years between choice events from age 5 (years / events). */
    readonly yearsPerChoiceFrom5: number;
    /** Share of years with a choice event, percent, by life stage. */
    readonly yearShareByStage: Record<string, number>;
    /** Mean choice events per life, by profile. */
    readonly meanPerLifeByProfile: Record<string, number>;
  };
  /** Decision slots (Packs with `year.decisions`), over age-ups to age 5 or later. */
  readonly decisions: {
    readonly years: number;
    /** Percent of those years with at least 1, 2 and 3 decisions queued. */
    readonly atLeast1: number;
    readonly atLeast2: number;
    readonly atLeast3: number;
    /** Slots that fired with no eligible decision, and the percent of years with one. */
    readonly noEligible: number;
    readonly noEligibleYearShare: number;
    /** The same at-least shares by profile. */
    readonly byProfile: Record<
      string,
      { atLeast1: number; atLeast2: number; atLeast3: number }
    >;
    /**
     * Player decisions: opens of event storylets with choices, chained steps (reached only
     * through `next`) excluded, so what the decision slots and person decisions drew.
     */
    readonly total: number;
    /** Storylet id -> opens and percent (two decimals) of `total`, largest first. */
    readonly byStorylet: Record<string, { count: number; share: number }>;
  };
  /**
   * Repeatable actions (those used at least once): uses per year lived, and how the years
   * with at least one use were spread. A "binding" is one action on one person (or alone).
   */
  readonly repeats: {
    /** Age-ups over which `perYear` is taken. */
    readonly years: number;
    readonly byActivity: Record<
      string,
      {
        uses: number;
        /** Uses per age-up over all lives. */
        perYear: number;
        /** Binding-years with at least one use. */
        usedYears: number;
        /** Mean uses in a binding-year with any. */
        meanWhenUsed: number;
        maxInYear: number;
        /** Percent of used binding-years past the full-effect and the reduced range (11+, 21+ for the default curve). */
        pastFull: number;
        pastReduced: number;
      }
    >;
  };
  /**
   * Storylets tagged `wager` (the player risks money): plays, net money in minor units, the
   * stake (the worst single loss) and the realised return, `100 + 100 * mean net / stake`
   * percent (below 100 loses money).
   */
  readonly wagers: Record<
    string,
    { plays: number; net: number; stake: number; returnPct: number }
  >;
  /** Chance hits dropped by the yearly cap, by Pack id (Packs with none are omitted). */
  readonly capDrops: Record<string, number>;
  /**
   * Milestones and consequences per life: the share of lives that reached each milestone, the
   * milestone storylets opened per life, and the consequences still queued at the end of a life.
   */
  readonly consequences: {
    readonly milestones: Record<string, { lives: number; pct: number }>;
    readonly fired: Dist | null;
    readonly pending: Dist | null;
  };
  readonly death: {
    readonly ended: number;
    readonly unfinished: number;
    readonly age: Dist | null;
    readonly ageHistogram: Record<string, number>;
    readonly causes: Record<string, number>;
  };
  readonly netWorth: Record<"18" | "40" | "65", Dist | null>;
  readonly rates: {
    /** Of lives that reached 30. */
    readonly degree: number;
    /** Of person-years aged 25-64. */
    readonly employment: number;
    /** Of lives that reached 25. */
    readonly everEmployed: number;
    /** Of lives that reached 65. */
    readonly retirement: number;
  };
  readonly loans: {
    readonly opened: number;
    readonly defaulted: number;
    readonly defaultRate: number;
    readonly repossessions: number;
  };
  /** Persons per save: how many exist, how many run a career, and the serialized size. */
  readonly population: {
    readonly persons: Dist | null;
    /** Animals in the world; `persons` leaves them out. */
    readonly pets: Dist | null;
    readonly careers: Dist | null;
    readonly saveBytes: Dist | null;
  };
  /** Living situation: cities and moving out. */
  readonly housing: {
    /** Age at which living with parents first ended, over lives where it did. */
    readonly moveOutAge: Dist | null;
    /** Percent of lives reaching 18 that ever stopped living with their parents. */
    readonly movedOut: number;
    /** Percent of lives reaching 18 in which the parents asked the player to leave. */
    readonly kickedOut: number;
    /** Lives in which the player was put out of the house at 16-17. */
    readonly putOut: number;
    /** Percent of those put out who got no guardian (on their own with living costs). */
    readonly noGuardian: number;
    /** Percent of lives reaching 30 / 40 still living with their parents at that age. */
    readonly withParents30: number;
    readonly withParents40: number;
    readonly byProfile: Record<
      string,
      {
        movedOut: number;
        kickedOut: number;
        withParents30: number;
        withParents40: number;
      }
    >;
  };
  /** Standards of living (Packs with `standards`). */
  readonly living: {
    /** Standard ids, cheapest first. */
    readonly standards: readonly string[];
    /** Decade age -> share (percent) of lives at that age with parents, or at each standard. */
    readonly byAge: Record<string, Record<string, number>>;
    /** Percent of person-years aged 18+ spent on their own that were homeless. */
    readonly homelessYearShare: number;
    /** Percent of person-years aged 18+ spent on their own, among all years aged 18+. */
    readonly onOwnYearShare: number;
    /** The homeless share of own years, per profile. */
    readonly homelessByProfile: Record<string, number>;
    /**
     * Living cost as a percent of income by household shape, over person-years aged 25-64
     * with income, on their own (Packs with `living.household`).
     */
    readonly costShare: Record<string, Dist | null>;
  };
  /** Declared Pack metrics (`packs/<id>/harness/metrics.yaml`), one section per Pack that has any. */
  readonly packMetrics: Record<string, PackSection>;
  /** Decade ages: stat id -> age -> distribution. */
  readonly statsByAge: Record<string, Record<string, Dist | null>>;
  /** Decade ages: stat id -> age -> percent of living lives with the stat at 100. */
  readonly statsAt100: Record<string, Record<string, number>>;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The outcome tallies with ids and keys sorted, so the report does not depend on the order lives were added. */
function sortedOutcomes(
  t: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.keys(t)
      .sort(byKey)
      .map((id) => [
        id,
        Object.fromEntries(
          Object.entries(t[id] as Record<string, number>).sort((a, b) =>
            byKey(a[0], b[0]),
          ),
        ),
      ]),
  );
}

/** No storylet should take more than this percent of all player decisions. */
export const DECISION_SHARE_CAP = 3;

/** Storylets reached only through `next` and never rolled themselves. */
export function chainSteps(bundles: readonly PackBundle[]): Set<string> {
  const targets = new Set<string>();
  for (const b of bundles)
    for (const s of b.storylets) {
      for (const o of s.outcomes) if (o.next) targets.add(o.next);
      for (const c of s.choices)
        for (const o of c.outcomes) if (o.next) targets.add(o.next);
    }
  const out = new Set<string>();
  for (const b of bundles)
    for (const s of b.storylets)
      if (s.trigger === "event" && s.chance === 0 && targets.has(s.id))
        out.add(s.id);
  return out;
}

const DECADES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const STAGES: readonly (readonly [string, number, number])[] = [
  ["5-12", 5, 12],
  ["13-17", 13, 17],
  ["18-29", 18, 29],
  ["30-49", 30, 49],
  ["50-64", 50, 64],
  ["65+", 65, 200],
];

function homeShares(h: readonly number[] = []) {
  const n = (i: number): number => h[i] ?? 0;
  return {
    movedOut: pct(n(1), n(0)),
    kickedOut: pct(n(2), n(0)),
    withParents30: pct(n(4), n(3)),
    withParents40: pct(n(6), n(5)),
  };
}

export class Aggregate {
  private readonly choicePerLife: number[] = [];
  private readonly choicePerLife5: number[] = [];
  private readonly choiceYearsPerLife5: number[] = [];
  private choiceYears5 = 0;
  private decYears = 0;
  private readonly decAtLeast = [0, 0, 0];
  private decEmpty = 0;
  private decEmptyYears = 0;
  private readonly capDrops = new Map<string, number>();
  private readonly milestoneLives = new Map<string, number>();
  private readonly consequencesFired: number[] = [];
  private readonly consequencesPending: number[] = [];
  private readonly profileDec = new Map<string, number[]>();
  private choiceEvents5 = 0;
  private years5 = 0;
  private repeatYears = 0;
  private readonly repeatUse = new Map<
    string,
    { uses: number; years: number; max: number; full: number; reduced: number }
  >();
  private readonly wagerTotals = new Map<
    string,
    { plays: number; net: number; worst: number }
  >();
  private readonly stageYears: number[] = STAGES.map(() => 0);
  private readonly stageHit: number[] = STAGES.map(() => 0);
  private readonly profileChoice = new Map<string, number[]>();
  private readonly bundles: readonly PackBundle[];
  private lives = 0;
  private readonly packMetrics: PackMetricsAggregate;
  private readonly profile = new Map<
    string,
    { lives: number; faults: number; deathAges: number[]; nw40: number[] }
  >();
  private readonly faults: Fault[] = [];
  private faultTotal = 0;
  private readonly faultKinds: Record<string, number> = {};
  private readonly fires: Record<string, number> = {};
  private readonly outcomes: Record<string, Record<string, number>> = {};
  private readonly eventHist: Record<string, number> = {};
  private eventSum = 0;
  private eventYears = 0;
  private readonly deathAges: number[] = [];
  private readonly causes: Record<string, number> = {};
  private unfinished = 0;
  private readonly nw: Record<"18" | "40" | "65", number[]> = {
    "18": [],
    "40": [],
    "65": [],
  };
  private reached30 = 0;
  private degree = 0;
  private reached25 = 0;
  private everEmployed = 0;
  private reached65 = 0;
  private retired = 0;
  private workYears = 0;
  private workingYears = 0;
  private readonly persons: number[] = [];
  private readonly pets: number[] = [];
  private readonly careers: number[] = [];
  private readonly saveBytes: number[] = [];
  private loansOpened = 0;
  private loansDefaulted = 0;
  private repossessions = 0;
  private readonly stats = new Map<string, Map<number, number[]>>();
  private readonly moveOutAges: number[] = [];
  /** Decade age -> standard id (or "parents") -> lives. */
  private readonly standardAt = new Map<number, Map<string, number>>();
  private readonly profileOwn = new Map<string, [number, number]>();
  private ownYears = 0;
  private homelessYears = 0;
  private readonly shares: Record<string, number[]> = {};
  private adultYears = 0;
  /** Per profile (and "all"): [reached18, movedOut, kickedOut, reached30, with30, reached40, with40]. */
  private readonly home = new Map<string, number[]>();
  private putOutLives = 0;
  private noGuardianLives = 0;

  /** Effective repeat curve per repeatable action, to count years past it. */
  private readonly curves = new Map<string, RepeatCurve>();

  constructor(
    bundles: readonly PackBundle[],
    metrics: readonly PackMetrics[] = [],
  ) {
    this.bundles = bundles;
    this.packMetrics = new PackMetricsAggregate(metrics);
    const base = bundles.find((b) => b.repeat)?.repeat ?? DEFAULT_REPEAT;
    for (const b of bundles)
      for (const s of b.storylets)
        if (s.repeatable) this.curves.set(s.id, { ...base, ...s.repeat });
  }

  add(r: LifeResult): void {
    this.lives++;
    this.packMetrics.add(r);
    const pf = this.profile.get(r.profile) ?? {
      lives: 0,
      faults: 0,
      deathAges: [],
      nw40: [],
    };
    this.profile.set(r.profile, pf);
    pf.lives++;
    pf.faults += r.faults.length;
    for (const f of r.faults) {
      this.faultTotal++;
      this.faultKinds[f.kind] = (this.faultKinds[f.kind] ?? 0) + 1;
      if (this.faults.length < 50) this.faults.push(f);
    }
    for (const [id, n] of Object.entries(r.fires))
      this.fires[id] = (this.fires[id] ?? 0) + n;
    for (const [id, picks] of Object.entries(r.outcomes)) {
      const t = this.outcomes[id] ?? {};
      this.outcomes[id] = t;
      for (const [k, n] of Object.entries(picks)) t[k] = (t[k] ?? 0) + n;
    }
    {
      let all = 0;
      let from5 = 0;
      let years = 0;
      for (const y of r.yearChoices) {
        all += y.n;
        if (y.age < 5) continue;
        from5 += y.n;
        this.years5++;
        if (y.n > 0) years++;
        STAGES.forEach(([, lo, hi], i) => {
          if (y.age >= lo && y.age <= hi) {
            this.stageYears[i] = (this.stageYears[i] as number) + 1;
            if (y.n > 0) this.stageHit[i] = (this.stageHit[i] as number) + 1;
          }
        });
      }
      this.choicePerLife.push(all);
      this.choicePerLife5.push(from5);
      this.choiceYearsPerLife5.push(years);
      this.choiceYears5 += years;
      this.choiceEvents5 += from5;
      const list = this.profileChoice.get(r.profile) ?? [];
      this.profileChoice.set(r.profile, list);
      list.push(all);
    }
    for (const m of r.consequences.milestones)
      this.milestoneLives.set(m, (this.milestoneLives.get(m) ?? 0) + 1);
    this.consequencesFired.push(r.consequences.fired);
    this.consequencesPending.push(r.consequences.pending);
    for (const [pack, n] of Object.entries(r.capDrops))
      this.capDrops.set(pack, (this.capDrops.get(pack) ?? 0) + n);
    for (const y of r.yearDecisions) {
      if (y.age < 5) continue;
      const pd = this.profileDec.get(r.profile) ?? [0, 0, 0, 0];
      this.profileDec.set(r.profile, pd);
      pd[3] = (pd[3] as number) + 1;
      this.decYears++;
      for (let k = 0; k < 3; k++)
        if (y.queued > k) {
          this.decAtLeast[k] = (this.decAtLeast[k] as number) + 1;
          pd[k] = (pd[k] as number) + 1;
        }
      this.decEmpty += y.empty;
      if (y.empty > 0) this.decEmptyYears++;
    }
    for (const [id, t] of Object.entries(r.wagers)) {
      const a = this.wagerTotals.get(id) ?? { plays: 0, net: 0, worst: 0 };
      this.wagerTotals.set(id, {
        plays: a.plays + t.plays,
        net: a.net + t.net,
        worst: Math.min(a.worst, t.worst),
      });
    }
    for (const year of r.yearUses) {
      this.repeatYears++;
      for (const [k, n] of Object.entries(year)) {
        const id = k.split("#")[0] as string;
        const c = this.curves.get(id);
        const u = this.repeatUse.get(id) ?? {
          uses: 0,
          years: 0,
          max: 0,
          full: 0,
          reduced: 0,
        };
        this.repeatUse.set(id, u);
        u.uses += n;
        u.years++;
        u.max = Math.max(u.max, n);
        if (c && n > c.full) u.full++;
        if (c && n > c.reduced) u.reduced++;
      }
    }
    for (const n of r.yearEvents) {
      this.eventHist[String(n)] = (this.eventHist[String(n)] ?? 0) + 1;
      this.eventSum += n;
      this.eventYears++;
    }
    if (r.death) {
      this.deathAges.push(r.death.age);
      pf.deathAges.push(r.death.age);
      this.causes[r.death.cause] = (this.causes[r.death.cause] ?? 0) + 1;
    } else this.unfinished++;
    for (const s of r.samples) {
      for (const k of ["18", "40", "65"] as const)
        if (s.age === Number(k)) {
          this.nw[k].push(s.netWorth);
          if (k === "40") pf.nw40.push(s.netWorth);
        }
      if (s.age >= 25 && s.age <= 64) {
        this.workYears++;
        if (s.employed) this.workingYears++;
      }
      const hh = s.household;
      if (hh && hh.income > 0 && s.age >= 25 && s.age <= 64) {
        const add = (shape: string, cost: number): void => {
          const list = this.shares[shape] ?? [];
          this.shares[shape] = list;
          list.push(Math.round((Math.max(0, cost) / hh.income) * 1000) / 10);
        };
        add("alone", hh.cost);
        add("1 child", hh.cost + hh.child);
        add("2 children", hh.cost + 2 * hh.child);
        add("partner shares", hh.cost - hh.partner);
        add("2 children + partner shares", hh.cost + 2 * hh.child - hh.partner);
      }
      if (s.age >= 18) {
        this.adultYears++;
        if (!s.withParents) {
          this.ownYears++;
          const po = this.profileOwn.get(r.profile) ?? [0, 0];
          this.profileOwn.set(r.profile, po);
          po[0]++;
          if (s.standard?.endsWith("/homeless")) {
            this.homelessYears++;
            po[1]++;
          }
        }
      }
      if (s.age % 10 === 0) {
        const at = this.standardAt.get(s.age) ?? new Map<string, number>();
        this.standardAt.set(s.age, at);
        const key = s.withParents ? "parents" : (s.standard ?? "none");
        at.set(key, (at.get(key) ?? 0) + 1);
        for (const [id, v] of Object.entries(s.stats)) {
          let byAge = this.stats.get(id);
          if (!byAge) {
            byAge = new Map();
            this.stats.set(id, byAge);
          }
          const list = byAge.get(s.age) ?? [];
          byAge.set(s.age, list);
          list.push(v);
        }
      }
    }
    const top = r.samples.at(-1)?.age ?? 0;
    const reached = Math.max(top, r.death?.age ?? 0);
    if (reached >= 30) {
      this.reached30++;
      if (r.everDegree) this.degree++;
    }
    if (reached >= 25) {
      this.reached25++;
      if (r.everEmployed) this.everEmployed++;
    }
    if (reached >= 65) {
      this.reached65++;
      if (r.retired) this.retired++;
    }
    {
      const reachedAge = (a: number): boolean => reached >= a;
      const withAt = (a: number): boolean =>
        r.samples.some((s) => s.age === a && s.withParents);
      if (r.moveOutAge !== null) this.moveOutAges.push(r.moveOutAge);
      if (r.putOut) {
        this.putOutLives++;
        if (r.noGuardian) this.noGuardianLives++;
      }
      for (const key of ["all", r.profile]) {
        const h = this.home.get(key) ?? [0, 0, 0, 0, 0, 0, 0];
        this.home.set(key, h);
        const add = (i: number, yes: boolean): void => {
          if (yes) h[i] = (h[i] as number) + 1;
        };
        add(0, reachedAge(18));
        add(1, reachedAge(18) && r.moveOutAge !== null);
        add(2, reachedAge(18) && r.kickedOut);
        add(3, reachedAge(30));
        add(4, withAt(30));
        add(5, reachedAge(40));
        add(6, withAt(40));
      }
    }
    if (r.persons !== null) {
      this.persons.push(r.persons);
      this.pets.push(r.pets);
      this.careers.push(r.careers);
      this.saveBytes.push(r.saveBytes);
    }
    this.loansOpened += r.loansOpened;
    this.loansDefaulted += r.loansDefaulted;
    this.repossessions += r.repossessions;
  }

  report(): Report {
    const chain = chainSteps(this.bundles);
    const all = this.bundles.flatMap((b) => b.storylets.map((s) => s.id));
    const sorted = Object.entries(this.fires)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
    const never = all.filter((id) => !this.fires[id]);
    const decisionIds = new Set(
      this.bundles.flatMap((b) =>
        b.storylets
          .filter(
            (s) =>
              s.trigger === "event" && s.choices.length > 0 && !chain.has(s.id),
          )
          .map((s) => s.id),
      ),
    );
    const decided = sorted.filter((e) => decisionIds.has(e.id));
    const decisionTotal = decided.reduce((a, e) => a + e.count, 0);
    const ageHist: Record<string, number> = {};
    for (const a of this.deathAges) {
      const k = `${Math.floor(a / 10) * 10}s`;
      ageHist[k] = (ageHist[k] ?? 0) + 1;
    }
    const statsByAge: Report["statsByAge"] = {};
    const statsAt100: Report["statsAt100"] = {};
    for (const [id, byAge] of [...this.stats].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      const row: Record<string, Dist | null> = {};
      for (const a of DECADES)
        if (byAge.has(a)) row[String(a)] = dist(byAge.get(a) as number[]);
      statsByAge[id] = row;
      statsAt100[id] = Object.fromEntries(
        DECADES.filter((a) => byAge.has(a)).map((a) => {
          const v = byAge.get(a) as number[];
          return [String(a), pct(v.filter((x) => x >= 100).length, v.length)];
        }),
      );
    }
    const profiles: Report["profiles"] = {};
    for (const [name, p] of [...this.profile].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    ))
      profiles[name] = {
        lives: p.lives,
        faults: p.faults,
        deathAge: dist(p.deathAges),
        netWorth40: dist(p.nw40),
      };
    return {
      lives: this.lives,
      profiles,
      faults: {
        total: this.faultTotal,
        byKind: this.faultKinds,
        first: this.faults,
      },
      storylets: {
        total: all.length,
        fired: this.fires,
        outcomes: sortedOutcomes(this.outcomes),
        top10: sorted.slice(0, 10),
        neverFired: never.filter((id) => !chain.has(id)),
        chainStepsNeverFired: never.filter((id) => chain.has(id)),
      },
      eventsPerYear: {
        mean:
          this.eventYears === 0
            ? 0
            : Math.round((this.eventSum / this.eventYears) * 100) / 100,
        years: this.eventYears,
        distribution: this.eventHist,
      },
      choices: {
        perLife: dist(this.choicePerLife),
        perLifeFrom5: dist(this.choicePerLife5),
        yearsWithChoiceFrom5: dist(this.choiceYearsPerLife5),
        yearShareFrom5: pct(this.choiceYears5, this.years5),
        yearsPerChoiceFrom5:
          this.choiceEvents5 === 0
            ? 0
            : Math.round((this.years5 / this.choiceEvents5) * 100) / 100,
        yearShareByStage: Object.fromEntries(
          STAGES.map(([name], i) => [
            name,
            pct(this.stageHit[i] as number, this.stageYears[i] as number),
          ]),
        ),
        meanPerLifeByProfile: Object.fromEntries(
          [...this.profileChoice]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([k, v]) => [
              k,
              Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100,
            ]),
        ),
      },
      decisions: {
        years: this.decYears,
        atLeast1: pct(this.decAtLeast[0] as number, this.decYears),
        atLeast2: pct(this.decAtLeast[1] as number, this.decYears),
        atLeast3: pct(this.decAtLeast[2] as number, this.decYears),
        noEligible: this.decEmpty,
        noEligibleYearShare: pct(this.decEmptyYears, this.decYears),
        byProfile: Object.fromEntries(
          [...this.profileDec]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([k, v]) => [
              k,
              {
                atLeast1: pct(v[0] as number, v[3] as number),
                atLeast2: pct(v[1] as number, v[3] as number),
                atLeast3: pct(v[2] as number, v[3] as number),
              },
            ]),
        ),
        total: decisionTotal,
        byStorylet: Object.fromEntries(
          decided.map((e) => [
            e.id,
            {
              count: e.count,
              share: Math.round((e.count / decisionTotal) * 10000) / 100,
            },
          ]),
        ),
      },
      repeats: {
        years: this.repeatYears,
        byActivity: Object.fromEntries(
          [...this.repeatUse]
            .sort((a, b) => b[1].uses - a[1].uses || (a[0] < b[0] ? -1 : 1))
            .map(([id, u]) => [
              id,
              {
                uses: u.uses,
                perYear:
                  Math.round((u.uses / Math.max(1, this.repeatYears)) * 1000) /
                  1000,
                usedYears: u.years,
                meanWhenUsed: Math.round((u.uses / u.years) * 100) / 100,
                maxInYear: u.max,
                pastFull: pct(u.full, u.years),
                pastReduced: pct(u.reduced, u.years),
              },
            ]),
        ),
      },
      wagers: Object.fromEntries(
        [...this.wagerTotals]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([id, t]) => {
            const stake = -t.worst;
            return [
              id,
              {
                plays: t.plays,
                net: t.net,
                stake,
                returnPct:
                  stake > 0
                    ? Math.round((100 + (100 * t.net) / t.plays / stake) * 10) /
                      10
                    : 100,
              },
            ];
          }),
      ),
      capDrops: Object.fromEntries(
        [...this.capDrops].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      ),
      consequences: {
        milestones: Object.fromEntries(
          [...this.milestoneLives]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([id, lives]) => [id, { lives, pct: pct(lives, this.lives) }]),
        ),
        fired: dist(this.consequencesFired),
        pending: dist(this.consequencesPending),
      },
      death: {
        ended: this.deathAges.length,
        unfinished: this.unfinished,
        age: dist(this.deathAges),
        ageHistogram: ageHist,
        causes: Object.fromEntries(
          Object.entries(this.causes).sort(
            (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
          ),
        ),
      },
      netWorth: {
        "18": dist(this.nw["18"]),
        "40": dist(this.nw["40"]),
        "65": dist(this.nw["65"]),
      },
      rates: {
        degree: pct(this.degree, this.reached30),
        employment: pct(this.workingYears, this.workYears),
        everEmployed: pct(this.everEmployed, this.reached25),
        retirement: pct(this.retired, this.reached65),
      },
      loans: {
        opened: this.loansOpened,
        defaulted: this.loansDefaulted,
        defaultRate: pct(this.loansDefaulted, this.loansOpened),
        repossessions: this.repossessions,
      },
      population: {
        persons: dist(this.persons),
        pets: dist(this.pets),
        careers: dist(this.careers),
        saveBytes: dist(this.saveBytes),
      },
      housing: {
        moveOutAge: dist(this.moveOutAges),
        putOut: this.putOutLives,
        noGuardian: pct(this.noGuardianLives, this.putOutLives),
        ...homeShares(this.home.get("all")),
        byProfile: Object.fromEntries(
          [...this.home]
            .filter(([k]) => k !== "all")
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([k, v]) => [k, homeShares(v)]),
        ),
      },
      living: {
        standards: this.bundles
          .flatMap((b) => b.standards)
          .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))
          .map((s) => s.id),
        byAge: Object.fromEntries(
          [...this.standardAt]
            .sort((a, b) => a[0] - b[0])
            .map(([age, m]) => {
              const total = [...m.values()].reduce((n, x) => n + x, 0);
              return [
                String(age),
                Object.fromEntries(
                  [...m].sort().map(([k, n]) => [k, pct(n, total)]),
                ),
              ];
            }),
        ),
        homelessYearShare: pct(this.homelessYears, this.ownYears),
        onOwnYearShare: pct(this.ownYears, this.adultYears),
        homelessByProfile: Object.fromEntries(
          [...this.profileOwn]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([k, v]) => [k, pct(v[1], v[0])]),
        ),
        costShare: Object.fromEntries(
          Object.entries(this.shares).map(([k, v]) => [k, dist(v)]),
        ),
      },
      packMetrics: this.packMetrics.report(),
      statsByAge,
      statsAt100,
    };
  }
}

const dRow = (label: string, d: Dist | null): string =>
  d
    ? `| ${label} | ${d.n} | ${d.mean} | ${d.min} | ${d.p10} | ${d.p50} | ${d.p90} | ${d.max} |`
    : `| ${label} | 0 | | | | | | |`;
const DHEAD =
  "| | n | mean | min | p10 | p50 | p90 | max |\n|---|---|---|---|---|---|---|---|";
const money = (d: Dist | null, f: (n: number) => number): Dist | null =>
  d && {
    ...d,
    mean: f(d.mean),
    min: f(d.min),
    p10: f(d.p10),
    p50: f(d.p50),
    p90: f(d.p90),
    p99: f(d.p99),
    max: f(d.max),
  };
const major = (n: number): number => Math.round(n / 100);

export function renderMarkdown(
  r: Report,
  meta: {
    seed: number;
    profiles: readonly string[];
    forced?: ForcedReport | undefined;
  },
): string {
  const L: string[] = [];
  L.push("# Balance harness report", "");
  if (meta.forced)
    L.push(
      "> **FORCED RUN**: rolls, choices or actions below were forced. These lives are not an unbiased sample and are not replayable from a choice log.",
      "",
    );
  L.push(
    `Lives: ${r.lives} · profiles: ${meta.profiles.join(", ")} · base seed: ${meta.seed} · faults: **${r.faults.total}**`,
    "",
  );
  if (meta.forced) {
    L.push(
      `## Forced${meta.forced.script ? `: ${meta.forced.script}` : ""}`,
      "",
      "| Forced | Fires | Lives |",
      "|---|---|---|",
    );
    for (const e of meta.forced.entries)
      L.push(`| ${e.label} | ${e.fires} | ${e.lives} |`);
    L.push("");
    if (meta.forced.neverMatched.length > 0)
      L.push(
        `**Never matched (failure):** ${meta.forced.neverMatched.join("; ")}`,
        "",
      );
  }
  L.push("## Population per save", "");
  L.push("| | p50 | p99 | max |", "|---|---|---|---|");
  for (const [label, d] of [
    ["persons (animals excluded)", r.population.persons],
    ["pets", r.population.pets],
    ["persons with careers", r.population.careers],
    ["save bytes", r.population.saveBytes],
  ] as const)
    L.push(
      `| ${label} | ${d?.p50 ?? "-"} | ${d?.p99 ?? "-"} | ${d?.max ?? "-"} |`,
    );
  L.push("");
  L.push("## Faults", "");
  if (r.faults.total === 0) L.push("None.", "");
  else {
    L.push(
      Object.entries(r.faults.byKind)
        .map(([k, n]) => `${k}: ${n}`)
        .join(" · "),
      "",
    );
    L.push(
      "| kind | profile | life seed | age | message |",
      "|---|---|---|---|---|",
    );
    for (const f of r.faults.first)
      L.push(
        `| ${f.kind} | ${f.profile} | ${f.seed} | ${f.age} | ${f.message.replaceAll("|", "\\|")} |`,
      );
    L.push(
      "",
      "Replay one: `pnpm harness --profile <profile> --life-seed <life seed>`",
      "",
    );
  }
  L.push(
    "## Profiles",
    "",
    "| profile | lives | faults | median age at death | median net worth at 40 (major units) |",
    "|---|---|---|---|---|",
  );
  for (const [k, p] of Object.entries(r.profiles))
    L.push(
      `| ${k} | ${p.lives} | ${p.faults} | ${p.deathAge?.p50 ?? "-"} | ${p.netWorth40 ? major(p.netWorth40.p50) : "-"} |`,
    );
  L.push(
    "",
    "## Storylets",
    "",
    `${r.storylets.total} storylets; ${Object.keys(r.storylets.fired).length} fired at least once.`,
    "",
  );
  L.push("Top 10:", "", "| storylet | fired |", "|---|---|");
  for (const t of r.storylets.top10) L.push(`| ${t.id} | ${t.count} |`);
  L.push(
    "",
    `Never fired (${r.storylets.neverFired.length}): ${r.storylets.neverFired.join(", ") || "none"}`,
    "",
  );
  L.push(
    `Chain steps never reached (\`chance: 0%\`, only via \`next\`) (${r.storylets.chainStepsNeverFired.length}): ${r.storylets.chainStepsNeverFired.join(", ") || "none"}`,
    "",
  );
  L.push(
    "## Events per year",
    "",
    `Mean ${r.eventsPerYear.mean} over ${r.eventsPerYear.years} age-ups.`,
    "",
    "| events | age-ups |",
    "|---|---|",
  );
  for (const [k, n] of Object.entries(r.eventsPerYear.distribution).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  ))
    L.push(`| ${k} | ${n} |`);
  L.push(
    "",
    "## Decision slots",
    "",
    `Over ${r.decisions.years} age-ups to age 5 or later, years with at least 1 / 2 / 3 decisions: ${r.decisions.atLeast1}% / ${r.decisions.atLeast2}% / ${r.decisions.atLeast3}%.`,
    "",
    `Slots that fired with no eligible decision: ${r.decisions.noEligible} (${r.decisions.noEligibleYearShare}% of years).`,
    "",
    "| profile | at least 1 | at least 2 | at least 3 |",
    "|---|---|---|---|",
  );
  for (const [k, v] of Object.entries(r.decisions.byProfile))
    L.push(`| ${k} | ${v.atLeast1}% | ${v.atLeast2}% | ${v.atLeast3}% |`);
  const byShare = Object.entries(r.decisions.byStorylet);
  L.push(
    "",
    `Share of the ${r.decisions.total} player decisions, by storylet (rule: none over ${DECISION_SHARE_CAP}%).`,
    "",
  );
  if (byShare.length === 0) L.push("No decision fired.");
  else {
    L.push("| storylet | decisions | share |", "|---|---|---|");
    for (const [id, v] of byShare)
      L.push(
        `| ${id} | ${v.count} | ${v.share}%${v.share > DECISION_SHARE_CAP ? " (over)" : ""} |`,
      );
  }
  L.push("", "## Milestones and consequences", "");
  const reached = Object.entries(r.consequences.milestones);
  if (reached.length === 0) L.push("No milestone was reached.", "");
  else {
    L.push("| milestone | lives | share |", "|---|---|---|");
    for (const [k, v] of reached) L.push(`| ${k} | ${v.lives} | ${v.pct}% |`);
    L.push("");
  }
  L.push(
    DHEAD,
    dRow("milestone storylets opened per life", r.consequences.fired),
    dRow("consequences still pending at the end", r.consequences.pending),
  );
  L.push("", "## Chance events dropped by the yearly cap", "");
  const drops = Object.entries(r.capDrops);
  if (drops.length === 0) L.push("None.");
  else {
    L.push("| pack | dropped |", "|---|---|");
    for (const [k, n] of drops) L.push(`| ${k} | ${n} |`);
  }
  L.push(
    "",
    "## Choice events",
    "",
    `${r.choices.yearShareFrom5}% of years from age 5 on had at least one choice event (one every ${r.choices.yearsPerChoiceFrom5} years).`,
    "",
    DHEAD,
    dRow("choice events per life", r.choices.perLife),
    dRow("choice events per life, age 5+", r.choices.perLifeFrom5),
    dRow("years with a choice, age 5+", r.choices.yearsWithChoiceFrom5),
    "",
    "| life stage | years with a choice |",
    "|---|---|",
  );
  for (const [k, v] of Object.entries(r.choices.yearShareByStage))
    L.push(`| ${k} | ${v}% |`);
  L.push(
    "",
    `Mean choice events per life by profile: ${Object.entries(
      r.choices.meanPerLifeByProfile,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );
  L.push(
    "",
    "## Repeated activities",
    "",
    `Uses of repeatable actions over ${r.repeats.years} age-ups. A binding-year is one action (on one person) in one year.`,
    "",
    "| activity | uses | uses per year | binding-years used | mean uses when used | max in a year | past full | past reduced |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const [id, u] of Object.entries(r.repeats.byActivity))
    L.push(
      `| ${id} | ${u.uses} | ${u.perYear} | ${u.usedYears} | ${u.meanWhenUsed} | ${u.maxInYear} | ${u.pastFull}% | ${u.pastReduced}% |`,
    );
  if (Object.keys(r.wagers).length > 0) {
    L.push(
      "",
      "## Wagers",
      "",
      "Storylets tagged `wager`; a play is an outcome that changed the player's money. Return is 100% plus the mean net change over the stake (the worst single loss); below 100% the player loses money on average.",
      "",
      "| storylet | plays | net (major units) | stake (major units) | realised return |",
      "|---|---|---|---|---|",
    );
    for (const [id, t] of Object.entries(r.wagers))
      L.push(
        `| ${id} | ${t.plays} | ${major(t.net)} | ${major(t.stake)} | ${t.returnPct}% |`,
      );
  }
  L.push(
    "",
    "## Death",
    "",
    `${r.death.ended} lives ended, ${r.death.unfinished} unfinished.`,
    "",
    DHEAD,
    dRow("age at death", r.death.age),
    "",
  );
  L.push("| decade | deaths |", "|---|---|");
  for (const [k, n] of Object.entries(r.death.ageHistogram).sort(
    (a, b) => parseInt(a[0], 10) - parseInt(b[0], 10),
  ))
    L.push(`| ${k} | ${n} |`);
  L.push("", "| cause | deaths |", "|---|---|");
  for (const [k, n] of Object.entries(r.death.causes))
    L.push(`| ${k} | ${n} |`);
  L.push("", "## Net worth (major currency units)", "", DHEAD);
  for (const k of ["18", "40", "65"] as const)
    L.push(dRow(`age ${k}`, money(r.netWorth[k], major)));
  L.push(
    "",
    "## Rates",
    "",
    `- Degree: ${r.rates.degree}% of lives reaching 30`,
    `- Employment: ${r.rates.employment}% of person-years aged 25-64`,
    `- Ever employed: ${r.rates.everEmployed}% of lives reaching 25`,
    `- Retirement: ${r.rates.retirement}% of lives reaching 65`,
    "",
  );
  L.push(
    "## Loans",
    "",
    `- Opened: ${r.loans.opened}`,
    `- Defaulted (a payment missed): ${r.loans.defaulted} (${r.loans.defaultRate}%)`,
    `- Repossessions: ${r.loans.repossessions}`,
    "",
  );
  const hs = r.housing;
  L.push(
    "## Housing",
    "",
    DHEAD,
    dRow("age at moving out", hs.moveOutAge),
    "",
    "| | moved out | kicked out | with parents at 30 | with parents at 40 |",
    "|---|---|---|---|---|",
    `| all | ${hs.movedOut}% | ${hs.kickedOut}% | ${hs.withParents30}% | ${hs.withParents40}% |`,
  );
  for (const [k, v] of Object.entries(hs.byProfile))
    L.push(
      `| ${k} | ${v.movedOut}% | ${v.kickedOut}% | ${v.withParents30}% | ${v.withParents40}% |`,
    );
  L.push(
    "",
    "Moved out and kicked out are shares of lives reaching 18; with parents is the share of lives reaching that age.",
    "",
    `Put out at 16-17: ${hs.putOut} lives; ${hs.noGuardian}% of them got no guardian.`,
    "",
  );
  const lv = r.living;
  if (lv.standards.length > 0) {
    const cols = ["parents", ...lv.standards, "none"];
    const short = (id: string): string => id.split("/").pop() ?? id;
    L.push(
      "## Living standards",
      "",
      `Homeless: ${lv.homelessYearShare}% of years lived on their own (aged 18+); by profile ${Object.entries(
        lv.homelessByProfile,
      )
        .map(([k, v]) => `${k} ${v}%`)
        .join(" · ")}. On their own: ${lv.onOwnYearShare}% of years aged 18+.`,
      "",
      `| age | ${cols.map(short).join(" | ")} |`,
      `|---|${cols.map(() => "---").join("|")}|`,
    );
    for (const [age, row] of Object.entries(lv.byAge))
      L.push(`| ${age} | ${cols.map((c) => `${row[c] ?? 0}%`).join(" | ")} |`);
    L.push(
      "",
      "Each row is the share of lives at that age, with parents or at each standard.",
      "",
    );
    const shapes = Object.entries(lv.costShare);
    if (shapes.length > 0) {
      L.push(
        "### Living cost share of income by household shape",
        "",
        "Percent of income, person-years aged 25-64 on their own with income. The bots have no children or partners, so the extra terms are applied to their own years: a child at home adds the dependent cost, a partner who moved in pays their share of the standard.",
        "",
        DHEAD,
      );
      for (const [shape, d] of shapes) L.push(dRow(shape, d));
      L.push("");
    }
  }
  for (const sec of Object.values(r.packMetrics))
    L.push(...renderPackSection(sec), "");
  L.push(
    "## Stats at 100",
    "",
    "Percent of living lives with the stat at its cap, by decade age.",
    "",
  );
  for (const [id, row] of Object.entries(r.statsAt100))
    L.push(
      `- ${id}: ${Object.entries(row)
        .map(([a, v]) => `${a}: ${v}%`)
        .join(", ")}`,
    );
  L.push("", "## Stats by age", "");
  for (const [id, row] of Object.entries(r.statsByAge)) {
    L.push(`### ${id}`, "", DHEAD);
    for (const [a, d] of Object.entries(row)) L.push(dRow(`age ${a}`, d));
    L.push("");
  }
  return L.join("\n");
}
