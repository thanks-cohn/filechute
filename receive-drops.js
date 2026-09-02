import { readStored } from "./storage.js";
import { mergeMetadata } from "./metadata-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-filechute-item";
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

function pathFromEntry(entry) {
  const path = String(entry?.querySelector(".entry-path")?.textContent || "").trim();
  if (!path) return null;
  return path.split("/").filter(Boolean).slice(1);
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
  if (!(await requestPermission(root))) throw new Error(`Chromium needs permission for ${root.name || "the Chute folder"}. Use Reconnect and try again.`);

  let directory = root;
  for (const name of pathNames || []) directory = await directory.getDirectoryHandle(name);
  return directory;
}

function sanitizeName(value, fallback = "dropped-file") {
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

async function uniqueDirectoryName(directory, requested) {
  const name = sanitizeName(requested, "Dropped folder");
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? name : `${name} (${attempt + 1})`;
    try {
      await directory.getDirectoryHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name === "TypeMismatchError") continue;
      throw error;
    }
  }
  return `${name}-${Date.now()}`;
}

function targetRelativeLocation(pathNames, name) {
  return [...pathNames, name].filter(Boolean).join("/");
}

async function writeFile(directory, pathNames, file, preferredName = file?.name, provenance = null) {
  const name = await uniqueFileName(directory, preferredName || "dropped-file");
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

async function copyHandle(source, destination, destinationPathNames) {
  if (source.kind === "file") {
    const file = await source.getFile();
    await writeFile(destination, destinationPathNames, file, source.name);
    return { files: 1, folders: 0 };
  }

  if (source.kind !== "directory") return { files: 0, folders: 0 };
  const name = await uniqueDirectoryName(destination, source.name);
  const childDestination = await destination.getDirectoryHandle(name, { create: true });
  let files = 0;
  let folders = 1;
  for await (const [, child] of source.entries()) {
    const copied = await copyHandle(child, childDestination, [...destinationPathNames, name]);
    files += copied.files;
    folders += copied.folders;
  }
  return { files, folders };
}

function htmlImageUrl(html) {
  if (!html) return null;
  try {
    const document = new DOMParser().parseFromString(html, "text/html");
    return document.querySelector("img[src]")?.src || null;
  } catch {
    return null;
  }
}

function firstUri(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) || null;
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function hostPattern(url) {
  return `${url.protocol}//${url.host}/*`;
}

async function fetchBrowserResource(url) {
  try {
    return await fetch(url.href, { cache: "no-store", credentials: "omit" });
  } catch (firstError) {
    const origin = hostPattern(url);
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [origin] });
    } catch {}
    if (!granted) throw firstError;
    return fetch(url.href, { cache: "no-store", credentials: "omit" });
  }
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "text/plain": ".txt"
};

function filenameFromDisposition(value) {
  const text = String(value || "");
  const utf8 = text.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.replace(/^"|"$/g, "")); } catch {}
  }
  return text.match(/filename="?([^";]+)"?/i)?.[1] || null;
}

function filenameForResponse(url, response, type) {
  const disposition = filenameFromDisposition(response.headers.get("content-disposition"));
  if (disposition) return sanitizeName(disposition);
  let pathname = "";
  try { pathname = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || ""); } catch {}
  let name = sanitizeName(pathname, "browser-drop");
  if (!/\.[a-z0-9]{1,8}$/i.test(name) && EXT_BY_MIME[type]) name += EXT_BY_MIME[type];
  return name;
}

async function saveBrowserUrl(url, directory, pathNames) {
  setStatus(`Receiving ${url.hostname}…`);
  const response = await fetchBrowserResource(url);
  if (!response.ok) throw new Error(`The browser resource returned HTTP ${response.status}.`);
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

  if (type === "text/html") {
    const host = sanitizeName(url.hostname || "website");
    const name = `${host}.url`;
    const shortcut = new File([`[InternetShortcut]\nURL=${url.href}\n`], name, { type: "text/plain" });
    await writeFile(directory, pathNames, shortcut, name, { sourceUrl: url.href, parentPageUrl: pageContextUrl() });
    return name;
  }

  const blob = await response.blob();
  const name = filenameForResponse(url, response, type || blob.type);
  const file = new File([blob], name, { type: type || blob.type || "application/octet-stream", lastModified: Date.now() });
  await writeFile(directory, pathNames, file, name, { sourceUrl: url.href, parentPageUrl: pageContextUrl() });
  return name;
}

function pageContextUrl() {
  const referrer = httpUrl(document.referrer);
  return referrer?.href || null;
}

function hasNativeIncomingData(transfer) {
  if (!transfer) return false;
  if ([...transfer.items || []].some((item) => item.kind === "file")) return true;
  if (htmlImageUrl(transfer.getData("text/html"))) return true;
  if (firstUri(transfer.getData("text/uri-list"))) return true;
  return Boolean(httpUrl(String(transfer.getData("text/plain") || "").trim()));
}

async function receiveNativeDrop(transfer, targetPathNames) {
  const destination = await resolveDirectory(targetPathNames);

  const handles = [];
  for (const item of [...transfer.items || []]) {
    if (item.kind !== "file" || typeof item.getAsFileSystemHandle !== "function") continue;
    try {
      const handle = await item.getAsFileSystemHandle();
      if (handle) handles.push(handle);
    } catch {}
  }

  if (handles.length) {
    let files = 0;
    let folders = 0;
    for (const handle of handles) {
      const copied = await copyHandle(handle, destination, targetPathNames);
      files += copied.files;
      folders += copied.folders;
    }
    return { message: `Copied ${files} file${files === 1 ? "" : "s"}${folders ? ` and ${folders} folder${folders === 1 ? "" : "s"}` : ""} into Chute.` };
  }

  const files = [...transfer.files || []];
  if (files.length) {
    let copied = 0;
    for (const file of files) {
      await writeFile(destination, targetPathNames, file, file.name);
      copied += 1;
    }
    return { message: `Copied ${copied} file${copied === 1 ? "" : "s"} into Chute.` };
  }

  const browserUrl = httpUrl(
    htmlImageUrl(transfer.getData("text/html")) ||
    firstUri(transfer.getData("text/uri-list")) ||
    String(transfer.getData("text/plain") || "").trim()
  );
  if (browserUrl) {
    const name = await saveBrowserUrl(browserUrl, destination, targetPathNames);
    return { message: `Saved ${name} into Chute.` };
  }

  throw new Error("That drag did not contain a file, folder, or browser resource Chute can save.");
}

function targetPathForEvent(event) {
  const folderRow = event.target instanceof Element ? event.target.closest(".entry.directory") : null;
  return pathFromEntry(folderRow) || currentPathNames();
}

function preserveCurrentPathAndReload(message) {
  try { sessionStorage.setItem(RESTORE_PATH_KEY, JSON.stringify(currentPathNames())); } catch {}
  setStatus(message);
  setTimeout(() => location.reload(), 140);
}

async function waitForDirectoryRow(name, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const rows = [...document.querySelectorAll(".entry.directory .entry-name")];
    const match = rows.find((row) => row.textContent === name);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

async function restorePathAfterReload() {
  let path = [];
  try {
    path = JSON.parse(sessionStorage.getItem(RESTORE_PATH_KEY) || "[]");
    sessionStorage.removeItem(RESTORE_PATH_KEY);
  } catch {}
  if (!Array.isArray(path) || !path.length) return;

  for (const name of path) {
    const row = await waitForDirectoryRow(name);
    if (!row) break;
    row.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

document.addEventListener("dragover", (event) => {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  if (transfer.types?.includes(FILECHUTE_DRAG_TYPE) || transfer.types?.includes(CHUTE_DRAG_TYPE)) return;
  if (!hasNativeIncomingData(transfer)) return;
  event.preventDefault();
  if (transfer) transfer.dropEffect = "copy";
  document.body.classList.add("filechute-drop-active");
}, true);

document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  document.body.classList.remove("filechute-drop-active");
}, true);

document.addEventListener("drop", (event) => {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  if (transfer.types?.includes(FILECHUTE_DRAG_TYPE) || transfer.types?.includes(CHUTE_DRAG_TYPE)) return;
  if (!hasNativeIncomingData(transfer)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  document.body.classList.remove("filechute-drop-active");
  const targetPathNames = targetPathForEvent(event);

  void receiveNativeDrop(transfer, targetPathNames)
    .then(({ message }) => preserveCurrentPathAndReload(message))
    .catch((error) => {
      console.error("Chute incoming drop failed", error);
      setStatus(error?.message || "Could not copy that drop into Chute.", true);
    });
}, true);

void restorePathAfterReload();
