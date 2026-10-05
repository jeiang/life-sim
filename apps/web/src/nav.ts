import { signal } from "@preact/signals";

export type PageId =
  | "profile"
  | "settings"
  | "occupation"
  | "assets"
  | "relationships"
  | "activities";

/** The full-page screen on top of the play layout, or null. Menu pages replace the placeholder. */
export const page = signal<PageId | null>(null);

export const openPage = (id: PageId): void => {
  page.value = id;
};
export const closePage = (): void => {
  page.value = null;
};
