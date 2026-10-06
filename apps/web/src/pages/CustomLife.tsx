import { GENDERS, type Gender } from "@life/core";
import { useState } from "preact/hooks";
import { Field, inputClass } from "../components/GodFields.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { packIndex, startCustomLife } from "../game/store.ts";
import { closeAllPages, closePage } from "../nav.ts";

const GENDER_LABEL: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  nonbinary: "Non-binary",
};

const family = packIndex.family;
const maxParents = Math.max(2, family?.parent.count ?? 2);
const maxSiblings = Math.max(6, family?.sibling.count[1] ?? 2);
const clampInt = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.trunc(n) || 0));

/** God mode: choose the starting options of a new life. */
export function CustomLifePage() {
  const [givenName, setGiven] = useState("");
  const [familyName, setFamily] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [stats, setStats] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      packIndex.stats.map((s) => [
        s.id,
        String(Math.round((s.start[0] + s.start[1]) / 2)),
      ]),
    ),
  );
  const [parents, setParents] = useState(String(family?.parent.count ?? 2));
  const [siblings, setSiblings] = useState(
    String(family?.sibling.count[0] ?? 0),
  );
  const [cityId, setCityId] = useState("");
  const cities = [...packIndex.cities.values()];
  const ready = givenName.trim() !== "" && familyName.trim() !== "";
  return (
    <PageShell title="Custom life" onBack={closePage}>
      <form
        class="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          closeAllPages();
          startCustomLife({
            givenName: givenName.trim(),
            familyName: familyName.trim(),
            gender,
            stats: Object.fromEntries(
              packIndex.stats.map((s) => [
                s.id,
                clampInt(Number(stats[s.id]), 0, 100),
              ]),
            ),
            parents: clampInt(Number(parents), 0, maxParents),
            siblings: clampInt(Number(siblings), 0, maxSiblings),
            ...(cityId === "" ? {} : { cityId }),
          });
        }}
      >
        <Field label="First name">
          <input
            value={givenName}
            onInput={(e) => setGiven(e.currentTarget.value)}
            class={inputClass}
          />
        </Field>
        <Field label="Last name">
          <input
            value={familyName}
            onInput={(e) => setFamily(e.currentTarget.value)}
            class={inputClass}
          />
        </Field>
        <Field label="Gender">
          <select
            value={gender}
            onChange={(e) => setGender(e.currentTarget.value as Gender)}
            class={inputClass}
          >
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>
        {packIndex.stats.map((s) => (
          <Field key={s.id} label={`Starting ${s.label} (0-100)`}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={stats[s.id]}
              onInput={(e) =>
                setStats({ ...stats, [s.id]: e.currentTarget.value })
              }
              class={inputClass}
            />
          </Field>
        ))}
        <Field label={`Parents (0-${maxParents})`}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={maxParents}
            value={parents}
            onInput={(e) => setParents(e.currentTarget.value)}
            class={inputClass}
          />
        </Field>
        <Field label={`Siblings (0-${maxSiblings})`}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={maxSiblings}
            value={siblings}
            onInput={(e) => setSiblings(e.currentTarget.value)}
            class={inputClass}
          />
        </Field>
        {cities.length > 0 && (
          <Field label="Birth city">
            <select
              value={cityId}
              onChange={(e) => setCityId(e.currentTarget.value)}
              class={inputClass}
              data-testid="custom-city"
            >
              <option value="">Random</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button
          type="submit"
          disabled={!ready}
          class="min-h-11 w-full rounded-xl bg-action px-4 font-semibold text-on-action disabled:opacity-50"
        >
          Start this life
        </button>
      </form>
    </PageShell>
  );
}
