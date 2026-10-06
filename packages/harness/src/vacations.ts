import type { LifeResult } from "./run.ts";

/** Pack id of the Vacations pack; its section appears in the report only when it is loaded. */
export const VACATIONS_PACK = "vacations";
/** Cause of death every trip outcome uses (`die("travel accident")`). */
const TRAVEL_DEATH = "travel accident";
/** Trip actions open a choice of five price tiers; tier `n` (1-based) costs `n` times this step. */
export const TRIP_TIER_STEP: Readonly<Record<string, number>> = {
  [`${VACATIONS_PACK}/take-vacation`]: 50000,
  [`${VACATIONS_PACK}/go-on-cruise`]: 120000,
};
/** Net worth is compared at these ages. */
const AGES = [40, 65] as const;

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};
const round = (n: number, d = 1000): number => Math.round(n * d) / d;

interface Bucket {
  lives: number;
  /** Trips per action id per tier slot. */
  trips: Map<string, number[]>;
  spent: number;
  earnings: number;
  travellers: number;
  deaths: number;
  /** Net worth at each age: [travellers, non-travellers]. */
  nw: Record<number, [number[], number[]]>;
}

const fresh = (): Bucket => ({
  lives: 0,
  trips: new Map(),
  spent: 0,
  earnings: 0,
  travellers: 0,
  deaths: 0,
  nw: { 40: [[], []], 65: [[], []] },
});

export interface VacationsReport {
  /** Trip action ids (full), in report order. */
  readonly actions: readonly string[];
  /** Per profile (and "all"): the Vacations metrics. */
  readonly byProfile: Record<
    string,
    {
      readonly lives: number;
      /** Percent of lives that took at least one trip. */
      readonly travellerShare: number;
      /** Trips per life by action, then by price tier (index 0 is tier 1). */
      readonly tripsPerLife: Record<string, readonly number[]>;
      readonly tripsPerLifeTotal: number;
      /** Trip spending as a percent of gross earnings. */
      readonly spendShare: number;
      /** Mean spending per life, minor units. */
      readonly spentPerLife: number;
      readonly travelDeaths: number;
      /** Travel deaths per 10,000 trips. */
      readonly deathsPer10k: number;
      /** Median net worth (minor units) of lives reaching the age: travellers, non-travellers. */
      readonly netWorth: Record<
        string,
        {
          readonly travellers: { n: number; median: number | null };
          readonly nonTravellers: { n: number; median: number | null };
        }
      >;
    }
  >;
}

/** Vacations metrics (issue #135): trips by tier, spend share of earnings, travel deaths, net worth against non-travellers. */
export class VacationStats {
  private readonly buckets = new Map<string, Bucket>();
  private readonly actions = new Set<string>();

  add(r: LifeResult): void {
    const mine = Object.entries(r.amountActions).filter(([id]) =>
      id.startsWith(`${VACATIONS_PACK}/`),
    );
    const trips = mine.reduce(
      (n, [, a]) => n + a.slots.reduce((x, y) => x + y, 0),
      0,
    );
    const died = r.death?.cause === TRAVEL_DEATH;
    for (const key of ["all", r.profile]) {
      const b = this.buckets.get(key) ?? fresh();
      this.buckets.set(key, b);
      b.lives++;
      b.earnings += r.earnings;
      if (trips > 0) b.travellers++;
      if (died) b.deaths++;
      for (const [id, a] of mine) {
        this.actions.add(id);
        const t = b.trips.get(id) ?? [];
        b.trips.set(id, t);
        a.slots.forEach((n, i) => {
          t[i] = (t[i] ?? 0) + n;
        });
        b.spent += a.spent;
      }
      for (const age of AGES) {
        const s = r.samples.find((x) => x.age === age);
        if (s)
          (b.nw[age] as [number[], number[]])[trips > 0 ? 0 : 1].push(
            s.netWorth,
          );
      }
    }
  }

  /** Null when no life ever used a trip action, or the Pack is not loaded. */
  report(): VacationsReport | null {
    const actions = [...this.actions].sort();
    if (actions.length === 0) return null;
    const byProfile: VacationsReport["byProfile"] = {};
    for (const [key, b] of [...this.buckets].sort((x, y) =>
      x[0] < y[0] ? -1 : 1,
    )) {
      let total = 0;
      const tripsPerLife: Record<string, number[]> = {};
      for (const id of actions) {
        const t = b.trips.get(id) ?? [];
        const row = Array.from({ length: 5 }, (_, i) =>
          round((t[i] ?? 0) / b.lives),
        );
        tripsPerLife[id] = row;
        total += t.reduce((x, y) => x + y, 0);
      }
      byProfile[key] = {
        lives: b.lives,
        travellerShare: round((b.travellers / b.lives) * 100, 10),
        tripsPerLife,
        tripsPerLifeTotal: round(total / b.lives),
        spendShare:
          b.earnings === 0 ? 0 : round((b.spent / b.earnings) * 100, 100),
        spentPerLife: Math.round(b.spent / b.lives),
        travelDeaths: b.deaths,
        deathsPer10k: total === 0 ? 0 : round((b.deaths / total) * 10000, 10),
        netWorth: Object.fromEntries(
          AGES.map((age) => {
            const [yes, no] = b.nw[age] as [number[], number[]];
            return [
              String(age),
              {
                travellers: { n: yes.length, median: median(yes) },
                nonTravellers: { n: no.length, median: median(no) },
              },
            ];
          }),
        ),
      };
    }
    return { actions, byProfile };
  }
}

const major = (n: number | null): string =>
  n === null ? "-" : String(Math.round(n / 100));

export function renderVacations(v: VacationsReport): string[] {
  const L: string[] = ["", "## Vacations", ""];
  L.push(
    "Trips per life by price tier (tier 1 is the cheapest named tier, picked from the trip action's choices), spending against gross earnings, and travel deaths. Only the `random` profile takes trips; the others never open the travel menu.",
    "",
    "| profile | lives | travellers | trips per life | tier 1 | tier 2 | tier 3 | tier 4 | tier 5 | action |",
    "|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const [k, p] of Object.entries(v.byProfile))
    for (const id of v.actions) {
      const t = p.tripsPerLife[id] as readonly number[];
      L.push(
        `| ${k} | ${p.lives} | ${p.travellerShare}% | ${p.tripsPerLifeTotal} | ${t.join(" | ")} | ${id} |`,
      );
    }
  L.push(
    "",
    "| profile | spend per life (major units) | spend share of earnings | travel deaths | deaths per 10,000 trips |",
    "|---|---|---|---|---|",
  );
  for (const [k, p] of Object.entries(v.byProfile))
    L.push(
      `| ${k} | ${major(p.spentPerLife)} | ${p.spendShare}% | ${p.travelDeaths} | ${p.deathsPer10k} |`,
    );
  L.push(
    "",
    "Median net worth (major units) of travellers and non-travellers within a profile:",
    "",
    "| profile | age | travellers (n) | non-travellers (n) |",
    "|---|---|---|---|",
  );
  for (const [k, p] of Object.entries(v.byProfile))
    for (const [age, c] of Object.entries(p.netWorth))
      L.push(
        `| ${k} | ${age} | ${major(c.travellers.median)} (${c.travellers.n}) | ${major(c.nonTravellers.median)} (${c.nonTravellers.n}) |`,
      );
  return L;
}
