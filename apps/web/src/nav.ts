import { signal } from "@preact/signals";

export type PageId =
  | "profile"
  | "chart"
  | "settings"
  | "occupation"
  | "assets"
  | "relationships"
  | "activities";

/** The full-page screen on top of the play layout, or null. Menu pages replace the placeholder. */
export const page = signal<PageId | null>(null);

/** Person shown by the profile page; null means the player. */
export const profileTarget = signal<number | null>(null);

interface Entry {
  readonly page: PageId;
  readonly target: number | null;
}
/** Pages beneath the current one, so Back returns where the player came from. */
const stack: Entry[] = [];

const push = (): void => {
  if (page.value) stack.push({ page: page.value, target: profileTarget.value });
};

export const openPage = (id: PageId): void => {
  push();
  if (id === "profile") profileTarget.value = null;
  page.value = id;
};

/** Open a person's profile (null for the player). */
export const openProfile = (personId: number | null): void => {
  push();
  profileTarget.value = personId;
  page.value = "profile";
};

export const closePage = (): void => {
  const prev = stack.pop();
  page.value = prev?.page ?? null;
  profileTarget.value = prev?.target ?? null;
};
