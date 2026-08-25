import {
  chooseExternalMetadataDirectory,
  externalMetadataStatus,
  setExternalMetadataEnabled
} from "./metadata-store.js";
import {
  chooseExternalThumbnailDirectory,
  externalThumbnailStatus,
  setExternalThumbnailEnabled
} from "./thumbnail-store.js";

const metadataToggle = document.querySelector("#metadata-local-enabled");
const thumbnailToggle = document.querySelector("#thumbnail-local-enabled");
const metadataButton = document.querySelector("#metadata-local-location");
const thumbnailButton = document.querySelector("#thumbnail-local-location");
const statusElement = document.querySelector("#status");

let metadataState = null;
let thumbnailState = null;
let busy = false;

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function localLabel(kind, state) {
  const name = state?.name || `${kind} folder`;
  if (!state?.enabled) {
    return state?.configured
      ? `${kind}: browser only · ${name} remembered`
      : `${kind}: browser only`;
  }
  if (!state?.configured) return `${kind}: choose local folder`;
  if (!state?.available) return `${kind}: reconnect ${name}`;
  return `${kind}: ${name}`;
}

function syncUi() {
  if (metadataToggle) {
    metadataToggle.checked = Boolean(metadataState?.enabled);
    metadataToggle.disabled = busy;
  }
  if (thumbnailToggle) {
    thumbnailToggle.checked = Boolean(thumbnailState?.enabled);
    thumbnailToggle.disabled = busy;
  }

  if (metadataButton) {
    metadataButton.textContent = localLabel("Metadata", metadataState);
    metadataButton.disabled = busy || !metadataState?.enabled;
  }
  if (thumbnailButton) {
    thumbnailButton.textContent = localLabel("Thumbs", thumbnailState);
    thumbnailButton.disabled = busy || !thumbnailState?.enabled;
  }

  document.body.classList.toggle(
    "filechute-auto-local-save",
    Boolean(metadataState?.enabled || thumbnailState?.enabled)
  );
}

async function refresh() {
  [metadataState, thumbnailState] = await Promise.all([
    externalMetadataStatus(),
    externalThumbnailStatus()
  ]);
  syncUi();
}

function permissionRequestFromGesture(state) {
  if (!state?.handle || state.available) return null;
  try {
    return state.handle.requestPermission({ mode: "readwrite" });
  } catch {
    return null;
  }
}

async function enableMetadataFromGesture() {
  if (metadataState?.configured) {
    const permissionPromise = permissionRequestFromGesture(metadataState);
    if (permissionPromise) {
      const result = await permissionPromise;
      if (result !== "granted") throw new Error("Chromium did not grant access to the remembered metadata folder.");
    }
    await setExternalMetadataEnabled(true);
    setStatus(`Metadata will save automatically to ${metadataState.name}.`);
    return;
  }

  const handle = await chooseExternalMetadataDirectory();
  if (!handle) throw new Error("No metadata folder was selected.");
  setStatus(`Metadata will save automatically to ${handle.name}.`);
}

async function enableThumbnailsFromGesture() {
  if (thumbnailState?.configured) {
    const permissionPromise = permissionRequestFromGesture(thumbnailState);
    if (permissionPromise) {
      const result = await permissionPromise;
      if (result !== "granted") throw new Error("Chromium did not grant access to the remembered thumbnail folder.");
    }
    await setExternalThumbnailEnabled(true);
    setStatus(`Generated thumbnails will save automatically to ${thumbnailState.name}.`);
    return;
  }

  const handle = await chooseExternalThumbnailDirectory();
  if (!handle) throw new Error("No thumbnail folder was selected.");
  setStatus(`Generated thumbnails will save automatically to ${handle.name}.`);
}

async function runSettingChange(action, fallbackMessage) {
  if (busy) return;
  busy = true;
  syncUi();
  try {
    await action();
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(fallbackMessage, error);
      setStatus(error?.message || fallbackMessage, true);
    }
  } finally {
    busy = false;
    await refresh();
  }
}

metadataToggle?.addEventListener("change", () => {
  if (!metadataToggle.checked) {
    void runSettingChange(async () => {
      await setExternalMetadataEnabled(false);
      setStatus("Metadata storage is browser only. The previous local folder stays remembered in case you turn it back on.");
    }, "Could not switch metadata storage to browser only.");
    return;
  }

  void runSettingChange(enableMetadataFromGesture, "Could not enable local metadata storage.");
});

thumbnailToggle?.addEventListener("change", () => {
  if (!thumbnailToggle.checked) {
    void runSettingChange(async () => {
      await setExternalThumbnailEnabled(false);
      setStatus("Thumbnail storage is browser only. The previous local folder stays remembered in case you turn it back on.");
    }, "Could not switch thumbnail storage to browser only.");
    return;
  }

  void runSettingChange(enableThumbnailsFromGesture, "Could not enable local thumbnail storage.");
});

metadataButton?.addEventListener("click", () => {
  if (!metadataState?.enabled || busy) return;

  if (metadataState.configured && !metadataState.available) {
    const permissionPromise = permissionRequestFromGesture(metadataState);
    void runSettingChange(async () => {
      const result = permissionPromise ? await permissionPromise : "denied";
      if (result !== "granted") throw new Error("Chromium did not restore access to the remembered metadata folder.");
      await setExternalMetadataEnabled(true);
      setStatus(`Metadata is reconnected to ${metadataState.name}.`);
    }, "Could not reconnect the metadata folder.");
    return;
  }

  void runSettingChange(async () => {
    const handle = await chooseExternalMetadataDirectory();
    if (!handle) return;
    setStatus(`Metadata will save automatically to ${handle.name}.`);
  }, "Could not choose a metadata folder.");
});

thumbnailButton?.addEventListener("click", () => {
  if (!thumbnailState?.enabled || busy) return;

  if (thumbnailState.configured && !thumbnailState.available) {
    const permissionPromise = permissionRequestFromGesture(thumbnailState);
    void runSettingChange(async () => {
      const result = permissionPromise ? await permissionPromise : "denied";
      if (result !== "granted") throw new Error("Chromium did not restore access to the remembered thumbnail folder.");
      await setExternalThumbnailEnabled(true);
      setStatus(`Thumbnails are reconnected to ${thumbnailState.name}.`);
    }, "Could not reconnect the thumbnail folder.");
    return;
  }

  void runSettingChange(async () => {
    const handle = await chooseExternalThumbnailDirectory();
    if (!handle) return;
    setStatus(`Generated thumbnails will save automatically to ${handle.name}.`);
  }, "Could not choose a thumbnail folder.");
});

void refresh().catch((error) => {
  console.error("Could not initialize FileChute durable storage settings", error);
});
