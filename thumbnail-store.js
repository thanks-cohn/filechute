import { readStored, writeStored } from "./storage.js";

const CACHE_PREFIX = "thumbnail-cache-v1:";

export async function loadThumbnail(key) {
  const cached = await readStored(`${CACHE_PREFIX}${key}`);
  return cached instanceof Blob && cached.size ? cached : null;
}

export async function saveThumbnail(key, blob) {
  if (blob instanceof Blob && blob.size) await writeStored(`${CACHE_PREFIX}${key}`, blob);
}

export function makeThumbnailKey({ relativePath, size, lastModified, mime, thumbnailSize = 48 }) {
  return [relativePath || "", size || 0, lastModified || 0, mime || "", thumbnailSize || 48].join("\u001f");
}
