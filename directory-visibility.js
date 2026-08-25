import { readStored } from "./storage.js";

const SHOW_IMAGES_KEY = "filechute-show-images";
const SHOW_VIDEOS_KEY = "filechute-show-videos";
const SHOW_OTHER_FILES_KEY = "filechute-show-other-files";
const SHOW_DIRECTORIES_KEY = "filechute-show-directories";
const DIRECTORY_POSITION_KEY = "filechute-directory-position";

const entries = document.querySelector("#entries");
const breadcrumbs = document.querySelector("#breadcrumbs");

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4", "m4v", "webm", "ogv", "ogg", "mov", "mkv"
]);

let showImages = true;
let showVideos = true;
let showOtherFiles = true;
let showDirectories = true;
let directoryPosition = "top";

function rootNameFromBreadcrumbs() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return "";
  return text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean)[0] || "";
}

function disableAutomaticFolderDive() {
  const rootName = rootNameFromBreadcrumbs();
  if (!rootName) return;
  try {
    sessionStorage.setItem(
      `filechute-default-location-v1:${rootName.toLocaleLowerCase()}`,
      "done"
    );
  } catch {}
}

function rowName(row) {
  return String(
    row?.querySelector(".entry-name-text")?.textContent ||
    row?.querySelector(".entry-name")?.textContent ||
    ""
  ).trim();
}

function extensionOf(name) {
  const value = String(name || "").toLocaleLowerCase();
  const dot = value.lastIndexOf(".");
  return dot < 0 ? "" : value.slice(dot + 1);
}

function fileCategory(name) {
  const ext = extensionOf(name);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "other";
}

function categoryVisible(category) {
  if (category === "image") return showImages;
  if (category === "video") return showVideos;
  return showOtherFiles;
}

function applyViewPolicy(root = document) {
  if (!entries) return;
  entries.dataset.filechuteDirectoryPosition = directoryPosition;

  for (const row of root.querySelectorAll?.(".entry") || []) {
    const isDirectory = row.classList.contains("directory");

    if (isDirectory) {
      row.dataset.filechuteDirectory = "true";
      row.hidden = !showDirectories;
      const name = row.querySelector(".entry-name-text") || row.querySelector(".entry-name");
      if (name) name.title = "Click to open · drag to FrameChute as a gallery";
      continue;
    }

    const category = fileCategory(rowName(row));
    row.dataset.filechuteMediaKind = category;
    row.hidden = !categoryVisible(category);
  }
}

const style = document.createElement("style");
style.dataset.filechuteDirectoryVisibility = "true";
style.textContent = `
  #entries[data-filechute-directory-position="top"] > .entry.directory {
    order: -100000 !important;
  }
  #entries[data-filechute-directory-position="bottom"] > .entry.directory {
    order: 100000 !important;
  }
  #entries > .entry.directory .fallback-icon { filter: none; }
`;
document.head.append(style);

async function initializeViewPolicy() {
  const [images, videos, other, directories, position] = await Promise.all([
    readStored(SHOW_IMAGES_KEY),
    readStored(SHOW_VIDEOS_KEY),
    readStored(SHOW_OTHER_FILES_KEY),
    readStored(SHOW_DIRECTORIES_KEY),
    readStored(DIRECTORY_POSITION_KEY)
  ]);

  showImages = images !== false;
  showVideos = videos !== false;
  showOtherFiles = other !== false;
  showDirectories = directories !== false;
  directoryPosition = position === "bottom" ? "bottom" : "top";

  disableAutomaticFolderDive();
  applyViewPolicy();
}

const breadcrumbObserver = new MutationObserver(() => disableAutomaticFolderDive());
if (breadcrumbs) {
  breadcrumbObserver.observe(breadcrumbs, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

const entryObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      applyViewPolicy(node.matches?.(".entry") ? (node.parentElement || document) : node);
    }
  }
});
if (entries) entryObserver.observe(entries, { childList: true });

void initializeViewPolicy();
