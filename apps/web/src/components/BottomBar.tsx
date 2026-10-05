import { Briefcase, Dices, House, Plus, Users } from "lucide-preact";
import type { ComponentType } from "preact";
import { ageUpOneYear, canAge } from "../game/store.ts";
import { openPage, type PageId } from "../nav.ts";

function MenuButton(props: {
  id: PageId;
  label: string;
  Icon: ComponentType<{ class?: string; "aria-hidden"?: "true" }>;
}) {
  return (
    <button
      type="button"
      onClick={() => openPage(props.id)}
      class="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[0.6875rem] [overflow-wrap:anywhere]"
    >
      <props.Icon aria-hidden="true" class="size-6" />
      {props.label}
    </button>
  );
}

export function BottomBar() {
  return (
    <nav
      aria-label="Menus"
      class="border-t border-text-muted/30 bg-surface-raised pb-[env(safe-area-inset-bottom)]"
    >
      <div class="grid grid-cols-5 items-end @max-xs:grid-cols-2 @max-xs:gap-1">
        <MenuButton id="occupation" label="Occupation" Icon={Briefcase} />
        <MenuButton id="assets" label="Assets" Icon={House} />
        <button
          type="button"
          disabled={!canAge.value}
          onClick={ageUpOneYear}
          class="mx-auto -mt-6 flex size-20 flex-col items-center justify-center rounded-full bg-action font-black text-on-action shadow-lg enabled:active:scale-95 disabled:opacity-60 @max-xs:order-first @max-xs:col-span-2 @max-xs:mt-1 @max-xs:min-h-20 @max-xs:w-[calc(100%-1rem)] @max-xs:rounded-2xl motion-safe:transition-transform"
        >
          <Plus aria-hidden="true" class="size-6" />
          <span>Age</span>
        </button>
        <MenuButton id="relationships" label="Relationships" Icon={Users} />
        <MenuButton id="activities" label="Activities" Icon={Dices} />
      </div>
    </nav>
  );
}
