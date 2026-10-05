import type { PackBundle } from "@life/core";
import type { ProfileName } from "./profiles.ts";
import type { Fault, LifeResult } from "./run.ts";

export interface Dist {
  readonly n: number;
  readonly mean: number;
  readonly min: number;
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
}

const rank = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;

export function dist(values: readonly number[]): Dist | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (const v of s) sum += v;
  return {
    n: s.length,
    mean: Math.round((sum / s.length) * 100) / 100,
    min: s[0] as number,
    p10: rank(s, 0.1),
    p50: rank(s, 0.5),
    p90: rank(s, 0.9),
    max: s[s.length - 1] as number,
  };
}

const pct = (n: number, d: number): number =>
  d === 0 ? 0 : Math.round((n / d) * 1000) / 10;

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
  /** Decade ages: stat id -> age -> distribution. */
  readonly statsByAge: Record<string, Record<string, Dist | null>>;
}

/** Storylets reached only through `next` and never rolled themselves. */
function chainSteps(bundles: readonly PackBundle[]): Set<string> {
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

export class Aggregate {
  private readonly bundles: readonly PackBundle[];
  private lives = 0;
  private readonly profile = new Map<
    string,
    { lives: number; faults: number; deathAges: number[]; nw40: number[] }
  >();
  private readonly faults: Fault[] = [];
  private faultTotal = 0;
  private readonly faultKinds: Record<string, number> = {};
  private readonly fires: Record<string, number> = {};
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
  private loansOpened = 0;
  private loansDefaulted = 0;
  private repossessions = 0;
  private readonly stats = new Map<string, Map<number, number[]>>();

  constructor(bundles: readonly PackBundle[]) {
    this.bundles = bundles;
  }

  add(r: LifeResult): void {
    this.lives++;
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
      if (s.age % 10 === 0) {
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
    const ageHist: Record<string, number> = {};
    for (const a of this.deathAges) {
      const k = `${Math.floor(a / 10) * 10}s`;
      ageHist[k] = (ageHist[k] ?? 0) + 1;
    }
    const statsByAge: Report["statsByAge"] = {};
    for (const [id, byAge] of [...this.stats].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      const row: Record<string, Dist | null> = {};
      for (const a of DECADES)
        if (byAge.has(a)) row[String(a)] = dist(byAge.get(a) as number[]);
      statsByAge[id] = row;
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
      statsByAge,
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
    max: f(d.max),
  };
const major = (n: number): number => Math.round(n / 100);

export function renderMarkdown(
  r: Report,
  meta: { seed: number; profiles: readonly ProfileName[]; seconds: number },
): string {
  const L: string[] = [];
  L.push("# Balance harness report", "");
  L.push(
    `Lives: ${r.lives} · profiles: ${meta.profiles.join(", ")} · base seed: ${meta.seed} · faults: **${r.faults.total}**`,
    "",
  );
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
  L.push("## Stats by age", "");
  for (const [id, row] of Object.entries(r.statsByAge)) {
    L.push(`### ${id}`, "", DHEAD);
    for (const [a, d] of Object.entries(row)) L.push(dRow(`age ${a}`, d));
    L.push("");
  }
  L.push(`Run time: ${meta.seconds.toFixed(1)} s`, "");
  return L.join("\n");
}
