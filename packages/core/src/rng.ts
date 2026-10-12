import { cyrb128 } from "./hash.ts";
import type { Gender } from "./state/types.ts";

/** Which god-mode category a draw belongs to (DESIGN.md §1.2). */
export type GodCategory = "outcome" | "event" | "person" | "npc";

/**
 * Describes a draw to god mode. Optional and inert for a plain {@link Rng}; a
 * {@link GodRng} uses it to build a {@link GodDraw} when it asks the player.
 */
export interface DrawInfo {
  readonly cat: GodCategory;
  /** The question shown to the player ("Which event?"). */
  readonly label: string;
  /** Value shown for an int draw is `offset + v` (default 0). */
  readonly offset?: number;
  /** Labels for an int draw over a small range (one per value). */
  readonly options?: readonly string[];
  /** The first-name draw: its pool for each gender (the form resolves a name from the index). */
  readonly names?: Readonly<Record<Gender, readonly string[]>>;
}

/** One draw a player may answer. `d` is the draw ordinal within its site. */
export interface GodDraw {
  readonly age: number;
  readonly key: string;
  readonly n: number;
  readonly d: number;
  readonly cat: GodCategory;
  readonly label: string;
  readonly kind: "chance" | "int" | "pick";
  /** The value the draw would have had without god mode. */
  readonly natural: number | boolean;
  /** Chance draws: the basis points. */
  readonly bp?: number;
  /** Int draws: the range `[0, range)`. */
  readonly range?: number;
  /** Int draws: the value shown is `offset + v`. */
  readonly offset?: number;
  /** Pick draws: one entry per index. */
  readonly options?: readonly {
    readonly label: string;
    readonly weight: number;
  }[];
  /** The first-name draw: its pool for each gender. */
  readonly names?: Readonly<Record<Gender, readonly string[]>>;
}

/**
 * Thrown by a god-mode draw that needs the player. Caught by the caller, which
 * shows the draws and re-runs the step once the player has answered.
 */
export class GodAsk extends Error {
  readonly title: string;
  readonly draws: readonly GodDraw[];
  readonly form: boolean;

  constructor(title: string, draws: readonly GodDraw[], form: boolean) {
    super(title);
    this.name = "GodAsk";
    this.title = title;
    this.draws = draws;
    this.form = form;
  }
}

/**
 * Transient god-mode state carried by a world while a step runs. Never
 * serialized. `picks` holds answers keyed by roll id (`age|key|n|d`); `used`
 * records which picks a completed draw consumed.
 */
export interface GodContext {
  readonly picks: ReadonlyMap<string, number | boolean>;
  readonly ask?: readonly GodCategory[];
  readonly skip?: ReadonlySet<string>;
  readonly used: Set<string>;
}

/**
 * A weighted pick's option name: a plain string, or an outcome's `{ label, text }`.
 * `label` is shown in god mode and matched first by a forced string; `text`, when
 * set, is matched next (exact).
 */
export type PickName =
  | string
  | { readonly label: string; readonly text?: string | undefined };

const nameOf = (n: PickName): string => (typeof n === "string" ? n : n.label);

/** An option's name in the forced-pick error: its label, and its text when it has one. */
const describeName = (n: PickName): string =>
  typeof n === "string" || n.text === undefined
    ? nameOf(n)
    : `${n.label} (text "${n.text}")`;

/** Index of the option a forced string names: its label first, then its text; -1 when neither matches. */
function indexOfName(
  names: readonly PickName[] | undefined,
  p: string,
): number {
  if (!names) return -1;
  const byLabel = names.findIndex((n) => nameOf(n) === p);
  if (byLabel >= 0) return byLabel;
  return names.findIndex((n) => typeof n !== "string" && n.text === p);
}

/** God-mode label of option `i`; its index as text when unnamed. */
function labelAt(names: readonly PickName[] | undefined, i: number): string {
  const n = names?.[i];
  return n === undefined ? String(i) : nameOf(n);
}

/** Values a forced stream returns in place of random draws; unset kinds fall back to the real stream. */
export interface ScriptedRolls {
  /** Result of `chanceBp` (hit or miss), whatever the probability. */
  readonly chance?: boolean;
  /** Result of `int(n)`; must lie in `[0, n)`. */
  readonly int?: number;
  /** Result of `weightedPick`: an index with positive weight, or a string naming an option: its label, else its text (exact). */
  readonly pick?: number | string;
}

/**
 * Sfc32 generator (Chris Doty-Humphrey, public domain), 32-bit state words,
 * Math.imul and >>> 0 only. Mutable by design; keep it local to one roll site.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(a: number, b: number, c: number, d: number) {
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
    for (let i = 0; i < 12; i++) this.next32();
  }

  /** Next uint32. */
  next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [0, n), unbiased (rejection sampling). 1 <= n <= 2^32. */
  int(n: number, info?: DrawInfo): number {
    void info;
    return this.rawInt(n);
  }

  /** True with probability bp/10000 (basis points). bp <= 0 never, >= 10000 always; consumes no randomness at the extremes. */
  chanceBp(bp: number, info?: DrawInfo): boolean {
    void info;
    return this.rawChance(bp);
  }

  /** Index chosen with probability weights[i] / sum(weights). Weights are non-negative integers with a positive sum; zero weights are never chosen. */
  weightedPick(
    weights: readonly number[],
    names?: readonly PickName[],
    info?: DrawInfo,
  ): number {
    void names;
    void info;
    return this.rawPick(weights);
  }

  /** Draws still open for the player (form-mode god streams only). */
  pendingDraws(): readonly GodDraw[] {
    return NO_DRAWS;
  }

  /** Natural draw; never reaches god mode, so internal draws stay on the real stream. */
  protected rawInt(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 0x100000000) {
      throw new RangeError(`int(n): n must be an integer in 1..2^32, got ${n}`);
    }
    const limit = Math.floor(0x100000000 / n) * n;
    let x = this.next32();
    while (x >= limit) x = this.next32();
    return x % n;
  }

  protected rawChance(bp: number): boolean {
    if (!Number.isInteger(bp))
      throw new RangeError(`chanceBp(bp): bp must be an integer, got ${bp}`);
    if (bp <= 0) return false;
    if (bp >= 10000) return true;
    return this.rawInt(10000) < bp;
  }

  protected rawPick(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w < 0)
        throw new RangeError(`weightedPick: invalid weight ${w}`);
      total += w;
    }
    if (total < 1)
      throw new RangeError("weightedPick: weights must have a positive sum");
    let r = this.rawInt(total);
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (r < w) return i;
      r -= w;
    }
    throw new Error("unreachable");
  }
}

const NO_DRAWS: readonly GodDraw[] = [];

/** Site of a god-mode stream: the `nextStream` arguments. */
export interface GodSite {
  readonly age: number;
  readonly key: string;
  readonly n: number;
}

/** Roll id of one draw: the picks table key. `d` is the draw ordinal within the site. */
export function rollId(site: GodSite, d: number): string {
  return `${site.age}|${site.key}|${site.n}|${d}`;
}

/**
 * A stream that answers draws from god picks, forced rolls, or the natural
 * stream (ADR 0003 amendment; DESIGN.md §1). Every call is numbered per site.
 * Natural draws always run first, so the stream position never depends on
 * god mode. Precedence: forced rolls, then god picks, then the natural value.
 * Asked draws throw {@link GodAsk}, or in form mode are collected in
 * {@link pendingDraws} for one combined ask.
 */
export class GodRng extends Rng {
  private ordinal = 0;
  private readonly open: GodDraw[] = [];
  private readonly site: GodSite;
  private readonly god: GodContext | undefined;
  private readonly forced: ScriptedRolls | undefined;
  private readonly form: boolean;

  constructor(
    words: readonly [number, number, number, number],
    site: GodSite,
    god: GodContext | undefined,
    forced: ScriptedRolls | undefined,
    form: boolean,
  ) {
    super(words[0], words[1], words[2], words[3]);
    this.site = site;
    this.god = god;
    this.forced = forced;
    this.form = form;
  }

  override pendingDraws(): readonly GodDraw[] {
    return this.open;
  }

  override int(n: number, info?: DrawInfo): number {
    const natural = this.rawInt(n);
    const d = this.ordinal++;
    const f = this.forced?.int;
    if (f !== undefined) {
      if (!Number.isInteger(f) || f < 0 || f >= n)
        throw new RangeError(`forced int ${f} is outside [0, ${n})`);
      return f;
    }
    const picked = this.picked(d);
    if (picked !== undefined) {
      const v = picked as number;
      if (!Number.isInteger(v) || v < 0 || v >= n)
        throw new RangeError(`god int ${v} is outside [0, ${n})`);
      return v;
    }
    if (info)
      this.ask(
        d,
        "int",
        info,
        natural,
        {
          range: n,
          ...(info.offset === undefined ? {} : { offset: info.offset }),
          ...(info.names === undefined ? {} : { names: info.names }),
          ...(info.options === undefined
            ? {}
            : { options: info.options.map((label) => ({ label, weight: 1 })) }),
        },
        n === 1,
      );
    return natural;
  }

  override chanceBp(bp: number, info?: DrawInfo): boolean {
    const natural = this.rawChance(bp);
    const d = this.ordinal++;
    const f = this.forced?.chance;
    if (f !== undefined) return f;
    const extreme = bp <= 0 || bp >= 10000;
    const picked = this.picked(d);
    if (picked !== undefined) return picked as boolean;
    if (info) this.ask(d, "chance", info, natural, { bp }, extreme);
    return natural;
  }

  override weightedPick(
    weights: readonly number[],
    names?: readonly PickName[],
    info?: DrawInfo,
  ): number {
    const natural = this.rawPick(weights);
    const d = this.ordinal++;
    const positive = weights.filter((w) => w > 0).length;
    const trivial = positive === 1;
    const p = this.forced?.pick;
    if (p !== undefined) {
      const i = typeof p === "string" ? indexOfName(names, p) : p;
      if (typeof p === "string" && i < 0)
        throw new RangeError(
          `forced pick "${p}" matches no label or text (${names?.map(describeName).join(" | ") ?? "none given"})`,
        );
      if (!Number.isInteger(i) || !((weights[i] ?? 0) > 0))
        throw new RangeError(`forced pick ${i} is not a drawable index`);
      return i;
    }
    const picked = this.picked(d);
    if (picked !== undefined) {
      const i = picked as number;
      if (!Number.isInteger(i) || !((weights[i] ?? 0) > 0))
        throw new RangeError(`god pick ${i} is not a drawable index`);
      return i;
    }
    if (info)
      this.ask(
        d,
        "pick",
        info,
        natural,
        {
          options: weights.map((weight, i) => ({
            label: labelAt(names, i),
            weight,
          })),
        },
        trivial,
      );
    return natural;
  }

  private picked(d: number): number | boolean | undefined {
    const god = this.god;
    if (!god) return undefined;
    const id = rollId(this.site, d);
    if (!god.picks.has(id)) return undefined;
    god.used.add(id);
    return god.picks.get(id);
  }

  private ask(
    d: number,
    kind: GodDraw["kind"],
    info: DrawInfo,
    natural: number | boolean,
    shape: {
      bp?: number;
      range?: number;
      offset?: number;
      names?: GodDraw["names"];
      options?: GodDraw["options"];
    },
    trivial: boolean,
  ): void {
    const god = this.god;
    if (!god?.ask?.includes(info.cat) || trivial) return;
    if (god.skip?.has(rollId(this.site, d))) return;
    const draw: GodDraw = {
      age: this.site.age,
      key: this.site.key,
      n: this.site.n,
      d,
      cat: info.cat,
      label: info.label,
      kind,
      natural,
      ...(shape.bp !== undefined ? { bp: shape.bp } : {}),
      ...(shape.range !== undefined ? { range: shape.range } : {}),
      ...(shape.offset !== undefined ? { offset: shape.offset } : {}),
      ...(shape.names !== undefined ? { names: shape.names } : {}),
      ...(shape.options !== undefined ? { options: shape.options } : {}),
    };
    if (this.form) {
      this.open.push(draw);
      return;
    }
    throw new GodAsk(info.label, [draw], false);
  }
}

/** Values forced by a stream override (see {@link setStreamOverride}). */
let streamOverride:
  | ((
      age: number,
      purposeKey: string,
      counter: number,
    ) => ScriptedRolls | undefined)
  | null = null;

/**
 * Force draws of any roll site: `override` is asked for every `nextStream` (the
 * age, the purpose key such as `gambling/play-slots` or `outcome/gambling/play-slots`,
 * and the counter the site would use) and returned rolls replace the draws of
 * that kind at that site; `undefined` leaves the site alone. Counters advance
 * exactly as without it, and unforced draws come from the real stream. `null`
 * clears. Forced rolls are not logged: a forced life is not replayable from its
 * choice log. Module-level, for vitest and the harness; `apps/web` must never
 * import it (the e2e production-bundle guard checks).
 */
export function setStreamOverride(
  override:
    | ((
        age: number,
        purposeKey: string,
        counter: number,
      ) => ScriptedRolls | undefined)
    | null,
): void {
  streamOverride = override;
}

/** @internal Used by `nextStream`. */
export function forcedRolls(
  age: number,
  purposeKey: string,
  counter: number,
): ScriptedRolls | undefined {
  return streamOverride?.(age, purposeKey, counter);
}

/**
 * Derive the sfc32 state words for one roll site (ADR 0003). The inputs are
 * joined as `seed|age|counter|purposeKey` (purpose key last, so it may contain
 * any character) and expanded with cyrb128. Generation 0 keeps that form; later
 * generations insert `g<n>` after the seed (never numeric, so it cannot collide
 * with a generation-0 key).
 */
export function streamWords(
  seed: number,
  age: number,
  purposeKey: string,
  counter: number,
  generation = 0,
): readonly [number, number, number, number] {
  const gen = generation === 0 ? "" : `|g${generation}`;
  return cyrb128(`${seed}${gen}|${age}|${counter}|${purposeKey}`);
}

/**
 * Derive an independent stream for one roll site (ADR 0003). See
 * {@link streamWords} for the key form.
 */
export function streamFor(
  seed: number,
  age: number,
  purposeKey: string,
  counter: number,
  generation = 0,
): Rng {
  const [a, b, c, d] = streamWords(seed, age, purposeKey, counter, generation);
  return new Rng(a, b, c, d);
}
