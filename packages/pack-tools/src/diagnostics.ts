/** One build error, located in a Pack source file. */
export interface Diagnostic {
  /** Path relative to the packs directory, for example `core-loop/storylets/work.yaml`. */
  readonly file: string;
  /** Location inside the file, for example `first-job-offer.choices[0].outcomes[1].effects[0]`. */
  readonly path: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export function formatDiagnostic(d: Diagnostic): string {
  const pos = d.line === undefined ? "" : `:${d.line}:${d.column ?? 1}`;
  const where = d.path ? ` (${d.path})` : "";
  return `${d.file}${pos}${where}: ${d.message}`;
}
