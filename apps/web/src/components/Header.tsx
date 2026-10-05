import { CircleUserRound, Settings } from "lucide-preact";
import { money } from "../game/format.ts";
import { packIndex, player } from "../game/store.ts";
import { openPage } from "../nav.ts";

export function Header() {
  const p = player.value;
  const jobs = p.occupations
    .map((o) => packIndex.occupations.get(o.kindId)?.label ?? o.kindId)
    .join(", ");
  return (
    <header class="flex items-center gap-1 bg-primary px-2 py-2 text-on-primary @max-xs:grid @max-xs:grid-cols-[auto_1fr_auto]">
      <button
        type="button"
        aria-label="Your profile"
        onClick={() => openPage("profile")}
        class="grid size-[44px] shrink-0 place-items-center rounded-full"
      >
        <CircleUserRound aria-hidden="true" class="size-8" />
      </button>
      <div class="min-w-0 flex-1 px-1">
        <h1 class="break-words font-bold">
          {p.givenName} {p.familyName}
        </h1>
        <div class="break-words text-xs">{jobs || "No occupation"}</div>
      </div>
      <div class="px-1 text-right @max-xs:order-last @max-xs:col-span-3 @max-xs:text-left">
        <div class="font-bold" data-testid="money">
          {money(p.money)}
        </div>
        <div class="text-xs">Bank balance</div>
      </div>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => openPage("settings")}
        class="grid size-[44px] shrink-0 place-items-center rounded-full"
      >
        <Settings aria-hidden="true" class="size-6" />
      </button>
    </header>
  );
}
