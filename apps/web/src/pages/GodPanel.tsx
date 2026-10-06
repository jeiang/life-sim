import { useState } from "preact/hooks";
import { Field, inputClass } from "../components/GodFields.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { money } from "../game/format.ts";
import {
  editMoney,
  editStat,
  packIndex,
  player,
  world,
} from "../game/store.ts";
import { closePage } from "../nav.ts";

const minorPerMajor = 10 ** (packIndex.currency?.digits ?? 2);

/** One number input with its own Set button, so one press is one logged edit. */
function EditRow(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onSet: (n: number) => string | null;
}) {
  const [text, setText] = useState(String(props.value));
  const [error, setError] = useState<string | null>(null);
  return (
    <div class="space-y-1">
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <Field label={props.label}>
            <input
              type="number"
              inputMode="decimal"
              min={props.min}
              max={props.max}
              step={props.step ?? 1}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              class={inputClass}
            />
          </Field>
        </div>
        <button
          type="button"
          aria-label={`Set ${props.label}`}
          disabled={text.trim() === "" || Number.isNaN(Number(text))}
          onClick={() => {
            const err = props.onSet(Number(text));
            setError(err);
            if (!err) setText(String(props.value));
          }}
          class="min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action disabled:opacity-50"
        >
          Set
        </button>
      </div>
      {error && (
        <p role="alert" class="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** God mode: edit the player's stats (0-100) and money. Each edit is a logged choice. */
export function GodPanel() {
  const p = player.value;
  const ended = world.value.ended !== null;
  return (
    <PageShell title="God mode" onBack={closePage}>
      {ended ? (
        <p class="text-text-muted">This life is over.</p>
      ) : (
        <>
          <p class="text-sm text-text-muted">
            Edits are saved with the life and marked on its profile.
          </p>
          {packIndex.stats.map((s) => (
            <EditRow
              key={`${s.id}:${p.stats[s.id] ?? 0}`}
              label={s.label}
              value={p.stats[s.id] ?? 0}
              min={0}
              max={100}
              onSet={(n) => editStat(s.id, n)}
            />
          ))}
          <EditRow
            key={`money:${p.money}`}
            label={`Money (now ${money(p.money)})`}
            value={p.money / minorPerMajor}
            step={1 / minorPerMajor}
            onSet={(n) => editMoney(Math.round(n * minorPerMajor))}
          />
        </>
      )}
    </PageShell>
  );
}
