import { EditRow } from "../components/GodFields.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { money } from "../game/format.ts";
import {
  editMoney,
  editStat,
  packIndex,
  player,
  world,
} from "../game/store.ts";
import { closePage, openPage, openProfile, openSub } from "../nav.ts";

const minorPerMajor = 10 ** (packIndex.currency?.digits ?? 2);

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
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openProfile(null)}
              class="min-h-11 rounded-xl px-4 font-semibold text-action ring-1 ring-text-muted/40"
            >
              Your profile
            </button>
            <button
              type="button"
              onClick={() => {
                openPage("assets");
                openSub("assets/investments");
              }}
              class="min-h-11 rounded-xl px-4 font-semibold text-action ring-1 ring-text-muted/40"
            >
              Investments
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}
