import { isGodLife } from "@life/core";
import { Plus } from "lucide-preact";
import { GodBadge } from "../components/GodFields.tsx";
import { PageShell } from "../components/PageShell.tsx";
import { money } from "../game/format.ts";
import { godMode } from "../game/hidden.ts";
import {
  continueLife,
  lives,
  loadProblems,
  startNewLife,
} from "../game/store.ts";
import { openPage } from "../nav.ts";

/** The ongoing lives: continue one or start another (nothing here ends a life). */
export function LivesPage() {
  const list = lives.value;
  const problems = loadProblems.value;
  return (
    <PageShell title="Your lives">
      {list.length === 0 ? (
        <p class="text-text-muted">No life in progress.</p>
      ) : (
        <ul class="space-y-2">
          {list.map((l) => {
            const p = l.world.persons.get(l.world.playerId);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => continueLife(l.id)}
                  class="min-h-11 w-full rounded-xl bg-surface-raised p-3 text-left"
                >
                  <span class="block font-bold">
                    {l.name}
                    {isGodLife(l.world) && <GodBadge />}
                  </span>
                  <span class="block text-sm text-text-muted">
                    {l.world.ended
                      ? `Died at age ${p?.age ?? 0}: choose an heir or finish`
                      : `Age ${p?.age ?? 0}`}
                    {!l.world.ended && p ? `, ${money(p.money)}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={startNewLife}
        class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-action px-4 font-semibold text-on-action"
      >
        <Plus aria-hidden="true" class="size-5" />
        Start a new life
      </button>
      {godMode.value && (
        <button
          type="button"
          onClick={() => openPage("customlife")}
          class="min-h-11 w-full rounded-xl bg-surface-raised px-4 font-semibold"
        >
          Custom life
        </button>
      )}
      {problems.length > 0 && (
        <p role="alert" class="text-sm text-danger">
          {problems.length} saved {problems.length === 1 ? "life" : "lives"}{" "}
          could not be read (damaged or from a newer version) and{" "}
          {problems.length === 1 ? "was" : "were"} left untouched.
        </p>
      )}
      <div class="flex gap-2">
        <button
          type="button"
          onClick={() => openPage("graveyard")}
          class="min-h-11 flex-1 rounded-xl bg-surface-raised px-3 font-semibold"
        >
          Graveyard
        </button>
        <button
          type="button"
          onClick={() => openPage("settings")}
          class="min-h-11 flex-1 rounded-xl bg-surface-raised px-3 font-semibold"
        >
          Settings
        </button>
      </div>
    </PageShell>
  );
}
