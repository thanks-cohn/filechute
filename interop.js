export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_VERSION = 1;

export function makeChutePayload({
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
    provider: "Chute",
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

export function writeChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";

  // Put the real File item into DataTransfer before adding Chute's private
  // metadata flavor. Some browser upload surfaces inspect the earliest/native
  // item and are markedly more reliable when Files is the primary flavor.
  let fileAdded = false;
  if (file) {
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

  // When Chute has the actual bytes, expose the drag as a file first and
  // do not advertise stale provenance URLs as ordinary text. Google and Yandex
  // can otherwise choose the text/uri-list flavor instead of uploading the
  // image. Keep source URLs only as a fallback when Chromium refused the File.
  if (!fileAdded) {
    const sourceUrl = validWebUrl(payload?.sourceUrl);
    if (sourceUrl) {
      try { transfer.setData("text/uri-list", sourceUrl); } catch {}
      try { transfer.setData("text/plain", sourceUrl); } catch {}
    } else if (!file && payload?.relativePath) {
      try { transfer.setData("text/plain", payload.relativePath); } catch {}
    }
  }
}

export function readChuteDrag(transfer) {
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
