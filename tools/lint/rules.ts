/** The lint rules: code, severity, name and the one-line fix hint printed with every finding. */
export type Severity = "error" | "warning";

export interface Rule {
  readonly code: string;
  readonly name: string;
  readonly severity: Severity;
  readonly hint: string;
}

export const RULES: Record<string, Rule> = {
  L001: {
    code: "L001",
    name: "unsatisfiable-when",
    severity: "error",
    hint: "no value the declared names can take makes this true: fix the condition or delete the content",
  },
  L002: {
    code: "L002",
    name: "gate-never-written",
    severity: "error",
    hint: "add the effect that sets the gate quality, or drop the gate",
  },
  L003: {
    code: "L003",
    name: "unreachable-chain",
    severity: "error",
    hint: "point a `next` from a reachable outcome at this storylet, or delete it",
  },
  L004: {
    code: "L004",
    name: "chain-target-dead",
    severity: "error",
    hint: "the `next` target has no outcome that can resolve: fix the target or drop the `next`",
  },
  L005: {
    code: "L005",
    name: "zero-weight",
    severity: "error",
    hint: "a weight or chance that is always 0 never fires: give it a positive value or delete it",
  },
  L006: {
    code: "L006",
    name: "quality-never-written",
    severity: "warning",
    hint: "a quality is read but no effect or hook writes it: write it somewhere or delete it",
  },
  L007: {
    code: "L007",
    name: "wager-return",
    severity: "error",
    hint: "retune the outcome weights or payouts, or set `wager_band` in the Pack's lint.yaml",
  },
  L008: {
    code: "L008",
    name: "nominal-chance",
    severity: "warning",
    hint: "the chance reaches past 100% and is clipped: cap it with min(...) or rescale it",
  },
  L009: {
    code: "L009",
    name: "next-loop",
    severity: "error",
    hint: "every outcome chains onward and none leaves the loop: give one outcome no `next`",
  },
  L000: {
    code: "L000",
    name: "stale-allow",
    severity: "warning",
    hint: "the allowlist entry matches no finding: delete it from lint.yaml",
  },
};

export interface Finding {
  readonly code: string;
  readonly rule: string;
  readonly severity: Severity;
  /** Pack that owns the subject (its allowlist applies). */
  readonly pack: string;
  /** Full storylet id, or `quality.<id>` for a quality. */
  readonly subject: string;
  /** Location inside the subject (`choices[0].outcomes[1].when`), empty for the subject itself. */
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

export function finding(
  code: string,
  pack: string,
  subject: string,
  path: string,
  message: string,
  severity?: Severity,
): Finding {
  const r = RULES[code] as Rule;
  return {
    code,
    rule: r.name,
    severity: severity ?? r.severity,
    pack,
    subject,
    path,
    message,
    hint: r.hint,
  };
}
