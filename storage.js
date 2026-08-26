const DB_NAME = "filechute-state-v1";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise = null;
const liveHandleCache = new Map();

function isFilesystemHandle(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value.kind === "file" || value.kind === "directory") &&
    typeof value.queryPermission === "function"
  );
}

function rememberLiveHandle(key, value) {
  if (isFilesystemHandle(value)) liveHandleCache.set(key, value);
  else liveHandleCache.delete(key);
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function readStored(key) {
  // FileSystemHandle objects are structured-cloned when they go through
  // IndexedDB. Keep using the exact live handle object for the lifetime of
  // this side-panel document so Windows Chromium does not make sibling
  // features (resize, metadata, thumbnails, etc.) reopen the filesystem
  // through a fresh clone after permission has already been granted.
  if (liveHandleCache.has(key)) return liveHandleCache.get(key);

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => {
      const value = request.result ?? null;
      rememberLiveHandle(key, value);
      resolve(value);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function writeStored(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      // Preserve the original in-memory object, not the IndexedDB clone.
      rememberLiveHandle(key, value);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(value, key);
  });
}

export async function removeStored(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      liveHandleCache.delete(key);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(key);
  });
}
