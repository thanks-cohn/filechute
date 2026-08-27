import "./image-background-remove.js";
import { readStored } from "./storage.js";
import {
  externalMetadataStatus,
  getExternalMetadataDirectory
} from "./metadata-store.js";
import {
  externalThumbnailStatus,
  getExternalThumbnailDirectory
} from "./thumbnail-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";

const statusElement = document.querySelector("#status");
const entriesElement = document.querySelector("#entries");
const chooseRootButton = document.querySelector("#choose-root");
const metadataLocationButton = document.querySelector("#metadata-location");
const thumbnailLocationButton = document.querySelector("#thumbnail-location");

let rootReconnectRendering = false;
let metadataReconnectFailed = false;
let thumbnailReconnectFailed = false;

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
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

function showCompatibilityFailure() {
  if (typeof window.showDirectoryPicker === "function") return false;
  setStatus("This Chromium build does not expose the File System Access API FileChute needs.", true);
  if (entriesElement) {
    entriesElement.innerHTML = '<div class="empty">FileChute needs a modern desktop Chromium browser with the File System Access API enabled. Update the browser or check whether an administrator policy disabled local file access.</div>';
  }
  if (chooseRootButton) chooseRootButton.disabled = true;
  return true;
}

async function renderInitialFolderChoice() {
  if (!entriesElement || showCompatibilityFailure()) return;
  const root = await readStored(ROOT_HANDLE_KEY);
  if (root) return;
  const empty = entriesElement.querySelector(".empty");
  if (!empty || empty.dataset.filechuteFirstRun === "true") return;

  empty.dataset.filechuteFirstRun = "true";
  empty.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = "Choose your FileChute folder";

  const explanation = document.createElement("div");
  explanation.style.marginTop = "8px";
  explanation.textContent = "FileChute will remember the folder you approve so normal launches do not keep asking again.";

  const recommendation = document.createElement("div");
  recommendation.style.marginTop = "8px";
  recommendation.style.opacity = "0.75";
  recommendation.textContent = "No preference? Use your Screenshots folder (usually inside Pictures). The picker opens in Pictures when Chromium supports it.";

  empty.append(title, explanation, recommendation);
  if (chooseRootButton) {
    chooseRootButton.textContent = "Choose FileChute folder";
    chooseRootButton.title = "Choose once; FileChute remembers this folder";
  }
  setStatus("Choose a folder once. FileChute will remember it.");
}

async function renderRootReconnect() {
  if (rootReconnectRendering || !entriesElement || showCompatibilityFailure()) return;
  rootReconnectRendering = true;
  try {
    const root = await readStored(ROOT_HANDLE_KEY);
    if (!root || await queryPermission(root)) return;
    if (document.querySelector("#filechute-reconnect-root")) return;

    const empty = entriesElement.querySelector(".empty");
    if (!empty) return;

    empty.replaceChildren();
    const message = document.createElement("div");
    message.textContent = `FileChute remembers “${root.name || "your folder"}”. Chromium only needs permission restored.`;

    const reconnect = document.createElement("button");
    reconnect.id = "filechute-reconnect-root";
    reconnect.type = "button";
    reconnect.className = "primary";
    reconnect.style.marginTop = "12px";
    reconnect.textContent = `Reconnect ${root.name || "folder"}`;

    const chooseDifferent = document.createElement("div");
    chooseDifferent.style.marginTop = "9px";
    chooseDifferent.style.opacity = "0.72";
    chooseDifferent.textContent = "Or use Choose folder above to select a different root.";

    reconnect.addEventListener("click", async () => {
      reconnect.disabled = true;
      reconnect.textContent = "Waiting for Chromium…";
      if (await requestPermission(root)) {
        setStatus(`Reconnected ${root.name || "folder"}.`);
        location.reload();
        return;
      }
      reconnect.disabled = false;
      reconnect.textContent = `Reconnect ${root.name || "folder"}`;
      setStatus("Chromium did not restore that folder permission. You can try again or choose a different folder.", true);
    });

    empty.append(message, reconnect, chooseDifferent);
    if (chooseRootButton) chooseRootButton.textContent = "Choose different folder";
  } finally {
    rootReconnectRendering = false;
  }
}

metadataLocationButton?.addEventListener("click", async (event) => {
  const labelSaysReconnect = metadataLocationButton.textContent?.includes("reconnect");
  if (!labelSaysReconnect || metadataReconnectFailed) {
    metadataReconnectFailed = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  const status = await externalMetadataStatus();
  if (!status.configured || status.available) {
    metadataLocationButton.textContent = status.configured ? `Metadata: ${status.name}` : "Metadata: browser only";
    return;
  }

  const handle = await getExternalMetadataDirectory({ request: true });
  if (handle) {
    metadataLocationButton.textContent = `Metadata: ${handle.name}`;
    setStatus(`Reconnected metadata folder ${handle.name}.`);
    return;
  }

  metadataReconnectFailed = true;
  metadataLocationButton.textContent = "Metadata: choose new folder";
  setStatus("Metadata permission was not restored. Click the storage button again to choose a replacement folder.", true);
}, true);

thumbnailLocationButton?.addEventListener("click", async (event) => {
  const labelSaysReconnect = thumbnailLocationButton.textContent?.includes("reconnect");
  if (!labelSaysReconnect || thumbnailReconnectFailed) {
    thumbnailReconnectFailed = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  const status = await externalThumbnailStatus();
  if (!status.configured || status.available) {
    thumbnailLocationButton.textContent = status.configured ? `Thumbs: ${status.name}` : "Thumbs: browser only";
    return;
  }

  const handle = await getExternalThumbnailDirectory({ request: true });
  if (handle) {
    thumbnailLocationButton.textContent = `Thumbs: ${handle.name}`;
    setStatus(`Reconnected thumbnail folder ${handle.name}.`);
    return;
  }

  thumbnailReconnectFailed = true;
  thumbnailLocationButton.textContent = "Thumbs: choose new folder";
  setStatus("Thumbnail permission was not restored. Click the storage button again to choose a replacement folder.", true);
}, true);

if (!showCompatibilityFailure()) {
  const observer = new MutationObserver(() => {
    void renderInitialFolderChoice();
    void renderRootReconnect();
  });
  if (entriesElement) observer.observe(entriesElement, { childList: true, subtree: true });
  setTimeout(() => { void renderInitialFolderChoice(); void renderRootReconnect(); }, 50);
  setTimeout(() => { void renderInitialFolderChoice(); void renderRootReconnect(); }, 250);
}