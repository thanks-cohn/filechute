import { readStored, writeStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const RESTORE_PATH_KEY = "filechute-restore-path-v1";
const ASPECT_KEY = "filechute-resize-maintain-aspect";
const NO_FILL_KEY = "filechute-resize-do-not-fill";
const COLOR_KEY = "filechute-resize-fill-color";
const RESIZED_FOLDER = "resized";
const IMAGE_EXTENSIONS = new Set(["jpg","jpeg","png","gif","webp","avif","bmp","svg","ico","apng"]);

const entries = document.querySelector("#entries");
const settingsForm = document.querySelector("#settings-form");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsButton = document.querySelector("#open-settings");
const settingsCancel = document.querySelector("#settings-cancel");
const settingsCancelX = document.querySelector("#settings-cancel-x");
const homeButton = document.querySelector("#home");
const statusElement = document.querySelector("#status");

let maintainAspect = true;
let doNotFill = false;
let fillColor = "#000000";
let settingsSnapshot = null;
let resizeTarget = null;
let lastEdited = "width";

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function ext(name) {
  const value = String(name || "").toLowerCase();
  const dot = value.lastIndexOf(".");
  return dot < 0 ? "" : value.slice(dot + 1);
}

function stem(name) {
  const value = String(name || "image");
  const dot = value.lastIndexOf(".");
  return dot > 0 ? value.slice(0, dot) : value;
}

function normalizeHex(value) {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text.toLowerCase()}`;
  return null;
}

async function getRoot({ request = false } = {}) {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") return null;
  try {
    if ((await root.queryPermission({ mode: "readwrite" })) === "granted") return root;
  } catch {}
  if (!request) return null;
  try {
    return (await root.requestPermission({ mode: "readwrite" })) === "granted" ? root : null;
  } catch {
    return null;
  }
}

function injectStyles() {
  if (document.querySelector("style[data-filechute-resize-v2]")) return;
  const style = document.createElement("style");
  style.dataset.chuteResizeV2 = "true";
  style.textContent = `
    .filechute-resize-actions{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:6px}
    .filechute-resize-actions button{padding:4px 7px;border-radius:7px;font-size:10px;line-height:1.15}
    .filechute-resize-button{min-width:48px}
    .filechute-location-button{width:28px;min-width:28px;padding-left:0!important;padding-right:0!important}
    .resize-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
    .resize-grid label{display:grid;gap:6px;color:#d6dcd8;font-size:11px}
    .resize-grid input[type=number],.resize-color-code{width:100%;border:1px solid #343a37;border-radius:9px;padding:8px 9px;background:#202422;color:inherit}
    .resize-summary{margin-top:12px;padding:9px 10px;border:1px solid #303633;border-radius:10px;color:#aab2ad;font-size:11px;line-height:1.45}
    .resize-color-row{display:grid;grid-template-columns:52px minmax(0,1fr);gap:8px;align-items:center}
    .resize-color-picker{width:52px;height:34px;padding:3px;border:1px solid #343a37;border-radius:9px;background:#202422}
    .resize-color-picker:disabled,.resize-color-code:disabled{opacity:.45}
  `;
  document.head.append(style);
}

function settingsInputs() {
  return {
    aspect: document.querySelector("#resize-v2-aspect"),
    noFill: document.querySelector("#resize-v2-no-fill"),
    picker: document.querySelector("#resize-v2-color-picker"),
    code: document.querySelector("#resize-v2-color-code")
  };
}

function syncSettingsUi() {
  const { aspect, noFill, picker, code } = settingsInputs();
  if (aspect) aspect.checked = maintainAspect;
  if (noFill) {
    noFill.checked = doNotFill;
    noFill.disabled = !maintainAspect;
  }
  if (picker) {
    picker.value = fillColor;
    picker.disabled = !maintainAspect || doNotFill;
  }
  if (code) {
    code.value = fillColor;
    code.disabled = !maintainAspect || doNotFill;
  }
}

async function persistSettings() {
  await Promise.all([
    writeStored(ASPECT_KEY, maintainAspect),
    writeStored(NO_FILL_KEY, doNotFill),
    writeStored(COLOR_KEY, fillColor)
  ]);
}

async function loadSettings() {
  const [aspect, noFill, color] = await Promise.all([
    readStored(ASPECT_KEY),
    readStored(NO_FILL_KEY),
    readStored(COLOR_KEY)
  ]);
  maintainAspect = aspect !== false;
  doNotFill = noFill === true;
  fillColor = normalizeHex(color) || "#000000";
  syncSettingsUi();
}

function makeSettingsSection() {
  if (!settingsForm || document.querySelector("#filechute-resize-v2-settings")) return;
  const section = document.createElement("section");
  section.id = "filechute-resize-v2-settings";
  section.className = "settings-section";
  section.innerHTML = `
    <h3>Image resize</h3>
    <p class="settings-note">Resizing stays local. Originals stay untouched and resized copies go into a <code>resized</code> subfolder.</p>
    <label class="setting-row checkbox-row"><span>Maintain aspect ratio</span><input id="resize-v2-aspect" type="checkbox" checked></label>
    <label class="setting-row checkbox-row"><span>Do not fill</span><input id="resize-v2-no-fill" type="checkbox"></label>
    <label class="setting-stack">
      <span>Fill color</span>
      <span class="resize-color-row">
        <input id="resize-v2-color-picker" class="resize-color-picker" type="color" value="#000000" aria-label="Fill color picker">
        <input id="resize-v2-color-code" class="resize-color-code" type="text" value="#000000" maxlength="7" spellcheck="false" aria-label="Fill color hex code" placeholder="#000000">
      </span>
      <small>Default: black. Enter a 6-digit hex code such as #000000 or choose a color. With Do not fill enabled, Chute changes the other dimension instead of padding.</small>
    </label>
  `;
  const durable = [...settingsForm.querySelectorAll(".settings-section")].find(
    (node) => node.querySelector("h3")?.textContent?.trim().toLowerCase() === "durable storage"
  );
  if (durable) durable.before(section);
  else settingsForm.querySelector(".dialog-actions")?.before(section);

  const { aspect, noFill, picker, code } = settingsInputs();
  const saveBasic = async () => {
    maintainAspect = Boolean(aspect?.checked);
    doNotFill = Boolean(noFill?.checked);
    syncSettingsUi();
    await persistSettings();
    updateSummary();
  };
  aspect?.addEventListener("change", () => void saveBasic());
  noFill?.addEventListener("change", () => void saveBasic());
  picker?.addEventListener("input", () => {
    fillColor = normalizeHex(picker.value) || "#000000";
    if (code) code.value = fillColor;
    void persistSettings();
    updateSummary();
  });
  code?.addEventListener("change", () => {
    const normalized = normalizeHex(code.value);
    if (!normalized) {
      code.value = fillColor;
      setStatus("Fill color must be a 6-digit hex code such as #000000.", true);
      return;
    }
    fillColor = normalized;
    if (picker) picker.value = fillColor;
    code.value = fillColor;
    void persistSettings();
    updateSummary();
  });
}

async function beginSettingsDraft() {
  await loadSettings();
  settingsSnapshot = { maintainAspect, doNotFill, fillColor };
}

async function restoreSettingsDraft() {
  if (!settingsSnapshot) return;
  ({ maintainAspect, doNotFill, fillColor } = settingsSnapshot);
  await persistSettings();
  syncSettingsUi();
  settingsSnapshot = null;
}

function makeDialog() {
  if (document.querySelector("#resize-v2-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "resize-v2-dialog";
  dialog.innerHTML = `
    <form id="resize-v2-form" class="dialog-card">
      <div class="dialog-heading"><div><h2>Resize image</h2><p id="resize-v2-name">Choose an output size.</p></div><button id="resize-v2-close" class="dialog-close" type="button" aria-label="Cancel resize">×</button></div>
      <div class="resize-grid">
        <label>Width<input id="resize-v2-width" type="number" min="1" max="32767" step="1" required></label>
        <label>Height<input id="resize-v2-height" type="number" min="1" max="32767" step="1" required></label>
      </div>
      <div id="resize-v2-summary" class="resize-summary"></div>
      <div class="dialog-actions"><button id="resize-v2-cancel" type="button">Cancel</button><button id="resize-v2-create" class="primary" type="submit">Create in resized/</button></div>
    </form>
  `;
  document.body.append(dialog);
  const width = dialog.querySelector("#resize-v2-width");
  const height = dialog.querySelector("#resize-v2-height");
  width?.addEventListener("input", () => dimensionEdited("width"));
  height?.addEventListener("input", () => dimensionEdited("height"));
  dialog.querySelector("#resize-v2-cancel")?.addEventListener("click", () => dialog.close("cancel"));
  dialog.querySelector("#resize-v2-close")?.addEventListener("click", () => dialog.close("cancel"));
  dialog.querySelector("#resize-v2-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void createCopy();
  });
}

function dialogElements() {
  const dialog = document.querySelector("#resize-v2-dialog");
  return {
    dialog,
    width: dialog?.querySelector("#resize-v2-width"),
    height: dialog?.querySelector("#resize-v2-height"),
    name: dialog?.querySelector("#resize-v2-name"),
    summary: dialog?.querySelector("#resize-v2-summary"),
    create: dialog?.querySelector("#resize-v2-create")
  };
}

function requested() {
  const { width, height } = dialogElements();
  return {
    width: Math.max(1, Math.min(32767, Number.parseInt(width?.value || "1", 10) || 1)),
    height: Math.max(1, Math.min(32767, Number.parseInt(height?.value || "1", 10) || 1))
  };
}

function plan() {
  if (!resizeTarget) return null;
  const out = requested();
  if (!maintainAspect) return { ...out, drawX: 0, drawY: 0, drawWidth: out.width, drawHeight: out.height, fill: false, mode: "stretch" };
  if (doNotFill) {
    if (lastEdited === "height") {
      const width = Math.max(1, Math.round(out.height * resizeTarget.width / resizeTarget.height));
      return { width, height: out.height, drawX: 0, drawY: 0, drawWidth: width, drawHeight: out.height, fill: false, mode: "aspect" };
    }
    const height = Math.max(1, Math.round(out.width * resizeTarget.height / resizeTarget.width));
    return { width: out.width, height, drawX: 0, drawY: 0, drawWidth: out.width, drawHeight: height, fill: false, mode: "aspect" };
  }
  const scale = Math.min(out.width / resizeTarget.width, out.height / resizeTarget.height);
  const drawWidth = Math.max(1, Math.round(resizeTarget.width * scale));
  const drawHeight = Math.max(1, Math.round(resizeTarget.height * scale));
  return {
    width: out.width,
    height: out.height,
    drawX: Math.round((out.width - drawWidth) / 2),
    drawY: Math.round((out.height - drawHeight) / 2),
    drawWidth,
    drawHeight,
    fill: true,
    mode: "letterbox"
  };
}

function updateSummary() {
  const { summary } = dialogElements();
  const output = plan();
  if (!summary || !output) return;
  if (!maintainAspect) summary.textContent = `Output: ${output.width} × ${output.height}. The image will be stretched.`;
  else if (doNotFill) summary.textContent = `Output: ${output.width} × ${output.height}. Aspect ratio is preserved with no fill.`;
  else summary.textContent = `Output: ${output.width} × ${output.height}. Aspect ratio is preserved and unused space is filled with ${fillColor}.`;
}

function dimensionEdited(which) {
  lastEdited = which;
  if (maintainAspect && doNotFill && resizeTarget) {
    const { width, height } = dialogElements();
    if (which === "width") {
      const value = Number.parseInt(width?.value || "0", 10);
      if (value > 0 && height) height.value = String(Math.max(1, Math.round(value * resizeTarget.height / resizeTarget.width)));
    } else {
      const value = Number.parseInt(height?.value || "0", 10);
      if (value > 0 && width) width.value = String(Math.max(1, Math.round(value * resizeTarget.width / resizeTarget.height)));
    }
  }
  updateSummary();
}

function rowPath(row) {
  return String(row?.querySelector(".entry-path")?.textContent || "").trim();
}

async function resolveRow(row, { request = false } = {}) {
  if (!(row instanceof HTMLElement)) throw new Error("Chute lost track of this image. Refresh the panel and try again.");
  const root = await getRoot({ request });
  if (!root) throw new Error("Chute needs write access to the remembered folder before it can resize this image.");
  const rawPath = rowPath(row);
  let parts = rawPath.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts[0]?.toLowerCase() === String(root.name || "").toLowerCase()) parts = parts.slice(1);
  if (!parts.length) throw new Error("Chute could not resolve this image path.");
  const fileName = parts.pop();
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part);
  const fileHandle = await directory.getFileHandle(fileName);
  return { row, root, directory, directoryParts: parts, fileHandle, fileName, rawPath };
}

async function openResize(row) {
  try {
    await loadSettings();
    const resolved = await resolveRow(row, { request: true });
    const file = await resolved.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    if (!width || !height) throw new Error("Chromium could not read this image's dimensions.");
    resizeTarget = { ...resolved, file, width, height };
    lastEdited = "width";
    const ui = dialogElements();
    if (ui.width) ui.width.value = String(width);
    if (ui.height) ui.height.value = String(height);
    if (ui.name) ui.name.textContent = `${file.name} · ${width} × ${height}`;
    updateSummary();
    ui.dialog?.showModal();
    ui.width?.focus();
    ui.width?.select();
  } catch (error) {
    console.error("Chute resize could not open", error);
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

async function numberedName(directory, sourceName, outputExt) {
  const base = stem(sourceName).replace(/-\d+$/, "");
  for (let number = 1; number < 100000; number += 1) {
    const candidate = `${base}-${number}${outputExt}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      throw error;
    }
  }
  return `${base}-${Date.now()}${outputExt}`;
}

async function outputDirectory(current) {
  if (current.directory.name?.toLowerCase() === RESIZED_FOLDER) return current.directory;
  return current.directory.getDirectoryHandle(RESIZED_FOLDER, { create: true });
}

async function createCopy() {
  if (!resizeTarget) return;
  const output = plan();
  const { dialog, create } = dialogElements();
  if (!output) return;
  if (create) {
    create.disabled = true;
    create.textContent = "Resizing…";
  }
  try {
    const current = await resolveRow(resizeTarget.row, { request: true });
    const file = await current.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = output.width;
      canvas.height = output.height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Chromium could not create a canvas for this resize.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (output.fill) {
        context.fillStyle = fillColor;
        context.fillRect(0, 0, output.width, output.height);
      } else {
        context.clearRect(0, 0, output.width, output.height);
      }
      context.drawImage(bitmap, output.drawX, output.drawY, output.drawWidth, output.drawHeight);
      const encoding = outputEncoding(file);
      const folder = await outputDirectory(current);
      const name = await numberedName(folder, file.name, encoding.ext);
      const handle = await folder.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(await canvasBlob(canvas, encoding));
      await writable.close();
      setStatus(`Created resized/${name}`);
      dialog?.close("ok");
      resizeTarget = null;
      window.dispatchEvent(new CustomEvent("chute:filesystem-changed"));
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.error("Chute image resize failed", error);
    setStatus(error?.message || "Could not resize this image.", true);
  } finally {
    if (create) {
      create.disabled = false;
      create.textContent = "Create in resized/";
    }
  }
}

async function openContainingFolder(row) {
  try {
    const resolved = await resolveRow(row, { request: false });
    sessionStorage.setItem(RESTORE_PATH_KEY, JSON.stringify(resolved.directoryParts));
    homeButton?.click();
    setTimeout(() => location.reload(), 60);
  } catch (error) {
    setStatus(error?.message || "Could not open that location.", true);
  }
}

function rowName(row) {
  return String(row.querySelector(".entry-name-text")?.textContent || row.querySelector(".entry-name")?.textContent || "").trim();
}

function decorateRows() {
  if (!entries) return;
  for (const row of entries.querySelectorAll(".entry:not(.directory)")) {
    const name = rowName(row);
    if (!IMAGE_EXTENSIONS.has(ext(name))) continue;
    const main = row.querySelector(".entry-main");
    if (!main) continue;
    let actions = main.querySelector(".filechute-resize-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "filechute-resize-actions";
      main.append(actions);
    }
    if (!actions.querySelector(".filechute-resize-button")) {
      const resize = document.createElement("button");
      resize.type = "button";
      resize.className = "filechute-resize-button";
      resize.textContent = "Resize";
      resize.title = `Resize ${name}`;
      resize.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openResize(row);
      });
      actions.append(resize);
    }
    if (!actions.querySelector(".filechute-location-button")) {
      const folder = document.createElement("button");
      folder.type = "button";
      folder.className = "filechute-location-button";
      folder.textContent = "📁";
      folder.title = `Open the folder containing ${name}`;
      folder.setAttribute("aria-label", folder.title);
      folder.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openContainingFolder(row);
      });
      actions.append(folder);
    }
  }
}

async function initialize() {
  injectStyles();
  makeSettingsSection();
  makeDialog();
  await loadSettings();
  decorateRows();
  settingsButton?.addEventListener("click", () => void beginSettingsDraft());
  settingsCancel?.addEventListener("click", () => void restoreSettingsDraft(), true);
  settingsCancelX?.addEventListener("click", () => void restoreSettingsDraft(), true);
  settingsDialog?.addEventListener("close", () => {
    if (settingsDialog.returnValue === "ok") settingsSnapshot = null;
  });
  if (entries) {
    new MutationObserver(decorateRows).observe(entries, { childList: true, subtree: true });
  }
}

void initialize().catch((error) => {
  console.error("Could not initialize Chute image resize", error);
});
