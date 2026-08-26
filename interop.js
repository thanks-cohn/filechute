import { writeStored } from "./storage.js";

export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_VERSION = 1;
export const FILECHUTE_TEXT_PREFIX = "filechute-transfer-v1:";

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

function textEnvelope(payload) {
  try {
    return `${FILECHUTE_TEXT_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
  } catch {
    return "";
  }
}

function payloadFromText(value) {
  const text = String(value || "");
  if (!text.startsWith(FILECHUTE_TEXT_PREFIX)) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(text.slice(FILECHUTE_TEXT_PREFIX.length)));
    if (payload?.protocol !== "filechute-item" || payload.version !== FILECHUTE_VERSION) return null;
    return payload;
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

  // Keep the private MIME flavor for same-renderer / browsers that preserve it.
  try {
    transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload));
  } catch {}

  // Chromium is not reliable about preserving custom drag flavors when a drag
  // leaves an extension side panel for another renderer. Whenever there is no
  // trustworthy native File item, carry the same payload inside text/plain.
  // Receivers recognize this prefix in capture phase and consume it before the
  // target website sees it as text.
  if (!fileAdded) {
    const envelope = textEnvelope(payload);
    if (envelope) {
      try { transfer.setData("text/plain", envelope); } catch {}
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
    return payloadFromText(transfer?.getData("text/plain"));
  } catch {
    return null;
  }
}
