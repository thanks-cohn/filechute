import { readStored, writeStored } from "./storage.js";
import { makeFileChutePayload, writeFileChuteDrag } from "./interop.js";
import {
  chooseExternalMetadataDirectory,
  externalMetadataStatus,
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
const THUMBNAIL_SIZE_KEY = "filechute-thumbnail-size";
const THUMBNAIL_DRAG_KEY = "filechute-thumbnail-drag-mode";
const LIST_MODE_KEY = "filechute-directory-list-mode";
const METADATA_CHOICE_KEY = "filechute-metadata-storage-choice";
const THUMBNAIL_CHOICE_KEY = "filechute-thumbnail-storage-choice";
const RECENT_KEY = "filechute-recent-drops-v1";
const DEFAULT_THUMBNAIL_SIZE = 48;
const MIN_THUMBNAIL_SIZE = 24;
const MAX_THUMBNAIL_SIZE = 160;
const PAGE_SIZE = 50;

const settingsButton = document.querySelector("#open-settings");
const backButton = document.querySelector("#back");
const homeButton = document.querySelector("#home");
const breadcrumbs = document.querySelector("#breadcrumbs");
const pageControls = document.querySelector("#page-controls");
const pagePrevButton = document.querySelector("#page-prev");
const pageNextButton = document.querySelector("#page-next");
const pageLabel = document.querySelector("#page-label");
const listModeInput = document.querySelector("#directory-list-mode");
const showThumbnailsInput = document.querySelector("#show-thumbnails");
const videoThumbnailsInput = document.querySelector("#video-thumbnails");
const thumbnailSizeInput = document.querySelector("#thumbnail-size");
const thumbnailSizeValue = document.querySelector("#thumbnail-size-value");
const thumbnailDragModeInput = document.querySelector("#thumbnail-drag-mode");
const metadataLocationButton = document.querySelector("#metadata-location");
const thumbnailLocationButton = document.querySelector("#thumbnail-location");
const statusElement = document.querySelector("#status");
const entriesElement = document.querySelector("#entries");
const entryTemplate = document.querySelector("#entry-template");
const settingsDialog = document.querySelector("#settings-dialog");
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
let thumbnailSize = DEFAULT_THUMBNAIL_SIZE;
let thumbnailDragMode = "original";
let listMode = "paged";
let pageIndex = 0;
let renderGeneration = 0;
const previewUrls = new Set();

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function clampThumbnailSize(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_THUMBNAIL_SIZE;
  return Math.min(MAX_THUMBNAIL_SIZE, Math.max(MIN_THUMBNAIL_SIZE, number));
}

function applyThumbnailSize() {
  document.documentElement.style.setProperty("--thumbnail-size", `${thumbnailSize}px`);
  if (thumbnailSizeInput) thumbnailSizeInput.value = String(thumbnailSize);
  if (thumbnailSizeValue) thumbnailSizeValue.textContent = `${thumbnailSize}px`;
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

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

function revokePreviewUrls() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls.clear();
}

function extensionOf(name) {
  const value = String(name || "").toLowerCase();
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index + 1);
}

function fallbackIcon(handle, file = null) {
  if (handle.kind === "directory") return "📁";
  const mime = String(file?.type || "").toLowerCase();
  const ext = extensionOf(handle.name);
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"].includes(ext)) return "🖼️";
  if (mime.startsWith("video/") || ["mp4", "m4v", "webm", "ogv", "mov", "mkv"].includes(ext)) return "🎞️";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "oga", "opus", "flac", "aac", "m4a", "weba"].includes(ext)) return "🎵";
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
      0.76
    );
  });
}

function drawCover(context, source, sourceWidth, sourceHeight) {
  const size = thumbnailSize;
  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  context.clearRect(0, 0, size, size);
  context.drawImage(source, x, y, width, height);
}

async function imageThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = thumbnailSize;
    canvas.height = thumbnailSize;
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
      const done = () => { clearTimeout(timer); resolve(); };
      const fail = () => { clearTimeout(timer); reject(new Error("Chromium could not decode this video preview")); };
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.load();
    });

    if (!video.videoWidth || !video.videoHeight) throw new Error("Video has no decodable frame");
    const canvas = document.createElement("canvas");
    canvas.width = thumbnailSize;
    canvas.height = thumbnailSize;
    const context = canvas.getContext("2d", { alpha: false });
    drawCover(context, video, video.videoWidth, video.videoHeight);
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
    mime: file.type,
    thumbnailSize
  });

  const stored = await loadThumbnail(key);
  if (stored) return stored;

  let generated = null;
  const ext = extensionOf(file.name);
  const imageLike = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"].includes(ext);
  const videoLike = file.type.startsWith("video/") || ["mp4", "m4v", "webm", "ogv", "mov", "mkv"].includes(ext);

  if (imageLike) generated = await imageThumbnail(file);
  else if (videoThumbnails && videoLike) generated = await videoThumbnail(file);

  if (generated) await saveThumbnail(key, generated);
  return generated;
}

function showPreview(img, fallback, blob) {
  const url = URL.createObjectURL(blob);
  previewUrls.add(url);
  img.src = url;
  img.hidden = false;
  img.draggable = false;
  fallback.hidden = true;
}

function waitForDialogClose(dialog) {
  return new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
}

async function refreshStorageLabels() {
  const metadata = await externalMetadataStatus();
  const thumbs = await externalThumbnailStatus();
  if (metadataLocationButton) {
    metadataLocationButton.textContent = metadata.configured
      ? `Metadata: ${metadata.name}${metadata.available ? "" : " · reconnect"}`
      : "Metadata: browser only";
  }
  if (thumbnailLocationButton) {
    thumbnailLocationButton.textContent = thumbs.configured
      ? `Thumbs: ${thumbs.name}${thumbs.available ? "" : " · reconnect"}`
      : "Thumbs: browser only";
  }
}

async function ensureDurabilityPrompts() {
  if (metadataDialog && !(await readStored(METADATA_CHOICE_KEY))) {
    metadataDialog.showModal();
    await waitForDialogClose(metadataDialog);
  }
  if (thumbnailDialog && !(await readStored(THUMBNAIL_CHOICE_KEY))) {
    thumbnailDialog.showModal();
    await waitForDialogClose(thumbnailDialog);
  }
  await refreshStorageLabels();
}

function resetPage() {
  pageIndex = 0;
}

async function navigateInto(name, handle) {
  if (handle.kind !== "directory") return;
  pathHandles.push(handle);
  pathNames.push(name);
  resetPage();
  await renderDirectory();
}

function breadcrumbsText() {
  return rootHandle ? [rootHandle.name, ...pathNames].join(" / ") : "No folder selected";
}

function thumbnailFileName(name) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem || "file"}.thumbnail-${thumbnailSize}px.webp`;
}

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon", apng: "image/apng",
  pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
  opus: "audio/opus", flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4", weba: "audio/webm",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
  txt: "text/plain", md: "text/markdown", json: "application/json", csv: "text/csv"
};

function normalizedTransferFile(file, name) {
  if (!(file instanceof File)) return file;
  const inferred = MIME_BY_EXTENSION[extensionOf(name)] || "";
  if (!inferred || file.type === inferred) return file;
  if (file.type && file.type !== "application/octet-stream") return file;
  return new File([file], name || file.name, { type: inferred, lastModified: file.lastModified });
}

function buildPayload({ handle, name, file, metadata, relativePath, representation = "original" }) {
  return makeFileChutePayload({
    kind: handle.kind === "directory" ? "directory" : "file",
    name: representation === "thumbnail" ? thumbnailFileName(name) : name,
    originalName: name,
    representation,
    mime: handle.kind === "directory"
      ? "inode/directory"
      : (representation === "thumbnail" ? "image/webp" : (file?.type || "")),
    relativePath,
    sourceUrl: metadata?.sourceUrl || null,
    parentPageUrl: metadata?.parentPageUrl || null,
    size: file?.size ?? null,
    lastModified: file?.lastModified ?? null
  });
}

function startDrag({ event, row, preview, payload, file }) {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  row.classList.add("dragging");
  writeFileChuteDrag(transfer, payload, file);
  if (preview && !preview.hidden) {
    try { transfer.setDragImage(preview, thumbnailSize / 2, thumbnailSize / 2); } catch {}
  }
}

async function renderEntry(name, handle, generation) {
  if (generation !== renderGeneration) return;
  const row = entryTemplate.content.firstElementChild.cloneNode(true);
  const previewWrap = row.querySelector(".preview-wrap");
  const preview = row.querySelector(".preview");
  const fallback = row.querySelector(".fallback-icon");
  const nameElement = row.querySelector(".entry-name");
  const pathButton = row.querySelector(".entry-path");
  const relativePath = childLocation(name);

  row.draggable = false;
  preview.draggable = false;
  nameElement.textContent = name;
  pathButton.textContent = relativePath;
  pathButton.title = `Copy ${relativePath}`;

  let file = null;
  let metadata = null;
  let thumbnailBlob = null;

  if (handle.kind === "directory") {
    row.classList.add("directory");
    row.dataset.filechuteDirectory = "true";
    fallback.textContent = "📁";
    nameElement.title = "Click to open · drag to FrameChute as a gallery";
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

  const dragOriginal = (event) => {
    const transferFile = normalizedTransferFile(file, name);
    const payload = buildPayload({ handle, name, file: transferFile, metadata, relativePath, representation: "original" });
    startDrag({ event, row, preview, payload, file: transferFile });
  };

  nameElement.draggable = true;
  nameElement.title = handle.kind === "directory"
    ? "Click to open · drag to FrameChute as a gallery"
    : "Drag the name to send the full original file";
  nameElement.addEventListener("dragstart", dragOriginal);

  previewWrap.draggable = true;
  previewWrap.title = handle.kind === "directory"
    ? "Drag this folder to FrameChute as a gallery"
    : "Drag preview";
  previewWrap.addEventListener("dragstart", (event) => {
    if (thumbnailDragMode === "thumbnail" && thumbnailBlob && handle.kind === "file") {
      const thumbFile = new File([thumbnailBlob], thumbnailFileName(name), {
        type: "image/webp",
        lastModified: Date.now()
      });
      const payload = buildPayload({ handle, name, file, metadata, relativePath, representation: "thumbnail" });
      startDrag({ event, row, preview, payload, file: thumbFile });
      return;
    }
    dragOriginal(event);
  });

  const finishDrag = () => row.classList.remove("dragging");
  nameElement.addEventListener("dragend", finishDrag);
  previewWrap.addEventListener("dragend", finishDrag);

  entriesElement.append(row);

  if (!file || !showThumbnails) return;
  const ext = extensionOf(file.name);
  const imageLike = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"].includes(ext);
  const videoLike = file.type.startsWith("video/") || ["mp4", "m4v", "webm", "ogv", "mov", "mkv"].includes(ext);
  if (!imageLike && !(videoThumbnails && videoLike)) return;

  try {
    thumbnailBlob = await thumbnailFor(file, relativePath);
    if (generation !== renderGeneration || !thumbnailBlob) return;
    showPreview(preview, fallback, thumbnailBlob);
  } catch (error) {
    console.warn("Thumbnail unavailable for", relativePath, error);
  }
}

function recentNames() {
  try {
    const names = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(names) ? names.map(String) : [];
  } catch {
    return [];
  }
}

function sortFiles(files) {
  const recent = recentNames();
  const recentIndex = new Map(recent.map((name, index) => [name, index]));
  return files.sort((a, b) => {
    const ai = recentIndex.get(a.name);
    const bi = recentIndex.get(b.name);
    const ar = Number.isInteger(ai);
    const br = Number.isInteger(bi);
    if (ar !== br) return ar ? -1 : 1;
    if (ar && br && ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function updatePageControls(totalFiles) {
  if (!pageControls || !pagePrevButton || !pageNextButton || !pageLabel) return;

  if (listMode === "all") {
    pageControls.hidden = true;
    return;
  }

  const pageCount = Math.max(1, Math.ceil(totalFiles / PAGE_SIZE));
  pageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const first = totalFiles ? pageIndex * PAGE_SIZE + 1 : 0;
  const last = Math.min(totalFiles, (pageIndex + 1) * PAGE_SIZE);

  pageControls.hidden = false;
  pagePrevButton.disabled = pageIndex <= 0;
  pageNextButton.disabled = pageIndex >= pageCount - 1;
  pageLabel.textContent = totalFiles
    ? `${pageIndex + 1} / ${pageCount} · files ${first}–${last} of ${totalFiles}`
    : "1 / 1 · no files";
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
    if (pageControls) pageControls.hidden = true;
    entriesElement.innerHTML = '<div class="empty">Choose a folder and FileChute will explore it here.</div>';
    setStatus("Choose a local folder to begin.");
    return;
  }

  if (!(await queryPermission(directory))) {
    if (pageControls) pageControls.hidden = true;
    entriesElement.innerHTML = '<div class="empty">FileChute remembers this folder, but Chromium needs permission again. Use Reconnect to restore it.</div>';
    setStatus("Folder permission needs to be restored.", true);
    return;
  }

  setStatus(`Reading ${currentLocation()}…`);

  try {
    const directories = [];
    const files = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === "directory") directories.push({ name, handle });
      else files.push({ name, handle });
    }

    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    sortFiles(files);

    if (!directories.length && !files.length) {
      updatePageControls(0);
      entriesElement.innerHTML = '<div class="empty">This folder is empty.</div>';
      setStatus(`${currentLocation()} · empty`);
      return;
    }

    // Folders are intentionally outside pagination. They are always rendered
    // first so navigation and FileChute → FrameChute gallery drags remain
    // available on every file page.
    for (const item of directories) {
      await renderEntry(item.name, item.handle, generation);
      if (generation !== renderGeneration) return;
    }

    updatePageControls(files.length);
    const visibleFiles = listMode === "all"
      ? files
      : files.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);

    for (const item of visibleFiles) {
      await renderEntry(item.name, item.handle, generation);
      if (generation !== renderGeneration) return;
    }

    if (generation === renderGeneration) {
      const folderText = `${directories.length} folder${directories.length === 1 ? "" : "s"}`;
      const fileText = `${files.length} file${files.length === 1 ? "" : "s"}`;
      const modeText = listMode === "all"
        ? "all loaded"
        : `${visibleFiles.length} shown · page ${pageIndex + 1}/${Math.max(1, Math.ceil(files.length / PAGE_SIZE))}`;
      setStatus(`${folderText} · ${fileText} · ${modeText} · ${currentLocation()}`);
    }
  } catch (error) {
    console.error(error);
    setStatus("Could not read this folder.", true);
  }
}

metadataBrowserOnly?.addEventListener("click", async (event) => {
  event.preventDefault();
  await writeStored(METADATA_CHOICE_KEY, "browser");
  metadataDialog.close("browser");
  await refreshStorageLabels();
});

metadataChoose?.addEventListener("click", async () => {
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

thumbnailBrowserOnly?.addEventListener("click", async (event) => {
  event.preventDefault();
  await writeStored(THUMBNAIL_CHOICE_KEY, "browser");
  thumbnailDialog.close("browser");
  await refreshStorageLabels();
});

thumbnailChoose?.addEventListener("click", async () => {
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

metadataLocationButton?.addEventListener("click", async () => {
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

thumbnailLocationButton?.addEventListener("click", async () => {
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

settingsButton?.addEventListener("click", () => settingsDialog.showModal());

backButton?.addEventListener("click", async () => {
  if (!pathHandles.length) return;
  pathHandles.pop();
  pathNames.pop();
  resetPage();
  await renderDirectory();
});

homeButton?.addEventListener("click", async () => {
  pathHandles = [];
  pathNames = [];
  resetPage();
  await renderDirectory();
});

pagePrevButton?.addEventListener("click", async () => {
  if (listMode !== "paged" || pageIndex <= 0) return;
  pageIndex -= 1;
  await renderDirectory();
  window.scrollTo({ top: 0, behavior: "instant" });
});

pageNextButton?.addEventListener("click", async () => {
  if (listMode !== "paged") return;
  pageIndex += 1;
  await renderDirectory();
  window.scrollTo({ top: 0, behavior: "instant" });
});

listModeInput?.addEventListener("change", async () => {
  listMode = listModeInput.value === "all" ? "all" : "paged";
  resetPage();
  await writeStored(LIST_MODE_KEY, listMode);
  await renderDirectory();
  setStatus(listMode === "all"
    ? "Loading entire directories is enabled. This may use considerably more memory on large image folders."
    : "Paged listing enabled: folders always visible, files load 50 at a time.");
});

showThumbnailsInput?.addEventListener("change", async () => {
  showThumbnails = showThumbnailsInput.checked;
  await writeStored(THUMBNAILS_KEY, showThumbnails);
  await renderDirectory();
});

videoThumbnailsInput?.addEventListener("change", async () => {
  videoThumbnails = videoThumbnailsInput.checked;
  await writeStored(VIDEO_THUMBNAILS_KEY, videoThumbnails);
  await renderDirectory();
});

thumbnailSizeInput?.addEventListener("input", () => {
  const next = clampThumbnailSize(thumbnailSizeInput.value);
  thumbnailSizeValue.textContent = `${next}px`;
  document.documentElement.style.setProperty("--thumbnail-size", `${next}px`);
});

thumbnailSizeInput?.addEventListener("change", async () => {
  thumbnailSize = clampThumbnailSize(thumbnailSizeInput.value);
  applyThumbnailSize();
  await writeStored(THUMBNAIL_SIZE_KEY, thumbnailSize);
  await renderDirectory();
});

thumbnailDragModeInput?.addEventListener("change", async () => {
  thumbnailDragMode = thumbnailDragModeInput.value === "thumbnail" ? "thumbnail" : "original";
  await writeStored(THUMBNAIL_DRAG_KEY, thumbnailDragMode);
  setStatus(thumbnailDragMode === "thumbnail"
    ? "Thumbnail drags now transfer the generated preview. Filename drags still transfer the original."
    : "Thumbnail and filename drags both transfer the full original file.");
});

async function initialize() {
  showThumbnails = (await readStored(THUMBNAILS_KEY)) !== false;
  videoThumbnails = (await readStored(VIDEO_THUMBNAILS_KEY)) !== false;
  thumbnailSize = clampThumbnailSize((await readStored(THUMBNAIL_SIZE_KEY)) ?? DEFAULT_THUMBNAIL_SIZE);
  thumbnailDragMode = (await readStored(THUMBNAIL_DRAG_KEY)) === "thumbnail" ? "thumbnail" : "original";
  listMode = (await readStored(LIST_MODE_KEY)) === "all" ? "all" : "paged";

  if (showThumbnailsInput) showThumbnailsInput.checked = showThumbnails;
  if (videoThumbnailsInput) videoThumbnailsInput.checked = videoThumbnails;
  if (thumbnailDragModeInput) thumbnailDragModeInput.value = thumbnailDragMode;
  if (listModeInput) listModeInput.value = listMode;
  applyThumbnailSize();

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
