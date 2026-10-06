import { ArrowLeft } from "lucide-preact";
import { closePage, openPage, type PageId } from "../nav.ts";

const TITLES: Record<PageId, string> = {
  profile: "Profile",
  chart: "Net worth",
  settings: "Settings",
  occupation: "Occupation",
  assets: "Assets",
  relationships: "Relationships",
  activities: "Activities",
  graveyard: "Graveyard",
  credits: "Credits",
  god: "God mode",
  customlife: "Custom life",
};

/** Stand-in full page with Back; each menu issue replaces its own page. */
export function Placeholder(props: { id: PageId }) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center gap-2 bg-primary px-2 py-2 text-on-primary">
        <button
          type="button"
          onClick={closePage}
          class="flex min-h-11 items-center gap-1 rounded-full px-3"
        >
          <ArrowLeft aria-hidden="true" class="size-5" />
          Back
        </button>
        <h1 class="font-bold">{TITLES[props.id]}</h1>
      </div>
      <main class="flex-1 p-4 text-text-muted">
        Coming soon.
        {props.id === "assets" && (
          <div class="mt-3">
            <button
              type="button"
              onClick={() => openPage("chart")}
              class="min-h-11 rounded-full border border-text-muted/50 px-4 text-text"
            >
              Net worth chart
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
