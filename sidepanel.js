import { readStored, writeStored } from "./storage.js";
import { makeFileChutePayload, writeFileChuteDrag } from "./interop.js";
import {
  chooseExternalMetadataDirectory,
  externalMetadataStatus,
  mergeMetadata,
  metadataFor
} from "./metadata-store.js";
import {
  chooseExternalThumbnailDirectory,
  externalThumbnailStatus,
  loadThumbnail,
  makeThumbnailKey,
  saveThumbnail
} from "./thumbnail-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const THUMBNAILS_KEY = "filechute-show-thumbnails";
const VIDEO_THUMBNAILS_KEY = "filechute-video-thumbnails";
const METADATA_CHOICE_KEY = "filechute-metadata-storage-choice";
const THUMBNAIL_CHOICE_KEY = "filechute-thumbnail-storage-choice";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
const CHUTE_ORIGIN = "http://127.0.0.1:17891/*";
const THUMB_SIZE = 48;

const chooseRootButton = document.querySelector("#choose-root");
const backButton = document.querySelector("#back");
const homeButton = document.querySelector("#home");
const breadcrumbs = document.querySelector("#breadcrumbs");
const showThumbnailsInput = document.querySelector("#show-thumbnails");
const videoThumbnailsInput = document.querySelector("#video-thumbnails");
const metadataLocationButton = document.querySelector("#metadata-location");
const thumbnailLocationButton = document.querySelector("#thumbnail-location");
const statusElement = document.querySelector("#status");
const entriesElement = document.querySelector("#entries");
const entryTemplate = document.querySelector("#entry-template");
const metadataDialog = document.querySelector("#metadata-dialog");
const metadataBrowserOnly = document.querySelector("#metadata-browser-only");
const metadataChoose = document.querySelector("#metadata-choose");
const thumbnailDialog = document.querySelector("#thumbnail-dialog");
const thumbnailBrowserOnly = document.querySelector("#thumbnail-browser-only");
const thumbnailChoose = document.querySelector("#thumbnail-choose");

let rootHandle = null;
let pathHandles = [];
let pathNames = [];
let showThumbnails = true;
let videoThumbnails = true;
let renderGeneration = 0;
const previewUrls = new Set();

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function currentDirectory() {
  return pathHandles.at(-1) || rootHandle;
}

function currentLocation() {
  if (!rootHandle) return "";
  return [rootHandle.name, ...pathNames].join("/");
}

function childLocation(name) {
  return [currentLocation(), name].filter(Boolean).join("/");
}

function targetLocation(targetNames, name) {
  if (!rootHandle) return name;
  return [rootHandle.name, ...targetNames, name].join("/");
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

function revokePreviewUrls() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls.clear();
}

function extensionOf(name) {
  return String(name || "").toLowerCase().split(".").pop() || "";
}

function fallbackIcon(handle, file = null) {
  if (handle.kind === "directory") return "📁";
  const mime = String(file?.type || "").toLowerCase();
  const ext = extensionOf(handle.name);
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎞️";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime === "application/pdf" || ext === "pdf") return "📕";
  if (mime.startsWith("text/") || ["txt", "md", "json", "csv", "log"].includes(ext)) return "📝";
  if (["zip", "7z", "rar", "tar", "gz"].includes(ext)) return "📦";
  return "📄";
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not encode thumbnail")),
      "image/webp",
      0.72
    );
  });
}

function drawCover(context, source, sourceWidth, sourceHeight) {
  const scale = Math.max(THUMB_SIZE / sourceWidth, THUMB_SIZE / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (THUMB_SIZE - width) / 2;
  const y = (THUMB_SIZE - height) / 2;
  context.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  context.drawImage(source, x, y, width, height);
}

async function imageThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    drawCover(context, bitmap, bitmap.width, bitmap.height);
    return await canvasBlob(canvas);
  } finally {
    bitmap.close();
  }
}

async function videoThumbnail(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Video thumbnail timed out")), 6000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const fail = () => {
        clearTimeout(timer);
        reject(new Error("Chromium could not decode this video preview"));
      };
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.load();
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("Video has no decodable frame");

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext("2d", { alpha: false });
    drawCover(context, video, width, height);
    return await canvasBlob(canvas);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function thumbnailFor(file, relativePath) {
  const key = makeThumbnailKey({
    relativePath,
    size: file.size,
    lastModified: file.lastModified,
    mime: file.type
  });

  const stored = await loadThumbnail(key);
  if (stored) return stored;

  let generated = null;
  if (file.type.startsWith("image/")) {
    generated = await imageThumbnail(file);
  } else if (videoThumbnails && file.type.startsWith("video/")) {
    generated = await videoThumbnail(file);
  }

  if (generated) await saveThumbnail(key, generated);
  return generated;
}

function showPreview(img, fallback, blob) {
  const url = URL.createObjectURL(blob);
  previewUrls.add(url);
  img.src = url;
  img.hidden = false;
  fallback.hidden = true;
}

function waitForDialogClose(dialog) {
  return new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
}

async function refreshStorageLabels() {
  const metadata = await externalMetadataStatus();
  const thumbs = await externalThumbnailStatus();
  metadataLocationButton.textContent = metadata.configured
    ? `Metadata: ${metadata.name}${metadata.available ? "" : " · reconnect"}`
    : "Metadata: browser only";
  thumbnailLocationButton.textContent = thumbs.configured
    ? `Thumbs: ${thumbs.name}${thumbs.available ? "" : " · reconnect"}`
    : "Thumbs: browser only";
}

async function ensureDurabilityPrompts() {
  if (!(await readStored(METADATA_CHOICE_KEY))) {
    metadataDialog.showModal();
    await waitForDialogClose(metadataDialog);
  }
  if (!(await readStored(THUMBNAIL_CHOICE_KEY))) {
    thumbnailDialog.showModal();
    await waitForDialogClose(thumbnailDialog);
  }
  await refreshStorageLabels();
}

async function navigateInto(name, handle) {
  if (handle.kind !== "directory") return;
  pathHandles.push(handle);
  pathNames.push(name);
  await renderDirectory();
}

function breadcrumbsText() {
  return rootHandle ? [rootHandle.name, ...pathNames].join(" / ") : "No folder selected";
}

async function renderEntry(name, handle, generation) {
  if (generation !== renderGeneration) return;
  const row = entryTemplate.content.firstElementChild.cloneNode(true);
  const preview = row.querySelector(".preview");
  const fallback = row.querySelector(".fallback-icon");
  const nameElement = row.querySelector(".entry-name");
  const pathButton = row.querySelector(".entry-path");
  const relativePath = childLocation(name);

  nameElement.textContent = name;
  pathButton.textContent = relativePath;
  pathButton.title = `Copy ${relativePath}`;

  let file = null;
  let metadata = null;
  if (handle.kind === "directory") {
    row.classList.add("directory");
    fallback.textContent = "📁";
    nameElement.title = "Open folder";
    nameElement.addEventListener("click", () => navigateInto(name, handle));
  } else {
    try {
      file = await handle.getFile();
      metadata = await metadataFor(relativePath);
    } catch (error) {
      console.warn("Could not read file", relativePath, error);
    }
    fallback.textContent = fallbackIcon(handle, file);
  }

  pathButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(relativePath);
      setStatus(`Copied ${relativePath}`);
    } catch {
      setStatus(relativePath);
    }
  });

  row.addEventListener("dragstart", (event) => {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    row.classList.add("dragging");

    const payload = makeFileChutePayload({
      kind: handle.kind === "directory" ? "directory" : "file",
      name,
      mime: file?.type || "",
      relativePath,
      sourceUrl: metadata?.sourceUrl || null,
      parentPageUrl: metadata?.parentPageUrl || null,
      size: file?.size ?? null,
      lastModified: file?.lastModified ?? null
    });

    writeFileChuteDrag(transfer, payload, file);
    if (!preview.hidden) {
      try { transfer.setDragImage(preview, THUMB_SIZE / 2, THUMB_SIZE / 2); } catch {}
    }
  });

  row.addEventListener("dragend", () => row.classList.remove("dragging"));

  if (handle.kind === "directory") {
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.classList.add("drop-target");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.classList.remove("drop-target");
      await receiveDrop(event.dataTransfer, handle, [...pathNames, name]);
    });
  }

  entriesElement.append(row);

  if (!file || !showThumbnails) return;
  if (!file.type.startsWith("image/") && !(videoThumbnails && file.type.startsWith("video/"))) return;

  try {
    const blob = await thumbnailFor(file, relativePath);
    if (generation !== renderGeneration || !blob) return;
    showPreview(preview, fallback, blob);
  } catch (error) {
    console.warn("Thumbnail unavailable for", relativePath, error);
  }
}

async function renderDirectory() {
  const directory = currentDirectory();
  const generation = ++renderGeneration;
  revokePreviewUrls();
  entriesElement.replaceChildren();
  breadcrumbs.textContent = breadcrumbsText();
  backButton.disabled = pathHandles.length === 0;
  homeButton.disabled = pathHandles.length === 0;

  if (!directory) {
    entriesElement.innerHTML = '<div class="empty">Choose a folder and FileChute will explore it here.</div>';
    setStatus("Choose a local folder to begin.");
    return;
  }

  if (!(await queryPermission(directory))) {
    entriesElement.innerHTML = '<div class="empty">FileChute remembers this folder, but Chromium needs permission again. Use Choose folder to reconnect it.</div>';
    setStatus("Folder permission needs to be restored.", true);
    return;
  }

  setStatus(`Reading ${currentLocation()}…`);
  try {
    const items = [];
    for await (const [name, handle] of directory.entries()) items.push({ name, handle });
    items.sort((a, b) => {
      if (a.handle.kind !== b.handle.kind) return a.handle.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    if (!items.length) {
      entriesElement.innerHTML = '<div class="empty">This folder is empty.</div>';
      setStatus(`${currentLocation()} · empty`);
      return;
    }

    for (const item of items) await renderEntry(item.name, item.handle, generation);
    if (generation === renderGeneration) setStatus(`${items.length} item${items.length === 1 ? "" : "s"} · ${currentLocation()}`);
  } catch (error) {
    console.error(error);
    setStatus("Could not read this folder.", true);
  }
}

async function chooseRoot() {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await requestPermission(handle))) return;
    rootHandle = handle;
    pathHandles = [];
    pathNames = [];
    await writeStored(ROOT_HANDLE_KEY, handle);
    await renderDirectory();
    await ensureDurabilityPrompts();
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      setStatus("Could not choose that folder.", true);
    }
  }
}

async function destinationName(directory, requested) {
  const name = String(requested || "dropped-file").replace(/[\\/\r\n]+/g, "_") || "dropped-file";
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

async function writeDroppedFile(directory, targetNames, file, preferredName = file.name, provenance = null) {
  const name = await destinationName(directory, preferredName);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();

  const relativePath = targetLocation(targetNames, name);
  if (provenance?.sourceUrl || provenance?.parentPageUrl) {
    await mergeMetadata(relativePath, {
      sourceUrl: provenance.sourceUrl || null,
      parentPageUrl: provenance.parentPageUrl || null
    });
  }
  return { name, relativePath };
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
      mime: String(item.mime || "application/octet-stream"),
      sourceUrl: item.sourceUrl || null,
      parentPageUrl: item.parentPageUrl || null
    };
  } catch {
    return null;
  }
}

async function ensureChuteBridgePermission() {
  if (await chrome.permissions.contains({ origins: [CHUTE_ORIGIN] })) return true;
  try {
    return await chrome.permissions.request({ origins: [CHUTE_ORIGIN] });
  } catch {
    return false;
  }
}

async function receiveChuteItem(item, directory, targetNames) {
  if (!(await ensureChuteBridgePermission())) {
    setStatus("FileChute needs localhost permission to receive this Chute item.", true);
    return false;
  }

  const response = await fetch(`http://127.0.0.1:17891/api/files/${encodeURIComponent(item.id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Chute returned ${response.status}`);
  const blob = await response.blob();
  const file = new File([blob], item.name, { type: item.mime || blob.type, lastModified: Date.now() });
  const written = await writeDroppedFile(directory, targetNames, file, item.name, item);
  setStatus(`Copied ${written.name} from Chute.`);
  return true;
}

async function receiveDrop(transfer, directory = currentDirectory(), targetNames = pathNames) {
  if (!transfer || !directory) return;
  if (!(await queryPermission(directory))) {
    setStatus("Folder permission is not available.", true);
    return;
  }

  try {
    const files = [...transfer.files];
    if (files.length) {
      let copied = 0;
      for (const file of files) {
        await writeDroppedFile(directory, targetNames, file);
        copied += 1;
      }
      setStatus(`Copied ${copied} file${copied === 1 ? "" : "s"} into ${targetLocation(targetNames, "").replace(/\/$/, "")}.`);
      await renderDirectory();
      return;
    }

    const chuteItem = decodeChuteToken(transfer.getData(CHUTE_DRAG_TYPE));
    if (chuteItem) {
      if (await receiveChuteItem(chuteItem, directory, targetNames)) await renderDirectory();
      return;
    }

    setStatus("That drag does not contain transferable file bytes yet.", true);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not receive that drop.", true);
  }
}

metadataBrowserOnly.addEventListener("click", async (event) => {
  event.preventDefault();
  await writeStored(METADATA_CHOICE_KEY, "browser");
  metadataDialog.close("browser");
  await refreshStorageLabels();
});

metadataChoose.addEventListener("click", async () => {
  try {
    const handle = await chooseExternalMetadataDirectory();
    if (!handle) return;
    await writeStored(METADATA_CHOICE_KEY, "external");
    metadataDialog.close("external");
    await refreshStorageLabels();
  } catch (error) {
    if (error?.name !== "AbortError") setStatus("Could not choose metadata folder.", true);
  }
});

thumbnailBrowserOnly.addEventListener("click", async (event) => {
  event.preventDefault();
  await writeStored(THUMBNAIL_CHOICE_KEY, "browser");
  thumbnailDialog.close("browser");
  await refreshStorageLabels();
});

thumbnailChoose.addEventListener("click", async () => {
  try {
    const handle = await chooseExternalThumbnailDirectory();
    if (!handle) return;
    await writeStored(THUMBNAIL_CHOICE_KEY, "external");
    thumbnailDialog.close("external");
    await refreshStorageLabels();
    await renderDirectory();
  } catch (error) {
    if (error?.name !== "AbortError") setStatus("Could not choose thumbnail folder.", true);
  }
});

metadataLocationButton.addEventListener("click", async () => {
  try {
    const handle = await chooseExternalMetadataDirectory();
    if (!handle) return;
    await writeStored(METADATA_CHOICE_KEY, "external");
    await refreshStorageLabels();
    setStatus(`Metadata will also be saved in ${handle.name}.`);
  } catch (error) {
    if (error?.name !== "AbortError") setStatus("Could not choose metadata folder.", true);
  }
});

thumbnailLocationButton.addEventListener("click", async () => {
  try {
    const handle = await chooseExternalThumbnailDirectory();
    if (!handle) return;
    await writeStored(THUMBNAIL_CHOICE_KEY, "external");
    await refreshStorageLabels();
    setStatus(`Generated thumbnails will also be saved in ${handle.name}.`);
    await renderDirectory();
  } catch (error) {
    if (error?.name !== "AbortError") setStatus("Could not choose thumbnail folder.", true);
  }
});

chooseRootButton.addEventListener("click", chooseRoot);
backButton.addEventListener("click", async () => {
  if (!pathHandles.length) return;
  pathHandles.pop();
  pathNames.pop();
  await renderDirectory();
});
homeButton.addEventListener("click", async () => {
  pathHandles = [];
  pathNames = [];
  await renderDirectory();
});

showThumbnailsInput.addEventListener("change", async () => {
  showThumbnails = showThumbnailsInput.checked;
  await writeStored(THUMBNAILS_KEY, showThumbnails);
  await renderDirectory();
});

videoThumbnailsInput.addEventListener("change", async () => {
  videoThumbnails = videoThumbnailsInput.checked;
  await writeStored(VIDEO_THUMBNAILS_KEY, videoThumbnails);
  await renderDirectory();
});

document.addEventListener("dragover", (event) => {
  if (!currentDirectory()) return;
  event.preventDefault();
  document.body.classList.add("filechute-drop-active");
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  document.body.classList.remove("filechute-drop-active");
});

document.addEventListener("drop", async (event) => {
  event.preventDefault();
  document.body.classList.remove("filechute-drop-active");
  await receiveDrop(event.dataTransfer);
});

async function initialize() {
  showThumbnails = (await readStored(THUMBNAILS_KEY)) !== false;
  videoThumbnails = (await readStored(VIDEO_THUMBNAILS_KEY)) !== false;
  showThumbnailsInput.checked = showThumbnails;
  videoThumbnailsInput.checked = videoThumbnails;
  rootHandle = await readStored(ROOT_HANDLE_KEY);
  await refreshStorageLabels();
  await renderDirectory();

  if (rootHandle && (await queryPermission(rootHandle))) {
    await ensureDurabilityPrompts();
  }
}

initialize().catch((error) => {
  console.error(error);
  setStatus("FileChute could not initialize.", true);
});
