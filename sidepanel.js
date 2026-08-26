import { readStored, writeStored } from "./storage.js";
import { makeChutePayload, writeChuteDrag } from "./interop.js";
import { metadataFor } from "./metadata-store.js";
import {
  loadThumbnail,
  makeThumbnailKey,
  saveThumbnail
} from "./thumbnail-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const RESTORE_PATH_KEY = "filechute-restore-path-v1";
const THUMBNAILS_KEY = "filechute-show-thumbnails";
const VIDEO_THUMBNAILS_KEY = "filechute-video-thumbnails";
const THUMBNAIL_SIZE_KEY = "filechute-thumbnail-size";
const THUMBNAIL_DRAG_KEY = "filechute-thumbnail-drag-mode";
const LIST_MODE_KEY = "filechute-directory-list-mode";
const FILES_PER_PAGE_KEY = "filechute-files-per-page";
const SHOW_IMAGES_KEY = "filechute-show-images";
const SHOW_VIDEOS_KEY = "filechute-show-videos";
const SHOW_OTHER_FILES_KEY = "filechute-show-other-files";
const SHOW_DIRECTORIES_KEY = "filechute-show-directories";
const LEGACY_VIEW_MODE_KEY = "filechute-view-mode";
const DIRECTORY_POSITION_KEY = "filechute-directory-position";
const RECENT_KEY = "filechute-recent-drops-v1";

const DEFAULT_THUMBNAIL_SIZE = 48;
const MIN_THUMBNAIL_SIZE = 24;
const MAX_THUMBNAIL_SIZE = 160;
const DEFAULT_FILES_PER_PAGE = 50;
const MIN_FILES_PER_PAGE = 1;
const MAX_FILES_PER_PAGE = 5000;

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4", "m4v", "webm", "ogv", "ogg", "mov", "mkv"
]);

const settingsButton = document.querySelector("#open-settings");
const backButton = document.querySelector("#back");
const homeButton = document.querySelector("#home");
const breadcrumbs = document.querySelector("#breadcrumbs");
const searchInput = document.querySelector("#file-search");
const pageControls = document.querySelector("#page-controls");
const pagePrevButton = document.querySelector("#page-prev");
const pageNextButton = document.querySelector("#page-next");
const pageLabel = document.querySelector("#page-label");
const statusElement = document.querySelector("#status");
const entriesElement = document.querySelector("#entries");
const entryTemplate = document.querySelector("#entry-template");

const settingsDialog = document.querySelector("#settings-dialog");
const thumbnailSizeInput = document.querySelector("#thumbnail-size");
const thumbnailSizeValue = document.querySelector("#thumbnail-size-value");

let rootHandle = null;
let pathHandles = [];
let pathNames = [];
let directorySnapshot = [];
let directorySignature = "";
let pageIndex = 0;
let renderGeneration = 0;
let searchGeneration = 0;
let recursiveSearchResults = null;
let pollBusy = false;

let showThumbnails = true;
let videoThumbnails = true;
let thumbnailSize = DEFAULT_THUMBNAIL_SIZE;
let thumbnailDragMode = "original";
let listMode = "paged";
let filesPerPage = DEFAULT_FILES_PER_PAGE;
let showImages = true;
let showVideos = true;
let showOtherFiles = true;
let showDirectories = true;
let directoryPosition = "top";

const previewUrls = new Set();

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function extensionOf(name) {
  const value = String(name || "").toLowerCase();
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index + 1);
}

function isImageName(name) {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}

function isVideoName(name) {
  return VIDEO_EXTENSIONS.has(extensionOf(name));
}

function classifyName(name) {
  if (isImageName(name)) return "image";
  if (isVideoName(name)) return "video";
  return "other";
}

function fileTypeVisible(name) {
  const kind = classifyName(name);
  if (kind === "image") return showImages;
  if (kind === "video") return showVideos;
  return showOtherFiles;
}

function clampThumbnailSize(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_THUMBNAIL_SIZE;
  return Math.min(MAX_THUMBNAIL_SIZE, Math.max(MIN_THUMBNAIL_SIZE, parsed));
}

function clampFilesPerPage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_FILES_PER_PAGE;
  return Math.min(MAX_FILES_PER_PAGE, Math.max(MIN_FILES_PER_PAGE, parsed));
}

function currentDirectory() {
  return pathHandles.at(-1) || rootHandle;
}

function currentLocation() {
  return rootHandle ? [rootHandle.name, ...pathNames].join("/") : "";
}

function childLocation(name) {
  return [currentLocation(), name].filter(Boolean).join("/");
}

function breadcrumbsText() {
  return rootHandle ? [rootHandle.name, ...pathNames].join(" / ") : "No folder selected";
}

function resetPage() {
  pageIndex = 0;
}

function revokePreviewUrls() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls.clear();
}

function applyThumbnailSize() {
  document.documentElement.style.setProperty("--thumbnail-size", `${thumbnailSize}px`);
}

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

function fallbackIcon(handle, file = null) {
  if (handle?.kind === "directory") return "📁";
  const mime = String(file?.type || "").toLowerCase();
  const ext = extensionOf(handle?.name || file?.name || "");
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "🖼️";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "🎞️";
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
  context.clearRect(0, 0, size, size);
  context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height);
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

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video has no decodable frame");
    }

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

  const ext = extensionOf(file.name);
  const imageLike = file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
  const videoLike = file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
  let generated = null;

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

function recentNames() {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function saveRecent(names) {
  const next = [...new Set([...names.filter(Boolean).map(String), ...recentNames()])].slice(0, 24);
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function sortByName(items) {
  return items.sort((a, b) => a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base"
  }));
}

function sortFiles(items) {
  const recent = recentNames();
  const recentIndex = new Map(recent.map((name, index) => [name, index]));
  return items.sort((a, b) => {
    const ai = recentIndex.get(a.name);
    const bi = recentIndex.get(b.name);
    const ar = Number.isInteger(ai);
    const br = Number.isInteger(bi);
    if (ar !== br) return ar ? -1 : 1;
    if (ar && br && ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function snapshotSignature(items) {
  return items
    .map((item) => `${item.handle.kind}:${item.name}`)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .join("\n");
}

function makeNameLine(nameElement, grip, name) {
  const text = document.createElement("span");
  text.className = "entry-name-text";
  text.textContent = name;
  nameElement.replaceChildren(grip, text);
  return text;
}

function copyPathHandler(pathButton, relativePath) {
  pathButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(relativePath);
      setStatus(`Copied ${relativePath}`);
    } catch {
      setStatus(relativePath);
    }
  });
}

function buildPayload({ handle, name, file, metadata, relativePath, representation = "original" }) {
  return makeChutePayload({
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

function thumbnailFileName(name) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem || "file"}.thumbnail-${thumbnailSize}px.webp`;
}

const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  apng: "image/apng",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv"
};

function normalizedTransferFile(file, name) {
  if (!(file instanceof File)) return file;
  const inferred = MIME_BY_EXTENSION[extensionOf(name)] || "";
  if (!inferred || file.type === inferred) return file;
  if (file.type && file.type !== "application/octet-stream") return file;
  return new File([file], name || file.name, {
    type: inferred,
    lastModified: file.lastModified
  });
}

function startDrag({ event, row, preview, payload, file }) {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  row.classList.add("dragging");
  writeChuteDrag(transfer, payload, file);
  if (preview && !preview.hidden) {
    try {
      transfer.setDragImage(preview, thumbnailSize / 2, thumbnailSize / 2);
    } catch {}
  }
}

function finishDrag(row) {
  row.classList.remove("dragging");
  document.documentElement.style.cursor = "";
  document.body.style.cursor = "";
}

async function navigateInto(name, handle) {
  if (!handle || handle.kind !== "directory") return;
  pathHandles.push(handle);
  pathNames.push(name);
  resetPage();
  if (searchInput) searchInput.value = "";
  directorySnapshot = [];
  directorySignature = "";
  await renderDirectory();
}

async function renderEntry(item, generation) {
  if (generation !== renderGeneration) return;

  const { name, handle } = item;
  const row = entryTemplate.content.firstElementChild.cloneNode(true);
  const grip = row.querySelector(".filechute-grip");
  const previewWrap = row.querySelector(".preview-wrap");
  const preview = row.querySelector(".preview");
  const fallback = row.querySelector(".fallback-icon");
  const nameElement = row.querySelector(".entry-name");
  const pathButton = row.querySelector(".entry-path");
  const relativePath = item.relativePath || childLocation(name);

  row.draggable = false;
  preview.draggable = false;
  pathButton.textContent = relativePath;
  pathButton.title = `Copy ${relativePath}`;
  copyPathHandler(pathButton, relativePath);
  makeNameLine(nameElement, grip, name);

  if (handle.kind === "directory") {
    row.classList.add("directory");
    row.dataset.chuteDirectory = "true";
    fallback.textContent = "📁";
    fallback.hidden = false;

    grip.draggable = true;
    grip.title = "Drag this folder to FrameChute as a gallery";
    grip.setAttribute("aria-label", grip.title);
    nameElement.draggable = false;
    previewWrap.draggable = false;
    nameElement.title = "Open folder";
    previewWrap.title = "Open folder";
    row.title = "Click to open this folder. Drag the six-dot grip to FrameChute for a gallery.";

    row.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".filechute-grip, .entry-path")) return;
      void navigateInto(name, handle);
    });

    grip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    grip.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      const payload = buildPayload({
        handle,
        name,
        file: null,
        metadata: null,
        relativePath,
        representation: "original"
      });
      startDrag({ event, row, preview: null, payload, file: null });
    });
    grip.addEventListener("dragend", () => finishDrag(row));

    entriesElement.append(row);
    return;
  }

  fallback.textContent = fallbackIcon(handle);
  entriesElement.append(row);

  let file = null;
  let metadata = null;
  let thumbnailBlob = null;

  try {
    file = normalizedTransferFile(await handle.getFile(), name);
    metadata = await metadataFor(relativePath);
  } catch (error) {
    console.warn("Could not read file", relativePath, error);
    return;
  }

  if (generation !== renderGeneration || !row.isConnected) return;
  fallback.textContent = fallbackIcon(handle, file);

  const dragOriginal = (event) => {
    const payload = buildPayload({
      handle,
      name,
      file,
      metadata,
      relativePath,
      representation: "original"
    });
    startDrag({ event, row, preview, payload, file });
  };

  grip.draggable = true;
  grip.title = "Drag the original file";
  grip.setAttribute("aria-label", grip.title);
  grip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  grip.addEventListener("dragstart", dragOriginal);
  grip.addEventListener("dragend", () => finishDrag(row));

  nameElement.draggable = true;
  nameElement.title = "Drag the original file";
  nameElement.addEventListener("dragstart", dragOriginal);
  nameElement.addEventListener("dragend", () => finishDrag(row));

  previewWrap.draggable = true;
  previewWrap.title = "Drag preview";
  previewWrap.addEventListener("dragstart", (event) => {
    if (thumbnailDragMode === "thumbnail" && thumbnailBlob) {
      const thumbFile = new File([thumbnailBlob], thumbnailFileName(name), {
        type: "image/webp",
        lastModified: Date.now()
      });
      const payload = buildPayload({
        handle,
        name,
        file,
        metadata,
        relativePath,
        representation: "thumbnail"
      });
      startDrag({ event, row, preview, payload, file: thumbFile });
      return;
    }
    dragOriginal(event);
  });
  previewWrap.addEventListener("dragend", () => finishDrag(row));

  if (!showThumbnails) return;

  const ext = extensionOf(file.name);
  const imageLike = file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
  const videoLike = file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
  if (!imageLike && !(videoThumbnails && videoLike)) return;

  try {
    thumbnailBlob = await thumbnailFor(file, relativePath);
    if (generation !== renderGeneration || !row.isConnected || !thumbnailBlob) return;
    showPreview(preview, fallback, thumbnailBlob);
  } catch (error) {
    console.warn("Thumbnail unavailable for", relativePath, error);
  }
}

function filteredSnapshot() {
  const query = String(searchInput?.value || "").trim().toLocaleLowerCase();
  const source = query && recursiveSearchResults ? recursiveSearchResults : directorySnapshot;
  const matches = source.filter(
    (item) => !query || item.name.toLocaleLowerCase().includes(query)
  );

  let directories = showDirectories
    ? matches.filter((item) => item.handle.kind === "directory")
    : [];
  let files = matches
    .filter((item) => item.handle.kind === "file")
    .filter((item) => fileTypeVisible(item.name));

  sortByName(directories);
  sortFiles(files);
  return { directories, files, query };
}

async function recursiveSearch(query, generation) {
  const matches = [];
  let visited = 0;
  async function walk(directory, segments) {
    for await (const [name, handle] of directory.entries()) {
      if (generation !== searchGeneration) return;
      const next = [...segments, name];
      if (handle.kind === "directory") {
        await walk(handle, next);
      } else if (name.toLocaleLowerCase().includes(query)) {
        matches.push({ name, handle, relativePath:[rootHandle.name, ...next].join("/") });
      }
      visited += 1;
      if (visited % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  await walk(rootHandle, []);
  if (generation !== searchGeneration) return;
  recursiveSearchResults = matches;
  resetPage();
  renderSnapshot();
}

function updatePageControls(totalFiles) {
  if (!pageControls || !pagePrevButton || !pageNextButton || !pageLabel) return;

  if (listMode === "all") {
    pageControls.hidden = true;
    return;
  }

  const pageCount = Math.max(1, Math.ceil(totalFiles / filesPerPage));
  pageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const first = totalFiles ? pageIndex * filesPerPage + 1 : 0;
  const last = Math.min(totalFiles, (pageIndex + 1) * filesPerPage);

  pageControls.hidden = false;
  pagePrevButton.disabled = pageIndex <= 0;
  pageNextButton.disabled = pageIndex >= pageCount - 1;
  pagePrevButton.title = `Previous ${filesPerPage} files`;
  pageNextButton.title = `Next ${filesPerPage} files`;
  pagePrevButton.setAttribute("aria-label", pagePrevButton.title);
  pageNextButton.setAttribute("aria-label", pageNextButton.title);
  pageLabel.textContent = totalFiles
    ? `${pageIndex + 1} / ${pageCount} · ${first}–${last} of ${totalFiles}`
    : "1 / 1 · no files";
}

function renderSnapshot() {
  const generation = ++renderGeneration;
  revokePreviewUrls();
  entriesElement.replaceChildren();

  const { directories, files, query } = filteredSnapshot();
  updatePageControls(files.length);

  const visibleFiles = listMode === "all"
    ? files
    : files.slice(pageIndex * filesPerPage, pageIndex * filesPerPage + filesPerPage);

  if (!directories.length && !visibleFiles.length) {
    entriesElement.innerHTML = `<div class="empty">${query ? "No matching items." : "Nothing in this folder matches the current visibility settings."}</div>`;
  } else {
    const top = directoryPosition === "top" ? directories : [];
    const bottom = directoryPosition === "bottom" ? directories : [];
    const ordered = [...top, ...visibleFiles, ...bottom];
    const tasks = ordered.map((item) => renderEntry(item, generation));
    void Promise.allSettled(tasks);
  }

  const folderText = showDirectories
    ? `${directories.length} folder${directories.length === 1 ? "" : "s"}`
    : "folders hidden";
  const fileText = `${files.length} visible file${files.length === 1 ? "" : "s"}`;
  const modeText = listMode === "all"
    ? "whole directory"
    : `${visibleFiles.length} shown · ${filesPerPage}/page · page ${pageIndex + 1}/${Math.max(1, Math.ceil(files.length / filesPerPage))}`;
  setStatus(`${folderText} · ${fileText} · ${modeText} · ${currentLocation()}`);
}

async function enumerateCurrentDirectory() {
  const directory = currentDirectory();
  if (!directory) return [];
  const items = [];
  for await (const [name, handle] of directory.entries()) {
    items.push({ name, handle });
  }
  return items;
}

async function renderDirectory() {
  if (breadcrumbs) breadcrumbs.textContent = breadcrumbsText();
  if (backButton) backButton.disabled = pathHandles.length === 0;
  if (homeButton) homeButton.disabled = pathHandles.length === 0;

  const directory = currentDirectory();
  if (!directory) {
    directorySnapshot = [];
    directorySignature = "";
    if (pageControls) pageControls.hidden = true;
    entriesElement.innerHTML = '<div class="empty">Choose a folder above and Chute will show exactly what is inside it.</div>';
    setStatus("Choose a local folder to begin.");
    return;
  }

  if (!(await queryPermission(directory))) {
    directorySnapshot = [];
    directorySignature = "";
    if (pageControls) pageControls.hidden = true;
    entriesElement.innerHTML = '<div class="empty">Chute remembers this folder, but Chromium needs permission again. Reconnect it or choose another folder.</div>';
    setStatus("Folder permission needs to be restored.", true);
    return;
  }

  setStatus(`Reading ${currentLocation()}…`);
  try {
    directorySnapshot = await enumerateCurrentDirectory();
    directorySignature = snapshotSignature(directorySnapshot);
    renderSnapshot();
  } catch (error) {
    console.error("Chute could not enumerate directory", error);
    setStatus("Could not read this folder.", true);
  }
}

async function restorePathIfNeeded() {
  let saved = [];
  try {
    saved = JSON.parse(sessionStorage.getItem(RESTORE_PATH_KEY) || "[]");
    sessionStorage.removeItem(RESTORE_PATH_KEY);
  } catch {}

  if (!rootHandle || !Array.isArray(saved) || !saved.length) return;

  let directory = rootHandle;
  const handles = [];
  const names = [];

  for (const name of saved) {
    try {
      directory = await directory.getDirectoryHandle(String(name));
      handles.push(directory);
      names.push(String(name));
    } catch {
      break;
    }
  }

  pathHandles = handles;
  pathNames = names;
}

async function scanForFilesystemChanges() {
  if (pollBusy || document.hidden || settingsDialog?.open || !currentDirectory()) return;
  pollBusy = true;

  try {
    const next = await enumerateCurrentDirectory();
    const signature = snapshotSignature(next);
    if (signature === directorySignature) return;

    const previous = new Set(
      directorySnapshot.map((item) => `${item.handle.kind}:${item.name}`)
    );
    const addedFiles = next
      .filter((item) => item.handle.kind === "file" && !previous.has(`file:${item.name}`))
      .map((item) => item.name);

    if (addedFiles.length) saveRecent(addedFiles);

    directorySnapshot = next;
    directorySignature = signature;
    renderSnapshot();
  } catch (error) {
    console.debug("Chute filesystem refresh skipped", error);
  } finally {
    pollBusy = false;
  }
}

async function loadVisibilitySettings() {
  const [
    storedImages,
    storedVideos,
    storedOther,
    storedDirectories,
    legacyView
  ] = await Promise.all([
    readStored(SHOW_IMAGES_KEY),
    readStored(SHOW_VIDEOS_KEY),
    readStored(SHOW_OTHER_FILES_KEY),
    readStored(SHOW_DIRECTORIES_KEY),
    readStored(LEGACY_VIEW_MODE_KEY)
  ]);

  const hasNewVisibility = [
    storedImages,
    storedVideos,
    storedOther,
    storedDirectories
  ].some((value) => typeof value === "boolean");

  if (!hasNewVisibility && legacyView === "images") {
    showImages = true;
    showVideos = false;
    showOtherFiles = false;
    showDirectories = false;
    await Promise.all([
      writeStored(SHOW_IMAGES_KEY, showImages),
      writeStored(SHOW_VIDEOS_KEY, showVideos),
      writeStored(SHOW_OTHER_FILES_KEY, showOtherFiles),
      writeStored(SHOW_DIRECTORIES_KEY, showDirectories),
      writeStored(LEGACY_VIEW_MODE_KEY, "all")
    ]);
    return;
  }

  showImages = storedImages !== false;
  showVideos = storedVideos !== false;
  showOtherFiles = storedOther !== false;
  showDirectories = storedDirectories !== false;

  if (legacyView !== "all") {
    await writeStored(LEGACY_VIEW_MODE_KEY, "all");
  }
}

backButton?.addEventListener("click", async () => {
  if (!pathHandles.length) return;
  pathHandles.pop();
  pathNames.pop();
  resetPage();
  if (searchInput) searchInput.value = "";
  directorySnapshot = [];
  directorySignature = "";
  await renderDirectory();
});

homeButton?.addEventListener("click", async () => {
  if (!rootHandle) return;
  pathHandles = [];
  pathNames = [];
  resetPage();
  if (searchInput) searchInput.value = "";
  directorySnapshot = [];
  directorySignature = "";
  await renderDirectory();
});

searchInput?.addEventListener("input", () => {
  const generation = ++searchGeneration;
  const query = String(searchInput.value || "").trim().toLocaleLowerCase();
  recursiveSearchResults = query ? [] : null;
  resetPage();
  renderSnapshot();
  if (query && rootHandle) {
    setStatus(`Searching ${rootHandle.name} recursively…`);
    void recursiveSearch(query, generation).catch(error => {
      if (generation !== searchGeneration) return;
      console.warn("Chute recursive search failed", error);
      setStatus("Search could not read part of the selected folder.", true);
    });
  }
});

pagePrevButton?.addEventListener("click", () => {
  if (listMode !== "paged" || pageIndex <= 0) return;
  pageIndex -= 1;
  renderSnapshot();
  window.scrollTo({ top: 0, behavior: "auto" });
});

pageNextButton?.addEventListener("click", () => {
  if (listMode !== "paged") return;
  const { files } = filteredSnapshot();
  const pageCount = Math.max(1, Math.ceil(files.length / filesPerPage));
  if (pageIndex >= pageCount - 1) return;
  pageIndex += 1;
  renderSnapshot();
  window.scrollTo({ top: 0, behavior: "auto" });
});

thumbnailSizeInput?.addEventListener("input", () => {
  if (thumbnailSizeValue) {
    thumbnailSizeValue.textContent = `${clampThumbnailSize(thumbnailSizeInput.value)}px`;
  }
});

settingsButton?.addEventListener("click", () => {
  settingsDialog?.showModal();
});

window.addEventListener("chute:filesystem-changed", () => {
  void scanForFilesystemChanges();
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".entry.dragging").forEach(
    (row) => row.classList.remove("dragging")
  );
  document.documentElement.style.cursor = "";
  document.body.style.cursor = "";
}, true);

async function initialize() {
  showThumbnails = (await readStored(THUMBNAILS_KEY)) !== false;
  videoThumbnails = (await readStored(VIDEO_THUMBNAILS_KEY)) !== false;
  thumbnailSize = clampThumbnailSize(
    (await readStored(THUMBNAIL_SIZE_KEY)) ?? DEFAULT_THUMBNAIL_SIZE
  );
  thumbnailDragMode = (await readStored(THUMBNAIL_DRAG_KEY)) === "thumbnail"
    ? "thumbnail"
    : "original";
  listMode = (await readStored(LIST_MODE_KEY)) === "all" ? "all" : "paged";
  filesPerPage = clampFilesPerPage(
    (await readStored(FILES_PER_PAGE_KEY)) ?? DEFAULT_FILES_PER_PAGE
  );
  directoryPosition = (await readStored(DIRECTORY_POSITION_KEY)) === "bottom"
    ? "bottom"
    : "top";

  await loadVisibilitySettings();

  applyThumbnailSize();
  rootHandle = await readStored(ROOT_HANDLE_KEY);
  await restorePathIfNeeded();
  await renderDirectory();

  const openSettings = await chrome.storage.session.get("filechute-open-settings").catch(() => ({}));
  if (openSettings?.["filechute-open-settings"]) {
    await chrome.storage.session.remove("filechute-open-settings").catch(() => {});
    settingsDialog?.showModal();
  }

  setInterval(() => void scanForFilesystemChanges(), 1000);
}

initialize().catch((error) => {
  console.error("Chute could not initialize", error);
  setStatus("Chute could not initialize.", true);
});
