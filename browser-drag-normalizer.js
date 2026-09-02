import "./yandex-image-drop-fallback.js";
import "./chatgpt-image-drop-fallback.js";
import "./google-image-drop-fallback.js";

const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-filechute-item";
const FRAMECHUTE_DRAG_TYPE = "application/x-framefilechute-item+json";
const PRIMED_TYPE = "application/x-filechute-browser-drop-primed";
const BROWSER_STRING_TYPES = ["text/html", "text/uri-list", "text/plain", "DownloadURL"];

function directMediaLike(value) {
  const text = String(value || "").trim();
  if (/^(?:data:image\/|blob:)/i.test(text)) return true;
  if (/\.(?:jpe?g|png|gif|webp|avif|bmp|svg|ico|apng|mp4|webm|mov|m4v|mkv|mp3|wav|ogg|flac|m4a|aac)(?:$|[?#])/i.test(text)) return true;
  try {
    const url = new URL(text);
    return ["imgurl", "mediaurl", "image_url", "image", "img"].some((key) => Boolean(url.searchParams.get(key)));
  } catch {
    return false;
  }
}

function looksLikeBrowserMedia(transfer) {
  if (!transfer) return false;
  try {
    const html = transfer.getData("text/html");
    if (/<(?:img|source)\b/i.test(html)) return true;
  } catch {}
  try {
    if (transfer.getData("DownloadURL")) return true;
  } catch {}
  try {
    if (directMediaLike(transfer.getData("text/uri-list"))) return true;
  } catch {}
  try {
    if (directMediaLike(transfer.getData("text/plain"))) return true;
  } catch {}
  return false;
}

function needsNormalization(transfer) {
  if (!transfer) return false;
  const types = [...(transfer.types || [])];
  if (types.includes(PRIMED_TYPE)) return false;
  if (types.includes(FILECHUTE_DRAG_TYPE) || types.includes(CHUTE_DRAG_TYPE) || types.includes(FRAMECHUTE_DRAG_TYPE)) return false;
  if ((transfer.files?.length || 0) > 0) return false;
  if (!BROWSER_STRING_TYPES.some((type) => types.includes(type))) return false;
  return looksLikeBrowserMedia(transfer);
}

function cloneBrowserStrings(transfer) {
  const clone = new DataTransfer();
  clone.effectAllowed = "copy";
  clone.setData(PRIMED_TYPE, "1");
  for (const type of BROWSER_STRING_TYPES) {
    try {
      const value = transfer.getData(type);
      if (value) clone.setData(type, value);
    } catch {}
  }
  return clone;
}

function nestedUrls(value) {
  const results = [];
  try {
    const url = new URL(String(value || ""));
    results.push(url.href);
    for (const key of ["imgurl", "mediaurl", "image_url", "image", "img", "url"]) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      try {
        const decoded = decodeURIComponent(nested);
        if (/^https?:/i.test(decoded)) results.push(decoded);
      } catch {}
    }
  } catch {}
  return results;
}

function permissionOrigins(transfer) {
  const urls = [];
  const add = (value) => {
    for (const candidate of nestedUrls(value)) urls.push(candidate);
  };

  try {
    const html = transfer.getData("text/html");
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const img of doc.querySelectorAll("img")) {
        for (const attr of ["data-iurl", "data-image-url", "data-original", "data-src", "data-url", "src"]) add(img.getAttribute(attr));
        for (const attr of ["srcset", "data-srcset"]) {
          String(img.getAttribute(attr) || "").split(",").forEach((part) => add(part.trim().split(/\s+/)[0]));
        }
        add(img.closest("a[href]")?.getAttribute("href"));
      }
      for (const source of doc.querySelectorAll("source[srcset]")) {
        String(source.getAttribute("srcset") || "").split(",").forEach((part) => add(part.trim().split(/\s+/)[0]));
      }
    }
  } catch {}

  try {
    const download = String(transfer.getData("DownloadURL") || "");
    const match = download.match(/^[^:]+:[^:]+:(https?:\/\/.+)$/);
    if (match) add(match[1]);
  } catch {}
  try { add(String(transfer.getData("text/uri-list") || "").split(/\r?\n/).find((line) => line && !line.startsWith("#"))); } catch {}
  try { add(transfer.getData("text/plain")); } catch {}

  const origins = [];
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const pattern = `${url.protocol}//${url.host}/*`;
      if (!origins.includes(pattern)) origins.push(pattern);
      if (origins.length >= 8) break;
    } catch {}
  }
  return origins;
}

function redispatch(event, clone) {
  const target = event.target instanceof EventTarget ? event.target : document;
  target.dispatchEvent(new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    composed: true,
    dataTransfer: clone,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY
  }));
}

document.addEventListener("drop", (event) => {
  if (!needsNormalization(event.dataTransfer)) return;
  const clone = cloneBrowserStrings(event.dataTransfer);
  if (![...(clone.types || [])].length) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  // Browser drops must never trigger a surprise host-permission dialog.
  // Reuse host access only when the user has already granted it elsewhere.
  const origins = permissionOrigins(clone);
  let permission = Promise.resolve(false);
  if (origins.length) {
    try { permission = chrome.permissions.contains({ origins }); } catch {}
  }

  void Promise.resolve(permission)
    .catch(() => false)
    .finally(() => redispatch(event, clone));
}, true);
