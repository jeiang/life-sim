import { ArrowLeft } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { closePage } from "../nav.ts";

/** Full page with a Back bar. */
export function PageFrame(props: {
  title: string;
  children: ComponentChildren;
}) {
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
        <h1 class="break-words font-bold">{props.title}</h1>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto">{props.children}</main>
    </div>
  );
}
