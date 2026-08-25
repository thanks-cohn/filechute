import { readStored, writeStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const MAINTAIN_ASPECT_KEY = "filechute-resize-maintain-aspect";
const DO_NOT_FILL_KEY = "filechute-resize-do-not-fill";
const FILL_COLOR_KEY = "filechute-resize-fill-color";

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"
]);

const entriesElement = document.querySelector("#entries");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const settingsButton = document.querySelector("#open-settings");
const settingsCancel = document.querySelector("#settings-cancel");
const settingsCancelX = document.querySelector("#settings-cancel-x");
const statusElement = document.querySelector("#status");

let maintainAspect = true;
let doNotFill = false;
let fillColor = "#000000";
let settingsSnapshot = null;
let resizeTarget = null;
let lastEditedDimension = "width";
let permissionSyncBusy = false;

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function extensionOf(name) {
  const value = String(name || "").toLowerCase();
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index + 1);
}

function stemOf(name) {
  const value = String(name || "image");
  const index = value.lastIndexOf(".");
  return index > 0 ? value.slice(0, index) : value;
}

function sanitizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#000000";
}

async function queryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

async function rootHandle({ request = false } = {}) {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") return null;
  if (await queryPermission(root)) return root;
  if (!request) return null;
  try {
    return (await root.requestPermission({ mode: "readwrite" })) === "granted" ? root : null;
  } catch {
    return null;
  }
}

function saveLikeControl(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.closest(".entry")) return false;
  if (!element.matches("button, a, [role='button']")) return false;
  if (element.classList.contains("filechute-resize-button")) return false;

  if (element.matches(
    ".entry-save, .image-save, .filechute-save-button, [data-filechute-save-action]"
  )) return true;

  const label = [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title")
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLocaleLowerCase();

  return /(^|\s)save(?:\s|$|\b)/i.test(label);
}

async function syncSaveButtons() {
  if (permissionSyncBusy || !entriesElement) return;
  permissionSyncBusy = true;
  try {
    const keepUsingFolder = Boolean(await rootHandle());
    document.body.classList.toggle("filechute-root-write-granted", keepUsingFolder);

    for (const control of entriesElement.querySelectorAll("button, a, [role='button']")) {
      if (!saveLikeControl(control)) continue;

      if (keepUsingFolder) {
        if (!control.hidden) control.dataset.filechuteAutoSaveHidden = "true";
        control.hidden = true;
        control.classList.add("filechute-auto-hidden-save");
        control.setAttribute("aria-hidden", "true");
        control.setAttribute("tabindex", "-1");
      } else if (control.dataset.filechuteAutoSaveHidden === "true") {
        control.hidden = false;
        control.classList.remove("filechute-auto-hidden-save");
        control.removeAttribute("aria-hidden");
        control.removeAttribute("tabindex");
        delete control.dataset.filechuteAutoSaveHidden;
      }
    }
  } finally {
    permissionSyncBusy = false;
  }
}

function injectStyles() {
  if (document.querySelector("style[data-filechute-image-resize]")) return;
  const style = document.createElement("style");
  style.dataset.filechuteImageResize = "true";
  style.textContent = `
    .filechute-entry-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 6px;
    }
    .filechute-entry-actions button {
      padding: 4px 7px;
      border-radius: 7px;
      font-size: 10px;
      line-height: 1.15;
    }
    .filechute-resize-button {
      min-width: 48px;
    }
    .filechute-auto-hidden-save {
      display: none !important;
    }
    .resize-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .resize-grid label {
      display: grid;
      gap: 6px;
      color: #d6dcd8;
      font-size: 11px;
    }
    .resize-grid input[type="number"] {
      width: 100%;
      border: 1px solid #343a37;
      border-radius: 9px;
      padding: 8px 9px;
      background: #202422;
      color: inherit;
    }
    .resize-summary {
      margin-top: 12px;
      padding: 9px 10px;
      border: 1px solid #303633;
      border-radius: 10px;
      color: #aab2ad;
      font-size: 11px;
      line-height: 1.45;
    }
    .resize-settings-color {
      width: 100%;
      min-height: 34px;
      padding: 3px;
      border: 1px solid #343a37;
      border-radius: 9px;
      background: #202422;
    }
    .resize-settings-color:disabled {
      opacity: .45;
    }
  `;
  document.head.append(style);
}

function makeSettingsSection() {
  if (document.querySelector("#filechute-resize-settings-section")) return;
  if (!settingsForm) return;

  const section = document.createElement("section");
  section.id = "filechute-resize-settings-section";
  section.className = "settings-section";
  section.innerHTML = `
    <h3>Image resize</h3>
    <p class="settings-note">Resize runs entirely inside FileChute. Originals are preserved and resized images are created as new files beside them.</p>
    <label class="setting-row checkbox-row">
      <span>Maintain aspect ratio</span>
      <input id="resize-maintain-aspect" type="checkbox" checked>
    </label>
    <label class="setting-row checkbox-row">
      <span>Do not fill</span>
      <input id="resize-do-not-fill" type="checkbox">
    </label>
    <label class="setting-stack" for="resize-fill-color">
      <span>Fill color</span>
      <input id="resize-fill-color" class="resize-settings-color" type="color" value="#000000">
      <small>Default: black. When aspect ratio is preserved and the requested width × height has a different shape, FileChute fills the unused space with this color. Turn on Do not fill to let the other side change instead.</small>
    </label>
  `;

  const durable = [...settingsForm.querySelectorAll(".settings-section")].find(
    (candidate) => candidate.querySelector("h3")?.textContent?.trim().toLocaleLowerCase() === "durable storage"
  );
  if (durable) durable.before(section);
  else settingsForm.querySelector(".dialog-actions")?.before(section);

  const aspectInput = section.querySelector("#resize-maintain-aspect");
  const noFillInput = section.querySelector("#resize-do-not-fill");
  const colorInput = section.querySelector("#resize-fill-color");

  const saveDraft = async () => {
    maintainAspect = Boolean(aspectInput?.checked);
    doNotFill = Boolean(noFillInput?.checked);
    fillColor = sanitizeColor(colorInput?.value);
    if (noFillInput) noFillInput.disabled = !maintainAspect;
    if (colorInput) colorInput.disabled = !maintainAspect || doNotFill;
    await Promise.all([
      writeStored(MAINTAIN_ASPECT_KEY, maintainAspect),
      writeStored(DO_NOT_FILL_KEY, doNotFill),
      writeStored(FILL_COLOR_KEY, fillColor)
    ]);
  };

  for (const control of [aspectInput, noFillInput, colorInput]) {
    control?.addEventListener("input", () => void saveDraft());
    control?.addEventListener("change", () => void saveDraft());
  }
}

function settingsInputs() {
  return {
    aspect: document.querySelector("#resize-maintain-aspect"),
    noFill: document.querySelector("#resize-do-not-fill"),
    color: document.querySelector("#resize-fill-color")
  };
}

function syncSettingsInputs() {
  const { aspect, noFill, color } = settingsInputs();
  if (aspect) aspect.checked = maintainAspect;
  if (noFill) {
    noFill.checked = doNotFill;
    noFill.disabled = !maintainAspect;
  }
  if (color) {
    color.value = fillColor;
    color.disabled = !maintainAspect || doNotFill;
  }
}

async function loadResizeSettings() {
  const [aspect, noFill, color] = await Promise.all([
    readStored(MAINTAIN_ASPECT_KEY),
    readStored(DO_NOT_FILL_KEY),
    readStored(FILL_COLOR_KEY)
  ]);
  maintainAspect = aspect !== false;
  doNotFill = noFill === true;
  fillColor = sanitizeColor(color);
  syncSettingsInputs();
}

async function beginSettingsDraft() {
  await loadResizeSettings();
  settingsSnapshot = { maintainAspect, doNotFill, fillColor };
}

async function restoreSettingsDraft() {
  if (!settingsSnapshot) return;
  maintainAspect = settingsSnapshot.maintainAspect;
  doNotFill = settingsSnapshot.doNotFill;
  fillColor = settingsSnapshot.fillColor;
  await Promise.all([
    writeStored(MAINTAIN_ASPECT_KEY, maintainAspect),
    writeStored(DO_NOT_FILL_KEY, doNotFill),
    writeStored(FILL_COLOR_KEY, fillColor)
  ]);
  syncSettingsInputs();
  settingsSnapshot = null;
}

function makeResizeDialog() {
  if (document.querySelector("#resize-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "resize-dialog";
  dialog.innerHTML = `
    <form id="resize-form" class="dialog-card">
      <div class="dialog-heading">
        <div>
          <h2>Resize image</h2>
          <p id="resize-image-name">Choose an output size.</p>
        </div>
        <button id="resize-close" class="dialog-close" type="button" aria-label="Cancel resize">×</button>
      </div>
      <div class="resize-grid">
        <label>Width
          <input id="resize-width" type="number" min="1" max="32767" step="1" inputmode="numeric" required>
        </label>
        <label>Height
          <input id="resize-height" type="number" min="1" max="32767" step="1" inputmode="numeric" required>
        </label>
      </div>
      <div id="resize-summary" class="resize-summary"></div>
      <div class="dialog-actions">
        <button id="resize-cancel" type="button">Cancel</button>
        <button id="resize-create" class="primary" type="submit">Create resized copy</button>
      </div>
    </form>
  `;
  document.body.append(dialog);

  const widthInput = dialog.querySelector("#resize-width");
  const heightInput = dialog.querySelector("#resize-height");
  widthInput?.addEventListener("input", () => dimensionEdited("width"));
  heightInput?.addEventListener("input", () => dimensionEdited("height"));
  dialog.querySelector("#resize-cancel")?.addEventListener("click", () => dialog.close("cancel"));
  dialog.querySelector("#resize-close")?.addEventListener("click", () => dialog.close("cancel"));
  dialog.querySelector("#resize-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void createResizedCopy();
  });
}

function resizeDialogElements() {
  const dialog = document.querySelector("#resize-dialog");
  return {
    dialog,
    width: dialog?.querySelector("#resize-width"),
    height: dialog?.querySelector("#resize-height"),
    name: dialog?.querySelector("#resize-image-name"),
    summary: dialog?.querySelector("#resize-summary"),
    create: dialog?.querySelector("#resize-create")
  };
}

function requestedDimensions() {
  const { width, height } = resizeDialogElements();
  return {
    width: Math.max(1, Math.min(32767, Number.parseInt(width?.value || "0", 10) || 0)),
    height: Math.max(1, Math.min(32767, Number.parseInt(height?.value || "0", 10) || 0))
  };
}

function outputPlan() {
  if (!resizeTarget) return null;
  const requested = requestedDimensions();
  const sourceWidth = resizeTarget.width;
  const sourceHeight = resizeTarget.height;

  if (!maintainAspect) {
    return {
      width: requested.width,
      height: requested.height,
      drawX: 0,
      drawY: 0,
      drawWidth: requested.width,
      drawHeight: requested.height,
      fill: false,
      mode: "stretch"
    };
  }

  if (doNotFill) {
    if (lastEditedDimension === "height") {
      const width = Math.max(1, Math.round(requested.height * sourceWidth / sourceHeight));
      return {
        width,
        height: requested.height,
        drawX: 0,
        drawY: 0,
        drawWidth: width,
        drawHeight: requested.height,
        fill: false,
        mode: "aspect"
      };
    }

    const height = Math.max(1, Math.round(requested.width * sourceHeight / sourceWidth));
    return {
      width: requested.width,
      height,
      drawX: 0,
      drawY: 0,
      drawWidth: requested.width,
      drawHeight: height,
      fill: false,
      mode: "aspect"
    };
  }

  const scale = Math.min(requested.width / sourceWidth, requested.height / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  return {
    width: requested.width,
    height: requested.height,
    drawX: Math.round((requested.width - drawWidth) / 2),
    drawY: Math.round((requested.height - drawHeight) / 2),
    drawWidth,
    drawHeight,
    fill: true,
    mode: "letterbox"
  };
}

function updateResizeSummary() {
  const { summary } = resizeDialogElements();
  const plan = outputPlan();
  if (!summary || !plan || !resizeTarget) return;

  if (!maintainAspect) {
    summary.textContent = `Output: ${plan.width} × ${plan.height}. Aspect ratio is not preserved; the image will be stretched to the requested size.`;
    return;
  }

  if (doNotFill) {
    summary.textContent = `Output: ${plan.width} × ${plan.height}. Aspect ratio is preserved and no padding is added.`;
    return;
  }

  summary.textContent = `Output: ${plan.width} × ${plan.height}. Aspect ratio is preserved; unused space is filled with ${fillColor}.`;
}

function dimensionEdited(which) {
  lastEditedDimension = which;
  if (maintainAspect && doNotFill && resizeTarget) {
    const { width, height } = resizeDialogElements();
    if (which === "width") {
      const value = Number.parseInt(width?.value || "0", 10);
      if (Number.isFinite(value) && value > 0 && height) {
        height.value = String(Math.max(1, Math.round(value * resizeTarget.height / resizeTarget.width)));
      }
    } else {
      const value = Number.parseInt(height?.value || "0", 10);
      if (Number.isFinite(value) && value > 0 && width) {
        width.value = String(Math.max(1, Math.round(value * resizeTarget.width / resizeTarget.height)));
      }
    }
  }
  updateResizeSummary();
}

async function resolveRowFile(row, { request = false } = {}) {
  const root = await rootHandle({ request });
  if (!root) throw new Error("FileChute needs write access to the remembered folder before it can resize this image.");

  const rawPath = String(row.querySelector(".entry-path")?.textContent || "").trim();
  let parts = rawPath.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts[0]?.toLocaleLowerCase() === String(root.name || "").toLocaleLowerCase()) parts = parts.slice(1);
  if (!parts.length) throw new Error("FileChute could not resolve this image path.");

  const fileName = parts.pop();
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part);
  const fileHandle = await directory.getFileHandle(fileName);
  return { root, directory, fileHandle, fileName, relativePath: rawPath };
}

async function openResize(row) {
  try {
    await loadResizeSettings();
    const resolved = await resolveRowFile(row, { request: true });
    const file = await resolved.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    if (!width || !height) throw new Error("Chromium could not read this image's dimensions.");

    resizeTarget = { ...resolved, file, width, height };
    lastEditedDimension = "width";

    const elements = resizeDialogElements();
    if (elements.width) elements.width.value = String(width);
    if (elements.height) elements.height.value = String(height);
    if (elements.name) elements.name.textContent = `${file.name} · ${width} × ${height}`;
    updateResizeSummary();
    elements.dialog?.showModal();
    elements.width?.focus();
    elements.width?.select();
    void syncSaveButtons();
  } catch (error) {
    console.error("FileChute image resize could not open", error);
    setStatus(error?.message || "Could not open image resize.", true);
  }
}

function outputEncoding(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type === "image/jpeg") return { type: "image/jpeg", ext: ".jpg", quality: 0.92 };
  if (type === "image/webp") return { type: "image/webp", ext: ".webp", quality: 0.92 };
  if (type === "image/png") return { type: "image/png", ext: ".png", quality: undefined };
  return { type: "image/png", ext: ".png", quality: undefined };
}

function canvasBlob(canvas, encoding) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Chromium could not encode the resized image.")),
      encoding.type,
      encoding.quality
    );
  });
}

async function uniqueOutputName(directory, requested) {
  const dot = requested.lastIndexOf(".");
  const stem = dot > 0 ? requested.slice(0, dot) : requested;
  const ext = dot > 0 ? requested.slice(dot) : "";

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? requested : `${stem} (${index + 1})${ext}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      throw error;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

async function createResizedCopy() {
  if (!resizeTarget) return;
  const { dialog, create } = resizeDialogElements();
  const plan = outputPlan();
  if (!plan || plan.width < 1 || plan.height < 1) {
    setStatus("Choose a valid resize width and height.", true);
    return;
  }

  if (plan.width > 32767 || plan.height > 32767) {
    setStatus("That image is larger than Chromium's safe canvas limit.", true);
    return;
  }

  if (create) {
    create.disabled = true;
    create.textContent = "Resizing…";
  }

  try {
    const current = await resolveRowFile(resizeTarget.row, { request: true });
    const file = await current.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = plan.width;
      canvas.height = plan.height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Chromium could not create a canvas for this resize.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      if (plan.fill) {
        context.fillStyle = fillColor;
        context.fillRect(0, 0, plan.width, plan.height);
      } else {
        context.clearRect(0, 0, plan.width, plan.height);
      }

      context.drawImage(
        bitmap,
        plan.drawX,
        plan.drawY,
        plan.drawWidth,
        plan.drawHeight
      );

      const encoding = outputEncoding(file);
      const blob = await canvasBlob(canvas, encoding);
      const requestedName = `${stemOf(file.name)}-resized-${plan.width}x${plan.height}${encoding.ext}`;
      const outputName = await uniqueOutputName(current.directory, requestedName);
      const outputHandle = await current.directory.getFileHandle(outputName, { create: true });
      const writable = await outputHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      setStatus(`Created ${outputName} beside the original.`);
      dialog?.close("ok");
      window.dispatchEvent(new CustomEvent("filechute:filesystem-changed"));
      resizeTarget = null;
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.error("FileChute image resize failed", error);
    setStatus(error?.message || "Could not resize this image.", true);
  } finally {
    if (create) {
      create.disabled = false;
      create.textContent = "Create resized copy";
    }
  }
}

function rowImageName(row) {
  return String(
    row.querySelector(".entry-name-text")?.textContent ||
    row.querySelector(".entry-name")?.textContent ||
    ""
  ).trim();
}

function decorateRows() {
  if (!entriesElement) return;
  for (const row of entriesElement.querySelectorAll(".entry:not(.directory)")) {
    const name = rowImageName(row);
    if (!IMAGE_EXTENSIONS.has(extensionOf(name))) continue;
    if (row.querySelector(".filechute-resize-button")) continue;

    const main = row.querySelector(".entry-main");
    if (!main) continue;
    let actions = main.querySelector(".filechute-entry-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "filechute-entry-actions";
      main.append(actions);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "filechute-resize-button";
    button.textContent = "Resize";
    button.title = `Resize ${name}`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openResize(row);
    });
    actions.append(button);
  }
}

async function initialize() {
  injectStyles();
  makeSettingsSection();
  makeResizeDialog();
  await loadResizeSettings();
  decorateRows();
  await syncSaveButtons();

  settingsButton?.addEventListener("click", () => void beginSettingsDraft());
  settingsCancel?.addEventListener("click", () => void restoreSettingsDraft(), true);
  settingsCancelX?.addEventListener("click", () => void restoreSettingsDraft(), true);
  settingsDialog?.addEventListener("close", () => {
    if (settingsDialog.returnValue === "ok") settingsSnapshot = null;
  });

  if (entriesElement) {
    const observer = new MutationObserver(() => {
      decorateRows();
      void syncSaveButtons();
    });
    observer.observe(entriesElement, { childList: true, subtree: true });
  }

  window.addEventListener("focus", () => void syncSaveButtons());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void syncSaveButtons();
  });
  setInterval(() => void syncSaveButtons(), 2000);
}

void initialize().catch((error) => {
  console.error("Could not initialize FileChute image resize", error);
});
