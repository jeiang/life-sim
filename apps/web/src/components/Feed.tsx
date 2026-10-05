import { useEffect, useRef } from "preact/hooks";
import { latestLines, world } from "../game/store.ts";
import { EmojiText } from "./Emoji.tsx";

/** Journal grouped by age, scrolled to the newest year. */
export function Feed() {
  const ref = useRef<HTMLElement>(null);
  const journal = world.value.journal;
  const ended = world.value.ended;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [journal, ended]);
  return (
    <main
      ref={ref}
      aria-label="Life journal"
      class="flex-1 space-y-3 @max-xs:h-[60dvh] @max-xs:flex-none overflow-y-auto px-4 py-3"
    >
      {journal.map((entry) => (
        <section key={entry.age} aria-label={`Age ${entry.age}`}>
          <h2 class="text-xs font-bold uppercase tracking-wide">
            Age {entry.age} {entry.age === 1 ? "year" : "years"}
          </h2>
          {entry.lines.map((line, i) => (
            <p key={i} class="journal-line my-0.5 break-words text-[0.9375rem]">
              <EmojiText text={line} />
            </p>
          ))}
        </section>
      ))}
      {ended && (
        <p class="rounded-lg bg-surface-raised p-3 font-semibold">
          {ended.givenName} {ended.familyName} died at {ended.age}:{" "}
          {ended.cause}.
        </p>
      )}
      <div role="status" class="sr-only">
        {latestLines.value.join(" ")}
      </div>
    </main>
  );
}
