import { GENDERS, type Gender, type GodDraw, rollId } from "@life/core";
import { useState } from "preact/hooks";
import {
  answerGod,
  cancelGod,
  type GodAnswer,
  type GodPending,
  godPending,
} from "../game/store.ts";
import { inputClass } from "./GodFields.tsx";
import { Modal } from "./Modal.tsx";

/** The first-name draw: an int over a raw roll, resolved from the pool of the person's sex. */
const isNames = (d: GodDraw): boolean =>
  d.kind === "int" && d.names !== undefined;
const isSex = (d: GodDraw): boolean => d.kind === "pick" && d.label === "Sex";
const NAME_RANGE = 2 ** 32;

/**
 * The sex the step will use for its names: the Sex row's pick, or the sex already settled by an
 * earlier round when there is no Sex row. Undefined while unknown.
 */
function sexOf(
  draws: readonly GodDraw[],
  values: readonly string[],
  fallback: string | undefined,
): string | undefined {
  const i = draws.findIndex(isSex);
  if (i < 0) return fallback;
  const value = values[i] ?? "";
  if (value === "") return undefined;
  return (draws[i] as GodDraw).options?.[Number(value)]?.label;
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

/**
 * The value a row holds when its draw is left to dice: the natural value, in the row's own
 * encoding (`hit`/`miss`, a select's choice index, a raw number, or a name's index).
 */
function naturalValue(d: GodDraw, sex: string | undefined): string {
  if (d.kind === "chance") return d.natural ? "hit" : "miss";
  if (isNames(d)) {
    const count = namesOf(d, sex).length;
    if (count === 0) return "";
    return String(nameIndex(Number(d.natural), count, d.range ?? NAME_RANGE));
  }
  if (d.kind === "int" && d.options === undefined)
    return String((d.offset ?? 0) + Number(d.natural));
  return String(d.natural);
}

/** Value passed to `answerGod` for one edited row. */
function answerValue(
  d: GodDraw,
  value: string,
  sex: string | undefined,
): number | boolean {
  if (d.kind === "chance") return value === "hit";
  if (isNames(d)) {
    const count = namesOf(d, sex).length;
    return nameRoll(Number(value), count, d.range ?? NAME_RANGE);
  }
  if (d.kind === "int" && d.options === undefined)
    return Number(value) - (d.offset ?? 0);
  return Number(value);
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
 * Turn the rows into an answer. Only edited rows become picks. A row still at its natural value,
 * emptied, or a names row with no known sex is left to chance: it is skipped, so the dice decide
 * it and it is not asked again.
 */
function gather(p: GodPending, values: readonly string[]): GodAnswer {
  const draws = p.ask.draws;
  const sex = sexOf(draws, values, p.sex);
  const picks: GodAnswer["picks"][number][] = [];
  const skip: GodDraw[] = [];
  for (const [i, d] of draws.entries()) {
    const value = values[i] ?? "";
    if (value === "" || value === naturalValue(d, sex)) skip.push(d);
    else picks.push({ draw: d, v: answerValue(d, value, sex) });
  }
  return { picks, skip, restToChance: false };
}

/** Every row's starting value: each draw at its natural value, names resolved for the natural sex. */
function naturalRows(
  draws: readonly GodDraw[],
  fallback: string | undefined,
): string[] {
  const sex = sexOf(
    draws,
    draws.map((d) => naturalValue(d, undefined)),
    fallback,
  );
  return draws.map((d) => naturalValue(d, sex));
}

/** The sex row is changed from its natural value (applied alone, see `answerGod`). */
function sexChanged(
  draws: readonly GodDraw[],
  values: readonly string[],
): boolean {
  const i = draws.findIndex(isSex);
  if (i < 0) return false;
  const value = values[i] ?? "";
  return value !== "" && value !== naturalValue(draws[i] as GodDraw, undefined);
}

/**
 * God mode's question dialog for a parked step (`godPending`). Every draw starts at its natural
 * value: edit any of them, reset one, or leave the whole form to chance. The form re-mounts each
 * round (keyed by `rounds`).
 */
export function GodAskDialog() {
  const p = godPending.value;
  if (!p) return null;
  return <GodAskForm key={p.rounds} pending={p} />;
}

function GodAskForm(props: { pending: GodPending }) {
  const { pending } = props;
  const draws = pending.ask.draws;
  const [values, setValues] = useState<string[]>(() =>
    naturalRows(draws, pending.sex),
  );
  const [error, setError] = useState<string | null>(null);
  const sex = sexOf(draws, values, pending.sex);
  // The Sex question leads the form. The engine's draw order is unchanged.
  const order = draws
    .map((_, i) => i)
    .sort(
      (a, b) =>
        Number(!isSex(draws[a] as GodDraw)) -
        Number(!isSex(draws[b] as GodDraw)),
    );

  return (
    <Modal labelledBy="god-ask-title">
      <h2 id="god-ask-title" class="mb-1 text-center text-lg font-bold">
        {pending.ask.title}
      </h2>
      <p class="mb-3 text-center text-sm text-text-muted">
        God mode: choose each outcome, or leave it to chance.
      </p>
      <div class="space-y-3">
        {order.map((i) => {
          const d = draws[i] as GodDraw;
          return (
            <GodRow
              key={rollId(d, d.d)}
              draw={d}
              value={values[i] ?? ""}
              natural={naturalValue(d, sex)}
              naturalLabel={naturalText(d, sex)}
              sex={sex}
              onChange={(value) =>
                setValues(values.map((v, j) => (j === i ? value : v)))
              }
            />
          );
        })}
      </div>
      {sexChanged(draws, values) && (
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
          onClick={() => setError(answerGod(gather(pending, values)))}
          class="min-h-11 flex-1 rounded-xl bg-primary px-3 py-2.5 font-semibold text-on-primary"
        >
          Confirm answers
        </button>
        <button
          type="button"
          onClick={() =>
            setError(answerGod({ picks: [], skip: [], restToChance: true }))
          }
          class="min-h-11 flex-1 rounded-xl border border-text-muted/50 px-3 py-2.5 font-semibold"
        >
          Leave to chance
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
  value: string;
  natural: string;
  naturalLabel: string;
  sex: string | undefined;
  onChange: (value: string) => void;
}) {
  const { draw: d, value, natural, naturalLabel, sex, onChange } = props;
  const blocked = isNames(d) && sex === undefined;
  const raw = d.kind === "int" && d.options === undefined && !isNames(d);
  const choices = choicesOf(d, sex);
  return (
    <div class="rounded-xl border border-text-muted/30 p-3">
      <div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span class="font-semibold">{d.label}</span>
        <span class="text-text-muted">natural: {naturalLabel}</span>
      </div>
      <div class="flex items-center gap-2">
        {raw ? (
          <input
            type="number"
            class={`${inputClass} min-w-0 flex-1`}
            aria-label={d.label}
            min={d.offset ?? 0}
            max={(d.offset ?? 0) + (d.range ?? 1) - 1}
            value={value}
            disabled={blocked}
            onInput={(e) => onChange(e.currentTarget.value)}
          />
        ) : (
          <select
            class={`${inputClass} min-w-0 flex-1`}
            aria-label={d.label}
            value={value}
            disabled={blocked || choices.length === 0}
            onChange={(e) => onChange(e.currentTarget.value)}
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
        )}
        <button
          type="button"
          disabled={blocked || value === natural}
          onClick={() => onChange(natural)}
          class="min-h-11 shrink-0 rounded-xl border border-text-muted/50 px-3 text-sm font-semibold disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
