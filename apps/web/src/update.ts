import { registerSW } from "virtual:pwa-register";
import { signal } from "@preact/signals";

/** True once a new service worker is installed and waiting for the user to accept it. */
export const updateAvailable = signal(false);

let applyUpdate: (() => Promise<void>) | undefined;

/** Register the service worker. Never reloads on its own: the user accepts via `reloadForUpdate`. */
export function initServiceWorker(): void {
  applyUpdate = registerSW({
    onRegisteredSW(swUrl, registration) {
      // vite-plugin-pwa's register helpers cannot set updateViaCache; re-registering the same
      // script is a no-op update check that sets it, so /sw.js is never served from the HTTP cache.
      if (registration)
        void navigator.serviceWorker.register(swUrl, {
          scope: registration.scope,
          updateViaCache: "none",
        });
    },
    onNeedRefresh() {
      updateAvailable.value = true;
    },
  });
}

/** Activate the waiting service worker and reload onto the new build. */
export async function reloadForUpdate(): Promise<void> {
  await applyUpdate?.();
}
