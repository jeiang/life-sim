import { bundles } from "virtual:packs";
import {
  type ActionRow,
  actionLabel,
  listActions,
  listShop,
  listSubmenus,
  type World,
} from "@life/core";
import { ArrowLeft } from "lucide-preact";
import { useState } from "preact/hooks";
import {
  MenuList,
  type MenuRow,
  MenuSection,
} from "../components/MenuList.tsx";
import { kinLabelOf, money } from "../game/format.ts";
import {
  openPurchase,
  packIndex,
  player,
  runMenuAction,
  sellAsset,
  world,
} from "../game/store.ts";
import {
  closePage,
  openPage,
  openProfile,
  openSub,
  type PageId,
  sub,
} from "../nav.ts";
import { MARKET_MIN_AGE, MarketScreen } from "./Market.tsx";

export type MenuId = Extract<
  PageId,
  "occupation" | "assets" | "relationships" | "activities"
>;

const TITLES: Record<MenuId, string> = {
  occupation: "Occupation",
  assets: "Assets",
  relationships: "Relationships",
  activities: "Activities",
};

export const isMenuId = (id: PageId): id is MenuId => id in TITLES;

const SHOPPING = "assets/shopping";
const INVESTMENTS = "assets/investments";

interface Confirm {
  text: string;
  options: { label: string; run: () => string | null }[];
}

function Shell(props: { title: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <header class="flex items-center gap-2 bg-primary px-2 py-2 text-on-primary">
        <button
          type="button"
          onClick={closePage}
          class="flex min-h-11 items-center gap-1 rounded-full px-3"
        >
          <ArrowLeft aria-hidden="true" class="size-5" />
          Back
        </button>
        <h1 class="font-bold">{props.title}</h1>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-3">{props.children}</main>
    </div>
  );
}

const actionRow = (
  a: ActionRow,
  target: number | undefined,
  run: (id: string, target?: number) => void,
): MenuRow => ({
  key: a.id,
  icon: a.icon,
  label: a.label,
  locked: a.locked,
  reason: a.reason,
  onSelect: () => run(a.id, target),
});

function relationsOf(w: World) {
  return w.relationships
    .filter((r) => r.from === w.playerId)
    .flatMap((r) => {
      const person = w.persons.get(r.to);
      return person && person.listed !== false ? [{ rel: r, person }] : [];
    });
}

function personName(w: World, id: number): string {
  const p = w.persons.get(id);
  return p ? `${p.givenName} ${p.familyName}`.trim() : "Unknown";
}

/** A menu page (top-level or submenu) with Back; rows come from the Core's action listing. */
export function MenuPage(props: { id: MenuId }) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const w = world.value;
  const path = sub.value ?? props.id;

  const run = (id: string, target?: number) => {
    setConfirm(null);
    setError(runMenuAction(id, target));
  };
  const ask = (c: Confirm) => {
    setError(null);
    setConfirm(c);
  };
  const attempt = (f: () => string | null) => () => {
    setConfirm(null);
    setError(f());
  };

  const panel = confirm ? (
    <fieldset class="mb-3 min-w-0 rounded-xl border-0 bg-surface-raised p-3">
      <legend class="sr-only">Confirm</legend>
      <p class="mb-2 font-medium">{confirm.text}</p>
      <div class="flex flex-wrap gap-2">
        {confirm.options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={attempt(o.run)}
            class="min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action"
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setConfirm(null)}
          class="min-h-11 rounded-xl px-4 font-semibold text-text ring-1 ring-text-muted/40"
        >
          Cancel
        </button>
      </div>
    </fieldset>
  ) : null;
  const err = (
    <div role="alert" class={error ? "mb-3 text-danger" : "hidden"}>
      {error}
    </div>
  );

  if (path === INVESTMENTS)
    return (
      <Shell title="Investments">
        <MarketScreen />
      </Shell>
    );

  // Shopping: the shop's item rows.
  if (path === SHOPPING) {
    const rows: MenuRow[] = listShop(w, bundles).map((s) => ({
      key: s.id,
      icon: s.icon,
      label: s.label,
      sublabel:
        s.canLoan && s.downPayment !== undefined
          ? `Or ${money(s.downPayment)} down with a loan`
          : undefined,
      value: money(s.price),
      locked: s.locked,
      reason: s.reason,
      onSelect: () => openPurchase(s.id),
    }));
    const extra = listActions(w, bundles, SHOPPING).map((a) =>
      actionRow(a, undefined, run),
    );
    return (
      <Shell title="Shopping">
        {err}
        {panel}
        <MenuList rows={rows} />
        {extra.length > 0 ? (
          <div class="mt-4">
            <MenuList rows={extra} />
          </div>
        ) : null}
      </Shell>
    );
  }

  const title = path === props.id ? TITLES[props.id] : actionLabel(path);
  const sections: preact.ComponentChildren[] = [];

  if (path === "occupation") {
    const p = player.value;
    sections.push(
      <MenuSection key="jobs" title="Current">
        {p.occupations.length > 0 ? (
          <MenuList
            rows={p.occupations.map((o) => {
              const kind = packIndex.occupations.get(o.kindId);
              return {
                key: `occ-${o.id}`,
                icon: kind?.icon,
                label: kind?.label ?? actionLabel(o.kindId),
                sublabel: `${o.years} ${o.years === 1 ? "year" : "years"}`,
                value: `${money(o.pay)}/yr`,
              };
            })}
          />
        ) : (
          <p class="px-1 text-text-muted">No occupation.</p>
        )}
      </MenuSection>,
    );
  }

  if (path === "assets") {
    const p = player.value;
    sections.push(
      <MenuSection key="owned" title="Owned">
        {p.assets.length > 0 ? (
          <MenuList
            rows={p.assets.map((a) => {
              const kind = packIndex.items.get(a.kindId);
              const label = kind?.label ?? actionLabel(a.kindId);
              return {
                key: `asset-${a.id}`,
                icon: kind?.icon,
                label,
                sublabel: `Bought for ${money(a.purchasePrice)}. Tap to sell.`,
                value: money(a.value),
                onSelect: () =>
                  ask({
                    text: `Sell your ${label} for ${money(a.value)}?`,
                    options: [{ label: "Sell", run: () => sellAsset(a.id) }],
                  }),
              };
            })}
          />
        ) : (
          <p class="px-1 text-text-muted">You own no assets.</p>
        )}
      </MenuSection>,
      <MenuSection key="shop" title="Buy">
        <MenuList
          rows={[
            {
              key: "shopping",
              label: "Shopping",
              chevron: true,
              onSelect: () => openSub(SHOPPING),
            },
            ...(packIndex.markets.size > 0 && player.value.age >= MARKET_MIN_AGE
              ? [
                  {
                    key: "investments",
                    label: "Investments",
                    chevron: true,
                    onSelect: () => openSub(INVESTMENTS),
                  },
                ]
              : []),
            {
              key: "chart",
              label: "Net worth chart",
              chevron: true,
              onSelect: () => openPage("chart"),
            },
          ]}
        />
      </MenuSection>,
    );
  }

  if (path === "relationships") {
    const people = relationsOf(w);
    sections.push(
      <MenuSection key="people" title="People">
        {people.length > 0 ? (
          <MenuList
            rows={people.map(({ rel, person }) => ({
              key: `person-${person.id}`,
              label: personName(w, person.id),
              sublabel: `${kinLabelOf(w, person.id) ?? packIndex.roles.get(rel.role)?.label ?? actionLabel(rel.role)}${person.alive ? "" : ", passed away"}`,
              value: `Closeness ${rel.closeness}`,
              chevron: true,
              onSelect: () => openProfile(person.id),
            }))}
          />
        ) : (
          <p class="px-1 text-text-muted">No one yet.</p>
        )}
      </MenuSection>,
    );
  }

  const actions = listActions(w, bundles, path).map((a) =>
    actionRow(a, undefined, run),
  );
  const submenus =
    path === props.id
      ? listSubmenus(bundles, props.id).filter(
          (s) => s !== SHOPPING && s !== INVESTMENTS,
        )
      : [];
  if (actions.length > 0)
    sections.push(
      <MenuSection key="actions" title="Actions">
        <MenuList rows={actions} />
      </MenuSection>,
    );
  if (submenus.length > 0)
    sections.push(
      <MenuSection key="more" title="More">
        <MenuList
          rows={submenus.map((s) => ({
            key: s,
            label: actionLabel(s),
            chevron: true,
            onSelect: () => openSub(s),
          }))}
        />
      </MenuSection>,
    );

  return (
    <Shell title={title}>
      {err}
      {panel}
      {sections}
    </Shell>
  );
}
