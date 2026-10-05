import type { Obituary, ObituaryOccupation } from "@life/core";
import { money } from "../game/format.ts";
import { packIndex } from "../game/store.ts";

function Entries(props: {
  title: string;
  items: readonly ObituaryOccupation[];
}) {
  return (
    <section aria-label={props.title}>
      <h3 class="font-bold">{props.title}</h3>
      {props.items.length === 0 ? (
        <p class="text-text-muted">None</p>
      ) : (
        <ul class="list-disc pl-5">
          {props.items.map((o, i) => (
            <li key={i}>
              {packIndex.occupations.get(o.kindId)?.label ?? o.kindId}, age{" "}
              {o.startedAge} to {o.endedAge} ({o.years}{" "}
              {o.years === 1 ? "year" : "years"})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A finished life: age, cause, net worth, career, and education. */
export function ObituaryView(props: { obituary: Obituary }) {
  const o = props.obituary;
  return (
    <article class="space-y-3 rounded-xl bg-surface-raised p-4">
      <h2 class="text-xl font-bold">
        {o.givenName} {o.familyName}
      </h2>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt class="text-text-muted">Age at death</dt>
        <dd>{o.age}</dd>
        <dt class="text-text-muted">Cause</dt>
        <dd>{o.cause}</dd>
        <dt class="text-text-muted">Net worth</dt>
        <dd>{money(o.netWorth)}</dd>
      </dl>
      <Entries title="Career" items={o.career} />
      <Entries title="Education" items={o.education} />
    </article>
  );
}
