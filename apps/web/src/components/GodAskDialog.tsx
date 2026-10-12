import { GENDERS, type Gender, type GodDraw, rollId } from "@life/core";
import { useState } from "preact/hooks";
import {
  answerGod,
  cancelGod,
  type GodAnswer,
  type GodPending,
  godPending,
} from "../game/store.ts";
import { Field, inputClass } from "./GodFields.tsx";
import { Modal } from "./Modal.tsx";

/** One row's answer: `value` is the chosen value (empty when none); `skip` leaves it to chance. */
interface Row {
  readonly value: string;
  readonly skip: boolean;
}

/** The first-name draw: an int over a raw roll, resolved from the pool of the person's sex. */
const isNames = (d: GodDraw): boolean =>
  d.kind === "int" && d.names !== undefined;
const isSex = (d: GodDraw): boolean => d.kind === "pick" && d.label === "Sex";
const NAME_RANGE = 2 ** 32;

/**
 * The sex the step will use for its names: the Sex row's pick, its natural value when it is
 * left to chance, or the sex already settled by an earlier round. Undefined while unknown.
 */
function sexOf(
  draws: readonly GodDraw[],
  rows: readonly Row[],
  fallback: string | undefined,
): string | undefined {
  const i = draws.findIndex(isSex);
  if (i < 0) return fallback;
  const d = draws[i] as GodDraw;
  const row = rows[i] as Row;
  if (row.skip) return d.options?.[Number(d.natural)]?.label;
  if (row.value === "") return undefined;
  return d.options?.[Number(row.value)]?.label;
}

function namesOf(d: GodDraw, sex: string | undefined): readonly string[] {
  if (!d.names || sex === undefined) return [];
  return (GENDERS as readonly string[]).includes(sex)
    ? d.names[sex as Gender]
    : [];
}

/** The raw roll that resolves to name `j`: the least roll whose index is `j`. */
function nameRoll(j: number, count: number, range: number): number {
  return Math.ceil((j * range) / count);
}

/** The name index a raw roll resolves to (the same mapping the form uses). */
function nameIndex(roll: number, count: number, range: number): number {
  return Math.floor((roll * count) / range);
}

/** Value passed to `answerGod` for one answered row. */
function answerValue(
  d: GodDraw,
  row: Row,
  sex: string | undefined,
): number | boolean {
  if (d.kind === "chance") return row.value === "hit";
  if (isNames(d)) {
    const count = namesOf(d, sex).length;
    return nameRoll(Number(row.value), count, d.range ?? NAME_RANGE);
  }
  if (d.kind === "int" && d.options === undefined)
    return Number(row.value) - (d.offset ?? 0);
  return Number(row.value);
}

/** Text of the value the draw would have had without god mode. */
function naturalText(d: GodDraw, sex: string | undefined): string {
  if (d.kind === "chance") return d.natural ? "Hit" : "Miss";
  if (isNames(d)) {
    const list = namesOf(d, sex);
    const j = nameIndex(Number(d.natural), list.length, d.range ?? NAME_RANGE);
    return list[j] ?? "unknown";
  }
  if (d.kind === "int" && d.options === undefined)
    return String((d.offset ?? 0) + Number(d.natural));
  return d.options?.[Number(d.natural)]?.label ?? String(d.natural);
}

/** Choices of a select-style row (empty for a raw number). */
function choicesOf(
  d: GodDraw,
  sex: string | undefined,
): { value: string; label: string }[] {
  if (d.kind === "chance") {
    const pct = (d.bp ?? 0) / 100;
    return [
      { value: "hit", label: `Hit (${pct}%)` },
      { value: "miss", label: "Miss" },
    ];
  }
  if (isNames(d))
    return namesOf(d, sex).map((label, j) => ({ value: String(j), label }));
  if (d.kind === "int" && d.options === undefined) return [];
  const opts = d.options ?? [];
  const total = opts.reduce((n, o) => n + o.weight, 0);
  return opts.flatMap((o, i) => {
    if (d.kind === "int") return [{ value: String(i), label: o.label }];
    if (o.weight <= 0) return [];
    const pct = Math.round((100 * o.weight) / total);
    return [{ value: String(i), label: `${o.label} (${pct}%)` }];
  });
}

/**
 * Turn the rows into an answer. A row left empty must be covered by `rest` (rolled by dice).
 * A names row with no known sex is left to chance. Returns an error message when a row is
 * undecided and the player did not choose "Roll the rest".
 */
function gather(
  p: GodPending,
  rows: readonly Row[],
  rest: boolean,
): GodAnswer | string {
  const sex = sexOf(p.ask.draws, rows, p.sex);
  const picks: GodAnswer["picks"][number][] = [];
  const skip: GodDraw[] = [];
  for (const [i, d] of p.ask.draws.entries()) {
    const row = rows[i] as Row;
    if (row.skip || (row.value === "" && isNames(d) && sex === undefined)) {
      skip.push(d);
    } else if (row.value !== "") {
      picks.push({ draw: d, v: answerValue(d, row, sex) });
    } else if (!rest) {
      return "Answer each question, or leave it to chance.";
    }
  }
  return { picks, skip, restToChance: rest };
}

/** The sex row is changed from its natural value (applied alone, see `answerGod`). */
function sexChanged(draws: readonly GodDraw[], rows: readonly Row[]): boolean {
  const i = draws.findIndex(isSex);
  if (i < 0) return false;
  const row = rows[i] as Row;
  return (
    !row.skip && row.value !== "" && Number(row.value) !== draws[i]?.natural
  );
}

/**
 * God mode's question dialog for a parked step (`godPending`). Each draw is picked, left to
 * chance, or covered by "Roll the rest". The form re-mounts each round (keyed by `rounds`).
 */
export function GodAskDialog() {
  const p = godPending.value;
  if (!p) return null;
  return <GodAskForm key={p.rounds} pending={p} />;
}

function GodAskForm(props: { pending: GodPending }) {
  const { pending } = props;
  const draws = pending.ask.draws;
  const [rows, setRows] = useState<Row[]>(() =>
    draws.map(() => ({ value: "", skip: false })),
  );
  const [error, setError] = useState<string | null>(null);
  const sex = sexOf(draws, rows, pending.sex);

  function update(i: number, patch: Partial<Row>): void {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit(rest: boolean): void {
    const answer = gather(pending, rows, rest);
    setError(typeof answer === "string" ? answer : answerGod(answer));
  }

  return (
    <Modal labelledBy="god-ask-title">
      <h2 id="god-ask-title" class="mb-1 text-center text-lg font-bold">
        {pending.ask.title}
      </h2>
      <p class="mb-3 text-center text-sm text-text-muted">
        God mode: choose each outcome, or leave it to chance.
      </p>
      <div class="space-y-3">
        {draws.map((d, i) => (
          <GodRow
            key={rollId(d, d.d)}
            draw={d}
            row={rows[i] as Row}
            sex={sex}
            onChange={(patch) => update(i, patch)}
          />
        ))}
      </div>
      {sexChanged(draws, rows) && (
        <p class="mt-3 text-sm text-text-muted">
          Changing the sex applies first. The other answers come back with the
          new choices.
        </p>
      )}
      {error && (
        <p role="alert" class="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submit(false)}
          class="min-h-11 flex-1 rounded-xl bg-primary px-3 py-2.5 font-semibold text-on-primary"
        >
          Confirm answers
        </button>
        <button
          type="button"
          onClick={() => submit(true)}
          class="min-h-11 flex-1 rounded-xl border border-text-muted/50 px-3 py-2.5 font-semibold"
        >
          Roll the rest
        </button>
        <button
          type="button"
          onClick={cancelGod}
          class="min-h-11 rounded-xl px-3 py-2.5 font-semibold text-text-muted"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function GodRow(props: {
  draw: GodDraw;
  row: Row;
  sex: string | undefined;
  onChange: (patch: Partial<Row>) => void;
}) {
  const { draw: d, row, sex, onChange } = props;
  const blocked = isNames(d) && sex === undefined;
  const disabled = row.skip || blocked;
  const choices = choicesOf(d, sex);
  const raw = d.kind === "int" && d.options === undefined;
  return (
    <div class="rounded-xl border border-text-muted/30 p-3">
      <div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span class="font-semibold">{d.label}</span>
        <span class="text-text-muted">natural: {naturalText(d, sex)}</span>
      </div>
      {raw ? (
        <input
          type="number"
          class={inputClass}
          aria-label={d.label}
          min={d.offset ?? 0}
          max={(d.offset ?? 0) + (d.range ?? 1) - 1}
          value={row.value}
          disabled={disabled}
          onInput={(e) => onChange({ value: e.currentTarget.value })}
        />
      ) : (
        <Field label={d.label}>
          <select
            class={inputClass}
            value={row.value}
            disabled={disabled || choices.length === 0}
            onChange={(e) => onChange({ value: e.currentTarget.value })}
          >
            <option value="">
              {blocked ? "Set the sex first" : "Choose…"}
            </option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label class="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={row.skip}
          disabled={blocked}
          onChange={(e) =>
            onChange({ skip: e.currentTarget.checked, value: "" })
          }
        />
        Leave to chance
      </label>
    </div>
  );
}
