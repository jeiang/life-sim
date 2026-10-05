/** Thin promise wrapper over the IndexedDB API (no dependency). */

export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDb(
  factory: IDBFactory,
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(name, version);
    open.onupgradeneeded = (e) => upgrade(open.result, e.oldVersion);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () =>
      reject(
        new Error(
          "The save database is open in another tab; close it and retry.",
        ),
      );
  });
}

/**
 * Run `body` in one transaction and resolve with its result once the transaction has
 * committed. `body` may only await IDB requests (anything else lets the transaction
 * auto-commit); if it throws, the transaction aborts and nothing is written.
 */
export async function run<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(stores, mode);
  const finished = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
  try {
    const result = await body(tx);
    await finished;
    return result;
  } catch (e) {
    finished.catch(() => {});
    try {
      tx.abort();
    } catch {
      // already finished
    }
    throw e;
  }
}
