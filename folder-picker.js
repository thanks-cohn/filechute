import { writeStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const chooseRootButton = document.querySelector("#choose-root");
const statusElement = document.querySelector("#status");

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function choosePicturesFirst() {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error("This Chromium build does not expose the File System Access directory picker.");
  }

  try {
    return await window.showDirectoryPicker({ mode: "readwrite", startIn: "pictures" });
  } catch (error) {
    // Older Chromium derivatives may implement showDirectoryPicker without the
    // well-known startIn hint. Only fall back when the option itself is the
    // problem; cancellation should remain cancellation.
    if (error?.name === "AbortError") throw error;
    try {
      return await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

chooseRootButton?.addEventListener("click", (event) => {
  // FileChute owns folder selection here so the older sidepanel listener does
  // not open a second picker. This runs in capture phase before that listener.
  event.preventDefault();
  event.stopImmediatePropagation();

  void (async () => {
    try {
      const handle = await choosePicturesFirst();
      if (!handle) return;
      await writeStored(ROOT_HANDLE_KEY, handle);
      setStatus(`Opening ${handle.name}…`);

      // Keep the directory grant in the current document. Some Chromium/Windows
      // combinations return a freshly granted handle to "prompt" after a forced
      // side-panel reload, which trapped FileChute in a reconnect loop.
      window.dispatchEvent(new CustomEvent("filechute:root-handle-ready", {
        detail: { handle }
      }));
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error("FileChute folder picker failed", error);
      setStatus(error?.message || "Could not choose that folder.", true);
    }
  })();
}, true);
