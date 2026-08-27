import { readStored, writeStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const BG_SENSITIVITY_KEY = "filechute-bg-remove-sensitivity";
const BG_FEATHER_KEY = "filechute-bg-remove-feather";
const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"
]);
const PREVIEW_MAX = 420;
const MASK_MAX = 2200;

const entriesElement = document.querySelector("#entries");
const statusElement = document.querySelector("#status");

let target = null;
let previewTimer = null;
let sensitivity = 48;
let feather = 7;

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
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

function rowImageName(row) {
  return String(
    row.querySelector(".entry-name-text")?.textContent ||
    row.querySelector(".entry-name")?.textContent ||
    ""
  ).trim();
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

async function resolveRowFile(row, { request = false } = {}) {
  const root = await rootHandle({ request });
  if (!root) throw new Error("Reconnect your FileChute folder before removing a background.");

  const rawPath = String(row.querySelector(".entry-path")?.textContent || "").trim();
  let parts = rawPath.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts[0]?.toLocaleLowerCase() === String(root.name || "").toLocaleLowerCase()) parts = parts.slice(1);
  if (!parts.length) throw new Error("FileChute could not resolve this image path.");

  const fileName = parts.pop();
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part);
  const fileHandle = await directory.getFileHandle(fileName);
  return { directory, fileHandle, fileName, relativePath: rawPath };
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

function injectStyles() {
  if (document.querySelector("style[data-filechute-bg-remove]")) return;
  const style = document.createElement("style");
  style.dataset.filechuteBgRemove = "true";
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
    .filechute-bg-remove-button { min-width: 66px; }
    .filechute-bg-preview-wrap {
      margin-top: 12px;
      min-height: 180px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 11px;
      background-color: #d8d8d8;
      background-image:
        linear-gradient(45deg, #bfc3c1 25%, transparent 25%),
        linear-gradient(-45deg, #bfc3c1 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #bfc3c1 75%),
        linear-gradient(-45deg, transparent 75%, #bfc3c1 75%);
      background-size: 18px 18px;
      background-position: 0 0, 0 9px, 9px -9px, -9px 0;
    }
    #filechute-bg-preview {
      display: block;
      max-width: 100%;
      max-height: 360px;
    }
    .filechute-bg-controls {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .filechute-bg-controls label {
      display: grid;
      grid-template-columns: minmax(0,1fr) auto;
      gap: 6px 12px;
      align-items: center;
      font-size: 11px;
    }
    .filechute-bg-controls input[type="range"] { grid-column: 1 / -1; width: 100%; }
    .filechute-bg-note {
      margin-top: 10px;
      color: #aab2ad;
      font-size: 11px;
      line-height: 1.45;
    }
  `;
  document.head.append(style);
}

function makeDialog() {
  if (document.querySelector("#filechute-bg-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "filechute-bg-dialog";
  dialog.innerHTML = `
    <form class="dialog-card" method="dialog">
      <div class="dialog-heading">
        <div>
          <h2>Remove background</h2>
          <p id="filechute-bg-name">Create a transparent PNG copy.</p>
        </div>
        <button id="filechute-bg-close" class="dialog-close" type="button" aria-label="Cancel background removal">×</button>
      </div>
      <div class="filechute-bg-preview-wrap">
        <canvas id="filechute-bg-preview" width="1" height="1"></canvas>
      </div>
      <div class="filechute-bg-controls">
        <label>
          <span>Background sensitivity</span>
          <output id="filechute-bg-sensitivity-value">48</output>
          <input id="filechute-bg-sensitivity" type="range" min="5" max="100" step="1" value="48">
        </label>
        <label>
          <span>Edge softness</span>
          <output id="filechute-bg-feather-value">7</output>
          <input id="filechute-bg-feather" type="range" min="0" max="30" step="1" value="7">
        </label>
      </div>
      <p class="filechute-bg-note">Runs entirely on your computer. This fast local remover follows background colors connected to the image edges, so it works best on clean, studio, screenshot, product, and mostly-uniform backgrounds. The original is never overwritten.</p>
      <div class="dialog-actions">
        <button id="filechute-bg-cancel" type="button">Cancel</button>
        <button id="filechute-bg-create" class="primary" type="button">Create transparent PNG</button>
      </div>
    </form>
  `;
  document.body.append(dialog);

  const close = () => dialog.close("cancel");
  dialog.querySelector("#filechute-bg-close")?.addEventListener("click", close);
  dialog.querySelector("#filechute-bg-cancel")?.addEventListener("click", close);
  dialog.querySelector("#filechute-bg-create")?.addEventListener("click", () => void createTransparentCopy());

  for (const id of ["filechute-bg-sensitivity", "filechute-bg-feather"]) {
    dialog.querySelector(`#${id}`)?.addEventListener("input", () => {
      readControls();
      schedulePreview();
    });
  }

  dialog.addEventListener("close", () => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    if (target?.bitmap) target.bitmap.close();
    target = null;
  });
}

function elements() {
  const dialog = document.querySelector("#filechute-bg-dialog");
  return {
    dialog,
    name: dialog?.querySelector("#filechute-bg-name"),
    preview: dialog?.querySelector("#filechute-bg-preview"),
    sensitivity: dialog?.querySelector("#filechute-bg-sensitivity"),
    sensitivityValue: dialog?.querySelector("#filechute-bg-sensitivity-value"),
    feather: dialog?.querySelector("#filechute-bg-feather"),
    featherValue: dialog?.querySelector("#filechute-bg-feather-value"),
    create: dialog?.querySelector("#filechute-bg-create")
  };
}

function readControls() {
  const el = elements();
  sensitivity = clamp(el.sensitivity?.value, 5, 100);
  feather = clamp(el.feather?.value, 0, 30);
  if (el.sensitivityValue) el.sensitivityValue.textContent = String(Math.round(sensitivity));
  if (el.featherValue) el.featherValue.textContent = String(Math.round(feather));
  void writeStored(BG_SENSITIVITY_KEY, sensitivity).catch(() => {});
  void writeStored(BG_FEATHER_KEY, feather).catch(() => {});
}

async function loadControls() {
  const [savedSensitivity, savedFeather] = await Promise.all([
    readStored(BG_SENSITIVITY_KEY),
    readStored(BG_FEATHER_KEY)
  ]);
  sensitivity = clamp(savedSensitivity ?? 48, 5, 100);
  feather = clamp(savedFeather ?? 7, 0, 30);
  const el = elements();
  if (el.sensitivity) el.sensitivity.value = String(Math.round(sensitivity));
  if (el.feather) el.feather.value = String(Math.round(feather));
  readControls();
}

function colorDistanceSq(data, offset, color) {
  const dr = data[offset] - color[0];
  const dg = data[offset + 1] - color[1];
  const db = data[offset + 2] - color[2];
  return dr * dr + dg * dg + db * db;
}

function borderSamples(imageData) {
  const { width, height, data } = imageData;
  const samples = [];
  const perimeter = Math.max(1, 2 * width + 2 * height);
  const step = Math.max(1, Math.floor(perimeter / 420));
  const pushPixel = (x, y) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < 16) return;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  for (let x = 0; x < width; x += step) {
    pushPixel(x, 0);
    if (height > 1) pushPixel(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    pushPixel(0, y);
    if (width > 1) pushPixel(width - 1, y);
  }
  return samples;
}

function backgroundClusters(imageData) {
  const samples = borderSamples(imageData);
  if (!samples.length) return [[255, 255, 255]];
  const k = Math.min(4, samples.length);
  let centers = Array.from({ length: k }, (_, index) => samples[Math.floor(index * samples.length / k)].slice());

  for (let iteration = 0; iteration < 7; iteration += 1) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const sample of samples) {
      let best = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < centers.length; index += 1) {
        const dr = sample[0] - centers[index][0];
        const dg = sample[1] - centers[index][1];
        const db = sample[2] - centers[index][2];
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      const sum = sums[best];
      sum[0] += sample[0];
      sum[1] += sample[1];
      sum[2] += sample[2];
      sum[3] += 1;
    }
    centers = centers.map((center, index) => {
      const sum = sums[index];
      return sum[3] ? [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] : center;
    });
  }

  const counts = centers.map(() => 0);
  for (const sample of samples) {
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < centers.length; index += 1) {
      const dr = sample[0] - centers[index][0];
      const dg = sample[1] - centers[index][1];
      const db = sample[2] - centers[index][2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    counts[best] += 1;
  }

  const minimum = Math.max(2, Math.floor(samples.length * 0.035));
  const kept = centers.filter((_center, index) => counts[index] >= minimum);
  return kept.length ? kept : [centers[counts.indexOf(Math.max(...counts))]];
}

function minClusterDistanceSq(data, offset, clusters) {
  let best = Infinity;
  for (const cluster of clusters) best = Math.min(best, colorDistanceSq(data, offset, cluster));
  return best;
}

function makeForegroundMask(imageData) {
  const { width, height, data } = imageData;
  const clusters = backgroundClusters(imageData);
  const threshold = 12 + sensitivity * 1.02;
  const soft = Math.max(1, feather * 2.15);
  const candidate = threshold + Math.max(10, soft * 1.6);
  const candidateSq = candidate * candidate;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const qualifies = (index) => {
    const offset = index * 4;
    return data[offset + 3] < 16 || minClusterDistanceSq(data, offset, clusters) <= candidateSq;
  };
  const push = (index) => {
    if (visited[index] || !qualifies(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    if (height > 1) push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    if (width > 1) push(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) push(index - 1);
    if (x + 1 < width) push(index + 1);
    if (y > 0) push(index - width);
    if (y + 1 < height) push(index + width);
  }

  const mask = new ImageData(width, height);
  const maskData = mask.data;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    maskData[offset] = 255;
    maskData[offset + 1] = 255;
    maskData[offset + 2] = 255;
    if (!visited[index]) {
      maskData[offset + 3] = data[offset + 3];
      continue;
    }
    const distance = Math.sqrt(minClusterDistanceSq(data, offset, clusters));
    const alpha = distance <= threshold
      ? 0
      : Math.round(clamp((distance - threshold) / soft, 0, 1) * 255);
    maskData[offset + 3] = Math.min(data[offset + 3], alpha);
  }
  return mask;
}

function scaledSize(width, height, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function maskForBitmap(bitmap, maxDimension) {
  const size = scaledSize(bitmap.width, bitmap.height, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) throw new Error("Chromium could not create a background-removal canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const imageData = context.getImageData(0, 0, size.width, size.height);
  const mask = makeForegroundMask(imageData);
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = size.width;
  maskCanvas.height = size.height;
  const maskContext = maskCanvas.getContext("2d", { alpha: true });
  if (!maskContext) throw new Error("Chromium could not create the transparency mask.");
  maskContext.putImageData(mask, 0, 0);
  return maskCanvas;
}

function renderComposite(bitmap, outputCanvas, maxMaskDimension) {
  const mask = maskForBitmap(bitmap, maxMaskDimension);
  outputCanvas.width = bitmap.width;
  outputCanvas.height = bitmap.height;
  const context = outputCanvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Chromium could not render the transparent image.");
  context.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  context.drawImage(bitmap, 0, 0, outputCanvas.width, outputCanvas.height);
  context.globalCompositeOperation = "destination-in";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(mask, 0, 0, outputCanvas.width, outputCanvas.height);
  context.globalCompositeOperation = "source-over";
}

function schedulePreview() {
  if (!target?.bitmap) return;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    try {
      renderPreview();
    } catch (error) {
      console.error("FileChute background preview failed", error);
      setStatus(error?.message || "Could not preview background removal.", true);
    }
  }, 90);
}

function renderPreview() {
  if (!target?.bitmap) return;
  const preview = elements().preview;
  if (!(preview instanceof HTMLCanvasElement)) return;
  const size = scaledSize(target.bitmap.width, target.bitmap.height, PREVIEW_MAX);
  const source = document.createElement("canvas");
  source.width = size.width;
  source.height = size.height;
  const sourceContext = source.getContext("2d", { alpha: true });
  if (!sourceContext) throw new Error("Chromium could not render the preview.");
  sourceContext.drawImage(target.bitmap, 0, 0, size.width, size.height);

  const mask = maskForBitmap(source, PREVIEW_MAX);
  preview.width = size.width;
  preview.height = size.height;
  const destination = preview.getContext("2d", { alpha: true });
  if (!destination) throw new Error("Chromium could not display the preview.");
  destination.clearRect(0, 0, size.width, size.height);
  destination.drawImage(source, 0, 0);
  destination.globalCompositeOperation = "destination-in";
  destination.drawImage(mask, 0, 0, size.width, size.height);
  destination.globalCompositeOperation = "source-over";
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Chromium could not encode the transparent PNG.")),
      "image/png"
    );
  });
}

async function openBackgroundRemoval(row) {
  try {
    if (target?.bitmap) target.bitmap.close();
    target = null;
    const resolved = await resolveRowFile(row, { request: true });
    const file = await resolved.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      throw new Error("Chromium could not decode this image.");
    }
    target = { ...resolved, row, file, bitmap };
    await loadControls();
    const el = elements();
    if (el.name) el.name.textContent = `${file.name} · ${bitmap.width} × ${bitmap.height} · original preserved`;
    el.dialog?.showModal();
    setStatus(`Previewing background removal for ${file.name} locally…`);
    renderPreview();
  } catch (error) {
    console.error("FileChute background removal could not open", error);
    setStatus(error?.message || "Could not open background removal.", true);
  }
}

async function createTransparentCopy() {
  if (!target?.bitmap) return;
  const el = elements();
  if (el.create) {
    el.create.disabled = true;
    el.create.textContent = "Removing background…";
  }
  try {
    readControls();
    const current = await resolveRowFile(target.row, { request: true });
    const file = await current.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      if (bitmap.width > 32767 || bitmap.height > 32767) throw new Error("That image exceeds Chromium's safe canvas size.");
      const output = document.createElement("canvas");
      renderComposite(bitmap, output, MASK_MAX);
      const blob = await canvasBlob(output);
      const requested = `${stemOf(file.name)}-no-bg.png`;
      const outputName = await uniqueOutputName(current.directory, requested);
      const outputHandle = await current.directory.getFileHandle(outputName, { create: true });
      const writable = await outputHandle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }
      setStatus(`Created ${outputName} beside the original.`);
      el.dialog?.close("ok");
      window.dispatchEvent(new CustomEvent("filechute:filesystem-changed"));
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.error("FileChute background removal failed", error);
    setStatus(error?.message || "Could not remove this background.", true);
  } finally {
    if (el.create) {
      el.create.disabled = false;
      el.create.textContent = "Create transparent PNG";
    }
  }
}

function decorateRows() {
  if (!entriesElement) return;
  for (const row of entriesElement.querySelectorAll(".entry:not(.directory)")) {
    const name = rowImageName(row);
    if (!IMAGE_EXTENSIONS.has(extensionOf(name))) continue;
    if (row.querySelector(".filechute-bg-remove-button")) continue;

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
    button.className = "filechute-bg-remove-button";
    button.textContent = "Remove BG";
    button.title = `Remove the background from ${name}`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openBackgroundRemoval(row);
    });
    actions.append(button);
  }
}

function initialize() {
  injectStyles();
  makeDialog();
  decorateRows();
  if (entriesElement) {
    const observer = new MutationObserver(decorateRows);
    observer.observe(entriesElement, { childList: true, subtree: true });
  }
}

initialize();
