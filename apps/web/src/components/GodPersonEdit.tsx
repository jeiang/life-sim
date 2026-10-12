import { GENDERS, type Gender, type Person, type PersonId } from "@life/core";
import { useState } from "preact/hooks";
import { editPerson, packIndex } from "../game/store.ts";
import { EditRow, Field, inputClass } from "./GodFields.tsx";

const button =
  "min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action disabled:opacity-50";

/** God mode: rename, re-sex, and re-stat a living person. Each Save is one logged edit. */
export function GodPersonEdit(props: { id: PersonId; person: Person }) {
  const { id, person: p } = props;
  const [given, setGiven] = useState(p.givenName);
  const [family, setFamily] = useState(p.familyName);
  const [gender, setGender] = useState<Gender>(p.gender ?? "male");
  const [nameError, setNameError] = useState<string | null>(null);
  const [sexError, setSexError] = useState<string | null>(null);
  return (
    <div class="flex flex-col gap-4">
      <form
        class="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setNameError(
            editPerson(id, { givenName: given, familyName: family }),
          );
        }}
      >
        <Field label="First name">
          <input
            type="text"
            value={given}
            onInput={(e) => setGiven(e.currentTarget.value)}
            class={inputClass}
          />
        </Field>
        <Field label="Family name">
          <input
            type="text"
            value={family}
            onInput={(e) => setFamily(e.currentTarget.value)}
            class={inputClass}
          />
        </Field>
        <button type="submit" class={button}>
          Save name
        </button>
        {nameError && (
          <p role="alert" class="text-sm text-danger">
            {nameError}
          </p>
        )}
      </form>

      <form
        class="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSexError(editPerson(id, { gender }));
        }}
      >
        <Field label="Sex">
          <select
            value={gender}
            onChange={(e) => setGender(e.currentTarget.value as Gender)}
            class={inputClass}
          >
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" class={button}>
          Save sex
        </button>
        {sexError && (
          <p role="alert" class="text-sm text-danger">
            {sexError}
          </p>
        )}
      </form>

      {packIndex.stats.map((s) => (
        <EditRow
          key={`${s.id}:${p.stats[s.id] ?? 0}`}
          label={s.label}
          value={p.stats[s.id] ?? 0}
          min={0}
          max={100}
          onSet={(n) => editPerson(id, { stats: { [s.id]: n } })}
        />
      ))}
    </div>
  );
}
