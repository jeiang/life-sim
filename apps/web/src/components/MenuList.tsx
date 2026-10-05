import { ChevronRight } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { PackIcon } from "./Emoji.tsx";

export interface MenuRow {
  key: string;
  /** Pack icon ref (`twemoji:...`); a plain letter badge is drawn when it has no image. */
  icon?: string | undefined;
  label: string;
  sublabel?: string | undefined;
  value?: string | undefined;
  /** Greyed and not activatable; `reason` is shown and announced. */
  locked?: boolean | undefined;
  reason?: string | undefined;
  /** Shows a chevron (the row opens a deeper screen). */
  chevron?: boolean | undefined;
  onSelect?: (() => void) | undefined;
}

function Badge(props: { icon: string | undefined; label: string }) {
  return (
    <span
      aria-hidden="true"
      class="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg text-on-primary"
    >
      {props.icon?.startsWith("twemoji:") ? (
        <PackIcon icon={props.icon} />
      ) : (
        props.label.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function Row(props: { row: MenuRow }) {
  const { row } = props;
  const reasonId = useId();
  const content = (
    <>
      <Badge icon={row.icon} label={row.label} />
      <span class="min-w-0 flex-1 text-left">
        <span class="block break-words font-medium">{row.label}</span>
        {row.sublabel ? (
          <span class="block break-words text-sm text-text-muted">
            {row.sublabel}
          </span>
        ) : null}
        {row.locked && row.reason ? (
          <span id={reasonId} class="block break-words text-sm text-text-muted">
            Locked: {row.reason}
          </span>
        ) : null}
      </span>
      {row.value ? (
        <span class="shrink-0 pl-2 text-right font-semibold">{row.value}</span>
      ) : null}
      {row.chevron ? (
        <ChevronRight
          aria-hidden="true"
          class="size-5 shrink-0 text-text-muted"
        />
      ) : null}
    </>
  );
  const base = "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-text";
  if (!row.onSelect && !row.locked) return <div class={base}>{content}</div>;
  return (
    <button
      type="button"
      aria-disabled={row.locked ? "true" : undefined}
      aria-describedby={row.locked && row.reason ? reasonId : undefined}
      onClick={row.locked ? undefined : row.onSelect}
      class={`${base} ${row.locked ? "opacity-60" : "active:bg-primary/10"}`}
    >
      {content}
    </button>
  );
}

/** Menu list screen kind: icon badge, label, optional sublabel and value, locked rows with reasons. */
export function MenuList(props: { rows: readonly MenuRow[] }) {
  return (
    <ul class="divide-y divide-text-muted/20 rounded-xl bg-surface-raised">
      {props.rows.map((row) => (
        <li key={row.key}>
          <Row row={row} />
        </li>
      ))}
    </ul>
  );
}

/** A titled group of rows on a menu page. */
export function MenuSection(props: {
  title: string;
  children: ComponentChildren;
}) {
  return (
    <section class="mb-4">
      <h2 class="px-1 pb-1 text-sm font-semibold uppercase tracking-wide text-text-muted">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}
