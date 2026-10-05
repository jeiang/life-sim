import { ArrowLeft } from "lucide-preact";
import type { ComponentChildren } from "preact";

/** Full page with a Back button and a title; used by the app screens. */
export function PageShell(props: {
  title: string;
  onBack?: () => void;
  children: ComponentChildren;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <header class="flex items-center gap-2 bg-primary px-2 py-2 text-on-primary">
        {props.onBack && (
          <button
            type="button"
            onClick={props.onBack}
            class="flex min-h-11 items-center gap-1 rounded-full px-3"
          >
            <ArrowLeft aria-hidden="true" class="size-5" />
            Back
          </button>
        )}
        <h1 class="px-2 font-bold">{props.title}</h1>
      </header>
      <main class="flex-1 space-y-4 overflow-y-auto p-4">{props.children}</main>
    </div>
  );
}
