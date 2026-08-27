export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_DRAG_PREFIX = "FILECHUTE1|";
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

function compactTicket(payload) {
  if (!payload?.transferToken || !payload?.relativePath) return "";
  return FILECHUTE_DRAG_PREFIX + [
    payload.sourceExtensionId || globalThis.chrome?.runtime?.id || "",
    payload.transferToken,
    payload.kind || "file",
    payload.relativePath || "",
    payload.originalName || payload.name || ""
  ].map((value) => encodeURIComponent(String(value))).join("|");
}

export function writeFileChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";

  // Always give Chromium the real File first. When it survives the extension
  // -> page boundary, FileChute does nothing else and the site receives a
  // normal trusted file drop.
  if (file) {
    try { transfer.items.add(file); } catch {}
  }

  try { transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload)); } catch {}

  if (payload?.transferToken && payload?.relativePath && globalThis.chrome?.runtime?.sendMessage) {
    globalThis.chrome.runtime.sendMessage({
      type: "filechute-register-transfer-v1",
      token: payload.transferToken,
      relativePath: payload.relativePath,
      representation: payload.representation || "original",
      kind: payload.kind || "file",
      name: payload.originalName || payload.name || "",
      mime: payload.mime || "",
      size: payload.size ?? null,
      lastModified: payload.lastModified ?? null
    }).catch(() => {});
  }

  // Windows Chromium can strip the usable File and private MIME at the renderer
  // boundary. A compact reference-only ticket gives FileChute's already-loaded
  // page receiver one final way to identify the drag. No file bytes are carried
  // here, and the receiver claims the fallback before page editors see it.
  const ticket = compactTicket(payload);
  if (ticket) {
    try { transfer.setData("text/plain", ticket); } catch {}
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
