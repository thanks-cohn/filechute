import { readStored } from "./storage.js";
import { mergeMetadata } from "./metadata-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const YANDEX_DRAG_KEY = "filechute-yandex-drag-source-v1";
const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const FRAMECHUTE_DRAG_TYPE = "application/x-framechute-item+json";
const MAX_AGE_MS = 12000;

const statusElement = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");
let recentYandexDrag = null;

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

function ignoredProtocol(transfer) {
  const types = [...(transfer?.types || [])];
  return types.includes(FILECHUTE_DRAG_TYPE) || types.includes(CHUTE_DRAG_TYPE) || types.includes(FRAMECHUTE_DRAG_TYPE);
}

function isYandexHost(hostname) {
  return /(^|\.)yandex\.(?:com|ru|kz|by|uz)$/i.test(hostname) || /(^|\.)yandex\.com\.tr$/i.test(hostname);
}

function recentCapture() {
  if (!recentYandexDrag || !Array.isArray(recentYandexDrag.urls)) return null;
  if (Date.now() - Number(recentYandexDrag.capturedAt || 0) > MAX_AGE_MS) return null;
  try {
    if (!isYandexHost(new URL(recentYandexDrag.pageUrl).hostname)) return null;
  } catch {
    return null;
  }
  return recentYandexDrag;
}

function browserishTransfer(transfer) {
  if (!transfer || ignoredProtocol(transfer)) return false;
  const types = [...(transfer.types || [])];
  const hasFileItem = [...(transfer.items || [])].some((item) => item.kind === "file");
  const hasBrowserString = types.some((type) => ["text/html", "text/uri-list", "text/plain", "DownloadURL"].includes(type));
  return hasFileItem || hasBrowserString;
}

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try { return (await handle.queryPermission({ mode })) === "granted"; } catch { return false; }
}

async function requestPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  if (await queryPermission(handle, mode)) return true;
  try { return (await handle.requestPermission({ mode })) === "granted"; } catch { return false; }
}

async function resolveDirectory(pathNames) {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") throw new Error("Choose a FileChute folder first.");
  if (!(await requestPermission(root))) {
    throw new Error(`Chromium needs permission for ${root.name || "the FileChute folder"}. Reconnect it and try again.`);
  }
  let directory = root;
  for (const name of pathNames || []) directory = await directory.getDirectoryHandle(name);
  return { root, directory };
}

function sanitizeName(value, fallback = "yandex-image") {
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
    try { await directory.getFileHandle(candidate); }
    catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name === "TypeMismatchError") continue;
      throw error;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp"
};

function ensureExtension(name, type) {
  let result = sanitizeName(name, "yandex-image");
  if (!/\.[a-z0-9]{1,8}$/i.test(result) && EXT_BY_MIME[type]) result += EXT_BY_MIME[type];
  return result;
}

function bytesFromBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function directFileFromTransfer(transfer) {
  for (const file of [...(transfer?.files || [])]) {
    if (file instanceof File && file.size > 0 && String(file.type || "").startsWith("image/")) return file;
  }
  for (const item of [...(transfer?.items || [])]) {
    if (item.kind !== "file") continue;
    try {
      const file = item.getAsFile?.();
      if (file instanceof File && file.size > 0 && (String(file.type || "").startsWith("image/") || /\.(?:jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(file.name))) return file;
    } catch {}
  }
  return null;
}

function originPatterns(urls) {
  const result = [];
  for (const value of urls || []) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const pattern = `${url.protocol}//${url.host}/*`;
      if (!result.includes(pattern)) result.push(pattern);
      if (result.length >= 10) break;
    } catch {}
  }
  return result;
}

function activeSourceTab() {
  return chrome.tabs.query({ active: true, currentWindow: true })
    .then(([tab]) => tab)
    .catch(() => null);
}

async function sourcePageFile(value, title) {
  const tab = await activeSourceTab();
  if (!tab?.id) return null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "filechute-read-page-resource-v1",
      url: value,
      suggestedName: title || "yandex-image"
    });
    if (!response?.ok || !response?.base64) return null;
    const type = String(response.type || "").toLowerCase();
    if (!type.startsWith("image/")) return null;
    const name = ensureExtension(response.name || title || "yandex-image", type);
    return {
      file: new File([bytesFromBase64(response.base64)], name, { type, lastModified: Date.now() }),
      sourceUrl: /^https?:/i.test(value) ? value : null
    };
  } catch {
    return null;
  }
}

function candidateName(value, title, type) {
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(value).pathname.split("/").filter(Boolean).at(-1) || ""); } catch {}
  return ensureExtension(pathname || title || "yandex-image", type);
}

async function extensionSideFile(value, title) {
  if (/^data:image\//i.test(value)) {
    const response = await fetch(value);
    const blob = await response.blob();
    const type = blob.type || "image/png";
    return {
      file: new File([blob], ensureExtension(title || "yandex-image", type), { type, lastModified: Date.now() }),
      sourceUrl: null
    };
  }
  if (!/^https?:/i.test(value)) return null;

  const response = await fetch(value, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) throw new Error(`Not an image response (${type || "unknown content type"}).`);
  const blob = await response.blob();
  return {
    file: new File([blob], candidateName(value, title, type || blob.type), { type: type || blob.type, lastModified: Date.now() }),
    sourceUrl: value
  };
}

async function saveFile(file, sourceUrl, targetPathNames) {
  const { root, directory } = await resolveDirectory(targetPathNames);
  const name = await uniqueFileName(directory, file.name || "yandex-image");
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();

  const metadataKey = [root.name, ...targetPathNames, name].filter(Boolean).join("/");
  if (sourceUrl) {
    await mergeMetadata(metadataKey, {
      sourceUrl,
      parentPageUrl: recentYandexDrag?.pageUrl || null
    });
  }
  return name;
}

function preservePathAndReload(message) {
  try { sessionStorage.setItem("filechute-restore-path-v1", JSON.stringify(currentPathNames())); } catch {}
  setStatus(message);
  setTimeout(() => location.reload(), 140);
}

async function loadInitialCapture() {
  try {
    const stored = await chrome.storage.local.get(YANDEX_DRAG_KEY);
    recentYandexDrag = stored?.[YANDEX_DRAG_KEY] || null;
  } catch {}
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[YANDEX_DRAG_KEY]) return;
  recentYandexDrag = changes[YANDEX_DRAG_KEY].newValue || null;
});

void loadInitialCapture();

document.addEventListener("dragover", (event) => {
  if (!recentCapture() || !browserishTransfer(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}, true);

document.addEventListener("drop", (event) => {
  const capture = recentCapture();
  const transfer = event.dataTransfer;
  if (!capture || !browserishTransfer(transfer)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const targetPathNames = targetPathForEvent(event);
  const directFile = directFileFromTransfer(transfer);
  const origins = originPatterns(capture.urls);

  // Never interrupt the Yandex drag with a per-image host permission prompt.
  // Existing access may be reused; otherwise try the source-page bridge first.
  let permissionPromise = Promise.resolve(false);
  if (origins.length) {
    try { permissionPromise = chrome.permissions.contains({ origins }); } catch {}
  }

  void Promise.resolve(permissionPromise)
    .catch(() => false)
    .then(async () => {
      if (directFile) {
        const name = await saveFile(directFile, null, targetPathNames);
        return `Saved ${name} from Yandex Images.`;
      }

      const failures = [];
      for (const value of capture.urls) {
        try {
          const fromPage = await sourcePageFile(value, capture.title);
          if (fromPage?.file) {
            const name = await saveFile(fromPage.file, fromPage.sourceUrl, targetPathNames);
            return `Saved ${name} from Yandex Images.`;
          }

          const fromExtension = await extensionSideFile(value, capture.title);
          if (fromExtension?.file) {
            const name = await saveFile(fromExtension.file, fromExtension.sourceUrl, targetPathNames);
            return `Saved ${name} from Yandex Images.`;
          }
        } catch (error) {
          failures.push(`${String(value).slice(0, 100)} → ${error?.message || error}`);
        }
      }

      console.warn("FileChute exhausted captured Yandex image sources", failures);
      throw new Error("Yandex supplied an image drag shell, but none of its captured image sources could be read. Refresh the Yandex Images tab and try the visible thumbnail again.");
    })
    .then((message) => preservePathAndReload(message))
    .catch((error) => {
      console.error("FileChute Yandex image drop failed", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        error
      });
      setStatus(error?.message || "Could not save that Yandex image.", true);
    });
}, true);
