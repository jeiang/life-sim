/**
 * Content sheet parser (docs/pipeline/content-sheet.md): line-oriented markdown into a typed
 * AST that keeps the 1-based line of everything a tool may need to point at. Shared by
 * `scaffold` (#202) and `focused-sim` (#203); the grammar lives in the document, not here.
 *
 * `parseSheet` applies the grammar and the per-field validation rules (required fields,
 * `event`/`action` rules, once-per-key rules, rate bands) and reports every violation with its
 * line number. It does not look at the Pack vocabulary: that is the caller's check.
 */

/** A value and the 1-based line it was written on. */
export interface Located {
  readonly value: string;
  readonly line: number;
}

/** An expected-rate band, `lo..hi` (`opens`: per life, `rate`: percent). */
export interface Band {
  readonly lo: number;
  readonly hi: number;
}

export interface LocatedBand extends Located, Band {}

export interface SheetOutcome {
  readonly line: number;
  /** Integer or expression, verbatim. */
  readonly weight: Located;
  readonly text: Located;
  readonly when?: Located;
  /** Effect statements in written order, verbatim. */
  readonly effects: readonly Located[];
  readonly next?: Located;
  /** Percent band. */
  readonly rate?: LocatedBand;
}

export interface SheetChoice {
  readonly line: number;
  readonly label: Located;
  readonly when?: Located;
  readonly outcomes: readonly SheetOutcome[];
}

/** A `needs` line: a name the vocabulary lacks. */
export interface SheetNeed {
  readonly line: number;
  readonly kind: string;
  readonly name: string;
  /** Type and range, verbatim. */
  readonly type: string;
  readonly meaning: string;
}

export interface SheetStorylet {
  readonly id: string;
  readonly line: number;
  /**
   * Fields by key (`trigger`, `when`, `repeat.full`, ...), each once. Excludes `opens` and
   * `needs`, which are typed below.
   */
  readonly fields: Readonly<Record<string, Located>>;
  /** Mean opens per life. */
  readonly opens?: LocatedBand;
  readonly needs: readonly SheetNeed[];
  /** Non-empty for a storylet with `### choice:` sections, else empty. */
  readonly choices: readonly SheetChoice[];
  /** The `### outcomes` list; empty for a storylet with choices. */
  readonly outcomes: readonly SheetOutcome[];
}

export interface Sheet {
  readonly title: Located;
  /** Header fields by key. */
  readonly headers: Readonly<Record<string, Located>>;
  /** Owner Pack id. */
  readonly pack: string;
  /** Pack ids the vocabulary was printed for. */
  readonly packs: readonly string[];
  /** Harness profile (default `all`). */
  readonly profile: string;
  /** Lives for the focused sim (default 1000). */
  readonly lives: number;
  readonly storylets: readonly SheetStorylet[];
}

export interface SheetError {
  readonly line: number;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly sheet: Sheet }
  | { readonly ok: false; readonly errors: readonly SheetError[] };

export const ID = /^[a-z][a-z0-9_-]*$/;
const MENU =
  /^(occupation|assets|relationships|activities)(\/[a-z][a-z0-9_-]*)?$/;
const PERCENT = /^\d+(\.\d{1,2})?%$/;
const INT = /^\d+$/;
const NUM = "\\d+(?:\\.\\d+)?";

const HEADER_KEYS: Record<string, true> = Object.fromEntries(
  ["pack", "packs", "profile", "lives"].map((k) => [k, true]),
);
const STORYLET_KEYS: Record<string, true> = Object.fromEntries(
  [
    "trigger",
    "menu",
    "label",
    "icon",
    "tags",
    "scope",
    "target",
    "when",
    "chance",
    "weight",
    "once",
    "repeatable",
    "cooldown",
    "max_per_life",
    "repeat.full",
    "repeat.reduced",
    "repeat.factor",
    "amount.min",
    "amount.max",
    "amount.step",
    "text",
    "opens",
    "needs",
  ].map((k) => [k, true]),
);
const OUTCOME_KEYS: Record<string, true> = Object.fromEntries(
  ["text", "when", "effect", "next", "rate"].map((k) => [k, true]),
);

/** A band `<lo>..<hi><unit>`, or undefined when `value` is not one (a single value is not a band). */
export function parseBand(
  value: string,
  unit: "per life" | "%",
): Band | undefined {
  const tail = unit === "%" ? "\\s*%" : "\\s+per life";
  const m = new RegExp(`^(${NUM})\\.\\.(${NUM})${tail}$`).exec(value);
  if (!m) return undefined;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  return lo <= hi ? { lo, hi } : undefined;
}

/** `a, b, c` as trimmed non-empty items. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

interface OutcomeDraft {
  line: number;
  weight: Located;
  text?: Located;
  when?: Located;
  effects: Located[];
  next?: Located;
  rate?: LocatedBand;
}

interface ChoiceDraft {
  line: number;
  label: Located;
  when?: Located;
  outcomes: OutcomeDraft[];
}

interface StoryletDraft {
  id: string;
  line: number;
  fields: Record<string, Located>;
  opens?: LocatedBand;
  needs: SheetNeed[];
  choices: ChoiceDraft[];
  outcomes: OutcomeDraft[];
  /** The section lines are being added to. */
  section: "none" | "outcomes" | "choice";
  hasOutcomesSection: boolean;
  outcome: OutcomeDraft | undefined;
}

/** Parse `text` as a content sheet. */
export function parseSheet(text: string): ParseResult {
  const errors: SheetError[] = [];
  const err = (line: number, message: string): void => {
    errors.push({ line, message });
  };

  let title: Located | undefined;
  const headers: Record<string, Located> = {};
  const storylets: StoryletDraft[] = [];
  let cur: StoryletDraft | undefined;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = (lines[i] as string).replace(/\s+$/, "");
    if (line === "" || line.startsWith(">")) continue;

    if (title === undefined) {
      const m = /^# Content sheet: (.+)$/.exec(line);
      if (m) {
        title = { value: (m[1] as string).trim(), line: n };
      } else {
        err(n, "expected the title line `# Content sheet: <title>`");
        title = { value: "", line: n };
      }
      continue;
    }

    const mH = /^## (.*)$/.exec(line);
    if (mH) {
      const id = (mH[1] as string).trim();
      if (!ID.test(id)) {
        err(n, `storylet id '${id}' must match ^[a-z][a-z0-9_-]*$`);
      } else if (storylets.some((s) => s.id === id)) {
        err(n, `storylet id '${id}' is already used in this sheet`);
      }
      cur = {
        id,
        line: n,
        fields: {},
        needs: [],
        choices: [],
        outcomes: [],
        section: "none",
        hasOutcomesSection: false,
        outcome: undefined,
      };
      storylets.push(cur);
      continue;
    }

    if (line === "### outcomes") {
      if (!cur) {
        err(n, "`### outcomes` before the first `## <id>` storylet");
      } else if (cur.hasOutcomesSection) {
        err(n, "a storylet has one `### outcomes` section");
      } else if (cur.choices.length > 0) {
        err(
          n,
          "a storylet has `### outcomes` or `### choice:` sections, never both",
        );
      } else {
        cur.section = "outcomes";
        cur.hasOutcomesSection = true;
        cur.outcome = undefined;
      }
      continue;
    }

    const mC = /^### choice: (.+)$/.exec(line);
    if (mC) {
      const label = (mC[1] as string).trim();
      if (!cur) {
        err(n, "`### choice:` before the first `## <id>` storylet");
      } else if (cur.hasOutcomesSection) {
        err(
          n,
          "a storylet has `### outcomes` or `### choice:` sections, never both",
        );
      } else {
        if (cur.choices.some((c) => c.label.value === label)) {
          err(n, `choice '${label}' appears twice in '${cur.id}'`);
        }
        cur.choices.push({
          line: n,
          label: { value: label, line: n },
          outcomes: [],
        });
        cur.section = "choice";
        cur.outcome = undefined;
      }
      continue;
    }

    const mO = /^- outcome: (.+)$/.exec(line);
    if (mO) {
      const section = cur?.section;
      if (!cur || section === "none" || section === undefined) {
        err(
          n,
          "`- outcome:` outside a `### outcomes` or `### choice:` section",
        );
        continue;
      }
      const o: OutcomeDraft = {
        line: n,
        weight: { value: (mO[1] as string).trim(), line: n },
        effects: [],
      };
      const list =
        section === "outcomes"
          ? cur.outcomes
          : (cur.choices[cur.choices.length - 1] as ChoiceDraft).outcomes;
      list.push(o);
      cur.outcome = o;
      continue;
    }

    const mS = /^ {2}- ([a-z]+):(?: (.*))?$/.exec(line);
    if (mS) {
      const key = mS[1] as string;
      const value = (mS[2] ?? "").trim();
      const o = cur?.outcome;
      if (!o) {
        err(n, `\`  - ${key}:\` outside an outcome`);
      } else if (!Object.hasOwn(OUTCOME_KEYS, key)) {
        err(n, `unknown outcome key '${key}' (text, when, effect, next, rate)`);
      } else if (value === "") {
        err(n, `outcome key '${key}' has an empty value; leave the line out`);
      } else if (key === "effect") {
        o.effects.push({ value, line: n });
      } else if (o[key as "text" | "when" | "next" | "rate"] !== undefined) {
        err(n, `outcome key '${key}' appears twice in one outcome`);
      } else if (key === "rate") {
        const b = parseBand(value, "%");
        if (b) o.rate = { value, line: n, ...b };
        else
          err(
            n,
            `rate '${value}' must be a band \`<lo>..<hi>%\` with lo <= hi`,
          );
      } else {
        o[key as "text" | "when" | "next"] = { value, line: n };
      }
      continue;
    }

    const mF = /^- ([a-z][a-z0-9_.]*):(?: (.*))?$/.exec(line);
    if (mF) {
      const key = mF[1] as string;
      const value = (mF[2] ?? "").trim();
      if (value === "") {
        err(n, `field '${key}' has an empty value; leave the line out`);
        continue;
      }
      if (!cur) {
        if (!Object.hasOwn(HEADER_KEYS, key)) {
          err(n, `unknown header key '${key}' (pack, packs, profile, lives)`);
        } else if (headers[key]) {
          err(n, `header '${key}' appears twice`);
        } else {
          headers[key] = { value, line: n };
        }
        continue;
      }
      if (cur.section === "choice") {
        const ch = cur.choices[cur.choices.length - 1] as ChoiceDraft;
        if (key === "when" && ch.outcomes.length === 0 && !ch.when) {
          ch.when = { value, line: n };
        } else {
          err(
            n,
            `a choice takes only one \`when\` field directly under its heading, not '${key}'`,
          );
        }
        continue;
      }
      if (cur.section === "outcomes" || cur.outcomes.length > 0) {
        err(
          n,
          `field '${key}' after a section; fields come before \`### outcomes\` / \`### choice:\``,
        );
        continue;
      }
      if (!Object.hasOwn(STORYLET_KEYS, key)) {
        err(n, `unknown storylet field '${key}'`);
      } else if (key === "needs") {
        const parts = value.split(": ");
        const head = (parts[0] ?? "").split(/\s+/);
        if (
          parts.length < 3 ||
          head.length !== 2 ||
          head.some((p) => p === "")
        ) {
          err(n, "`needs` is `<kind> <name>: <type and range>: <meaning>`");
        } else {
          cur.needs.push({
            line: n,
            kind: head[0] as string,
            name: head[1] as string,
            type: (parts[1] as string).trim(),
            meaning: parts.slice(2).join(": ").trim(),
          });
        }
      } else if (key === "opens") {
        if (cur.opens) {
          err(n, "field 'opens' appears twice");
        } else {
          const b = parseBand(value, "per life");
          if (b) cur.opens = { value, line: n, ...b };
          else
            err(
              n,
              `opens '${value}' must be a band \`<lo>..<hi> per life\` with lo <= hi`,
            );
        }
      } else if (cur.fields[key]) {
        err(n, `field '${key}' appears twice`);
      } else {
        cur.fields[key] = { value, line: n };
      }
      continue;
    }

    err(n, `line matches no form of the grammar: ${line}`);
  }

  if (title === undefined)
    err(1, "empty sheet: expected `# Content sheet: <title>`");

  // ---- headers ----
  for (const key of ["pack", "packs"]) {
    if (!headers[key])
      err(title?.line ?? 1, `missing required header '${key}'`);
  }
  const pack = headers.pack?.value ?? "";
  const packs = splitList(headers.packs?.value ?? "");
  if (headers.pack && !ID.test(pack))
    err(headers.pack.line, `pack '${pack}' is not a Pack id`);
  if (headers.packs) {
    for (const p of packs) {
      if (!ID.test(p))
        err(headers.packs.line, `'${p}' in packs is not a Pack id`);
    }
    if (headers.pack && !packs.includes(pack)) {
      err(headers.packs.line, `packs must include the owner pack '${pack}'`);
    }
  }
  let lives = 1000;
  if (headers.lives) {
    if (/^[1-9]\d*$/.test(headers.lives.value))
      lives = Number(headers.lives.value);
    else
      err(
        headers.lives.line,
        `lives '${headers.lives.value}' must be a positive integer`,
      );
  }
  if (storylets.length === 0)
    err(title?.line ?? 1, "a sheet has at least one `## <id>` storylet");

  // ---- storylets ----
  const out: SheetStorylet[] = [];
  for (const s of storylets) {
    validateStorylet(s, err);
    const freeze = (o: OutcomeDraft): SheetOutcome => ({
      line: o.line,
      weight: o.weight,
      text: o.text ?? { value: "", line: o.line },
      ...(o.when ? { when: o.when } : {}),
      effects: o.effects,
      ...(o.next ? { next: o.next } : {}),
      ...(o.rate ? { rate: o.rate } : {}),
    });
    out.push({
      id: s.id,
      line: s.line,
      fields: s.fields,
      ...(s.opens ? { opens: s.opens } : {}),
      needs: s.needs,
      choices: s.choices.map((c) => ({
        line: c.line,
        label: c.label,
        ...(c.when ? { when: c.when } : {}),
        outcomes: c.outcomes.map(freeze),
      })),
      outcomes: s.outcomes.map(freeze),
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors: [...errors].sort((a, b) => a.line - b.line) };
  }
  return {
    ok: true,
    sheet: {
      title: title as Located,
      headers,
      pack,
      packs,
      profile: headers.profile?.value ?? "all",
      lives,
      storylets: out,
    },
  };
}

function validateStorylet(
  s: StoryletDraft,
  err: (line: number, message: string) => void,
): void {
  const f = s.fields;
  const need = (key: string): Located | undefined => {
    if (!f[key])
      err(s.line, `storylet '${s.id}' is missing required field '${key}'`);
    return f[key];
  };
  const forbid = (key: string, why: string): void => {
    const v = f[key];
    if (v) err(v.line, `'${key}' ${why}`);
  };

  need("text");
  const trigger = need("trigger");
  if (trigger && trigger.value !== "event" && trigger.value !== "action") {
    err(trigger.line, `trigger '${trigger.value}' must be event or action`);
  } else if (trigger?.value === "event") {
    if (f.chance && f.weight) {
      err(f.weight.line, "an event has exactly one of `chance` and `weight`");
    } else if (!f.chance && !f.weight) {
      err(s.line, `event '${s.id}' needs \`chance\` or \`weight\``);
    }
    for (const k of [
      "menu",
      "label",
      "repeatable",
      "repeat.full",
      "repeat.reduced",
      "repeat.factor",
      "amount.min",
      "amount.max",
      "amount.step",
    ]) {
      forbid(k, "is for actions; an event has no such field");
    }
  } else if (trigger?.value === "action") {
    need("menu");
    need("label");
    forbid(
      "chance",
      "is for events; an action has neither `chance` nor `weight`",
    );
    forbid(
      "weight",
      "is for events; an action has neither `chance` nor `weight`",
    );
    if (f.repeatable && f.cooldown) {
      err(f.cooldown.line, "a repeatable action has no `cooldown`");
    }
  }

  if (f.menu && !MENU.test(f.menu.value)) {
    err(
      f.menu.line,
      `menu '${f.menu.value}' must be <top> or <top>/<submenu>, top one of occupation, assets, relationships, activities`,
    );
  }
  if (f.chance && !PERCENT.test(f.chance.value)) {
    err(
      f.chance.line,
      `chance '${f.chance.value}' must be a percent literal with at most 2 decimals`,
    );
  }
  if (f.scope && f.scope.value !== "loan" && f.scope.value !== "person") {
    err(f.scope.line, `scope '${f.scope.value}' must be loan or person`);
  }
  if (f.target && f.scope?.value !== "person") {
    err(f.target.line, "`target` needs `scope: person`");
  }
  if (f.target) {
    for (const t of splitList(f.target.value)) {
      if (!/^[a-z][a-z0-9_-]*(\/[a-z][a-z0-9_-]*)?$/.test(t)) {
        err(f.target.line, `target '${t}' is not a role id`);
      }
    }
  }
  if (f.tags) {
    for (const t of splitList(f.tags.value)) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(t))
        err(f.tags.line, `tag '${t}' is not a valid tag`);
    }
  }
  for (const k of ["once", "repeatable"]) {
    if (f[k] && f[k].value !== "true")
      err(f[k].line, `'${k}' must be \`true\` (leave the line out otherwise)`);
  }
  for (const k of [
    "cooldown",
    "max_per_life",
    "repeat.full",
    "repeat.reduced",
  ]) {
    if (f[k] && !INT.test(f[k].value))
      err(f[k].line, `'${k}' must be an integer`);
  }
  if (f["repeat.factor"] && !PERCENT.test(f["repeat.factor"].value)) {
    err(f["repeat.factor"].line, "'repeat.factor' must be a percent literal");
  }
  if (f["amount.min"] && !f["amount.max"])
    err(f["amount.min"].line, "`amount.min` and `amount.max` come together");
  if (f["amount.max"] && !f["amount.min"])
    err(f["amount.max"].line, "`amount.min` and `amount.max` come together");
  if (f["amount.step"] && !f["amount.min"])
    err(
      f["amount.step"].line,
      "`amount.step` needs `amount.min` and `amount.max`",
    );

  // ---- sections ----
  const groups: { owner: string; list: OutcomeDraft[]; line: number }[] =
    s.choices.length > 0
      ? s.choices.map((c) => ({
          owner: `choice '${c.label.value}'`,
          list: c.outcomes,
          line: c.line,
        }))
      : [{ owner: `storylet '${s.id}'`, list: s.outcomes, line: s.line }];
  if (s.choices.length === 0 && !s.hasOutcomesSection) {
    err(
      s.line,
      `storylet '${s.id}' needs a \`### outcomes\` section or \`### choice:\` sections`,
    );
  }
  for (const g of groups) {
    if (g.list.length === 0 && (s.choices.length > 0 || s.hasOutcomesSection)) {
      err(g.line, `${g.owner} needs at least one \`- outcome:\``);
    }
    for (const o of g.list) {
      if (!o.text) err(o.line, "outcome is missing required key 'text'");
      if (
        o.next &&
        !/^[a-z][a-z0-9_-]*(\/[a-z][a-z0-9_-]*)?$/.test(o.next.value)
      ) {
        err(o.next.line, `next '${o.next.value}' is not a storylet id`);
      }
    }
  }
}

/** `path:line: message`, the form every tool prints. */
export function formatSheetError(file: string, e: SheetError): string {
  return `${file}:${e.line}: ${e.message}`;
}
