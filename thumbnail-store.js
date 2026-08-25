import { readStored, writeStored, removeStored } from "./storage.js";

const EXTERNAL_HANDLE_KEY = "thumbnail-directory-handle";
const CHOICE_KEY = "filechute-thumbnail-storage-choice";
const CACHE_PREFIX = "thumbnail-cache-v1:";
const FORMAT = "image/webp";

async function hasPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

async function requestPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  if (await hasPermission(handle, mode)) return true;
  try {
    return (await handle.requestPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

async function localMirrorEnabled(storedHandle = null) {
  const choice = await readStored(CHOICE_KEY);
  if (choice === "external") return true;
  if (choice === "browser") return false;
  return Boolean(storedHandle);
}

async function digestName(key) {
  const bytes = new TextEncoder().encode(String(key));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `filechute-${hex.slice(0, 32)}.webp`;
}

export async function setExternalThumbnailEnabled(enabled) {
  await writeStored(CHOICE_KEY, enabled ? "external" : "browser");
}

export async function chooseExternalThumbnailDirectory() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  if (!handle) return null;
  if (!(await requestPermission(handle))) return null;
  await Promise.all([
    writeStored(EXTERNAL_HANDLE_KEY, handle),
    writeStored(CHOICE_KEY, "external")
  ]);
  return handle;
}

export async function getExternalThumbnailDirectory({ request = false } = {}) {
  const handle = await readStored(EXTERNAL_HANDLE_KEY);
  if (!handle || !(await localMirrorEnabled(handle))) return null;
  const ok = request ? await requestPermission(handle) : await hasPermission(handle);
  return ok ? handle : null;
}

export async function forgetExternalThumbnailDirectory() {
  await Promise.all([
    removeStored(EXTERNAL_HANDLE_KEY),
    writeStored(CHOICE_KEY, "browser")
  ]);
}

export async function externalThumbnailStatus() {
  const stored = await readStored(EXTERNAL_HANDLE_KEY);
  const enabled = await localMirrorEnabled(stored);
  if (!stored) {
    return {
      enabled,
      configured: false,
      available: false,
      name: null,
      handle: null
    };
  }
  return {
    enabled,
    configured: true,
    available: await hasPermission(stored),
    name: stored.name || "Thumbnail folder",
    handle: stored
  };
}

export async function loadThumbnail(key) {
  const cached = await readStored(`${CACHE_PREFIX}${key}`);
  if (cached instanceof Blob && cached.size) return cached;

  const directory = await getExternalThumbnailDirectory();
  if (!directory) return null;

  try {
    const fileHandle = await directory.getFileHandle(await digestName(key));
    const file = await fileHandle.getFile();
    if (!file.size) return null;
    const blob = file.type === FORMAT ? file : file.slice(0, file.size, FORMAT);
    await writeStored(`${CACHE_PREFIX}${key}`, blob);
    return blob;
  } catch (error) {
    if (error?.name !== "NotFoundError") console.warn("Could not read external FileChute thumbnail", error);
    return null;
  }
}

export async function saveThumbnail(key, blob) {
  if (!(blob instanceof Blob) || !blob.size) return;
  await writeStored(`${CACHE_PREFIX}${key}`, blob);

  const directory = await getExternalThumbnailDirectory();
  if (!directory) return;

  try {
    const fileHandle = await directory.getFileHandle(await digestName(key), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    console.warn("Could not mirror FileChute thumbnail outside the browser", error);
  }
}

export function makeThumbnailKey({ relativePath, size, lastModified, mime, thumbnailSize = 48 }) {
  return [relativePath || "", size || 0, lastModified || 0, mime || "", thumbnailSize || 48].join("\u001f");
}
