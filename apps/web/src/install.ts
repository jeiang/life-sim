import { signal } from "@preact/signals";

/** The browser's deferred Android/desktop install prompt (`beforeinstallprompt`), once fired. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const installPrompt = signal<InstallPromptEvent | null>(null);

const DISMISSED_KEY = "life-sim:install-card-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** The install card was dismissed (remembered across visits). */
export const installDismissed = signal(readDismissed());
/** The export reminder was dismissed (this visit only; it returns next time). */
export const backupReminderDismissed = signal(false);

export function dismissInstall(): void {
  installDismissed.value = true;
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // private mode: dismissed for this visit only
  }
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/** iOS Safari (iPhone, iPad, iPadOS posing as a Mac) outside the installed app. */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && safari && !isStandalone();
}

/** Capture `beforeinstallprompt` so the card can offer an install button. Call once at startup. */
export function initInstall(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt.value = e as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt.value = null;
  });
}

export async function promptInstall(): Promise<void> {
  const p = installPrompt.value;
  if (!p) return;
  installPrompt.value = null; // a prompt can be used once
  await p.prompt();
  await p.userChoice;
}
