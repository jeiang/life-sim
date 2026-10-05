import { Download, Share, X } from "lucide-preact";
import type { ComponentChildren } from "preact";
import {
  backupReminderDismissed,
  dismissInstall,
  installDismissed,
  installPrompt,
  isIosSafari,
  promptInstall,
} from "../install.ts";
import { openPage } from "../nav.ts";
import { shouldNudgeBackup } from "../persistence/index.ts";

const ios = typeof navigator !== "undefined" && isIosSafari();

function Card(props: {
  title: string;
  onDismiss: () => void;
  children: ComponentChildren;
}) {
  return (
    <section
      aria-label={props.title}
      class="flex items-start gap-2 rounded-xl border border-text-muted/40 bg-surface-raised p-3 text-sm"
    >
      <div class="min-w-0 flex-1 space-y-2">
        <h2 class="font-bold">{props.title}</h2>
        {props.children}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={props.onDismiss}
        class="grid size-11 shrink-0 place-items-center rounded-full"
      >
        <X aria-hidden="true" class="size-5" />
      </button>
    </section>
  );
}

/**
 * Top of the feed: install guidance (iOS Share, Add to Home Screen; Android install
 * button) until dismissed, then an export reminder while storage is not durable.
 */
export function InstallCard() {
  if (!installDismissed.value) {
    if (ios)
      return (
        <Card title="Install Life Sim" onDismiss={dismissInstall}>
          <p>
            Tap{" "}
            <Share aria-hidden="true" class="inline size-4 align-text-bottom" />{" "}
            <strong>Share</strong> in Safari, then choose{" "}
            <strong>Add to Home Screen</strong>. Installed, your lives are kept
            safer and the game works offline.
          </p>
        </Card>
      );
    if (installPrompt.value)
      return (
        <Card title="Install Life Sim" onDismiss={dismissInstall}>
          <p>Install the game to play it offline from your home screen.</p>
          <button
            type="button"
            onClick={() => void promptInstall()}
            class="flex min-h-11 items-center gap-2 rounded-xl bg-action px-4 font-semibold text-on-action"
          >
            <Download aria-hidden="true" class="size-5" />
            Install
          </button>
        </Card>
      );
  }
  if (shouldNudgeBackup.value && !backupReminderDismissed.value)
    return (
      <Card
        title="Back up your lives"
        onDismiss={() => {
          backupReminderDismissed.value = true;
        }}
      >
        <p>
          This browser may clear the game's saved data. Export your lives now
          and then to keep a copy.
        </p>
        <button
          type="button"
          onClick={() => openPage("settings")}
          class="min-h-11 rounded-xl bg-action px-4 font-semibold text-on-action"
        >
          Go to export
        </button>
      </Card>
    );
  return null;
}
