import { readStored } from "./storage.js";
import { mergeMetadata } from "./metadata-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const RESTORE_PATH_KEY = "filechute-restore-path-v1";
const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-filechute-item";
const FRAMECHUTE_DRAG_TYPE = "application/x-framefilechute-item+json";

const statusElement = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function currentPathNames() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return [];
  return text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean).slice(1);
}

function pathFromEntry(entry) {
  const path = String(entry?.querySelector(".entry-path")?.textContent || "").trim();
  if (!path) return null;
  return path.split("/").filter(Boolean).slice(1);
}

function targetPathForEvent(event) {
  const folderRow = event.target instanceof Element ? event.target.closest(".entry.directory") : null;
  return pathFromEntry(folderRow) || currentPathNames();
}

function clearDropTargets() {
  document.querySelectorAll(".entry.directory.drop-target").forEach((row) => row.classList.remove("drop-target"));
}

function markDropTarget(event) {
  clearDropTargets();
  const folderRow = event.target instanceof Element ? event.target.closest(".entry.directory") : null;
  folderRow?.classList.add("drop-target");
}

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

async function requestPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  if (await queryPermission(handle, mode)) return true;
  try {
    return (await handle.requestPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

async function rootHandle() {
  return readStored(ROOT_HANDLE_KEY);
}

async function resolveDirectory(pathNames) {
  const root = await rootHandle();
  if (!root || root.kind !== "directory") throw new Error("Choose a Chute folder first.");
  if (!(await requestPermission(root))) {
    throw new Error(`Chromium needs permission for ${root.name || "the Chute folder"}. Reconnect it and try again.`);
  }

  let directory = root;
  for (const name of pathNames || []) directory = await directory.getDirectoryHandle(name);
  return directory;
}

function sanitizeName(value, fallback = "browser-image") {
  const clean = String(value || "").replace(/[\\/\r\n\0]+/g, "_").trim();
  return clean || fallback;
}

async function uniqueFileName(directory, requested) {
  const name = sanitizeName(requested);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? name : `${stem} (${attempt + 1})${ext}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name === "TypeMismatchError") continue;
      throw error;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

async function writeFile(directory, pathNames, file, preferredName = file?.name, provenance = null) {
  const name = await uniqueFileName(directory, preferredName || "browser-image");
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();

  const root = await rootHandle();
  const metadataKey = [root?.name, ...pathNames, name].filter(Boolean).join("/");
  if (provenance?.sourceUrl || provenance?.parentPageUrl) {
    await mergeMetadata(metadataKey, {
      sourceUrl: provenance.sourceUrl || null,
      parentPageUrl: provenance.parentPageUrl || null
    });
  }
  return name;
}

function firstUri(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) || "";
}

function srcsetUrls(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function nestedImageUrls(value) {
  const results = [];
  try {
    const url = new URL(String(value || ""));
    for (const key of ["imgurl", "mediaurl", "image_url", "image", "img", "url"]) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      try {
        const decoded = decodeURIComponent(nested);
        if (/^(?:https?:|data:image\/|blob:)/i.test(decoded)) results.push(decoded);
      } catch {}
    }
  } catch {}
  return results;
}

function htmlResourceCandidates(html) {
  if (!html) return [];
  const candidates = [];
  const push = (value, score = 0, name = "") => {
    const text = String(value || "").trim();
    if (!text) return;
    candidates.push({ value: text, score, name: String(name || "") });
    for (const nested of nestedImageUrls(text)) candidates.push({ value: nested, score: score + 80, name: String(name || "") });
  };

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of doc.querySelectorAll("img")) {
      const suggested = img.getAttribute("alt") || img.getAttribute("title") || "";
      for (const attr of ["data-iurl", "data-image-url", "data-original", "data-src", "data-url", "src"]) {
        push(img.getAttribute(attr), attr === "src" ? 70 : 105, suggested);
      }
      for (const attr of ["srcset", "data-srcset"]) {
        for (const url of srcsetUrls(img.getAttribute(attr))) push(url, 100, suggested);
      }
      const link = img.closest("a[href]")?.getAttribute("href");
      push(link, 35, suggested);
    }

    for (const source of doc.querySelectorAll("source[srcset]")) {
      for (const url of srcsetUrls(source.getAttribute("srcset"))) push(url, 95);
    }

    for (const link of doc.querySelectorAll("a[href]")) push(link.getAttribute("href"), 20, link.textContent);
  } catch {}

  return candidates;
}

function schemeScore(value) {
  if (/^https?:/i.test(value)) return 80;
  if (/^data:image\//i.test(value)) return 45;
  if (/^blob:/i.test(value)) return 35;
  return -1000;
}

function mediaHintScore(value) {
  try {
    const url = new URL(value);
    if (/\.(?:jpe?g|png|gif|webp|avif|bmp|svg|ico|apng)(?:$|[?#])/i.test(url.pathname + url.search)) return 55;
    if (/\.(?:mp4|webm|mov|m4v|mkv|mp3|wav|ogg|flac|m4a|aac)(?:$|[?#])/i.test(url.pathname + url.search)) return 35;
  } catch {}
  return 0;
}

function downloadUrlCandidate(value) {
  const text = String(value || "");
  const match = text.match(/^([^:]+):([^:]+):(.+)$/);
  if (!match) return null;
  const valueUrl = match[3];
  if (!/^(?:https?:|data:|blob:)/i.test(valueUrl)) return null;
  return { value: valueUrl, score: 190, name: match[2], mime: match[1] };
}

function bestBrowserResource(transfer) {
  if (!transfer) return null;
  const candidates = [];

  const add = (candidate, score = 0, name = "", mime = "") => {
    if (!candidate) return;
    const value = String(candidate.value ?? candidate).trim();
    if (!/^(?:https?:|data:image\/|blob:)/i.test(value)) return;
    candidates.push({
      value,
      name: candidate.name || name || "",
      mime: candidate.mime || mime || "",
      score: Number(candidate.score ?? score) + schemeScore(value) + mediaHintScore(value)
    });
    for (const nested of nestedImageUrls(value)) {
      candidates.push({ value: nested, name: candidate.name || name || "", mime, score: score + 220 + schemeScore(nested) + mediaHintScore(nested) });
    }
  };

  try { add(downloadUrlCandidate(transfer.getData("DownloadURL"))); } catch {}
  try {
    for (const candidate of htmlResourceCandidates(transfer.getData("text/html"))) add(candidate);
  } catch {}
  try { add(firstUri(transfer.getData("text/uri-list")), 80); } catch {}
  try { add(String(transfer.getData("text/plain") || "").trim(), 25); } catch {}

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function parseFrameChutePayload(transfer) {
  try {
    const raw = transfer?.getData(FRAMECHUTE_DRAG_TYPE);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.protocol !== "framefilechute-item" || payload?.version !== 1) return null;
    return payload;
  } catch {
    return null;
  }
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/mp4": ".m4a",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov"
};

function ensureExtension(name, type) {
  let result = sanitizeName(name, "browser-image");
  if (!/\.[a-z0-9]{1,8}$/i.test(result) && EXT_BY_MIME[type]) result += EXT_BY_MIME[type];
  return result;
}

function bytesFromBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function pageBlobResource(url, suggestedName = "browser-image") {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.id) throw new Error("Chute could not identify the page that created this temporary image.");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "filechute-read-page-resource-v1",
      url,
      suggestedName
    });
    if (response?.ok && response?.base64) {
      const type = response.type || "application/octet-stream";
      const name = ensureExtension(response.name || suggestedName, type);
      return new File([bytesFromBase64(response.base64)], name, { type, lastModified: Date.now() });
    }
  } catch {}

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (resourceUrl, fallbackName) => {
        const response = await fetch(resourceUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunk) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
        }
        return { ok: true, base64: btoa(binary), type: blob.type || "application/octet-stream", name: fallbackName };
      },
      args: [url, suggestedName]
    });
    const response = results?.[0]?.result;
    if (response?.ok && response?.base64) {
      const type = response.type || "application/octet-stream";
      const name = ensureExtension(response.name || suggestedName, type);
      return new File([bytesFromBase64(response.base64)], name, { type, lastModified: Date.now() });
    }
  } catch (error) {
    console.debug("Chute could not read the page-owned blob directly", error);
  }

  throw new Error("This page supplied a temporary blob image that Chute could not read. Keep the source tab active and try the drag again.");
}

function filenameFromDisposition(value) {
  const text = String(value || "");
  const utf8 = text.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.replace(/^\"|\"$/g, "")); } catch {}
  }
  return text.match(/filename=\"?([^\";]+)\"?/i)?.[1] || null;
}

async function fetchHttpResource(url) {
  try {
    return await fetch(url.href, { cache: "no-store", credentials: "omit" });
  } catch (firstError) {
    const origin = `${url.protocol}//${url.host}/*`;
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [origin] }); } catch {}
    if (!granted) throw firstError;
    return fetch(url.href, { cache: "no-store", credentials: "omit" });
  }
}

async function browserResourceFile(resource) {
  const value = resource.value;
  if (/^data:image\//i.test(value)) {
    const response = await fetch(value);
    const blob = await response.blob();
    const type = blob.type || resource.mime || "application/octet-stream";
    return new File([blob], ensureExtension(resource.name || "browser-image", type), { type, lastModified: Date.now() });
  }

  if (/^blob:/i.test(value)) return pageBlobResource(value, resource.name || "browser-image");

  const url = new URL(value);
  const response = await fetchHttpResource(url);
  if (!response.ok) throw new Error(`The browser resource returned HTTP ${response.status}.`);
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

  if (type === "text/html") {
    throw new Error("That drag resolved to a web page instead of the image itself. Try dragging the image pixels or thumbnail rather than its surrounding link.");
  }

  const blob = await response.blob();
  const disposition = filenameFromDisposition(response.headers.get("content-disposition"));
  let pathname = "";
  try { pathname = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || ""); } catch {}
  const name = ensureExtension(disposition || resource.name || pathname || "browser-image", type || blob.type);
  return new File([blob], name, { type: type || blob.type || resource.mime || "application/octet-stream", lastModified: Date.now() });
}

function parentPageUrl() {
  try {
    const referrer = new URL(document.referrer);
    return ["http:", "https:"].includes(referrer.protocol) ? referrer.href : null;
  } catch {
    return null;
  }
}

async function receiveBrowserResource(resource, targetPathNames) {
  const destination = await resolveDirectory(targetPathNames);
  setStatus("Receiving browser image…");
  const file = await browserResourceFile(resource);
  const name = await writeFile(destination, targetPathNames, file, file.name, {
    sourceUrl: /^https?:/i.test(resource.value) ? resource.value : null,
    parentPageUrl: parentPageUrl()
  });
  return `Saved ${name} into Chute.`;
}

async function receiveFrameChute(payload, transfer, targetPathNames) {
  const destination = await resolveDirectory(targetPathNames);

  const directFiles = [...(transfer?.files || [])];
  if (directFiles.length) {
    let count = 0;
    for (const file of directFiles) {
      await writeFile(destination, targetPathNames, file, file.name);
      count += 1;
    }
    return `Copied ${count} FrameChute file${count === 1 ? "" : "s"} into Chute.`;
  }

  if (payload.sourceUrl && /^https?:/i.test(payload.sourceUrl)) {
    return receiveBrowserResource({ value: payload.sourceUrl, name: payload.name || "FrameChute image", mime: payload.mime || "" }, targetPathNames);
  }

  if (!payload.sourceExtensionId || !payload.transferToken) {
    throw new Error("Reload FrameChute and drag this media item again so Chute can request the source.");
  }

  let response;
  try {
    response = await chrome.runtime.sendMessage(payload.sourceExtensionId, {
      type: "framefilechute-read-dragged-resource-v1",
      transferToken: payload.transferToken
    });
  } catch (error) {
    throw new Error(`Could not reach FrameChute. Reload both extensions and try again. ${error?.message || ""}`.trim());
  }

  if (!response?.ok) throw new Error(response?.error || "FrameChute did not return that media item.");
  if (response.sourceUrl && /^https?:/i.test(response.sourceUrl)) {
    return receiveBrowserResource({ value: response.sourceUrl, name: response.name || payload.name, mime: response.type || payload.mime }, targetPathNames);
  }
  if (!response.base64) throw new Error("FrameChute returned no transferable media bytes.");

  const type = response.type || payload.mime || "application/octet-stream";
  const name = ensureExtension(response.name || payload.name || "FrameChute media", type);
  const file = new File([bytesFromBase64(response.base64)], name, {
    type,
    lastModified: Number(response.lastModified) || Date.now()
  });
  await writeFile(destination, targetPathNames, file, name);
  return `Copied ${name} from FrameChute.`;
}

function preserveCurrentPathAndReload(message) {
  try { sessionStorage.setItem(RESTORE_PATH_KEY, JSON.stringify(currentPathNames())); } catch {}
  setStatus(message);
  setTimeout(() => location.reload(), 140);
}

function ignoredProtocol(transfer) {
  const types = [...(transfer?.types || [])];
  return types.includes(FILECHUTE_DRAG_TYPE) || types.includes(CHUTE_DRAG_TYPE);
}

function enhancedEvidence(transfer) {
  if (!transfer || ignoredProtocol(transfer)) return false;
  const types = [...(transfer.types || [])];
  if (types.includes(FRAMECHUTE_DRAG_TYPE)) return true;
  if ([...transfer.items || []].some((item) => item.kind === "file")) return false;
  return types.some((type) => ["text/html", "text/uri-list", "text/plain", "DownloadURL"].includes(type));
}

document.addEventListener("dragover", (event) => {
  if (!enhancedEvidence(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  markDropTarget(event);
  document.body.classList.add("filechute-drop-active");
}, true);

document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  clearDropTargets();
}, true);

document.addEventListener("drop", (event) => {
  const transfer = event.dataTransfer;
  if (!enhancedEvidence(transfer)) return;

  const frameChute = parseFrameChutePayload(transfer);
  const browserResource = frameChute ? null : bestBrowserResource(transfer);
  if (!frameChute && !browserResource) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  document.body.classList.remove("filechute-drop-active");
  clearDropTargets();
  const targetPathNames = targetPathForEvent(event);

  const work = frameChute
    ? receiveFrameChute(frameChute, transfer, targetPathNames)
    : receiveBrowserResource(browserResource, targetPathNames);

  void work
    .then((message) => preserveCurrentPathAndReload(message))
    .catch((error) => {
      console.error("Chute enhanced incoming drop failed", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        error
      });
      setStatus(error?.message || "Could not save that browser resource into Chute.", true);
    });
}, true);
