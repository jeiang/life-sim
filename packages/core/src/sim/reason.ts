import type { Expr } from "../expr/index.ts";

/**
 * A short human reason for a condition that evaluated false. For a conjunction, the first
 * clause that fails (per `holds`) is explained; simple age comparisons read as 'Age 18+';
 * anything else is the generic 'Not available'.
 */
export function explainFalse(e: Expr, holds: (c: Expr) => boolean): string {
  if (typeof e === "object" && e[0] === "and") {
    const l = e[1] as Expr;
    return explainFalse(holds(l) ? (e[2] as Expr) : l, holds);
  }
  return ageClause(e) ?? "Not available";
}

function ageClause(e: Expr): string | undefined {
  if (typeof e !== "object" || e.length !== 3) return undefined;
  const [op, l, r] = e as unknown as [string, Expr, Expr];
  if (!Array.isArray(l) || l[0] !== "v" || l[1] !== "age") return undefined;
  if (typeof r !== "number") return undefined;
  switch (op) {
    case ">=":
      return `Age ${r}+`;
    case ">":
      return `Age ${r + 1}+`;
    case "<":
      return `Under age ${r}`;
    case "<=":
      return `Age ${r} or under`;
    case "==":
      return `Age ${r} only`;
  }
  return undefined;
}
