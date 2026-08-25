import { readStored, writeStored } from "./storage.js";

const LAUNCH_MODE_KEY = "filechute-launch-mode";
const LEGACY_VIEW_MODE_KEY = "filechute-view-mode";
const SHOW_IMAGES_KEY = "filechute-show-images";
const SHOW_VIDEOS_KEY = "filechute-show-videos";
const SHOW_OTHER_FILES_KEY = "filechute-show-other-files";
const SHOW_DIRECTORIES_KEY = "filechute-show-directories";
const DIRECTORY_POSITION_KEY = "filechute-directory-position";
const LIST_MODE_KEY = "filechute-directory-list-mode";
const FILES_PER_PAGE_KEY = "filechute-files-per-page";
const THUMBNAILS_KEY = "filechute-show-thumbnails";
const VIDEO_THUMBNAILS_KEY = "filechute-video-thumbnails";
const THUMBNAIL_SIZE_KEY = "filechute-thumbnail-size";
const THUMBNAIL_DRAG_KEY = "filechute-thumbnail-drag-mode";
const RESTORE_PATH_KEY = "filechute-restore-path-v1";

const DEFAULT_FILES_PER_PAGE = 50;
const MIN_FILES_PER_PAGE = 1;
const MAX_FILES_PER_PAGE = 5000;

const settingsButton = document.querySelector("#open-settings");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const cancelButton = document.querySelector("#settings-cancel");
const cancelX = document.querySelector("#settings-cancel-x");
const statusElement = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");

const launchModeInput = document.querySelector("#launch-mode");
const showImagesInput = document.querySelector("#show-images");
const showVideosInput = document.querySelector("#show-videos");
const showOtherFilesInput = document.querySelector("#show-other-files");
const showDirectoriesInput = document.querySelector("#show-directories");
const directoryPositionInput = document.querySelector("#directory-position");
const listModeInput = document.querySelector("#directory-list-mode");
const filesPerPageInput = document.querySelector("#files-per-page");
const showThumbnailsInput = document.querySelector("#show-thumbnails");
const videoThumbnailsInput = document.querySelector("#video-thumbnails");
const thumbnailSizeInput = document.querySelector("#thumbnail-size");
const thumbnailSizeValue = document.querySelector("#thumbnail-size-value");
const thumbnailDragModeInput = document.querySelector("#thumbnail-drag-mode");
const presetButtons = [...document.querySelectorAll("[data-visibility-preset]")];

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

function clampFilesPerPage(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_FILES_PER_PAGE;
  return Math.min(MAX_FILES_PER_PAGE, Math.max(MIN_FILES_PER_PAGE, number));
}

function syncDraftUi() {
  if (thumbnailSizeValue && thumbnailSizeInput) {
    thumbnailSizeValue.textContent = `${clampThumbnailSize(thumbnailSizeInput.value)}px`;
  }

  if (directoryPositionInput && showDirectoriesInput) {
    directoryPositionInput.disabled = !showDirectoriesInput.checked;
  }

  if (filesPerPageInput && listModeInput) {
    filesPerPageInput.disabled = listModeInput.value === "all";
  }

  if (videoThumbnailsInput && showThumbnailsInput && showVideosInput) {
    videoThumbnailsInput.disabled = !showThumbnailsInput.checked || !showVideosInput.checked;
  }
}

async function visibilityFromStorage() {
  const [images, videos, other, directories, legacyView] = await Promise.all([
    readStored(SHOW_IMAGES_KEY),
    readStored(SHOW_VIDEOS_KEY),
    readStored(SHOW_OTHER_FILES_KEY),
    readStored(SHOW_DIRECTORIES_KEY),
    readStored(LEGACY_VIEW_MODE_KEY)
  ]);

  const hasNewVisibility = [images, videos, other, directories]
    .some((value) => typeof value === "boolean");

  if (!hasNewVisibility && legacyView === "images") {
    return {
      images: true,
      videos: false,
      other: false,
      directories: false
    };
  }

  return {
    images: images !== false,
    videos: videos !== false,
    other: other !== false,
    directories: directories !== false
  };
}

async function loadSettingsIntoForm() {
  const visibility = await visibilityFromStorage();

  if (launchModeInput) {
    launchModeInput.value = (await readStored(LAUNCH_MODE_KEY)) === "window"
      ? "window"
      : "panel";
  }

  if (showImagesInput) showImagesInput.checked = visibility.images;
  if (showVideosInput) showVideosInput.checked = visibility.videos;
  if (showOtherFilesInput) showOtherFilesInput.checked = visibility.other;
  if (showDirectoriesInput) showDirectoriesInput.checked = visibility.directories;

  if (directoryPositionInput) {
    directoryPositionInput.value = (await readStored(DIRECTORY_POSITION_KEY)) === "bottom"
      ? "bottom"
      : "top";
  }

  if (listModeInput) {
    listModeInput.value = (await readStored(LIST_MODE_KEY)) === "all"
      ? "all"
      : "paged";
  }

  if (filesPerPageInput) {
    filesPerPageInput.value = String(clampFilesPerPage(
      (await readStored(FILES_PER_PAGE_KEY)) ?? DEFAULT_FILES_PER_PAGE
    ));
  }

  if (showThumbnailsInput) {
    showThumbnailsInput.checked = (await readStored(THUMBNAILS_KEY)) !== false;
  }

  if (videoThumbnailsInput) {
    videoThumbnailsInput.checked = (await readStored(VIDEO_THUMBNAILS_KEY)) !== false;
  }

  if (thumbnailSizeInput) {
    thumbnailSizeInput.value = String(clampThumbnailSize(
      (await readStored(THUMBNAIL_SIZE_KEY)) ?? 48
    ));
  }

  if (thumbnailDragModeInput) {
    thumbnailDragModeInput.value = (await readStored(THUMBNAIL_DRAG_KEY)) === "thumbnail"
      ? "thumbnail"
      : "original";
  }

  syncDraftUi();
}

function applyVisibilityPreset(preset) {
  const next = {
    everything: [true, true, true, true],
    media: [true, true, false, false],
    images: [true, false, false, false],
    videos: [false, true, false, false],
    folders: [false, false, false, true]
  }[preset];

  if (!next) return;
  const [images, videos, other, directories] = next;
  if (showImagesInput) showImagesInput.checked = images;
  if (showVideosInput) showVideosInput.checked = videos;
  if (showOtherFilesInput) showOtherFilesInput.checked = other;
  if (showDirectoriesInput) showDirectoriesInput.checked = directories;
  syncDraftUi();
}

function preserveCurrentPathForReload() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return;

  const parts = text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return;

  try {
    sessionStorage.setItem(RESTORE_PATH_KEY, JSON.stringify(parts.slice(1)));
  } catch {}
}

async function applySettings() {
  const launchMode = launchModeInput?.value === "window" ? "window" : "panel";
  const directoryPosition = directoryPositionInput?.value === "bottom" ? "bottom" : "top";
  const listMode = listModeInput?.value === "all" ? "all" : "paged";
  const filesPerPage = clampFilesPerPage(filesPerPageInput?.value ?? DEFAULT_FILES_PER_PAGE);
  const thumbnailSize = clampThumbnailSize(thumbnailSizeInput?.value ?? 48);
  const thumbnailDragMode = thumbnailDragModeInput?.value === "thumbnail"
    ? "thumbnail"
    : "original";

  await Promise.all([
    writeStored(LAUNCH_MODE_KEY, launchMode),
    writeStored(LEGACY_VIEW_MODE_KEY, "all"),
    writeStored(SHOW_IMAGES_KEY, Boolean(showImagesInput?.checked)),
    writeStored(SHOW_VIDEOS_KEY, Boolean(showVideosInput?.checked)),
    writeStored(SHOW_OTHER_FILES_KEY, Boolean(showOtherFilesInput?.checked)),
    writeStored(SHOW_DIRECTORIES_KEY, Boolean(showDirectoriesInput?.checked)),
    writeStored(DIRECTORY_POSITION_KEY, directoryPosition),
    writeStored(LIST_MODE_KEY, listMode),
    writeStored(FILES_PER_PAGE_KEY, filesPerPage),
    writeStored(THUMBNAILS_KEY, Boolean(showThumbnailsInput?.checked)),
    writeStored(VIDEO_THUMBNAILS_KEY, Boolean(videoThumbnailsInput?.checked)),
    writeStored(THUMBNAIL_SIZE_KEY, thumbnailSize),
    writeStored(THUMBNAIL_DRAG_KEY, thumbnailDragMode)
  ]);

  try {
    await chrome.runtime.sendMessage({
      type: "filechute-launch-mode-changed",
      launchMode
    });
  } catch {}

  preserveCurrentPathForReload();
  settingsDialog?.close("ok");
  setStatus("Applying FileChute settings…");
  location.reload();
}

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    applyVisibilityPreset(button.dataset.visibilityPreset || "");
  });
}

for (const control of [
  showImagesInput,
  showVideosInput,
  showOtherFilesInput,
  showDirectoriesInput,
  listModeInput,
  showThumbnailsInput,
  videoThumbnailsInput,
  thumbnailSizeInput
]) {
  control?.addEventListener("input", syncDraftUi);
  control?.addEventListener("change", syncDraftUi);
}

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
