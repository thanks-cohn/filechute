import { writeStored } from "./storage.js";

export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_VERSION = 1;

const TRANSFER_FILE_CACHE_KEY = "filechute-transfer-file-cache-v1";

export function makeFileChutePayload({
  kind,
  name,
  originalName = name,
  representation = "original",
  mime = "",
  relativePath = "",
  sourceUrl = null,
  parentPageUrl = null,
  size = null,
  lastModified = null,
  sourceExtensionId = null,
  transferToken = null
}) {
  return {
    protocol: "filechute-item",
    version: FILECHUTE_VERSION,
    kind,
    name,
    originalName,
    representation,
    mime,
    relativePath,
    sourceUrl,
    parentPageUrl,
    size,
    lastModified,
    sourceExtensionId: sourceExtensionId || globalThis.chrome?.runtime?.id || null,
    transferToken: transferToken || globalThis.crypto?.randomUUID?.() || null
  };
}

function validWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function windowsPlatform() {
  const platform = String(
    globalThis.navigator?.userAgentData?.platform ||
    globalThis.navigator?.platform ||
    globalThis.navigator?.userAgent ||
    ""
  ).toLowerCase();
  return platform.includes("windows") || platform.startsWith("win");
}

function cacheTransferFile(payload, file) {
  if (!(file instanceof File) || !payload?.transferToken) return;

  // Keep exactly one most-recent transfer file. The receiving page can fetch
  // these bytes through FileChute's bridge instead of asking Windows Chromium
  // to synthesize an OS-native file drag. A single slot avoids abandoned drag
  // attempts accumulating permanent temporary files in IndexedDB.
  void writeStored(TRANSFER_FILE_CACHE_KEY, {
    token: String(payload.transferToken),
    file,
    storedAt: Date.now()
  }).catch((error) => {
    console.debug("FileChute could not cache drag bytes", error);
  });
}

export function writeFileChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";

  cacheTransferFile(payload, file);

  // Chromium has a long-standing bug where DataTransferItemList.add(File) can
  // appear to succeed while no usable File reaches the drop target. On Windows
  // repeated synthetic file drags can also leave Chromium's drag state wedged.
  // Carry only FileChute's token there; the page bridge retrieves the bytes.
  const useNativeFileItem = Boolean(file) && !windowsPlatform();
  let fileAdded = false;
  if (useNativeFileItem) {
    try {
      const before = transfer.items.length;
      const added = transfer.items.add(file);
      fileAdded = Boolean(added) || transfer.items.length > before || transfer.files?.length > 0;
    } catch {}
  }

  transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload));

  if (payload?.transferToken && payload?.relativePath && globalThis.chrome?.runtime?.sendMessage) {
    globalThis.chrome.runtime.sendMessage({
      type: "filechute-register-transfer-v1",
      token: payload.transferToken,
      relativePath: payload.relativePath,
      representation: payload.representation || "original",
      kind: payload.kind || "file",
      name: payload.originalName || payload.name || ""
    }).catch(() => {});
  }

  if (!fileAdded) {
    // On Windows do not turn a failed file drag into a provenance-URL drag.
    // A compatible receiving page will consume FILECHUTE_DRAG_TYPE; an
    // incompatible page merely sees the harmless FileChute relative path.
    if (file && windowsPlatform() && payload?.relativePath) {
      try { transfer.setData("text/plain", payload.relativePath); } catch {}
      return;
    }

    const sourceUrl = validWebUrl(payload?.sourceUrl);
    if (sourceUrl) {
      try { transfer.setData("text/uri-list", sourceUrl); } catch {}
      try { transfer.setData("text/plain", sourceUrl); } catch {}
    } else if (!file && payload?.relativePath) {
      try { transfer.setData("text/plain", payload.relativePath); } catch {}
    }
  }
}

export function readFileChuteDrag(transfer) {
  try {
    const raw = transfer.getData(FILECHUTE_DRAG_TYPE);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.protocol !== "filechute-item" || payload.version !== FILECHUTE_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}
