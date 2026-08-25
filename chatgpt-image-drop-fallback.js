import { readStored } from "./storage.js";
import { mergeMetadata } from "./metadata-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const CHATGPT_DRAG_KEY = "filechute-chatgpt-drag-source-v1";
const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const FRAMECHUTE_DRAG_TYPE = "application/x-framechute-item+json";
const MAX_AGE_MS = 12000;
const MAX_PAGE_RESOURCE_BYTES = 48 * 1024 * 1024;

const statusElement = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");
let recentChatGptDrag = null;

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

function recentCapture() {
  if (!recentChatGptDrag || !Array.isArray(recentChatGptDrag.urls)) return null;
  if (Date.now() - Number(recentChatGptDrag.capturedAt || 0) > MAX_AGE_MS) return null;
  try {
    const host = new URL(recentChatGptDrag.pageUrl).hostname;
    if (host !== "chatgpt.com" && host !== "chat.openai.com") return null;
  } catch {
    return null;
  }
  return recentChatGptDrag;
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
  if (!(await requestPermission(root))) throw new Error(`Chromium needs permission for ${root.name || "the FileChute folder"}. Reconnect it and try again.`);
  let directory = root;
  for (const name of pathNames || []) directory = await directory.getDirectoryHandle(name);
  return { root, directory };
}

function sanitizeName(value, fallback = "chatgpt-image") {
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
  let result = sanitizeName(name, "chatgpt-image");
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
      if (result.length >= 8) break;
    } catch {}
  }
  return result;
}

async function activeSourceTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  return tab?.id ? tab : null;
}

async function pageBridgeFile(value, title) {
  const tab = await activeSourceTab();
  if (!tab?.id) throw new Error("FileChute could not identify the ChatGPT tab that created this image.");
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "filechute-read-page-resource-v1",
    url: value,
    suggestedName: title || "chatgpt-image"
  });
  if (!response?.ok || !response?.base64) throw new Error(response?.error || "ChatGPT did not return the image bytes.");
  if (Number(response.size || 0) > MAX_PAGE_RESOURCE_BYTES) throw new Error("This ChatGPT image is too large for the browser bridge.");
  const type = response.type || "application/octet-stream";
  const name = ensureExtension(response.name || title || "chatgpt-image", type);
  return { file: new File([bytesFromBase64(response.base64)], name, { type, lastModified: Date.now() }), sourceUrl: /^https?:/i.test(value) ? value : null };
}

async function extensionFetchFile(value, title) {
  if (/^data:image\//i.test(value)) {
    const response = await fetch(value);
    const blob = await response.blob();
    const type = blob.type || "image/png";
    return { file: new File([blob], ensureExtension(title || "chatgpt-image", type), { type, lastModified: Date.now() }), sourceUrl: null };
  }
  if (!/^https?:/i.test(value)) throw new Error("That ChatGPT image uses a page-owned temporary URL.");
  const response = await fetch(value, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) throw new Error(`Not an image response (${type || "unknown content type"}).`);
  const blob = await response.blob();
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(value).pathname.split("/").filter(Boolean).at(-1) || ""); } catch {}
  const name = ensureExtension(pathname || title || "chatgpt-image", type || blob.type);
  return { file: new File([blob], name, { type: type || blob.type, lastModified: Date.now() }), sourceUrl: value };
}

async function fileFromCandidate(value, title) {
  try {
    return await pageBridgeFile(value, title);
  } catch (pageError) {
    try {
      return await extensionFetchFile(value, title);
    } catch (fetchError) {
      throw new Error(`${pageError?.message || pageError}; fallback: ${fetchError?.message || fetchError}`);
    }
  }
}

async function saveFile(file, sourceUrl, targetPathNames, pageUrl) {
  const { root, directory } = await resolveDirectory(targetPathNames);
  const name = await uniqueFileName(directory, file.name || "chatgpt-image");
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();

  const metadataKey = [root.name, ...targetPathNames, name].filter(Boolean).join("/");
  if (sourceUrl || pageUrl) await mergeMetadata(metadataKey, { sourceUrl: sourceUrl || null, parentPageUrl: pageUrl || null });
  return name;
}

function preservePathAndReload(message) {
  try { sessionStorage.setItem("filechute-restore-path-v1", JSON.stringify(currentPathNames())); } catch {}
  setStatus(message);
  setTimeout(() => location.reload(), 140);
}

async function loadInitialCapture() {
  try {
    const stored = await chrome.storage.local.get(CHATGPT_DRAG_KEY);
    recentChatGptDrag = stored?.[CHATGPT_DRAG_KEY] || null;
  } catch {}
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[CHATGPT_DRAG_KEY]) return;
  recentChatGptDrag = changes[CHATGPT_DRAG_KEY].newValue || null;
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

  let permissionPromise = Promise.resolve(false);
  if (origins.length) {
    try { permissionPromise = chrome.permissions.request({ origins }); } catch {}
  }

  void Promise.resolve(permissionPromise)
    .catch(() => false)
    .then(async () => {
      if (directFile) {
        const name = await saveFile(directFile, null, targetPathNames, capture.pageUrl);
        return `Saved ${name} from ChatGPT.`;
      }

      const failures = [];
      for (const value of capture.urls) {
        try {
          const { file, sourceUrl } = await fileFromCandidate(value, capture.title);
          const name = await saveFile(file, sourceUrl, targetPathNames, capture.pageUrl);
          return `Saved ${name} from ChatGPT.`;
        } catch (error) {
          failures.push(`${String(value).slice(0, 90)} → ${error?.message || error}`);
        }
      }

      console.warn("FileChute exhausted captured ChatGPT image sources", failures);
      throw new Error("ChatGPT supplied an image drag, but FileChute could not read any captured image source. Refresh this ChatGPT tab after reloading FileChute and try again.");
    })
    .then((message) => preservePathAndReload(message))
    .catch((error) => {
      console.error("FileChute ChatGPT image drop failed", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        error
      });
      setStatus(error?.message || "Could not save that ChatGPT image.", true);
    });
}, true);
