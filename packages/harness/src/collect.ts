import type { MarketTake, PackMetrics, Table } from "./metrics.ts";
import { evalExpr } from "./metrics.ts";
import type { Move } from "./profiles.ts";

/** The value at `key`, made and stored when absent. */
function slot<T>(rec: Record<string, T>, key: string, make: () => T): T {
  const hit = rec[key];
  if (hit !== undefined) return hit;
  const v = make();
  rec[key] = v;
  return v;
}

/** What one life did in one table: per action id, each column's total and the count per amount-grid slot. */
export interface TableCell {
  readonly cols: Record<string, number>;
  readonly slots: number[];
}

/** A life's values for one Pack's metrics; snapshot measures are keyed `id@age`. */
export interface LifeMetrics {
  readonly measures: Record<string, number>;
  readonly tables: Record<string, Record<string, TableCell>>;
}

/** The part of the player the collector reads. */
export interface Player {
  readonly age: number;
  readonly money: number;
  readonly stats: Readonly<Record<string, number>>;
  readonly qualities: Readonly<Record<string, number | boolean | string>>;
}

export interface LifeEnd {
  readonly me: Player | null;
  readonly years: number;
  readonly earnings: number;
  readonly death: { readonly cause: string } | null;
  /** Storylet id -> times opened. */
  readonly fires: Readonly<Record<string, number>>;
  /** Storylet id -> outcome key (`o<i>`, `c<j>.o<i>`) -> times resolved. */
  readonly outcomes: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** Value of the player's market holdings, in total and per market kind. */
export interface Holdings {
  readonly total: number;
  readonly byKind: Readonly<Record<string, number>>;
}

/** The part of a market series the collector reads (`Series` in core). */
export interface MarketSeries {
  /** World year of `prices[0]`. */
  readonly from: number;
  readonly prices: readonly number[];
  /** Bonds after an issuer default: the share of principal still owed, basis points. */
  readonly face?: number | undefined;
}

/** One market kind over a life, built from the yearly points the collector observes. */
interface MarketTrack {
  lastYear: number | undefined;
  first: number | undefined;
  prev: number | undefined;
  min: number | undefined;
  max: number | undefined;
  /** Price steps observed after the first point. */
  years: number;
  delistings: number;
  relistings: number;
  defaults: number;
  face: number | undefined;
  /** Years with a price drop of at least this many basis points, per declared threshold. */
  drops: Map<number, number>;
}

const newTrack = (): MarketTrack => ({
  lastYear: undefined,
  first: undefined,
  prev: undefined,
  min: undefined,
  max: undefined,
  years: 0,
  delistings: 0,
  relistings: 0,
  defaults: 0,
  face: undefined,
  drops: new Map(),
});
interface Before {
  readonly money: number;
  readonly qualities: Record<string, number>;
}

const numeric = (v: unknown): number =>
  typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "number" ? v : 0;

/**
 * Gathers the declared metrics of one life from hooks the run loop calls; knows no Pack by
 * name. `observe` and `yearEnd` read qualities along the way, `before/afterAction` fill the
 * tables, `snapshot` takes the values at fixed ages and `finish` evaluates every measure.
 */
export class MetricCollector {
  private readonly ever = new Set<string>();
  private readonly years = new Map<string, number>();
  private readonly snapshots: Record<string, Record<string, number>> = {};
  private readonly cells: Record<
    string,
    Record<string, Record<string, TableCell>>
  > = {};
  private readonly watched: ReadonlySet<string>;
  /** Market kind id -> what its series did over the life so far. */
  private readonly markets = new Map<string, MarketTrack>();
  private readonly packs: readonly PackMetrics[];
  private readonly storyletsTagged: (tag: string) => ReadonlySet<string>;

  constructor(
    packs: readonly PackMetrics[],
    storyletsTagged: (tag: string) => ReadonlySet<string>,
  ) {
    this.packs = packs;
    this.storyletsTagged = storyletsTagged;
    const watched = new Set<string>();
    for (const p of packs)
      for (const t of p.tables) {
        if (t.raises) watched.add(t.raises);
        for (const c of Object.values(t.columns))
          if (typeof c === "object" && c.delta !== "money")
            watched.add(c.delta.quality);
      }
    this.watched = watched;
    for (const p of packs)
      for (const m of p.measures)
        if (m.kind === "market") {
          const st = this.markets.get(m.market) ?? newTrack();
          this.markets.set(m.market, st);
          if (typeof m.take === "object" && !st.drops.has(m.take.dropYears))
            st.drops.set(m.take.dropYears, 0);
        }
  }

  /** Note qualities that are positive now (after each voluntary move and each age-up). */
  observe(me: Player): void {
    for (const p of this.packs)
      for (const m of p.measures)
        if (
          m.kind === "quality" &&
          m.at === "ever" &&
          numeric(me.qualities[m.quality]) > 0
        )
          this.ever.add(`${p.pack}:${m.id}`);
  }

  /** Count the qualities that are positive at the end of an age-up. */
  yearEnd(me: Player): void {
    for (const p of this.packs)
      for (const m of p.measures)
        if (
          m.kind === "quality" &&
          m.at === "years" &&
          numeric(me.qualities[m.quality]) > 0
        ) {
          const k = `${p.pack}:${m.id}`;
          this.years.set(k, (this.years.get(k) ?? 0) + 1);
        }
  }

  /** Take the snapshot measures declared for the player's current age. */
  snapshot(me: Player, netWorth: number, holdings: Holdings): void {
    for (const p of this.packs)
      for (const m of p.measures) {
        if (m.kind !== "snapshot" || !m.ages.includes(me.age)) continue;
        const v =
          m.take === "net_worth"
            ? netWorth
            : m.take === "holdings"
              ? holdings.total
              : "stat" in m.take
                ? (me.stats[m.take.stat] ?? 0)
                : "holding" in m.take
                  ? (holdings.byKind[m.take.holding] ?? 0)
                  : numeric(me.qualities[m.take.quality]);
        slot<Record<string, number>>(this.snapshots, p.pack, () => ({}))[
          `${m.id}@${me.age}`
        ] = v;
      }
  }

  /**
   * Note the price of every market kind a measure reads, once per world year: call after the
   * life begins and after each age-up. A series point already seen is skipped.
   */
  market(series: Readonly<Record<string, MarketSeries>>): void {
    for (const [kind, st] of this.markets) {
      const s = series[kind];
      if (!s) continue;
      const last = s.from + s.prices.length - 1;
      if (st.lastYear === undefined) {
        const p = s.prices[s.prices.length - 1] as number;
        st.lastYear = last;
        st.first = st.prev = st.min = st.max = p;
        st.face = s.face;
        continue;
      }
      for (let y = st.lastYear + 1; y <= last; y++) {
        const p = s.prices[y - s.from];
        if (p === undefined) continue;
        const prev = st.prev as number;
        if (prev > 0 && p === 0) st.delistings++;
        if (prev === 0 && p > 0) st.relistings++;
        for (const [bp, n] of st.drops)
          if (prev > 0 && p < prev && ((prev - p) * 10000) / prev >= bp)
            st.drops.set(bp, n + 1);
        st.prev = p;
        st.min = Math.min(st.min as number, p);
        st.max = Math.max(st.max as number, p);
        st.years++;
      }
      st.lastYear = last;
      // A default lowers the remaining principal; a recovery of the face never happens.
      if (s.face !== undefined && s.face < (st.face ?? 10000)) st.defaults++;
      if (s.face !== undefined) st.face = s.face;
    }
  }

  private marketValue(kind: string, take: MarketTake): number {
    const st = this.markets.get(kind);
    if (!st || st.first === undefined) return 0;
    if (typeof take === "object") return st.drops.get(take.dropYears) ?? 0;
    switch (take) {
      case "annualized_return":
        return st.years === 0 || st.first === 0
          ? 0
          : ((st.prev as number) / st.first) ** (1 / st.years) * 10000 - 10000;
      case "start_price":
        return st.first;
      case "end_price":
        return st.prev as number;
      case "min_price":
        return st.min as number;
      case "max_price":
        return st.max as number;
      case "delistings":
        return st.delistings;
      case "relistings":
        return st.relistings;
      case "defaults":
        return st.defaults;
    }
  }

  private applies(p: PackMetrics, id: string): boolean {
    return id.startsWith(`${p.pack}/`) && p.tables.length > 0;
  }

  /** Call before a voluntary action; null when no table can count it. */
  beforeAction(me: Player, m: Move): Before | null {
    if (m.t !== "action" || !this.packs.some((p) => this.applies(p, m.id)))
      return null;
    const qualities: Record<string, number> = {};
    for (const q of this.watched) qualities[q] = numeric(me.qualities[q]);
    return { money: me.money, qualities };
  }

  /** Call after the action and its events resolved. Returns an assertion message when a money floor broke. */
  afterAction(me: Player, m: Move, before: Before | null): string[] {
    const faults: string[] = [];
    if (!before || m.t !== "action") return faults;
    for (const p of this.packs) {
      if (!this.applies(p, m.id)) continue;
      for (const t of p.tables) {
        if (!this.counts(t, me, m, before)) continue;
        const byTable = slot<Record<string, Record<string, TableCell>>>(
          this.cells,
          p.pack,
          () => ({}),
        );
        const byAction = slot<Record<string, TableCell>>(
          byTable,
          t.id,
          () => ({}),
        );
        const cell = slot<TableCell>(byAction, m.id, () => ({
          cols: {},
          slots: [],
        }));
        for (const [name, c] of Object.entries(t.columns)) {
          const d =
            c === "count"
              ? 1
              : c === "amount"
                ? (m.amount ?? 0)
                : c.delta === "money"
                  ? me.money - before.money
                  : numeric(me.qualities[c.delta.quality]) -
                    (before.qualities[c.delta.quality] as number);
          cell.cols[name] = (cell.cols[name] ?? 0) + d;
        }
        if (m.slot !== undefined) {
          while (cell.slots.length < m.slot) cell.slots.push(0);
          cell.slots[m.slot - 1] = (cell.slots[m.slot - 1] as number) + 1;
        }
        if (t.moneyFloor !== undefined && me.money < t.moneyFloor)
          faults.push(`${m.id} left money below ${t.moneyFloor}`);
      }
    }
    return faults;
  }

  private counts(
    t: Table,
    me: Player,
    m: Extract<Move, { t: "action" }>,
    before: Before,
  ): boolean {
    if (t.withAmount && (m.amount === undefined || m.slot === undefined))
      return false;
    if (
      t.raises &&
      numeric(me.qualities[t.raises]) -
        (before.qualities[t.raises] as number) <=
        0
    )
      return false;
    return true;
  }

  /** Evaluate every measure over the finished life. */
  finish(end: LifeEnd): Record<string, LifeMetrics> {
    const out: Record<string, LifeMetrics> = {};
    for (const p of this.packs) {
      const measures: Record<string, number> = { ...this.snapshots[p.pack] };
      const tables = this.cells[p.pack] ?? {};
      for (const m of p.measures) {
        switch (m.kind) {
          case "quality":
            measures[m.id] =
              m.at === "end"
                ? numeric(end.me?.qualities[m.quality])
                : m.at === "ever"
                  ? this.ever.has(`${p.pack}:${m.id}`)
                    ? 1
                    : 0
                  : (this.years.get(`${p.pack}:${m.id}`) ?? 0);
            break;
          case "life":
            measures[m.id] = m.life === "years" ? end.years : end.earnings;
            break;
          case "death":
            measures[m.id] = end.death?.cause === m.cause ? 1 : 0;
            break;
          case "fires": {
            const ids = m.storylet
              ? new Set([m.storylet])
              : this.storyletsTagged(m.tag as string);
            let n = 0;
            for (const [id, c] of Object.entries(end.fires))
              if (ids.has(id)) n += c;
            measures[m.id] = n;
            break;
          }
          case "table": {
            let n = 0;
            for (const cell of Object.values(tables[m.table] ?? {}))
              n += cell.cols[m.column] ?? 0;
            measures[m.id] = n;
            break;
          }
          case "market":
            measures[m.id] = this.marketValue(m.market, m.take);
            break;
          case "outcome":
            measures[m.id] = end.outcomes[m.storylet]?.[m.key] ?? 0;
            break;
          case "when":
            measures[m.id] = evalExpr(m.when, (id) => measures[id]);
            break;
          case "snapshot":
            break;
        }
      }
      out[p.pack] = { measures, tables };
    }
    return out;
  }
}
