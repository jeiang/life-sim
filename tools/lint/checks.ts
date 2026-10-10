/**
 * The static content checks of `pnpm tool lint` (docs/spec/tools/lint.md), over compiled
 * bundles. Everything is a proof from interval analysis (interval.ts), never a guess: a
 * finding means no life can make the content fire, or the closed-form numbers are out of band.
 */
import type {
  CompiledChoice,
  CompiledOutcome,
  CompiledStorylet,
  Effect,
  Expr,
  PackBundle,
  QualityDecl,
} from "../../packages/core/src/index.ts";
import {
  Analyzer,
  BOOL,
  type Env,
  type Interval,
  isFalse,
  isPoint,
  isTrue,
  join,
  meet,
  point,
  type Ranges,
  TOP,
} from "./interval.ts";
import { type Finding, finding } from "./rules.ts";

/** The default band of a wager's closed-form return (a ratio: 1 is break-even). */
export const DEFAULT_WAGER_BAND: readonly [number, number] = [0.4, 1];

export interface CheckOptions {
  /** Wager band by Pack id (`wager_band` in its lint.yaml). */
  readonly wagerBands?: ReadonlyMap<string, readonly [number, number]>;
}

const NO_ENV: Env = new Map();
const MAX_CHANCE = 10000;

// ---- names and ranges -------------------------------------------------------

/** The quality id a name or write target refers to (`quality.x`, `person.quality.x`), or null. */
function qualityId(name: string): string | null {
  const parts = name.split(".");
  const i = parts.indexOf("quality");
  return i >= 0 && parts[i + 1] !== undefined ? (parts[i + 1] as string) : null;
}

function qualityRange(q: QualityDecl): Interval {
  if (q.type === "flag") return BOOL;
  return { lo: q.min ?? -Infinity, hi: q.max ?? Infinity };
}

/** Every `["v", name]` in a JSON value. */
function names(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(x)) {
    if (x.length === 2 && x[0] === "v" && typeof x[1] === "string") {
      out.add(x[1]);
    } else {
      for (const i of x) names(i, out);
    }
  } else if (x !== null && typeof x === "object") {
    for (const v of Object.values(x)) names(v, out);
  }
  return out;
}

function* effectsOf(b: PackBundle): Generator<Effect> {
  for (const s of b.storylets) {
    for (const o of outcomesOf(s)) yield* o.effects;
  }
  const h = b.hooks;
  if (!h) return;
  const lists = [
    h.on_birth,
    h.on_age_up_pre,
    h.on_age_up_post,
    h.on_death,
    h.on_succession,
    ...Object.values(h.on_milestone ?? {}),
  ];
  for (const l of lists) for (const st of l ?? []) yield* st;
}

function outcomesOf(s: CompiledStorylet): CompiledOutcome[] {
  return [...s.outcomes, ...s.choices.flatMap((c) => c.outcomes)];
}

interface Model {
  readonly declared: Analyzer;
  readonly reach: Analyzer;
  /** Qualities some name reads. */
  readonly read: ReadonlySet<string>;
  /** Qualities some effect, hook or Core rule writes. */
  readonly written: ReadonlySet<string>;
  readonly quality: ReadonlyMap<string, { pack: string; decl: QualityDecl }>;
  readonly reachOf: ReadonlyMap<string, Interval>;
}

function buildModel(bundles: readonly PackBundle[]): Model {
  const quality = new Map<string, { pack: string; decl: QualityDecl }>();
  const counters = new Map<string, Interval>();
  const tables = new Map<string, Interval>();
  const bools = new Set<string>();
  for (const b of bundles) {
    for (const q of b.qualities) {
      if (!quality.has(q.id)) quality.set(q.id, { pack: b.id, decl: q });
    }
    for (const s of b.state) {
      if (s.kind === "counter") {
        counters.set(
          s.id,
          s.type === "flag"
            ? BOOL
            : { lo: s.min ?? -Infinity, hi: s.max ?? Infinity },
        );
      } else {
        tables.set(s.id, { lo: s.min ?? -Infinity, hi: s.max ?? Infinity });
      }
    }
    for (const r of b.readables) {
      if (r.type === "bool") bools.add(r.id);
    }
  }

  const base =
    (reach: ReadonlyMap<string, Interval> | null): Ranges =>
    (name) => {
      const parts = name.split(".");
      const qid = qualityId(name);
      if (qid !== null) {
        const q = quality.get(qid);
        if (!q) return TOP;
        return reach?.get(qid) ?? qualityRange(q.decl);
      }
      if (parts.includes("stat")) return { lo: 0, hi: 100 };
      if (parts[0] === "world") return counters.get(parts[1] ?? "") ?? TOP;
      if (parts[0] === "table") return tables.get(parts[1] ?? "") ?? TOP;
      if (name === "age" || name === "person.age")
        return { lo: 0, hi: Infinity };
      if (parts.length === 1 && bools.has(name)) return BOOL;
      return TOP;
    };
  const declared = new Analyzer(base(null));

  // What each quality can hold: its default, joined with whatever any write can leave in it.
  const reachOf = new Map<string, Interval>();
  const fullRange = new Map<string, Interval>();
  const written = new Set<string>();
  for (const [id, q] of quality) {
    fullRange.set(id, qualityRange(q.decl));
    reachOf.set(
      id,
      point(q.decl.type === "flag" ? (q.decl.default ? 1 : 0) : q.decl.default),
    );
  }
  const widen = (id: string, i: Interval) => {
    const cur = reachOf.get(id);
    const range = fullRange.get(id);
    if (!cur || !range) return;
    reachOf.set(id, join(cur, meet(i, range) ?? range));
  };
  for (const b of bundles) {
    for (const e of effectsOf(b)) {
      const [op, target, expr] = e as readonly [string, unknown, Expr];
      if (op !== "set" && op !== "add" && op !== "sub") continue;
      if (typeof target !== "string") continue;
      const id = qualityId(target);
      const range = id === null ? undefined : fullRange.get(id);
      if (id === null || !range) continue;
      written.add(id);
      const v = declared.ev(expr, NO_ENV);
      if (op === "set") {
        widen(id, v);
      } else {
        // A step up can reach the maximum, a step down the minimum.
        const d = op === "add" ? v : { lo: -v.hi, hi: -v.lo };
        if (d.lo < 0) widen(id, point(range.lo));
        if (d.hi > 0) widen(id, point(range.hi));
      }
    }
    for (const c of b.npcCareers?.education ?? []) {
      written.add(c.quality);
      widen(c.quality, fullRange.get(c.quality) ?? TOP);
    }
  }

  const read = new Set<string>();
  for (const b of bundles) {
    for (const n of names(b)) {
      const id = qualityId(n);
      if (id !== null) read.add(id);
    }
  }

  return {
    declared,
    reach: new Analyzer(base(reachOf)),
    read,
    written,
    quality,
    reachOf,
  };
}

// ---- storylet analysis ------------------------------------------------------

/**
 * An event written with a literal `chance: 0%` (or `weight: 0`): only a `next` can open it,
 * so its own `when` and chance are not checked and it needs a live chain to reach it.
 */
function isChainOnly(s: CompiledStorylet): boolean {
  return s.trigger === "event" && (s.chance === 0 || s.weight === 0);
}

interface Analysis {
  readonly findings: Finding[];
  /** The storylet's `when` can never hold (reported). */
  readonly dead: boolean;
  /** Full ids that live outcomes chain to, with the path of the `next`. */
  readonly nexts: { target: string; path: string }[];
  /** Some outcome can resolve (or there is nothing to resolve). */
  readonly canResolve: boolean;
  /** Has live outcomes and every one of them chains onward. */
  readonly forced: boolean;
  /** Event with a positive chance or weight, or an action. */
  readonly root: boolean;
}

interface Gate {
  readonly dead: "L001" | "L002" | null;
  readonly envD: Env;
  readonly envR: Env;
  readonly detail: string;
}

function describeNarrowed(m: Model, expr: Expr): string {
  const out: string[] = [];
  for (const n of names(expr)) {
    const id = qualityId(n);
    const q = id === null ? undefined : m.quality.get(id);
    const r = id === null ? undefined : m.reachOf.get(id);
    if (!q || !r) continue;
    const d = qualityRange(q.decl);
    if (r.lo !== d.lo || r.hi !== d.hi) {
      out.push(`quality.${id} only ever holds ${r.lo}..${r.hi}`);
    }
  }
  return [...new Set(out)].join(", ");
}

function gate(m: Model, when: Expr | undefined, envD: Env, envR: Env): Gate {
  if (when === undefined) return { dead: null, envD, envR, detail: "" };
  const d = m.declared.ev(when, envD);
  const d2 = isFalse(d) ? null : m.declared.refine(when, envD, true);
  if (!d2) return { dead: "L001", envD, envR, detail: "" };
  const r = m.reach.ev(when, envR);
  const r2 = isFalse(r) ? null : m.reach.refine(when, envR, true);
  if (!r2) {
    return {
      dead: "L002",
      envD,
      envR,
      detail: describeNarrowed(m, when),
    };
  }
  return { dead: null, envD: d2, envR: r2, detail: "" };
}

function analyze(
  m: Model,
  pack: string,
  s: CompiledStorylet,
  mode: "normal" | "chain",
): Analysis {
  const findings: Finding[] = [];
  const nexts: { target: string; path: string }[] = [];
  const report = (code: string, path: string, msg: string) =>
    findings.push(finding(code, pack, s.id, path, msg));

  const chainOnly = isChainOnly(s);
  let envD: Env = NO_ENV;
  let envR: Env = NO_ENV;
  let dead = false;
  if (mode === "normal" && s.when) {
    const g = gate(m, s.when, envD, envR);
    if (g.dead) {
      dead = true;
      report(
        g.dead,
        "when",
        g.dead === "L001"
          ? "the storylet's `when` can never be true"
          : `the storylet's \`when\` can never be true: ${g.detail}`,
      );
    } else {
      envD = g.envD;
      envR = g.envR;
    }
  }

  let root = !chainOnly && !dead;
  if (mode === "normal" && s.trigger === "event") {
    for (const [field, e] of [
      ["chance", s.chance],
      ["weight", s.weight],
    ] as const) {
      if (e === undefined) continue;
      const v = m.reach.ev(e, envR);
      if (v.hi <= 0) {
        report(
          "L005",
          field,
          `the ${field} is always 0, so the event never fires`,
        );
        root = false;
      } else if (field === "chance" && v.hi > MAX_CHANCE && v.hi < Infinity) {
        report(
          "L008",
          field,
          `the chance reaches ${v.hi / 100}% and is clipped at 100%`,
        );
      }
    }
  }

  let live = 0;
  let liveWithNext = 0;
  let canResolve = s.choices.length === 0 && s.outcomes.length === 0;
  const scan = (
    outs: readonly CompiledOutcome[],
    prefix: string,
    eD: Env,
    eR: Env,
  ): number => {
    let n = 0;
    outs.forEach((o, i) => {
      const at = `${prefix}outcomes[${i}]`;
      const g = gate(m, o.when, eD, eR);
      if (g.dead) {
        if (!dead) {
          report(
            g.dead,
            `${at}.when`,
            g.dead === "L001"
              ? "the outcome's `when` can never be true"
              : `the outcome's \`when\` can never be true: ${g.detail}`,
          );
        }
        return;
      }
      const w = m.reach.ev(o.weight, g.envR);
      if (w.hi <= 0) {
        if (!dead)
          report("L005", `${at}.weight`, "the outcome weight is always 0");
        return;
      }
      n++;
      live++;
      if (o.next !== undefined) {
        liveWithNext++;
        nexts.push({ target: o.next, path: `${at}.next` });
      }
    });
    return n;
  };

  if (s.choices.length === 0) {
    if (scan(s.outcomes, "", envD, envR) > 0) canResolve = true;
  } else {
    s.choices.forEach((c: CompiledChoice, i) => {
      const at = `choices[${i}]`;
      const g = gate(m, c.when, envD, envR);
      if (g.dead) {
        if (!dead) {
          report(
            g.dead,
            `${at}.when`,
            g.dead === "L001"
              ? "the choice's `when` can never be true"
              : `the choice's \`when\` can never be true: ${g.detail}`,
          );
        }
        return;
      }
      const n = scan(c.outcomes, `${at}.`, g.envD, g.envR);
      if (n > 0 || c.outcomes.length === 0) canResolve = true;
    });
  }

  return {
    findings,
    dead,
    nexts,
    canResolve,
    forced: live > 0 && live === liveWithNext,
    root,
  };
}

// ---- wagers -----------------------------------------------------------------

/** `k * amount + c`. */
interface Linear {
  readonly k: number;
  readonly c: number;
}

function linear(e: Expr): Linear | null {
  if (typeof e === "number") return { k: 0, c: e };
  if (!Array.isArray(e)) return null;
  const t = e as readonly unknown[];
  switch (t[0]) {
    case "v":
      return t[1] === "amount" ? { k: 1, c: 0 } : null;
    case "neg": {
      const a = linear(t[1] as Expr);
      return a && { k: -a.k, c: -a.c };
    }
    case "+":
    case "-": {
      const a = linear(t[1] as Expr);
      const b = linear(t[2] as Expr);
      if (!a || !b) return null;
      const s = t[0] === "+" ? 1 : -1;
      return { k: a.k + s * b.k, c: a.c + s * b.c };
    }
    case "*": {
      const a = linear(t[1] as Expr);
      const b = linear(t[2] as Expr);
      if (!a || !b) return null;
      if (a.k === 0) return { k: a.c * b.k, c: a.c * b.c };
      if (b.k === 0) return { k: b.c * a.k, c: b.c * a.c };
      return null;
    }
    case "/": {
      const a = linear(t[1] as Expr);
      const b = linear(t[2] as Expr);
      return a && b && b.k === 0 && b.c !== 0
        ? { k: a.k / b.c, c: a.c / b.c }
        : null;
    }
    default:
      return null;
  }
}

/**
 * The closed-form return of one choice (or the single outcome list) of a wager: 1 plus the
 * mean net money change per unit staked. Null when it has no closed form (weights or `when`
 * that depend on the life, a `next`, money effects that are not linear in `amount`).
 */
function wagerReturn(
  m: Model,
  outs: readonly CompiledOutcome[],
): number | null {
  if (outs.length === 0) return null;
  const rows: { w: number; k: number; c: number }[] = [];
  for (const o of outs) {
    if (o.next !== undefined) return null;
    if (o.when !== undefined && !isTrue(m.declared.ev(o.when, NO_ENV))) {
      return null;
    }
    const w = m.declared.ev(o.weight, NO_ENV);
    if (!isPoint(w) || w.lo < 0) return null;
    let k = 0;
    let c = 0;
    for (const e of o.effects) {
      const [op, target, expr] = e as readonly [string, unknown, Expr];
      if (target !== "money" || (op !== "add" && op !== "sub")) continue;
      const l = linear(expr);
      if (!l) return null;
      const s = op === "add" ? 1 : -1;
      k += s * l.k;
      c += s * l.c;
    }
    rows.push({ w: w.lo, k, c });
  }
  const total = rows.reduce((a, r) => a + r.w, 0);
  if (total <= 0) return null;
  const perAmount = rows.some((r) => r.k !== 0);
  if (perAmount) {
    if (rows.some((r) => r.c !== 0)) return null;
    return 1 + rows.reduce((a, r) => a + r.w * r.k, 0) / total;
  }
  const stake = -Math.min(...rows.map((r) => r.c));
  if (stake <= 0) return null;
  return 1 + rows.reduce((a, r) => a + r.w * r.c, 0) / total / stake;
}

function checkWager(
  m: Model,
  pack: string,
  s: CompiledStorylet,
  band: readonly [number, number],
): Finding[] {
  const out: Finding[] = [];
  const sets: { path: string; outs: readonly CompiledOutcome[] }[] =
    s.choices.length === 0
      ? [{ path: "", outs: s.outcomes }]
      : s.choices.map((c, i) => ({ path: `choices[${i}]`, outs: c.outcomes }));
  for (const { path, outs } of sets) {
    const r = wagerReturn(m, outs);
    if (r === null) continue;
    const pct = `${(r * 100).toFixed(1)}%`;
    const range = `${band[0] * 100}-${band[1] * 100}%`;
    if (r > band[1] + 1e-9) {
      out.push(
        finding(
          "L007",
          pack,
          s.id,
          path,
          `closed-form return ${pct} is above the band ${range}`,
        ),
      );
    } else if (r < band[0] - 1e-9) {
      out.push(
        finding(
          "L007",
          pack,
          s.id,
          path,
          `closed-form return ${pct} is below the band ${range}`,
          "warning",
        ),
      );
    }
  }
  return out;
}

// ---- entry ------------------------------------------------------------------

/** Every finding over `bundles` (the whole Pack set, in any order), sorted. */
export function checkBundles(
  bundles: readonly PackBundle[],
  opts: CheckOptions = {},
): Finding[] {
  const m = buildModel(bundles);
  const findings: Finding[] = [];
  const all = new Map<string, { pack: string; s: CompiledStorylet }>();
  for (const b of bundles) {
    for (const s of b.storylets) all.set(s.id, { pack: b.id, s });
  }

  const chainOnly = isChainOnly;
  const analysis = new Map<string, Analysis>();
  /** Whether a chain into the storylet can resolve (its own `when` is not checked). */
  const resolves = new Map<string, boolean>();
  for (const [id, { pack, s }] of all) {
    const a = analyze(m, pack, s, chainOnly(s) ? "chain" : "normal");
    analysis.set(id, a);
    resolves.set(
      id,
      chainOnly(s) ? a.canResolve : analyze(m, pack, s, "chain").canResolve,
    );
  }

  // Reachability: roots, then storylets only a `next` can open.
  const reached = new Set<string>();
  const queue: string[] = [];
  for (const [id, a] of analysis) {
    if (a.root && a.canResolve) {
      reached.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const a = analysis.get(queue.pop() as string);
    for (const n of a?.nexts ?? []) {
      if (all.has(n.target) && !reached.has(n.target)) {
        reached.add(n.target);
        queue.push(n.target);
      }
    }
  }

  for (const [id, { pack, s }] of all) {
    const a = analysis.get(id) as Analysis;
    if (chainOnly(s)) {
      if (!reached.has(id)) {
        findings.push(
          finding(
            "L003",
            pack,
            id,
            "",
            "no reachable outcome chains to this storylet, and it has no chance or weight of its own",
          ),
        );
      } else if (a.canResolve) {
        // A target that cannot resolve is reported once, by the L004 of whatever chains to it.
        findings.push(...a.findings);
      }
    } else {
      findings.push(...a.findings);
    }
    for (const n of a.nexts) {
      const t = all.get(n.target);
      if (t && resolves.get(n.target) === false) {
        findings.push(
          finding(
            "L004",
            pack,
            id,
            n.path,
            `\`next\` opens ${n.target}, which has no outcome that can resolve`,
          ),
        );
      }
    }
    if (s.tags.includes("wager")) {
      findings.push(
        ...checkWager(
          m,
          pack,
          s,
          opts.wagerBands?.get(pack) ?? DEFAULT_WAGER_BAND,
        ),
      );
    }
  }

  // Loops: storylets whose every live outcome chains, and only to storylets that do the same.
  const trapped = new Set<string>();
  for (const [id, a] of analysis) if (a.forced) trapped.add(id);
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of trapped) {
      const a = analysis.get(id) as Analysis;
      if (a.nexts.some((n) => !trapped.has(n.target))) {
        trapped.delete(id);
        changed = true;
      }
    }
  }
  for (const id of trapped) {
    const pack = all.get(id)?.pack ?? "";
    findings.push(
      finding(
        "L009",
        pack,
        id,
        "",
        "every outcome chains onward and the chain never leaves this loop",
      ),
    );
  }

  for (const [id, q] of m.quality) {
    if (m.read.has(id) && !m.written.has(id)) {
      findings.push(
        finding(
          "L006",
          q.pack,
          `quality.${id}`,
          "",
          `read but never written: it stays at its default (${q.decl.default})`,
        ),
      );
    }
  }

  return findings.sort(
    (a, b) =>
      a.pack.localeCompare(b.pack) ||
      a.subject.localeCompare(b.subject) ||
      a.code.localeCompare(b.code) ||
      a.path.localeCompare(b.path),
  );
}
