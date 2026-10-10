export interface Dist {
  readonly n: number;
  readonly mean: number;
  readonly min: number;
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly p99: number;
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
    p99: rank(s, 0.99),
    max: s[s.length - 1] as number,
  };
}

/** Percent of `d` that `n` is, one decimal; 0 when `d` is 0. */
export const pct = (n: number, d: number): number =>
  d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
