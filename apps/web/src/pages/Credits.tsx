import { credits } from "virtual:packs";
import { PageShell } from "../components/PageShell.tsx";
import { closePage } from "../nav.ts";

/** Every bundled icon source with its license, from the build's credits manifest. */
export function CreditsPage() {
  return (
    <PageShell title="Credits" onBack={closePage}>
      <ul class="space-y-3">
        {credits.entries.map((e) => (
          <li key={e.id} class="rounded-xl bg-surface-raised p-3 text-sm">
            <h2 class="text-base font-bold">{e.name}</h2>
            <p>
              <a class="underline" href={e.licenseUrl} rel="noreferrer">
                {e.license}
              </a>
              {" · "}
              <a class="underline" href={e.source} rel="noreferrer">
                Source
              </a>
              {e.usage === "chrome" ? " · interface icons" : ""}
              {e.modified ? " · modified" : ""}
            </p>
            <p class="text-text-muted">{e.attribution}</p>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
