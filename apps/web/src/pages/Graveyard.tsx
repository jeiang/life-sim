import type { GraveyardEntry } from "@life/core";
import { useState } from "preact/hooks";
import { Chart } from "../components/Chart.tsx";
import { ObituaryView } from "../components/ObituaryView.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { graveyard } from "../game/store.ts";
import { closePage } from "../nav.ts";

/** One life's generations, oldest first: the family tree, newest family first. */
function families(
  entries: readonly GraveyardEntry[],
): readonly (readonly GraveyardEntry[])[] {
  const byLife = new Map<string, GraveyardEntry[]>();
  for (const g of entries) {
    const list = byLife.get(g.lifeId);
    if (list) list.push(g);
    else byLife.set(g.lifeId, [g]);
  }
  return [...byLife.values()].map((l) =>
    l.sort((a, b) => a.generation - b.generation),
  );
}

/** A generation's archived journal and net worth series. */
function Archive(props: { entry: GraveyardEntry }) {
  const g = props.entry;
  return (
    <>
      <section
        aria-label="Journal"
        class="space-y-1 rounded-xl bg-surface-raised p-4"
      >
        <h3 class="font-bold">Journal</h3>
        {g.journal.length === 0 ? (
          <p class="text-text-muted">Nothing was written.</p>
        ) : (
          <ul class="space-y-1">
            {g.journal.map((e, i) => (
              <li key={i}>
                <span class="font-semibold">Age {e.age}</span>{" "}
                {e.lines.join(" ")}
              </li>
            ))}
          </ul>
        )}
      </section>
      {g.netWorth.length > 0 && (
        <Chart
          title="Net worth by age"
          points={g.netWorth.map((p) => ({ x: p.age, y: p.value }))}
        />
      )}
    </>
  );
}

/** Finished lives, grouped by family with one entry per generation; tap one for its obituary. */
export function GraveyardPage() {
  const [selected, setSelected] = useState<GraveyardEntry | null>(null);
  if (selected)
    return (
      <PageShell title="Obituary" onBack={() => setSelected(null)}>
        <ObituaryView obituary={selected.obituary} />
        <Archive entry={selected} />
      </PageShell>
    );
  const entries = graveyard.value;
  return (
    <PageShell title="Graveyard" onBack={closePage}>
      {entries.length === 0 ? (
        <p class="text-text-muted">No one has died yet.</p>
      ) : (
        families(entries).map((family) => {
          const founder = family[0] as GraveyardEntry;
          const label = `The ${founder.obituary.familyName} family`;
          return (
            <section key={founder.lifeId} aria-label={label} class="space-y-2">
              <h2 class="font-bold">
                {label}
                <span class="ml-2 font-normal text-sm text-text-muted">
                  {family.length}{" "}
                  {family.length === 1 ? "generation" : "generations"}
                </span>
              </h2>
              <ul class="space-y-2">
                {family.map((g, i) => (
                  <li
                    key={g.id}
                    style={{ marginLeft: `${Math.min(i, 6) * 12}px` }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(g)}
                      class="min-h-11 w-full rounded-xl bg-surface-raised p-3 text-left"
                    >
                      <span class="block font-bold">
                        {g.obituary.givenName} {g.obituary.familyName}
                      </span>
                      <span class="block text-sm text-text-muted">
                        Generation {g.generation + 1}. Died at {g.obituary.age}:{" "}
                        {g.obituary.cause}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </PageShell>
  );
}
