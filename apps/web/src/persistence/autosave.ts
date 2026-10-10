import type { SavedLife, World } from "@life/core";
import { signal } from "@preact/signals";
import type { LifeStore } from "./store.ts";

export interface Autosaver {
  /**
   * Queue a save of this life's world. Call after every action and age-up. Writes run one
   * at a time in call order, and a write still waiting for its turn is replaced by a newer
   * one for the same life, so rapid taps never pile up. A world with `ended` is saved like any
   * other: the life stays in the life list until the player chooses an heir or finishes it
   * (`LifeStore.succeedLife`, `moveToGraveyard`). Resolves when this snapshot (or a newer one
   * for the same life) is stored; rejects if the write failed.
   */
  save(id: string, name: string, world: World): Promise<void>;
  /** Resolves when every queued write has finished (success or failure). */
  flush(): Promise<void>;
  /** Last write error message (quota, blocked, ...), or null after a successful write. */
  readonly lastError: { readonly value: string | null };
}

export interface AutosaveOptions {
  /** Timestamp source for `updatedAt`; defaults to `Date.now`. */
  now?: () => number;
}

interface Waiter {
  resolve(): void;
  reject(e: unknown): void;
}
interface Queued {
  life: SavedLife;
  waiters: Waiter[];
}

export function createAutosaver(
  store: LifeStore,
  opts: AutosaveOptions = {},
): Autosaver {
  const now = opts.now ?? Date.now;
  const lastError = signal<string | null>(null);
  const queue = new Map<string, Queued>();
  let draining: Promise<void> | null = null;

  async function drain(): Promise<void> {
    while (queue.size > 0) {
      const [id, job] = queue.entries().next().value as [string, Queued];
      queue.delete(id);
      try {
        await store.saveLife(job.life);
        lastError.value = null;
        for (const w of job.waiters) w.resolve();
      } catch (e) {
        lastError.value = e instanceof Error ? e.message : String(e);
        for (const w of job.waiters) w.reject(e);
      }
    }
    draining = null;
  }

  return {
    lastError,
    save(id, name, world) {
      const life: SavedLife = { id, name, updatedAt: now(), world };
      return new Promise<void>((resolve, reject) => {
        const waiter = { resolve, reject };
        const queued = queue.get(id);
        if (queued) {
          queued.life = life;
          queued.waiters.push(waiter);
        } else queue.set(id, { life, waiters: [waiter] });
        draining ??= drain();
      });
    },
    async flush() {
      while (draining) await draining;
    },
  };
}
