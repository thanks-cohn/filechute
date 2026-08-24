export const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
export const FILECHUTE_VERSION = 1;

export function makeFileChutePayload({
  kind,
  name,
  mime = "",
  relativePath = "",
  sourceUrl = null,
  parentPageUrl = null,
  size = null,
  lastModified = null
}) {
  return {
    protocol: "filechute-item",
    version: FILECHUTE_VERSION,
    kind,
    name,
    mime,
    relativePath,
    sourceUrl,
    parentPageUrl,
    size,
    lastModified
  };
}

export function writeFileChuteDrag(transfer, payload, file = null) {
  transfer.effectAllowed = "copy";
  transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload));

  if (file) {
    try { transfer.items.add(file); } catch {}
  }

  if (payload.sourceUrl) {
    try { transfer.setData("text/uri-list", payload.sourceUrl); } catch {}
    try { transfer.setData("text/plain", payload.sourceUrl); } catch {}
  } else if (payload.relativePath) {
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
