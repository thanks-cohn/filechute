import { readStored, writeStored, removeStored } from "./storage.js";

const EXTERNAL_HANDLE_KEY = "metadata-directory-handle";
const CACHE_KEY = "metadata-cache-v1";
const EXTERNAL_FILENAME = "filechute-metadata.json";
const FORMAT_VERSION = 1;

function emptyDocument() {
  return {
    format: "filechute-metadata",
    version: FORMAT_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {}
  };
}

function normalizeDocument(value) {
  if (!value || typeof value !== "object") return emptyDocument();
  if (value.format !== "filechute-metadata" || value.version !== FORMAT_VERSION) return emptyDocument();
  return {
    format: "filechute-metadata",
    version: FORMAT_VERSION,
    updatedAt: value.updatedAt || new Date().toISOString(),
    entries: value.entries && typeof value.entries === "object" ? value.entries : {}
  };
}

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode })) === "granted") return true;
  } catch {}
  return false;
}

async function requestPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  if (await queryPermission(handle, mode)) return true;
  try {
    return (await handle.requestPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

export async function getExternalMetadataDirectory({ request = false } = {}) {
  const handle = await readStored(EXTERNAL_HANDLE_KEY);
  if (!handle) return null;
  const ok = request ? await requestPermission(handle) : await queryPermission(handle);
  return ok ? handle : null;
}

export async function chooseExternalMetadataDirectory() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  if (!handle) return null;
  if (!(await requestPermission(handle))) return null;
  await writeStored(EXTERNAL_HANDLE_KEY, handle);
  return handle;
}

export async function forgetExternalMetadataDirectory() {
  await removeStored(EXTERNAL_HANDLE_KEY);
}

async function readExternalDocument(directory) {
  if (!directory) return null;
  try {
    const fileHandle = await directory.getFileHandle(EXTERNAL_FILENAME);
    const file = await fileHandle.getFile();
    return normalizeDocument(JSON.parse(await file.text()));
  } catch (error) {
    if (error?.name === "NotFoundError") return emptyDocument();
    throw error;
  }
}

async function writeExternalDocument(directory, document) {
  if (!directory) return false;
  const fileHandle = await directory.getFileHandle(EXTERNAL_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(document, null, 2)}\n`);
  await writable.close();
  return true;
}

export async function loadMetadataDocument() {
  const cached = normalizeDocument(await readStored(CACHE_KEY));
  const directory = await getExternalMetadataDirectory();
  if (!directory) return cached;

  try {
    const external = await readExternalDocument(directory);
    if (!external) return cached;

    const externalTime = Date.parse(external.updatedAt || "") || 0;
    const cacheTime = Date.parse(cached.updatedAt || "") || 0;
    const chosen = externalTime >= cacheTime ? external : cached;
    await writeStored(CACHE_KEY, chosen);
    return chosen;
  } catch (error) {
    console.warn("Could not read external FileChute metadata", error);
    return cached;
  }
}

export async function saveMetadataDocument(document) {
  const normalized = normalizeDocument(document);
  normalized.updatedAt = new Date().toISOString();
  await writeStored(CACHE_KEY, normalized);

  const directory = await getExternalMetadataDirectory();
  if (directory) {
    try {
      await writeExternalDocument(directory, normalized);
    } catch (error) {
      console.warn("Could not mirror FileChute metadata outside the browser", error);
    }
  }

  return normalized;
}

export async function metadataFor(key) {
  const document = await loadMetadataDocument();
  return document.entries[key] || null;
}

export async function mergeMetadata(key, patch) {
  const document = await loadMetadataDocument();
  document.entries[key] = {
    ...(document.entries[key] || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  return saveMetadataDocument(document);
}

export async function externalMetadataStatus() {
  const stored = await readStored(EXTERNAL_HANDLE_KEY);
  if (!stored) return { configured: false, available: false, name: null };
  return {
    configured: true,
    available: await queryPermission(stored),
    name: stored.name || "Metadata folder"
  };
}
