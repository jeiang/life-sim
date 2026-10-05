import { netWorth } from "@life/core";
import { PackIcon } from "../components/Emoji.tsx";
import { PageFrame } from "../components/PageFrame.tsx";
import { StatBars } from "../components/StatPanel.tsx";
import { money } from "../game/format.ts";
import { packIndex, world } from "../game/store.ts";
import { openPage, profileTarget } from "../nav.ts";

const Section = (props: {
  title: string;
  children: preact.ComponentChildren;
}) => (
  <section class="border-t border-text-muted/30 px-4 py-3">
    <h2 class="mb-2 font-bold">{props.title}</h2>
    {props.children}
  </section>
);

const Row = (props: { label: string; value: string; testid?: string }) => (
  <div class="flex justify-between gap-3 py-0.5">
    <span class="text-text-muted">{props.label}</span>
    <span class="text-right font-medium" data-testid={props.testid}>
      {props.value}
    </span>
  </div>
);

/** Profile of the player or another person (docs/spec/screens.md). */
export function Profile() {
  const w = world.value;
  const id = profileTarget.value ?? w.playerId;
  const isPlayer = id === w.playerId;
  const p = w.persons.get(id);
  if (!p)
    return (
      <PageFrame title="Profile">
        <p class="p-4 text-text-muted">Nobody found.</p>
      </PageFrame>
    );

  const rel = w.relationships.find(
    (r) =>
      (r.from === w.playerId && r.to === id) ||
      (r.from === id && r.to === w.playerId),
  );
  const roleLabel = rel
    ? (packIndex.roles.get(rel.role)?.label ?? rel.role)
    : undefined;

  return (
    <PageFrame title={isPlayer ? "Your profile" : "Profile"}>
      <div class="px-4 py-3">
        <h2 class="text-lg font-bold">
          {p.givenName} {p.familyName}
        </h2>
        <p class="text-text-muted">
          {isPlayer ? "You" : (roleLabel ?? "Acquaintance")}, age {p.age}
          {p.alive ? "" : " (deceased)"}
        </p>
      </div>

      {!isPlayer && rel && (
        <Section title="Closeness">
          <div
            role="img"
            aria-label={`Closeness, ${rel.closeness} percent`}
            data-testid="closeness"
          >
            <div class="flex justify-between text-xs" aria-hidden="true">
              <span>Closeness</span>
              <span>{rel.closeness}%</span>
            </div>
            <div class="h-2 rounded bg-text-muted/25" aria-hidden="true">
              <div
                class="h-2 rounded bg-primary"
                style={{ width: `${rel.closeness}%` }}
              />
            </div>
          </div>
        </Section>
      )}

      {isPlayer && (
        <>
          <Section title="Occupations">
            {p.occupations.length === 0 ? (
              <p class="text-text-muted">No occupation</p>
            ) : (
              <ul>
                {p.occupations.map((o) => {
                  const k = packIndex.occupations.get(o.kindId);
                  return (
                    <li key={o.id} class="py-0.5">
                      <PackIcon icon={k?.icon} /> {k?.label ?? o.kindId}
                      <span class="text-text-muted">
                        {" "}
                        · {o.pay >= 0 ? "pays" : "costs"}{" "}
                        {money(Math.abs(o.pay))}
                        /yr · {o.years} {o.years === 1 ? "year" : "years"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          <Section title="Money">
            <Row label="Bank balance" value={money(p.money)} />
            <Row
              label="Net worth"
              value={money(netWorth(p))}
              testid="net-worth"
            />
            <button
              type="button"
              onClick={() => openPage("chart")}
              class="mt-2 min-h-11 rounded-full border border-text-muted/50 px-4"
            >
              Net worth chart
            </button>
          </Section>
          <Section title="Loans">
            {p.loans.length === 0 ? (
              <p class="text-text-muted">No loans</p>
            ) : (
              <ul class="flex flex-col gap-2">
                {p.loans.map((l) => (
                  <li key={l.id}>
                    <div class="font-medium">
                      {packIndex.loans.get(l.kindId)?.label ?? l.kindId}
                    </div>
                    <Row label="Balance" value={money(l.balance)} />
                    <Row label="Payment per year" value={money(l.payment)} />
                    <Row label="Missed payments" value={String(l.missed)} />
                    {l.missed > 0 && (
                      <p class="text-sm text-warning">
                        Missed payments risk repossession.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <Section title="Stats">
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 @max-xs:grid-cols-1">
          <StatBars stats={p.stats} />
        </div>
      </Section>

      {!isPlayer && (
        <Section title="Interactions">
          <p class="text-text-muted">No interactions yet</p>
        </Section>
      )}
    </PageFrame>
  );
}
