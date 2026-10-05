import { packIndex, player } from "../game/store.ts";
import { PackIcon } from "./Emoji.tsx";

const tone = (v: number): string =>
  v > 66 ? "bg-stat-good" : v > 33 ? "bg-stat-mid" : "bg-stat-bad";

/** Compact 0-100 bars: colour plus number, each exposed as one labelled value. */
export function StatPanel() {
  return (
    <section
      aria-label="Stats"
      class="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-text-muted/30 px-4 py-2 @max-xs:grid-cols-1"
    >
      <StatBars stats={player.value.stats} />
    </section>
  );
}

/** The labelled bars for one person's stats, as grid items. */
export function StatBars(props: { stats: Readonly<Record<string, number>> }) {
  const stats = props.stats;
  return (
    <>
      {packIndex.stats.map((s) => {
        const v = stats[s.id] ?? 0;
        return (
          <div key={s.id} role="img" aria-label={`${s.label}, ${v} percent`}>
            <div class="flex justify-between gap-2 text-xs" aria-hidden="true">
              <span>
                <PackIcon icon={s.icon} /> {s.label}
              </span>
              <span>{v}%</span>
            </div>
            <div class="h-2 rounded bg-text-muted/25" aria-hidden="true">
              <div
                class={`h-2 rounded transition-[width] duration-300 motion-reduce:transition-none ${tone(v)}`}
                style={{ width: `${v}%` }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
