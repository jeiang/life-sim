import { useState } from "preact/hooks";
import { money } from "../game/format.ts";

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

const W = 320;
const H = 180;
const PAD = { l: 8, r: 8, t: 12, b: 24 };

/** Describe the series in words, for the accessible name and summary. */
export function summarize(
  points: readonly ChartPoint[],
  xUnit: string,
  fmt: (y: number) => string,
): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "No data yet.";
  let lo = first;
  let hi = first;
  for (const p of points) {
    if (p.y < lo.y) lo = p;
    if (p.y > hi.y) hi = p;
  }
  const head = `${points.length} ${points.length === 1 ? "point" : "points"}, ${xUnit} ${first.x} to ${last.x}.`;
  return `${head} Started at ${fmt(first.y)}, now ${fmt(last.y)}. Lowest ${fmt(lo.y)} at ${xUnit} ${lo.x}, highest ${fmt(hi.y)} at ${xUnit} ${hi.x}.`;
}

/**
 * SVG line chart of a value over age (no chart library). The plot is one labelled image; a
 * toggle reveals the same data as a table.
 */
export function Chart(props: {
  title: string;
  points: readonly ChartPoint[];
  xUnit?: string;
  format?: (y: number) => string;
}) {
  const [table, setTable] = useState(false);
  const fmt = props.format ?? money;
  const xUnit = props.xUnit ?? "age";
  const pts = props.points;
  const summary = summarize(pts, xUnit, fmt);

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = xs.length ? Math.min(...xs) : 0;
  const x1 = xs.length ? Math.max(...xs) : 1;
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(0, ...ys);
  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const sx = (x: number): number =>
    PAD.l + (x1 === x0 ? pw / 2 : ((x - x0) / (x1 - x0)) * pw);
  const sy = (y: number): number =>
    PAD.t + (y1 === y0 ? ph / 2 : (1 - (y - y0) / (y1 - y0)) * ph);
  const line = pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`);
  const last = pts[pts.length - 1];

  return (
    <section aria-label={props.title} class="flex flex-col gap-2 p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${props.title}. ${summary}`}
        class="w-full rounded bg-surface-raised"
        data-testid="chart"
      >
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={sy(0)}
          y2={sy(0)}
          class="stroke-text-muted"
          stroke-width="0.5"
          stroke-dasharray="3 3"
        />
        {line.length > 1 && (
          <polyline
            points={line.join(" ")}
            fill="none"
            class="stroke-primary"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        )}
        {last && (
          <circle cx={sx(last.x)} cy={sy(last.y)} r="3" class="fill-primary" />
        )}
        <text x={PAD.l} y={H - 8} font-size="10" class="fill-text-muted">
          {xUnit} {x0}
        </text>
        <text
          x={W - PAD.r}
          y={H - 8}
          font-size="10"
          text-anchor="end"
          class="fill-text-muted"
        >
          {xUnit} {x1}
        </text>
      </svg>
      <p class="text-sm" data-testid="chart-summary">
        {summary}
      </p>
      <button
        type="button"
        aria-expanded={table}
        onClick={() => setTable(!table)}
        class="min-h-11 self-start rounded-full border border-text-muted/50 px-4"
      >
        {table ? "Hide data table" : "Show data table"}
      </button>
      {table && (
        <div class="max-h-72 overflow-y-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              {props.title} by {xUnit}
            </caption>
            <thead>
              <tr>
                <th scope="col" class="py-1">
                  Age
                </th>
                <th scope="col" class="py-1 text-right">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.x} class="border-t border-text-muted/20">
                  <th scope="row" class="py-1 font-normal">
                    {p.x}
                  </th>
                  <td class="py-1 text-right">{fmt(p.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
