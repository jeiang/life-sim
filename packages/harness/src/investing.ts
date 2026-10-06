import {
  getPerson,
  indexBundles,
  type PackBundle,
  unitsValue,
  type World,
} from "@life/core";
import type { LifeResult } from "./run.ts";

/** Pack id of the Investing pack; its section appears in the report only when it is loaded. */
export const INVESTING_PACK = "investing";
/** A year's return at or below this (-20%) counts as a crash year. */
const CRASH_RETURN = -0.2;
/** A year's growth multiple never counts below this, so a total loss keeps the log finite. */
const FLOOR = 0.01;
/** Net worth is compared at these ages. */
const AGES = [40, 65] as const;

/** One market kind over the world years a life lived through. */
export interface KindYears {
  years: number;
  /** Sum of yearly returns (fractions) and of ln(growth), for the mean and the annualised return. */
  sum: number;
  logSum: number;
  crashes: number;
  delisted: number;
  defaults: number;
}

/** Tips followed by the return of the tipped kind in the next settlement. */
export interface TipYears {
  n: number;
  /** Sum of the tipped kinds' returns (fractions). */
  sum: number;
  /** Tips whose kind rose (an insider tip: rose 20% or more). */
  hits: number;
}

/** What one life saw of the market and what its player held (collected during the run). */
export interface InvestLife {
  readonly kinds: Readonly<Record<string, KindYears>>;
  /** Years the player held something, with the sum of ln(value growth incl. coupons and maturities). */
  readonly heldYears: number;
  readonly heldLogSum: number;
  readonly everHeld: boolean;
  /** Tips (the three sources) and insider tips offered, with how the tipped kinds did the next year. */
  readonly tips: Readonly<TipYears>;
  readonly insiderTips: Readonly<TipYears>;
  /** Years observed and the sum of the mean return of all tippable kinds each year. */
  readonly baseline: { readonly years: number; readonly sum: number };
  /** Age the player acted on an insider tip; 0 when never. */
  readonly insiderAge: number;
  /** Scams lost money to. */
  readonly scams: number;
}

const TIP_ID = /^investing\/(tip|insider)-(.+)$/;
/** An insider tip counts as right when the kind rises by at least this (20%). */
const INSIDER_HIT = 0.2;

const growth = (r: number): number => Math.log(Math.max(1 + r, FLOOR));
const last = (xs: readonly number[]): number => xs[xs.length - 1] as number;

/** Observes each age-up of a life and sums the market's and the player's yearly results. */
export class InvestTracker {
  private readonly idx;
  private readonly kinds = new Map<string, KindYears>();
  private heldYears = 0;
  private heldLogSum = 0;
  private everHeld = false;
  private readonly tips: TipYears = { n: 0, sum: 0, hits: 0 };
  private readonly insiderTips: TipYears = { n: 0, sum: 0, hits: 0 };
  private readonly baseline = { years: 0, sum: 0 };
  /** Storylet id -> times opened as of the last year, for counting new tips. */
  private readonly opened = new Map<string, number>();

  constructor(bundles: readonly PackBundle[]) {
    this.idx = indexBundles(bundles);
  }

  /** The Pack is loaded, so there is something to track. */
  static wanted(bundles: readonly PackBundle[]): boolean {
    return bundles.some((b) => b.id === INVESTING_PACK);
  }

  /** Call with the world just before an age-up and just after it. */
  year(before: World, after: World): void {
    // A death during the age-up can skip the settlement, so that year says nothing.
    if (after.ended) return;
    const returns = new Map<string, number>();
    for (const k of this.idx.markets.values()) {
      const m = k.market;
      const a = before.market[k.id];
      const b = after.market[k.id];
      if (!m || !a || !b) continue;
      const p0 = last(a.prices);
      const p1 = last(b.prices);
      if (p0 <= 0) continue;
      const face1 = b.face ?? 10000;
      let r = p1 / p0 - 1;
      if (m.bond)
        r += ((m.bond.couponBp / 10000) * (face1 / 10000) * m.start) / p0;
      const s = this.kinds.get(k.id) ?? {
        years: 0,
        sum: 0,
        logSum: 0,
        crashes: 0,
        delisted: 0,
        defaults: 0,
      };
      this.kinds.set(k.id, s);
      returns.set(k.id, r);
      s.years++;
      s.sum += r;
      s.logSum += growth(r);
      if (r <= CRASH_RETURN) s.crashes++;
      if (p1 === 0) s.delisted++;
      if (m.bond && face1 < (a.face ?? 10000)) s.defaults++;
    }
    // Tips offered since the last age-up are about this settlement's return.
    for (const [id, rec] of Object.entries(before.storyletLog)) {
      const m = TIP_ID.exec(id);
      if (!m) continue;
      const fresh = rec.count - (this.opened.get(id) ?? 0);
      this.opened.set(id, rec.count);
      const r = returns.get(`${INVESTING_PACK}/${m[2]}`);
      if (fresh <= 0 || r === undefined) continue;
      const t = m[1] === "tip" ? this.tips : this.insiderTips;
      t.n += fresh;
      t.sum += fresh * r;
      if (r >= (m[1] === "tip" ? 0 : INSIDER_HIT)) t.hits += fresh;
    }
    const tippable = [...returns].filter(([id]) =>
      this.idx.storylets.has(
        `${id.replace(`${INVESTING_PACK}/`, `${INVESTING_PACK}/tip-`)}`,
      ),
    );
    if (tippable.length > 0) {
      this.baseline.years++;
      this.baseline.sum +=
        tippable.reduce((n, [, r]) => n + r, 0) / tippable.length;
    }
    const was = getPerson(before, before.playerId).holdings;
    const now = getPerson(after, after.playerId).holdings;
    if (was.some((h) => h.units > 0) || now.some((h) => h.units > 0))
      this.everHeld = true;
    let start = 0;
    let end = 0;
    for (const h of was) {
      const s0 = before.market[h.kindId];
      const s1 = after.market[h.kindId];
      const m = this.idx.markets.get(h.kindId)?.market;
      if (!s0 || !s1 || !m) continue;
      start += unitsValue(h.units, last(s0.prices));
      const h1 = now.find((x) => x.kindId === h.kindId);
      if (h1) end += unitsValue(h1.units, last(s1.prices));
      if (m.bond) {
        const owed = Math.trunc(
          (unitsValue(h.units, m.start) * (s1.face ?? 10000)) / 10000,
        );
        const matured =
          h.maturesYear !== undefined && after.worldYear >= h.maturesYear;
        end +=
          Math.trunc((owed * m.bond.couponBp) / 10000) + (matured ? owed : 0);
      }
    }
    if (start > 0) {
      this.heldYears++;
      this.heldLogSum += Math.log(Math.max(end / start, FLOOR));
    }
  }

  result(w: World | null): InvestLife {
    const q = w ? getPerson(w, w.playerId).qualities : {};
    return {
      kinds: Object.fromEntries(this.kinds),
      heldYears: this.heldYears,
      heldLogSum: this.heldLogSum,
      everHeld: this.everHeld,
      tips: this.tips,
      insiderTips: this.insiderTips,
      baseline: this.baseline,
      insiderAge: Number(q.invest_insider_age ?? 0),
      scams: Number(q.invest_scams ?? 0),
    };
  }
}

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};
const round = (n: number, d = 1000): number => Math.round(n * d) / d;
const pct = (n: number): number => round(n * 100, 100);

interface Bucket {
  lives: number;
  adults: number;
  participants: number;
  kinds: Map<string, KindYears>;
  heldYears: number;
  heldLogSum: number;
  insiderActed: number;
  scams: number;
  tips: TipYears;
  insiderTips: TipYears;
  baseline: { years: number; sum: number };
  fires: Record<string, number>;
  /** Net worth at each age: [investors, non-investors]. */
  nw: Record<number, [number[], number[]]>;
}

const fresh = (): Bucket => ({
  lives: 0,
  adults: 0,
  participants: 0,
  kinds: new Map(),
  heldYears: 0,
  heldLogSum: 0,
  insiderActed: 0,
  scams: 0,
  tips: { n: 0, sum: 0, hits: 0 },
  insiderTips: { n: 0, sum: 0, hits: 0 },
  baseline: { years: 0, sum: 0 },
  fires: {},
  nw: { 40: [[], []], 65: [[], []] },
});

/** Storylet fire counts the report keeps, keyed by what they count. */
const FIRE_GROUPS: readonly (readonly [string, RegExp])[] = [
  ["asks", /^investing\/(ask-for-tip|read-the-news|read-investing-book)$/],
  ["tips", /^investing\/tip-/],
  ["insiderOffers", /^investing\/insider-/],
  ["scamOffers", /^investing\/(ponzi-scheme|fake-coin|guaranteed-returns)$/],
];

export interface InvestingReport {
  readonly byProfile: Record<
    string,
    {
      readonly lives: number;
      /** Percent of lives reaching 18 that ever held an investment. */
      readonly participation: number;
      /** Annualised return of what the player held (coupons and maturities included), percent; null with no holding years. */
      readonly annualised: number | null;
      readonly heldYears: number;
      readonly perLife: {
        readonly asks: number;
        readonly tips: number;
        readonly insiderOffers: number;
        readonly insiderActed: number;
        readonly scamOffers: number;
        readonly scamsLost: number;
      };
      readonly netWorth: Record<
        string,
        {
          readonly investors: { n: number; median: number | null };
          readonly others: { n: number; median: number | null };
        }
      >;
    }
  >;
  /** How the tipped kinds did the year after a tip, all profiles. */
  readonly tipAccuracy: {
    /** Mean yearly return of all tippable kinds, percent (what a random pick earns). */
    readonly baseline: number;
    readonly tips: { n: number; mean: number; hit: number };
    readonly insiderTips: { n: number; mean: number; hit: number };
  };
  /** The market itself over every life's world years (all profiles). */
  readonly kinds: Record<
    string,
    {
      readonly years: number;
      /** Mean yearly return, percent. */
      readonly mean: number;
      /** Annualised (geometric) return, percent; a delisting counts as -99%. */
      readonly annualised: number;
      /** Percent of years at -20% or worse. */
      readonly crashYears: number;
      /** Percent of years the kind was delisted (price fell to 0 for good). */
      readonly delistedYears: number;
      /** Issuer defaults, percent of bond-years. */
      readonly defaultRate: number;
    }
  >;
}

/** Investing metrics (issue #139): returns per kind, crashes, participation, net worth against non-investors, bond defaults. */
export class InvestStats {
  private readonly buckets = new Map<string, Bucket>();

  add(r: LifeResult): void {
    const inv = r.invest;
    if (!inv) return;
    const adult = r.samples.some((s) => s.age >= 18);
    for (const key of ["all", r.profile]) {
      const b = this.buckets.get(key) ?? fresh();
      this.buckets.set(key, b);
      b.lives++;
      if (adult) b.adults++;
      if (adult && inv.everHeld) b.participants++;
      b.heldYears += inv.heldYears;
      b.heldLogSum += inv.heldLogSum;
      if (inv.insiderAge > 0) b.insiderActed++;
      b.scams += inv.scams;
      for (const [to, from] of [
        [b.tips, inv.tips],
        [b.insiderTips, inv.insiderTips],
      ] as const) {
        to.n += from.n;
        to.sum += from.sum;
        to.hits += from.hits;
      }
      b.baseline.years += inv.baseline.years;
      b.baseline.sum += inv.baseline.sum;
      for (const [id, n] of Object.entries(r.fires))
        for (const [g, re] of FIRE_GROUPS)
          if (re.test(id)) b.fires[g] = (b.fires[g] ?? 0) + n;
      for (const [id, k] of Object.entries(inv.kinds)) {
        const t = b.kinds.get(id) ?? {
          years: 0,
          sum: 0,
          logSum: 0,
          crashes: 0,
          delisted: 0,
          defaults: 0,
        };
        b.kinds.set(id, t);
        t.years += k.years;
        t.sum += k.sum;
        t.logSum += k.logSum;
        t.crashes += k.crashes;
        t.delisted += k.delisted;
        t.defaults += k.defaults;
      }
      for (const age of AGES) {
        const s = r.samples.find((x) => x.age === age);
        if (s)
          (b.nw[age] as [number[], number[]])[inv.everHeld ? 0 : 1].push(
            s.netWorth,
          );
      }
    }
  }

  /** Null when the Pack was not loaded (no life carried a result). */
  report(): InvestingReport | null {
    const all = this.buckets.get("all");
    if (!all) return null;
    const byProfile: InvestingReport["byProfile"] = {};
    for (const [key, b] of [...this.buckets].sort((x, y) =>
      x[0] < y[0] ? -1 : 1,
    )) {
      const per = (g: string) => round((b.fires[g] ?? 0) / b.lives, 100);
      byProfile[key] = {
        lives: b.lives,
        participation: b.adults === 0 ? 0 : pct(b.participants / b.adults),
        annualised:
          b.heldYears === 0
            ? null
            : pct(Math.exp(b.heldLogSum / b.heldYears) - 1),
        heldYears: b.heldYears,
        perLife: {
          asks: per("asks"),
          tips: per("tips"),
          insiderOffers: per("insiderOffers"),
          insiderActed: round(b.insiderActed / b.lives, 1000),
          scamOffers: per("scamOffers"),
          scamsLost: round(b.scams / b.lives, 100),
        },
        netWorth: Object.fromEntries(
          AGES.map((age) => {
            const [yes, no] = b.nw[age] as [number[], number[]];
            return [
              String(age),
              {
                investors: { n: yes.length, median: median(yes) },
                others: { n: no.length, median: median(no) },
              },
            ];
          }),
        ),
      };
    }
    const kinds: InvestingReport["kinds"] = {};
    for (const [id, k] of [...all.kinds].sort((x, y) => (x[0] < y[0] ? -1 : 1)))
      kinds[id] = {
        years: k.years,
        mean: pct(k.sum / k.years),
        annualised: pct(Math.exp(k.logSum / k.years) - 1),
        crashYears: pct(k.crashes / k.years),
        delistedYears: pct(k.delisted / k.years),
        defaultRate: pct(k.defaults / k.years),
      };
    const acc = (t: TipYears) => ({
      n: t.n,
      mean: t.n === 0 ? 0 : pct(t.sum / t.n),
      hit: t.n === 0 ? 0 : pct(t.hits / t.n),
    });
    return {
      byProfile,
      kinds,
      tipAccuracy: {
        baseline:
          all.baseline.years === 0
            ? 0
            : pct(all.baseline.sum / all.baseline.years),
        tips: acc(all.tips),
        insiderTips: acc(all.insiderTips),
      },
    };
  }
}

const major = (n: number | null): string =>
  n === null ? "-" : String(Math.round(n / 100));

export function renderInvesting(v: InvestingReport): string[] {
  const L: string[] = ["", "## Investing", ""];
  L.push(
    "The market over every life's world years (all profiles): the mean and annualised (geometric) yearly return, share of years at -20% or worse (a crash year), delistings and, for government bonds, issuer defaults. Bond returns include the coupon.",
    "",
    "| kind | years | mean return | annualised | crash years | delisted | bond default rate |",
    "|---|---|---|---|---|---|---|",
  );
  for (const [id, k] of Object.entries(v.kinds))
    L.push(
      `| ${id} | ${k.years} | ${k.mean}% | ${k.annualised}% | ${k.crashYears}% | ${k.delistedYears}% | ${k.defaultRate}% |`,
    );
  const a = v.tipAccuracy;
  L.push(
    "",
    `Tip accuracy (return of the tipped kind in the next settlement, all profiles; a random kind earns ${a.baseline}% on average):`,
    "",
    "| source | tips | mean return | share right |",
    "|---|---|---|---|",
    `| tips | ${a.tips.n} | ${a.tips.mean}% | ${a.tips.hit}% (rose) |`,
    `| insider tips | ${a.insiderTips.n} | ${a.insiderTips.mean}% | ${a.insiderTips.hit}% (rose 20%+) |`,
  );
  L.push(
    "",
    "Per profile: share of adult lives that ever held an investment, annualised return of the holdings (time-weighted, coupons and maturities included), and tips, insider offers (and acted on), scam offers and scams lost to, per life.",
    "",
    "| profile | lives | participation | annualised return | holding years | asks | tips | insider offers | insider acted | scam offers | scams lost |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const [k, p] of Object.entries(v.byProfile))
    L.push(
      `| ${k} | ${p.lives} | ${p.participation}% | ${p.annualised === null ? "-" : `${p.annualised}%`} | ${p.heldYears} | ${p.perLife.asks} | ${p.perLife.tips} | ${p.perLife.insiderOffers} | ${p.perLife.insiderActed} | ${p.perLife.scamOffers} | ${p.perLife.scamsLost} |`,
    );
  L.push(
    "",
    "Median net worth (major units) of lives that ever held an investment and the rest, within a profile:",
    "",
    "| profile | age | investors (n) | others (n) |",
    "|---|---|---|---|",
  );
  for (const [k, p] of Object.entries(v.byProfile))
    for (const [age, c] of Object.entries(p.netWorth))
      L.push(
        `| ${k} | ${age} | ${major(c.investors.median)} (${c.investors.n}) | ${major(c.others.median)} (${c.others.n}) |`,
      );
  return L;
}
