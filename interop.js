export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_VERSION = 1;

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

export function writeFileChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";
  transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload));

  if (payload?.transferToken && payload?.relativePath && globalThis.chrome?.runtime?.sendMessage) {
    // Fire-and-forget registration of this user-initiated drag. The service
    // worker keeps the token only briefly and consumes it after one transfer.
    globalThis.chrome.runtime.sendMessage({
      type: "filechute-register-transfer-v1",
      token: payload.transferToken,
      relativePath: payload.relativePath,
      representation: payload.representation || "original"
    }).catch(() => {});
  }

  if (file) {
    try { transfer.items.add(file); } catch {}
  }

  if (payload.sourceUrl) {
    try { transfer.setData("text/uri-list", payload.sourceUrl); } catch {}
    try { transfer.setData("text/plain", payload.sourceUrl); } catch {}
  } else if (!file && payload.relativePath) {
    // Directory/custom-payload fallback only. For real files, do not let a
    // path-like string outrank the actual File object at the drop target.
    try { transfer.setData("text/plain", payload.relativePath); } catch {}
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
