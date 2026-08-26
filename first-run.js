import { readStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";

const statusElement = document.querySelector("#status");
const entriesElement = document.querySelector("#entries");
const chooseRootButton = document.querySelector("#choose-root");

let rootReconnectRendering = false;

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
  setStatus("This Chromium build does not expose the File System Access API Chute needs.", true);
  if (entriesElement) {
    entriesElement.innerHTML = '<div class="empty">Chute needs a modern desktop Chromium browser with the File System Access API enabled. Update the browser or check whether an administrator policy disabled local file access.</div>';
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
    message.textContent = `Chute remembers “${root.name || "your folder"}”. Chromium only needs permission restored.`;

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


if (!showCompatibilityFailure()) {
  const observer = new MutationObserver(() => void renderRootReconnect());
  if (entriesElement) observer.observe(entriesElement, { childList: true, subtree: true });
  setTimeout(() => void renderRootReconnect(), 50);
  setTimeout(() => void renderRootReconnect(), 250);
}
