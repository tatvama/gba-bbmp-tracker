"use client";

/**
 * IndexedDB store for FileSystemFileHandles keyed by upload-session id — the
 * piece that lets an interrupted ZIP upload RESUME after the browser was
 * closed, without asking the user to find the file again. Handles only exist
 * when the file arrived via showOpenFilePicker or a drag-drop
 * getAsFileSystemHandle (Chromium); on other browsers every helper quietly
 * no-ops and resume falls back to "re-select the same file" (matched by
 * fingerprint server-side).
 */

const DB_NAME = "gba-import-handles";
const STORE = "handles";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveFileHandle(sessionId: string, handle: unknown): Promise<void> {
  if (!handle) return;
  await withStore("readwrite", (s) => s.put(handle, sessionId) as IDBRequest<IDBValidKey>);
}

export async function loadFileHandle(sessionId: string): Promise<FileSystemFileHandle | null> {
  const v = await withStore<unknown>("readonly", (s) => s.get(sessionId) as IDBRequest<unknown>);
  if (v && typeof (v as FileSystemFileHandle).getFile === "function") return v as FileSystemFileHandle;
  return null;
}

export async function deleteFileHandle(sessionId: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(sessionId) as IDBRequest<undefined>);
}

/**
 * Ask (or re-ask) for read permission on a stored handle, then return its
 * current File. Must run inside a user gesture when permission was dropped.
 * Returns null when the handle is gone or permission was denied.
 */
export async function fileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  try {
    const h = handle as FileSystemFileHandle & {
      queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
      requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
    };
    let perm: PermissionState = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
    if (perm === "prompt") perm = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
    if (perm !== "granted") return null;
    return await handle.getFile();
  } catch {
    return null;
  }
}
