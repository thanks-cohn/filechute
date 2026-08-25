import { readStored, writeStored } from "./storage.js";

const LAUNCH_MODE_KEY = "filechute-launch-mode";
const VIEW_MODE_KEY = "filechute-view-mode";
const DIRECTORY_POSITION_KEY = "filechute-directory-position";
const LIST_MODE_KEY = "filechute-directory-list-mode";
const THUMBNAILS_KEY = "filechute-show-thumbnails";
const VIDEO_THUMBNAILS_KEY = "filechute-video-thumbnails";
const THUMBNAIL_SIZE_KEY = "filechute-thumbnail-size";
const THUMBNAIL_DRAG_KEY = "filechute-thumbnail-drag-mode";

const settingsButton = document.querySelector("#open-settings");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const cancelButton = document.querySelector("#settings-cancel");
const cancelX = document.querySelector("#settings-cancel-x");
const statusElement = document.querySelector("#status");

const launchModeInput = document.querySelector("#launch-mode");
const viewModeInput = document.querySelector("#view-mode");
const directoryPositionInput = document.querySelector("#directory-position");
const listModeInput = document.querySelector("#directory-list-mode");
const showThumbnailsInput = document.querySelector("#show-thumbnails");
const videoThumbnailsInput = document.querySelector("#video-thumbnails");
const thumbnailSizeInput = document.querySelector("#thumbnail-size");
const thumbnailSizeValue = document.querySelector("#thumbnail-size-value");
const thumbnailDragModeInput = document.querySelector("#thumbnail-drag-mode");

const deferredControlIds = new Set([
  "launch-mode",
  "view-mode",
  "directory-position",
  "directory-list-mode",
  "show-thumbnails",
  "video-thumbnails",
  "thumbnail-size",
  "thumbnail-drag-mode"
]);

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function clampThumbnailSize(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return 48;
  return Math.min(160, Math.max(24, number));
}

function syncDraftUi() {
  if (thumbnailSizeValue && thumbnailSizeInput) {
    thumbnailSizeValue.textContent = `${clampThumbnailSize(thumbnailSizeInput.value)}px`;
  }
  if (directoryPositionInput && viewModeInput) {
    directoryPositionInput.disabled = viewModeInput.value === "images";
  }
}

async function loadSettingsIntoForm() {
  if (launchModeInput) launchModeInput.value = (await readStored(LAUNCH_MODE_KEY)) === "window" ? "window" : "panel";
  if (viewModeInput) viewModeInput.value = (await readStored(VIEW_MODE_KEY)) === "images" ? "images" : "all";
  if (directoryPositionInput) directoryPositionInput.value = (await readStored(DIRECTORY_POSITION_KEY)) === "bottom" ? "bottom" : "top";
  if (listModeInput) listModeInput.value = (await readStored(LIST_MODE_KEY)) === "all" ? "all" : "paged";
  if (showThumbnailsInput) showThumbnailsInput.checked = (await readStored(THUMBNAILS_KEY)) !== false;
  if (videoThumbnailsInput) videoThumbnailsInput.checked = (await readStored(VIDEO_THUMBNAILS_KEY)) !== false;
  if (thumbnailSizeInput) thumbnailSizeInput.value = String(clampThumbnailSize((await readStored(THUMBNAIL_SIZE_KEY)) ?? 48));
  if (thumbnailDragModeInput) thumbnailDragModeInput.value = (await readStored(THUMBNAIL_DRAG_KEY)) === "thumbnail" ? "thumbnail" : "original";
  syncDraftUi();
}

async function applySettings() {
  const launchMode = launchModeInput?.value === "window" ? "window" : "panel";
  const viewMode = viewModeInput?.value === "images" ? "images" : "all";
  const directoryPosition = directoryPositionInput?.value === "bottom" ? "bottom" : "top";
  const listMode = listModeInput?.value === "all" ? "all" : "paged";
  const thumbnailSize = clampThumbnailSize(thumbnailSizeInput?.value ?? 48);
  const thumbnailDragMode = thumbnailDragModeInput?.value === "thumbnail" ? "thumbnail" : "original";

  await Promise.all([
    writeStored(LAUNCH_MODE_KEY, launchMode),
    writeStored(VIEW_MODE_KEY, viewMode),
    writeStored(DIRECTORY_POSITION_KEY, directoryPosition),
    writeStored(LIST_MODE_KEY, listMode),
    writeStored(THUMBNAILS_KEY, Boolean(showThumbnailsInput?.checked)),
    writeStored(VIDEO_THUMBNAILS_KEY, Boolean(videoThumbnailsInput?.checked)),
    writeStored(THUMBNAIL_SIZE_KEY, thumbnailSize),
    writeStored(THUMBNAIL_DRAG_KEY, thumbnailDragMode)
  ]);

  try {
    await chrome.runtime.sendMessage({ type: "filechute-launch-mode-changed", launchMode });
  } catch {}

  settingsDialog?.close("ok");
  setStatus("Applying FileChute settings…");
  location.reload();
}

// Existing sidepanel listeners used to rebuild thumbnails and listings as soon
// as a control changed. Settings are a draft: consume those events while the
// dialog is open, then write the chosen values only when OK is pressed.
function interceptDraftEvent(event) {
  if (!settingsDialog?.open) return;
  const target = event.target;
  if (!(target instanceof Element) || !deferredControlIds.has(target.id)) return;
  if (target.id === "thumbnail-size" || target.id === "view-mode") syncDraftUi();
  event.stopImmediatePropagation();
}

document.addEventListener("input", interceptDraftEvent, true);
document.addEventListener("change", interceptDraftEvent, true);

settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void applySettings().catch((error) => {
    console.error("Could not apply FileChute settings", error);
    setStatus(error?.message || "Could not apply FileChute settings.", true);
  });
});

async function cancelSettings() {
  await loadSettingsIntoForm();
  settingsDialog?.close("cancel");
}

cancelButton?.addEventListener("click", () => void cancelSettings());
cancelX?.addEventListener("click", () => void cancelSettings());
settingsButton?.addEventListener("click", () => void loadSettingsIntoForm());

void loadSettingsIntoForm();