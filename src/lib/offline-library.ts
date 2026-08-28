"use client";

// Durable, client-side book storage — separate from any HTTP cache. IndexedDB
// survives browser restarts and revisits days/weeks later; it's only cleared
// by the user or by explicit eviction under disk pressure, which we opt out
// of via navigator.storage.persist() below. Read/write are keyed by concept
// slug so re-visiting a concept is instant and works offline once saved.

const DB_NAME = "substrate-offline";
const DB_VERSION = 2;
const STORE = "concept-chunks";
const PDF_STORE = "pdf-files";
const ENABLED_KEY = "substrate:offline-storage-enabled";

export interface StoredConceptChunk {
  slug: string;
  title: string;
  sourceChunk: string;
  savedAt: number;
}

export interface StoredPdfFile {
  id: string; // stable id derived from name+size, so re-opening the same file resumes it
  name: string;
  size: number;
  file: Blob;
  lastPage: number;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "slug" });
      }
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function pdfFileId(name: string, size: number): string {
  return `${name}:${size}`;
}

export async function savePdfFile(entry: Omit<StoredPdfFile, "savedAt">) {
  if (!supported()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).put({ ...entry, savedAt: Date.now() } satisfies StoredPdfFile);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Quota exceeded or storage unavailable — the reader still works for
    // this session, it just won't be there on the next visit.
  }
}

export async function updatePdfLastPage(id: string, lastPage: number) {
  if (!supported()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(PDF_STORE, "readwrite");
    const store = tx.objectStore(PDF_STORE);
    const existing: StoredPdfFile | undefined = await new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existing) store.put({ ...existing, lastPage });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best-effort — losing the last-read page just means starting at 1.
  }
}

export async function listPdfFiles(): Promise<StoredPdfFile[]> {
  if (!supported()) return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(PDF_STORE, "readonly").objectStore(PDF_STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deletePdfFile(id: string) {
  if (!supported()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing to clean up if the store never opened.
  }
}

function supported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function isOfflineStorageEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(ENABLED_KEY);
  return stored === null ? true : stored === "1"; // default on
}

export function setOfflineStorageEnabled(enabled: boolean) {
  window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  if (!enabled) void clearOfflineLibrary();
}

// Ask the browser not to evict this origin's storage under disk pressure.
// Best-effort: some browsers only grant it for installed/bookmarked sites.
export async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // Ignore — falls back to best-effort storage, which is still fine for
    // most sessions; we just lose the eviction-resistance guarantee.
  }
}

export async function saveConceptChunk(chunk: Omit<StoredConceptChunk, "savedAt">) {
  if (!supported() || !isOfflineStorageEnabled() || !chunk.sourceChunk) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...chunk, savedAt: Date.now() } satisfies StoredConceptChunk);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Storage can be unavailable (private browsing, quota) — reading the
    // book still works from the server-rendered prop, so just skip caching.
  }
}

export async function getConceptChunk(slug: string): Promise<StoredConceptChunk | null> {
  if (!supported()) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(slug);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearOfflineLibrary() {
  if (!supported()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing to clean up if the store never opened.
  }
}
