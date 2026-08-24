import { readStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
const CHUTE_ORIGIN = "http://127.0.0.1:17891/*";
const CHUTE_BASE = "http://127.0.0.1:17891";
const RESTORE_PATH_KEY = "filechute-restore-path-v1";

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

function pathFromFolderRow(row) {
  const path = String(row?.querySelector(".entry-path")?.textContent || "").trim();
  if (!path) return null;
  return path.split("/").filter(Boolean).slice(1);
}

function targetPathForEvent(event) {
  const row = event.target instanceof Element ? event.target.closest(".entry.directory") : null;
  return pathFromFolderRow(row) || currentPathNames();
}

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

async function resolveDestination(pathNames) {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") throw new Error("Choose a FileChute folder first.");
  if (!(await queryPermission(root))) {
    throw new Error(`Reconnect ${root.name || "the FileChute folder"}, then drop from Chute again.`);
  }
  let directory = root;
  for (const name of pathNames) directory = await directory.getDirectoryHandle(name);
  return directory;
}

function decodeChuteToken(value) {
  const text = String(value || "");
  if (!text.startsWith(CHUTE_DRAG_PREFIX)) return null;
  try {
    const item = JSON.parse(decodeURIComponent(text.slice(CHUTE_DRAG_PREFIX.length)));
    if (!item?.id || !item?.name) return null;
    return {
      id: String(item.id),
      name: String(item.name),
      mime: String(item.mime || "application/octet-stream")
    };
  } catch {
    return null;
  }
}

function chuteIdFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.origin !== CHUTE_BASE) return null;
    const match = url.pathname.match(/^\/api\/files\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function firstUri(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) || "";
}

function itemFromDownloadUrl(value) {
  const text = String(value || "");
  const match = text.match(/^([^:]+):([^:]+):(https?:\/\/.+)$/);
  if (!match) return null;
  const id = chuteIdFromUrl(match[3]);
  if (!id) return null;
  return { id, name: match[2] || `chute-${id}`, mime: match[1] || "application/octet-stream" };
}

function htmlImageUrl(value) {
  if (!value) return "";
  try {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return doc.querySelector("img[src]")?.src || "";
  } catch {
    return "";
  }
}

function extractChuteItem(transfer) {
  if (!transfer) return null;

  let privateValue = "";
  let plain = "";
  let uri = "";
  let download = "";
  let html = "";
  try { privateValue = transfer.getData(CHUTE_DRAG_TYPE); } catch {}
  try { plain = transfer.getData("text/plain"); } catch {}
  try { uri = firstUri(transfer.getData("text/uri-list")); } catch {}
  try { download = transfer.getData("DownloadURL"); } catch {}
  try { html = transfer.getData("text/html"); } catch {}

  const tokenItem = decodeChuteToken(privateValue) || decodeChuteToken(plain);
  if (tokenItem) return tokenItem;

  const downloadItem = itemFromDownloadUrl(download);
  if (downloadItem) return downloadItem;

  const url = uri || htmlImageUrl(html) || plain;
  const id = chuteIdFromUrl(url);
  if (!id) return null;

  let name = `chute-${id}`;
  let mime = "application/octet-stream";
  const fromDownload = itemFromDownloadUrl(download);
  if (fromDownload) {
    name = fromDownload.name;
    mime = fromDownload.mime;
  }
  return { id, name, mime };
}

function hasChuteEvidence(transfer) {
  if (!transfer) return false;
  const types = [...(transfer.types || [])];
  if (types.includes(CHUTE_DRAG_TYPE)) return true;
  try {
    if (decodeChuteToken(transfer.getData("text/plain"))) return true;
    if (chuteIdFromUrl(firstUri(transfer.getData("text/uri-list")))) return true;
    if (chuteIdFromUrl(htmlImageUrl(transfer.getData("text/html")))) return true;
    if (itemFromDownloadUrl(transfer.getData("DownloadURL"))) return true;
  } catch {}
  return false;
}

async function ensureChutePermission() {
  if (await chrome.permissions.contains({ origins: [CHUTE_ORIGIN] })) return true;
  try {
    return await chrome.permissions.request({ origins: [CHUTE_ORIGIN] });
  } catch {
    return false;
  }
}

function safeName(value, fallback) {
  const result = String(value || "").replace(/[\\/\r\n\0]+/g, "_").trim();
  return result || fallback;
}

async function uniqueName(directory, requested) {
  const name = safeName(requested, "chute-file");
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

function filenameFromDisposition(value) {
  const text = String(value || "");
  const utf8 = text.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.replace(/^"|"$/g, "")); } catch {}
  }
  return text.match(/filename="?([^";]+)"?/i)?.[1] || null;
}

async function receiveChuteItem(item, targetPathNames) {
  const destination = await resolveDestination(targetPathNames);
  if (!(await ensureChutePermission())) {
    throw new Error("Allow FileChute to read Chute's local file bridge, then drop again.");
  }

  const response = await fetch(`${CHUTE_BASE}/api/files/${encodeURIComponent(item.id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Chute returned HTTP ${response.status}.`);
  const blob = await response.blob();
  const headerName = filenameFromDisposition(response.headers.get("content-disposition"));
  const requestedName = headerName || item.name || `chute-${item.id}`;
  const name = await uniqueName(destination, requestedName);
  const fileHandle = await destination.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return name;
}

function preservePathAndReload(message) {
  try { sessionStorage.setItem(RESTORE_PATH_KEY, JSON.stringify(currentPathNames())); } catch {}
  setStatus(message);
  setTimeout(() => location.reload(), 120);
}

document.addEventListener("dragover", (event) => {
  if (!hasChuteEvidence(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  document.body.classList.add("filechute-drop-active");
}, true);

document.addEventListener("drop", (event) => {
  const item = extractChuteItem(event.dataTransfer);
  if (!item) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  document.body.classList.remove("filechute-drop-active");
  const targetPathNames = targetPathForEvent(event);

  void receiveChuteItem(item, targetPathNames)
    .then((name) => preservePathAndReload(`Copied ${name} from Chute.`))
    .catch((error) => {
      console.error("Chute → FileChute drop failed", error);
      setStatus(error?.message || "Could not copy that Chute item into FileChute.", true);
    });
}, true);
