import { readStored, removeStored } from "./storage.js";
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

function announceRootHandle(handle) {
  window.dispatchEvent(new CustomEvent("filechute:root-handle-ready", {
    detail: { handle: handle || null }
  }));
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

    const forget = document.createElement("button");
    forget.id = "filechute-forget-root";
    forget.type = "button";
    forget.style.marginTop = "9px";
    forget.style.marginLeft = "8px";
    forget.textContent = "Forget remembered folder";

    const chooseDifferent = document.createElement("div");
    chooseDifferent.style.marginTop = "9px";
    chooseDifferent.style.opacity = "0.72";
    chooseDifferent.textContent = "Or use Choose folder above to select a different root.";

    reconnect.addEventListener("click", async () => {
      reconnect.disabled = true;
      reconnect.textContent = "Waiting for Chromium…";
      if (await requestPermission(root)) {
        setStatus(`Reconnected ${root.name || "folder"}.`);

        // Do not reload the side panel here. On Windows Chromium, a forced
        // reload can immediately turn the restored grant back into "prompt".
        // Hand the now-authorized live handle to the existing shelf instead.
        announceRootHandle(root);
        return;
      }
      reconnect.disabled = false;
      reconnect.textContent = `Reconnect ${root.name || "folder"}`;
      setStatus("Chromium did not restore that folder permission. Try again, choose a different folder, or forget this remembered folder.", true);
    });

    forget.addEventListener("click", async () => {
      forget.disabled = true;
      try {
        await removeStored(ROOT_HANDLE_KEY);
        announceRootHandle(null);
        if (chooseRootButton) chooseRootButton.textContent = "Choose folder";
        setStatus("Forgot the remembered folder. Choose a local folder to continue.");
      } catch (error) {
        console.error("Could not forget FileChute root folder", error);
        forget.disabled = false;
        setStatus("Could not forget the remembered folder.", true);
      }
    });

    empty.append(message, reconnect, forget, chooseDifferent);
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
  const observer = new MutationObserver(() => void renderRootReconnect());
  if (entriesElement) observer.observe(entriesElement, { childList: true, subtree: true });
  setTimeout(() => void renderRootReconnect(), 50);
  setTimeout(() => void renderRootReconnect(), 250);
}
