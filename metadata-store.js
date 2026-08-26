import { readStored, writeStored } from "./storage.js";

const CACHE_KEY = "metadata-cache-v1";
const FORMAT_VERSION = 1;

function emptyDocument() {
  return { format: "chute-metadata", version: FORMAT_VERSION, updatedAt: new Date().toISOString(), entries: {} };
}

function normalizeDocument(value) {
  if (!value || typeof value !== "object" || value.version !== FORMAT_VERSION) return emptyDocument();
  return {
    format: "chute-metadata",
    version: FORMAT_VERSION,
    updatedAt: value.updatedAt || new Date().toISOString(),
    entries: value.entries && typeof value.entries === "object" ? value.entries : {}
  };
}

export async function loadMetadataDocument() {
  return normalizeDocument(await readStored(CACHE_KEY));
}

export async function saveMetadataDocument(document) {
  const normalized = normalizeDocument(document);
  normalized.updatedAt = new Date().toISOString();
  await writeStored(CACHE_KEY, normalized);
  return normalized;
}

export async function metadataFor(key) {
  const document = await loadMetadataDocument();
  return document.entries[key] || null;
}

export async function mergeMetadata(key, patch) {
  const document = await loadMetadataDocument();
  document.entries[key] = { ...(document.entries[key] || {}), ...patch, updatedAt: new Date().toISOString() };
  return saveMetadataDocument(document);
}
