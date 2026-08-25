import { readStored } from "./storage.js";

const VIEW_MODE_KEY = "filechute-view-mode";
const DIRECTORY_POSITION_KEY = "filechute-directory-position";
const entries = document.querySelector("#entries");
const breadcrumbs = document.querySelector("#breadcrumbs");

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"
]);

let viewMode = "browse";
let directoryPosition = "top";

function rootNameFromBreadcrumbs() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return "";
  return text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean)[0] || "";
}

function disableAutomaticFolderDive() {
  const rootName = rootNameFromBreadcrumbs();
  if (!rootName) return;
  // The directory selected by the user is authoritative. FileChute must not
  // silently dive into Pictures/Screenshots or any other child folder.
  try {
    sessionStorage.setItem(`filechute-default-location-v1:${rootName.toLocaleLowerCase()}`, "done");
  } catch {}
}

function rowName(row) {
  return String(
    row?.querySelector(".entry-name-text")?.textContent ||
    row?.querySelector(".entry-name")?.textContent ||
    ""
  ).trim();
}

function isImageName(name) {
  const value = String(name || "").toLocaleLowerCase();
  const dot = value.lastIndexOf(".");
  return dot >= 0 && IMAGE_EXTENSIONS.has(value.slice(dot + 1));
}

function applyViewPolicy(root = document) {
  if (!entries) return;
  entries.dataset.filechuteViewMode = viewMode;
  entries.dataset.filechuteDirectoryPosition = directoryPosition;

  for (const row of root.querySelectorAll?.(".entry") || []) {
    const isDirectory = row.classList.contains("directory");
    if (isDirectory) {
      row.dataset.filechuteDirectory = "true";
      row.hidden = viewMode === "images";
      const name = row.querySelector(".entry-name-text") || row.querySelector(".entry-name");
      if (name) name.title = "Click to open · drag to FrameChute as a gallery";
      const preview = row.querySelector(".preview-wrap");
      if (preview) preview.title = "Drag this folder to FrameChute as a gallery";
      continue;
    }

    const image = isImageName(rowName(row));
    row.classList.toggle("filechute-non-image", !image);
    row.hidden = viewMode === "images" && !image;
  }
}

const style = document.createElement("style");
style.dataset.filechuteDirectoryVisibility = "true";
style.textContent = `
  /* Directories are first-class FileChute objects and never participate in
     the 50-file page count. Their placement is a user preference. */
  #entries[data-filechute-view-mode="browse"][data-filechute-directory-position="top"] > .entry.directory {
    display: grid !important;
    order: -100000 !important;
  }
  #entries[data-filechute-view-mode="browse"][data-filechute-directory-position="bottom"] > .entry.directory {
    display: grid !important;
    order: 100000 !important;
  }
  #entries[data-filechute-view-mode="images"] > .entry.directory,
  #entries[data-filechute-view-mode="images"] > .entry.filechute-non-image {
    display: none !important;
  }
  #entries > .entry.directory .fallback-icon { filter: none; }
`;
document.head.append(style);

async function initializeViewPolicy() {
  viewMode = (await readStored(VIEW_MODE_KEY)) === "images" ? "images" : "browse";
  directoryPosition = (await readStored(DIRECTORY_POSITION_KEY)) === "bottom" ? "bottom" : "top";
  disableAutomaticFolderDive();
  applyViewPolicy();
}

const breadcrumbObserver = new MutationObserver(() => disableAutomaticFolderDive());
if (breadcrumbs) breadcrumbObserver.observe(breadcrumbs, { childList: true, characterData: true, subtree: true });

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