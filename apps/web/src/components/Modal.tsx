import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centred modal. Traps Tab inside, focuses the first enabled control (or `[data-autofocus]`)
 * on open, and returns focus to the opener on close. Escape calls `onClose`; leave `onClose`
 * unset for modals that must be answered (pending events).
 */
export function Modal(props: {
  /** Accessible name; used when there is no visible `labelledBy` element. */
  label?: string;
  labelledBy?: string;
  onClose?: () => void;
  children: ComponentChildren;
}) {
  const card = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = card.current;
    if (el) {
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]:not([disabled])") ??
        el.querySelector<HTMLElement>(FOCUSABLE) ??
        el;
      target.focus();
    }
    // Keep focus inside even when the browser moves it by other means.
    const guard = (e: FocusEvent) => {
      const c = card.current;
      if (c && e.target instanceof Node && !c.contains(e.target)) {
        (c.querySelector<HTMLElement>(FOCUSABLE) ?? c).focus();
      }
    };
    document.addEventListener("focusin", guard);
    return () => {
      document.removeEventListener("focusin", guard);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      if (onClose.current) {
        e.preventDefault();
        onClose.current();
      }
      return;
    }
    if (e.key !== "Tab") return;
    const el = card.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      el.focus();
      return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!el.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div class="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-black/50 p-4">
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={props.labelledBy ? undefined : props.label}
        aria-labelledby={props.labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        class="modal-card max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-surface-raised p-4 outline-none"
      >
        {props.children}
      </div>
    </div>
  );
}
