import { readStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const RESIZED_FOLDER = "resized";

const entries = document.querySelector("#entries");
const statusElement = document.querySelector("#status");

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function numberOrNull(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function originalDimensions() {
  const text = String(document.querySelector("#resize-v3-name")?.textContent || "");
  const match = text.match(/(\d+)\s*[×x]\s*(\d+)/i);
  if (!match) return null;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  return width > 0 && height > 0 ? { width, height } : null;
}

function maintainAspectEnabled() {
  return document.querySelector("#resize-v3-aspect")?.checked !== false;
}

function updateDimensionHints() {
  const width = document.querySelector("#resize-v3-width");
  const height = document.querySelector("#resize-v3-height");
  if (!(width instanceof HTMLInputElement) || !(height instanceof HTMLInputElement)) return;

  // FileChute performs the pair validation itself so either field can be blank
  // when aspect ratio is preserved.
  width.required = false;
  height.required = false;
  width.placeholder = maintainAspectEnabled() ? "auto" : "required";
  height.placeholder = maintainAspectEnabled() ? "auto" : "required";
}

function prepareSingleDimensionSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "resize-v3-form") return;

  const widthInput = form.querySelector("#resize-v3-width");
  const heightInput = form.querySelector("#resize-v3-height");
  if (!(widthInput instanceof HTMLInputElement) || !(heightInput instanceof HTMLInputElement)) return;

  const width = numberOrNull(widthInput.value);
  const height = numberOrNull(heightInput.value);
  const preserve = maintainAspectEnabled();

  if (!preserve) {
    if (!width || !height) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus("Enter both width and height when aspect ratio is not preserved.", true);
    }
    return;
  }

  if (!width && !height) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus("Enter a width or a height. FileChute will calculate the other side automatically.", true);
    return;
  }

  if (width && height) return;

  const source = originalDimensions();
  if (!source) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus("FileChute could not read the original aspect ratio. Enter both dimensions for this resize.", true);
    return;
  }

  if (width && !height) {
    heightInput.value = String(Math.max(1, Math.round(width * source.height / source.width)));
  } else if (height && !width) {
    widthInput.value = String(Math.max(1, Math.round(height * source.width / source.height)));
  }

  // Let image-resize-v3's existing submit handler continue with the completed pair.
}

function rowPath(row) {
  return String(row?.querySelector(".entry-path")?.textContent || "").trim();
}

async function rootWithReadPermission() {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") return null;
  try {
    const state = await root.queryPermission({ mode: "read" });
    return state === "granted" ? root : null;
  } catch {
    return null;
  }
}

async function resizedDirectoryForRow(row) {
  const root = await rootWithReadPermission();
  if (!root) throw new Error("FileChute needs access to the remembered root folder.");

  let parts = rowPath(row).split("/").map((part) => part.trim()).filter(Boolean);
  if (parts[0]?.toLowerCase() === String(root.name || "").toLowerCase()) parts = parts.slice(1);
  if (!parts.length) throw new Error("FileChute could not resolve this image location.");
  parts.pop(); // filename

  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part);

  if (directory.name?.toLowerCase() === RESIZED_FOLDER) {
    return { root, directory, parentParts: parts.slice(0, -1), targetParts: parts };
  }

  const resized = await directory.getDirectoryHandle(RESIZED_FOLDER);
  return { root, directory: resized, parentParts: parts, targetParts: [...parts, RESIZED_FOLDER] };
}

function visibleResizedDirectoryRow() {
  return [...(entries?.querySelectorAll(".entry.directory") || [])].find((row) => {
    const name = String(
      row.querySelector(".entry-name-text")?.textContent ||
      row.querySelector(".entry-name")?.textContent ||
      ""
    ).trim().toLowerCase();
    return name === RESIZED_FOLDER;
  }) || null;
}

async function openClosestSystemLocation(row) {
  let resolved;
  try {
    resolved = await resizedDirectoryForRow(row);
  } catch (error) {
    if (error?.name === "NotFoundError") {
      setStatus("No resized/ folder here yet. Resize an image first.");
      return;
    }
    throw error;
  }

  // Chromium does not expose an absolute OS path for a FileSystemHandle, so a
  // dependency-free extension cannot launch Dolphin or reveal/select the file
  // there. The closest system UI is the native open-file picker, started in
  // the exact resized/ parent directory.
  if (typeof window.showOpenFilePicker === "function") {
    try {
      setStatus(`Opening the system file picker at ${[resolved.root.name, ...resolved.targetParts].join("/")}…`);
      await window.showOpenFilePicker({
        startIn: resolved.directory,
        multiple: false,
        types: [{
          description: "Images",
          accept: {
            "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp"]
          }
        }]
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.debug("Native picker unavailable; opening resized/ inside FileChute instead", error);
    }
  }

  const visible = visibleResizedDirectoryRow();
  const name = visible?.querySelector(".entry-name");
  if (name instanceof HTMLElement) {
    name.click();
    setStatus("Opened resized/ inside FileChute.");
    return;
  }

  // Use FileChute's existing typed-location navigation without location.reload().
  const locationInput = document.querySelector(".filechute-location");
  const go = document.querySelector(".filechute-location-go");
  if (locationInput instanceof HTMLInputElement && go instanceof HTMLButtonElement) {
    locationInput.value = [resolved.root.name, ...resolved.targetParts].join("/");
    go.click();
    return;
  }

  setStatus("The resized/ folder exists, but this panel cannot navigate to it until the folder list is visible.", true);
}

function interceptResizedFolderButton(event) {
  const target = event.target instanceof Element ? event.target.closest(".filechute-output-folder-button") : null;
  if (!(target instanceof HTMLElement)) return;
  const row = target.closest(".entry");
  if (!(row instanceof HTMLElement)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  void openClosestSystemLocation(row).catch((error) => {
    console.error("FileChute could not open resized location", error);
    setStatus(error?.message || "Could not open the resized location.", true);
  });
}

function install() {
  updateDimensionHints();

  const form = document.querySelector("#resize-v3-form");
  if (form instanceof HTMLFormElement && form.dataset.filechuteSingleDimension !== "true") {
    form.dataset.filechuteSingleDimension = "true";
    form.addEventListener("submit", prepareSingleDimensionSubmit, true);
  }

  const aspect = document.querySelector("#resize-v3-aspect");
  if (aspect instanceof HTMLInputElement && aspect.dataset.filechuteDimensionHints !== "true") {
    aspect.dataset.filechuteDimensionHints = "true";
    aspect.addEventListener("change", updateDimensionHints);
  }
}

entries?.addEventListener("click", interceptResizedFolderButton, true);

install();
new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
