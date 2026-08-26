import { writeStored } from "./storage.js";

export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_VERSION = 1;
export const FILECHUTE_TEXT_PREFIX = "FILECHUTE1|";

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

  void writeStored(TRANSFER_FILE_CACHE_KEY, {
    token: String(payload.transferToken),
    file,
    storedAt: Date.now()
  }).catch((error) => {
    console.debug("FileChute could not cache drag bytes", error);
  });
}

function compactTicket(payload) {
  const extensionId = String(payload?.sourceExtensionId || globalThis.chrome?.runtime?.id || "");
  const token = String(payload?.transferToken || "");
  const kind = payload?.kind === "directory" ? "d" : "f";
  const path = encodeURIComponent(String(payload?.relativePath || ""));
  const name = encodeURIComponent(String(payload?.originalName || payload?.name || ""));
  if (!extensionId || !token) return "";
  return `${FILECHUTE_TEXT_PREFIX}${extensionId}|${token}|${kind}|${path}|${name}`;
}

export function payloadFromTextTicket(value) {
  const text = String(value || "");
  if (!text.startsWith(FILECHUTE_TEXT_PREFIX)) return null;

  const parts = text.slice(FILECHUTE_TEXT_PREFIX.length).split("|");
  if (parts.length < 5) return null;

  const [sourceExtensionId, transferToken, kindCode, encodedPath, ...nameParts] = parts;
  if (!sourceExtensionId || !transferToken) return null;

  try {
    const relativePath = decodeURIComponent(encodedPath || "");
    const originalName = decodeURIComponent(nameParts.join("|") || "");
    return {
      protocol: "filechute-item",
      version: FILECHUTE_VERSION,
      kind: kindCode === "d" ? "directory" : "file",
      name: originalName,
      originalName,
      representation: "original",
      mime: kindCode === "d" ? "inode/directory" : "",
      relativePath,
      sourceUrl: null,
      parentPageUrl: null,
      size: null,
      lastModified: null,
      sourceExtensionId,
      transferToken
    };
  } catch {
    return null;
  }
}

export function writeFileChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";
  cacheTransferFile(payload, file);

  const onWindows = windowsPlatform();
  const useNativeFileItem = Boolean(file) && !onWindows;
  let fileAdded = false;

  if (useNativeFileItem) {
    try {
      const before = transfer.items.length;
      const added = transfer.items.add(file);
      fileAdded = Boolean(added) || transfer.items.length > before || transfer.files?.length > 0;
    } catch {}
  }

  // Preserve the full FileChute payload where Chromium allows custom flavors.
  try {
    transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload));
  } catch {}

  // When there is no trustworthy native File, also expose a very small standard
  // text flavor. Windows Chromium has proven much more reliable with short
  // text/plain drag data than with script-created File items or large JSON
  // payloads crossing from the extension side panel into another renderer.
  if (!fileAdded) {
    const ticket = compactTicket(payload);
    if (ticket) {
      try { transfer.setData("text/plain", ticket); } catch {}
    }
  }

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
}

export function readFileChuteDrag(transfer) {
  try {
    const raw = transfer?.getData(FILECHUTE_DRAG_TYPE);
    if (raw) {
      const payload = JSON.parse(raw);
      if (payload?.protocol === "filechute-item" && payload.version === FILECHUTE_VERSION) return payload;
    }
  } catch {}

  try {
    return payloadFromTextTicket(transfer?.getData("text/plain"));
  } catch {
    return null;
  }
}
