import { signal } from "@preact/signals";

export type PageId =
  | "profile"
  | "chart"
  | "settings"
  | "occupation"
  | "assets"
  | "relationships"
  | "activities"
  | "graveyard"
  | "credits";

/** The full-page screen on top of the play layout, or null. Menu pages replace the placeholder. */
export const page = signal<PageId | null>(null);

/** Person shown by the profile page; null means the player. */
export const profileTarget = signal<number | null>(null);

/**
 * A deeper screen inside a menu page: a submenu path (`activities/job-board`,
 * `assets/shopping`). Null shows the top-level menu page.
 */
export const sub = signal<string | null>(null);

interface Entry {
  readonly page: PageId;
  readonly target: number | null;
  readonly sub: string | null;
}
/** Pages beneath the current one, so Back returns where the player came from. */
const stack: Entry[] = [];

const push = (): void => {
  if (page.value)
    stack.push({
      page: page.value,
      target: profileTarget.value,
      sub: sub.value,
    });
};

export const openPage = (id: PageId): void => {
  push();
  if (id === "profile") profileTarget.value = null;
  sub.value = null;
  page.value = id;
};

/** Open a person's profile (null for the player). */
export const openProfile = (personId: number | null): void => {
  push();
  profileTarget.value = personId;
  sub.value = null;
  page.value = "profile";
};

export const openSub = (path: string): void => {
  sub.value = path;
};

/** Back one level: a submenu to its menu, otherwise the page beneath. */
export const closePage = (): void => {
  if (sub.value !== null) {
    sub.value = null;
    return;
  }
  const prev = stack.pop();
  page.value = prev?.page ?? null;
  profileTarget.value = prev?.target ?? null;
  sub.value = prev?.sub ?? null;
};

/** Drop every open page (back to the play layout or the life list). */
export const closeAllPages = (): void => {
  stack.length = 0;
  page.value = null;
  profileTarget.value = null;
};
