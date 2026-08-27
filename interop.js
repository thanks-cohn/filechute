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

function validWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function compactTicket(payload) {
  if (!payload?.transferToken || !payload?.relativePath) return "";
  const fields = [
    payload.sourceExtensionId || globalThis.chrome?.runtime?.id || "",
    payload.transferToken,
    payload.kind || "file",
    payload.relativePath || "",
    payload.originalName || payload.name || ""
  ];
  return FILECHUTE_DRAG_PREFIX + fields.map((value) => encodeURIComponent(String(value))).join("|");
}

export function writeFileChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";

  // Keep the ordinary browser File flavor first. This is the zero-overhead path
  // on platforms/sites where Chromium carries the File correctly.
  let fileAdded = false;
  if (file) {
    try {
      const before = transfer.items.length;
      const added = transfer.items.add(file);
      fileAdded = Boolean(added) || transfer.items.length > before || transfer.files?.length > 0;
    } catch {}
  }

  // Always register FileChute's private metadata. The receiving bridge uses it
  // when Chromium preserves custom MIME across the renderer boundary.
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

  // Chromium on Windows can report a script-added File locally yet strip the
  // usable File by the time the drag reaches the page renderer. Mirror a tiny
  // recovery ticket into text/plain so FileChute's one canonical receiver can
  // recover the exact file. This is deliberately compact: never place file
  // bytes, paths from outside the selected root, or giant JSON envelopes here.
  const ticket = compactTicket(payload);
  if (ticket) {
    try { transfer.setData("text/plain", ticket); } catch {}
  } else if (!fileAdded) {
    const sourceUrl = validWebUrl(payload?.sourceUrl);
    if (sourceUrl) {
      try { transfer.setData("text/uri-list", sourceUrl); } catch {}
      try { transfer.setData("text/plain", sourceUrl); } catch {}
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
