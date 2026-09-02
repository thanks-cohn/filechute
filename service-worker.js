import { readStored } from "./storage.js";

const STANDALONE_WIDTH = 390;
const STANDALONE_HEIGHT = 760;
const STANDALONE_WINDOW_KEY = "filechute-standalone-window-id";
const ROOT_HANDLE_KEY = "filechute-root-handle";
const LAUNCH_MODE_KEY = "filechute-launch-mode";
const TRANSFER_PREFIX = "filechute-transfer-v1:";
const GALLERY_SOURCE_PREFIX = "filechute-gallery-source-v1:";
const MAX_INLINE_TRANSFER_BYTES = 48 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "ico", "apng"]);
const DIAGNOSTICS_KEY = "filechute-drag-diagnostics-v1";
const DIAGNOSTIC_SIGNATURES_KEY = "filechute-drag-failure-signatures-v1";
const DIAGNOSTIC_LIMIT = 500;
let diagnosticWrite = Promise.resolve();

async function storeDiagnosticNow(line) {
  if (typeof line !== "string") return false;
  const safeLine = line.replace(/[\r\n]+/g, " ").slice(0, 4096);
  const stored = await chrome.storage.session.get(DIAGNOSTICS_KEY).catch(() => ({}));
  const lines = Array.isArray(stored?.[DIAGNOSTICS_KEY])
    ? stored[DIAGNOSTICS_KEY].filter((item) => typeof item === "string")
    : [];
  lines.push(safeLine);
  const update = { [DIAGNOSTICS_KEY]: lines.slice(-DIAGNOSTIC_LIMIT) };
  try {
    const record = JSON.parse(safeLine);
    if (record?.state === "failed" && typeof record.signature === "string") {
      const signatureStore = await chrome.storage.session.get(DIAGNOSTIC_SIGNATURES_KEY).catch(() => ({}));
      const signatures = Array.isArray(signatureStore?.[DIAGNOSTIC_SIGNATURES_KEY])
        ? signatureStore[DIAGNOSTIC_SIGNATURES_KEY].filter((item) => typeof item === "string")
        : [];
      if (!signatures.includes(record.signature)) signatures.push(record.signature);
      update[DIAGNOSTIC_SIGNATURES_KEY] = signatures;
    }
  } catch {}
  await chrome.storage.session.set(update);
  console.info(`[FileChute drag diagnostic] ${safeLine}`);
  return true;
}

function storeDiagnostic(line) {
  const write = diagnosticWrite.then(() => storeDiagnosticNow(line));
  diagnosticWrite = write.catch(() => {});
  return write;
}

function workerDiagnostic(boundary, token, state, detail = "", error = null) {
  const clean = (value) => String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 1000);
  const record = {
    at: new Date().toISOString(), token: clean(token) || "unavailable",
    boundary: clean(boundary), state: clean(state), detail: clean(detail),
    error: error ? `${clean(error.name || "Error")}:${clean(error.message || error)}` : ""
  };
  record.signature = [record.boundary, record.state, record.error].filter(Boolean).join("|");
  void storeDiagnostic(JSON.stringify(record)).catch(() => {});
}

async function fileChuteLaunchMode() {
  return (await readStored(LAUNCH_MODE_KEY)) === "window" ? "window" : "panel";
}

async function configureLaunchBehavior(requestedMode = null) {
  const mode = requestedMode === "window" ? "window" : requestedMode === "panel" ? "panel" : await fileChuteLaunchMode();
  if (!chrome.sidePanel) return mode;

  try {
    await chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: mode === "panel" });
  } catch (error) {
    console.warn("FileChute could not configure the browser side panel.", error);
  }
  return mode;
}

async function rememberedStandaloneWindow() {
  try {
    const stored = await chrome.storage.session.get(STANDALONE_WINDOW_KEY);
    const id = stored?.[STANDALONE_WINDOW_KEY];
    if (!Number.isInteger(id)) return null;
    return await chrome.windows.get(id);
  } catch {
    return null;
  }
}

async function rememberStandaloneWindow(id) {
  if (!Number.isInteger(id)) return;
  try {
    await chrome.storage.session.set({ [STANDALONE_WINDOW_KEY]: id });
  } catch {}
}

async function forgetStandaloneWindow() {
  try {
    await chrome.storage.session.remove(STANDALONE_WINDOW_KEY);
  } catch {}
}

async function standaloneBounds(tab) {
  let host = null;
  try {
    if (Number.isInteger(tab?.windowId)) host = await chrome.windows.get(tab.windowId);
  } catch {}

  const width = Math.max(300, Math.min(STANDALONE_WIDTH, Number(host?.width) || STANDALONE_WIDTH));
  const height = Math.max(480, Math.min(Number(host?.height) || STANDALONE_HEIGHT, 1400));

  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(Number.isFinite(host?.left) ? host.left : 0),
    top: Math.round(Number.isFinite(host?.top) ? host.top : 0)
  };
}

async function focusStandalone(windowInfo, bounds = null) {
  if (!windowInfo?.id) return false;
  try {
    await chrome.windows.update(windowInfo.id, { focused: true, ...(bounds || {}) });
    return true;
  } catch {
    await forgetStandaloneWindow();
    return false;
  }
}

async function openStandaloneFileChute(tab) {
  const bounds = await standaloneBounds(tab);
  const existing = await rememberedStandaloneWindow();
  if (await focusStandalone(existing, bounds)) return;

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html?standalone=1"),
    type: "popup",
    focused: true,
    ...bounds
  });

  await rememberStandaloneWindow(created?.id);
}

function transferKey(token) {
  return `${TRANSFER_PREFIX}${String(token || "")}`;
}

function gallerySourceKey(token) {
  return `${GALLERY_SOURCE_PREFIX}${String(token || "")}`;
}

async function registerTransfer(message) {
  const token = String(message?.token || "");
  const relativePath = String(message?.relativePath || "");
  if (!token || !relativePath) {
    workerDiagnostic("worker.registration.validate", token, "failed", "missing-token-or-path");
    return false;
  }

  workerDiagnostic("worker.registration.begin", token, "healthy", `kind=${message?.kind || "file"}`);

  const record = {
    relativePath,
    representation: message?.representation === "thumbnail" ? "thumbnail" : "original",
    kind: message?.kind === "directory" ? "directory" : "file",
    name: String(message?.name || "")
  };

  await chrome.storage.session.set({ [transferKey(token)]: record });
  workerDiagnostic("worker.registration.session-write", token, "healthy");

  // Directory drags can become saved FrameChute galleries, so remember their
  // source mapping beyond the current browser session. The actual filesystem
  // permission remains entirely controlled by Chromium and the saved root
  // directory handle.
  if (record.kind === "directory") {
    await chrome.storage.local.set({ [gallerySourceKey(token)]: record });
  }
  return true;
}

async function consumeTransfer(token, relativePath) {
  workerDiagnostic("worker.transfer.consume.begin", token, "pending");
  const key = transferKey(token);
  const stored = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key).catch(() => {});
  const record = stored?.[key];
  if (!record) {
    workerDiagnostic("worker.transfer.lookup", token, "failed", "record-missing");
    throw new Error("This FileChute drag is no longer available. Drag the item again.");
  }
  if (String(record.relativePath) !== String(relativePath)) {
    workerDiagnostic("worker.transfer.path-match", token, "failed", "path-mismatch");
    throw new Error("The FileChute drag does not match this file.");
  }
  workerDiagnostic("worker.transfer.consume.complete", token, "healthy");
  return record;
}

async function gallerySourceRecord(token, directoryPath) {
  const key = gallerySourceKey(token);
  const persistent = await chrome.storage.local.get(key);
  let record = persistent?.[key] || null;

  if (!record) {
    const session = await chrome.storage.session.get(transferKey(token));
    record = session?.[transferKey(token)] || null;
  }

  if (!record) throw new Error("This FileChute gallery source is not registered. Drag the folder into FrameChute again.");
  if (String(record.relativePath) !== String(directoryPath)) throw new Error("This gallery source does not match that FileChute folder.");
  if (record.kind && record.kind !== "directory") throw new Error("This FileChute source is not a directory.");
  return record;
}

async function hasReadPermission(handle) {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

async function rootDirectory() {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") throw new Error("FileChute no longer has a selected root folder.");
  if (!(await hasReadPermission(root))) {
    throw new Error(`Reconnect ${root.name || "the FileChute folder"} in FileChute, then try again.`);
  }
  return root;
}

function pathSegments(relativePath, root) {
  const segments = String(relativePath || "").split("/").filter(Boolean);
  if (segments[0] === root.name) segments.shift();
  return segments;
}

async function directoryForRelativePath(relativePath) {
  const root = await rootDirectory();
  const segments = pathSegments(relativePath, root);
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  return directory;
}

async function fileForRelativePath(relativePath) {
  const root = await rootDirectory();
  const segments = pathSegments(relativePath, root);
  if (!segments.length) throw new Error("That FileChute item does not resolve to a file.");

  let directory = root;
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
  const handle = await directory.getFileHandle(segments.at(-1));
  return handle.getFile();
}

function extensionOf(name) {
  const value = String(name || "").toLowerCase();
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index + 1);
}

function isSupportedImagePath(path) {
  return IMAGE_EXTENSIONS.has(extensionOf(path));
}

async function collectGalleryImages(directory, fullPath, displayPrefix, results) {
  const children = [];
  for await (const [name, handle] of directory.entries()) children.push({ name, handle });
  children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  for (const child of children) {
    const relativePath = [fullPath, child.name].filter(Boolean).join("/");
    const displayPath = [displayPrefix, child.name].filter(Boolean).join("/");

    if (child.handle.kind === "directory") {
      await collectGalleryImages(child.handle, relativePath, displayPath, results);
      continue;
    }

    if (child.handle.kind === "file" && isSupportedImagePath(child.name)) {
      results.push({
        name: child.name,
        relativePath,
        displayPath
      });
    }
  }
}

async function listGalleryImages(message) {
  const token = String(message?.sourceToken || "");
  const directoryPath = String(message?.directoryPath || "");
  if (!token || !directoryPath) throw new Error("The gallery source is missing its folder reference.");

  await gallerySourceRecord(token, directoryPath);
  const directory = await directoryForRelativePath(directoryPath);
  const entries = [];
  await collectGalleryImages(directory, directoryPath, "", entries);
  return { ok: true, entries };
}

function pathInsideDirectory(directoryPath, entryPath) {
  const base = String(directoryPath || "").replace(/\/+$/, "");
  const entry = String(entryPath || "");
  return Boolean(base && entry && entry.startsWith(`${base}/`));
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function readGalleryImage(message) {
  const token = String(message?.sourceToken || "");
  const directoryPath = String(message?.directoryPath || "");
  const entryPath = String(message?.entryPath || "");
  if (!token || !directoryPath || !entryPath) throw new Error("The gallery image reference is incomplete.");

  await gallerySourceRecord(token, directoryPath);
  if (!pathInsideDirectory(directoryPath, entryPath)) throw new Error("That image is outside the selected gallery folder.");
  if (!isSupportedImagePath(entryPath)) throw new Error("That gallery entry is not a supported image.");

  const file = await fileForRelativePath(entryPath);
  if (file.size > MAX_INLINE_TRANSFER_BYTES) {
    throw new Error("This individual image is too large for the current gallery bridge.");
  }

  return {
    ok: true,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    base64: bytesToBase64(await file.arrayBuffer())
  };
}

async function readDraggedFile(message) {
  const relativePath = String(message?.relativePath || "");
  const token = String(message?.transferToken || "");
  const transfer = await consumeTransfer(token, relativePath);

  if (transfer.representation !== "original") {
    throw new Error("This receiver currently requests the original file. Change thumbnail dragging to Original and try again.");
  }

  const file = await fileForRelativePath(relativePath);
  workerDiagnostic("worker.filesystem.read", token, "healthy", `name=${file.name};size=${file.size};type=${file.type || ""}`);
  if (file.size > MAX_INLINE_TRANSFER_BYTES) {
    throw new Error("This file is too large for the current direct handoff. Large-file streaming is still being added.");
  }

  return {
    ok: true,
    name: file.name,
    type: file.type || message?.mime || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    base64: bytesToBase64(await file.arrayBuffer())
  };
}

async function handleBridgeMessage(message) {
  if (message?.type === "filechute-read-dragged-file-v1") return readDraggedFile(message);
  if (message?.type === "chute-gallery-list-v1") return listGalleryImages(message);
  if (message?.type === "chute-gallery-read-v1") return readGalleryImage(message);
  return null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "filechute-diagnostic-v1") {
    void storeDiagnostic(message.line)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "filechute-diagnostics-read-v1") {
    void chrome.storage.session.get([DIAGNOSTICS_KEY, DIAGNOSTIC_SIGNATURES_KEY])
      .then((stored) => sendResponse({
        ok: true,
        lines: stored?.[DIAGNOSTICS_KEY] || [],
        signatures: stored?.[DIAGNOSTIC_SIGNATURES_KEY] || []
      }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "filechute-launch-mode-changed") {
    void configureLaunchBehavior(message?.launchMode)
      .then((mode) => sendResponse({ ok: true, launchMode: mode }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "filechute-register-transfer-v1") {
    void registerTransfer(message)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (!["filechute-read-dragged-file-v1", "chute-gallery-list-v1", "chute-gallery-read-v1"].includes(message?.type)) return false;
  void handleBridgeMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!["filechute-read-dragged-file-v1", "chute-gallery-list-v1", "chute-gallery-read-v1"].includes(message?.type)) return false;
  void handleBridgeMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

// In the default panel mode Chrome owns the action click and toggles the
// persistent browser side panel. This listener only does work when the user
// explicitly selects the legacy floating-window mode in FileChute settings.
chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    if ((await fileChuteLaunchMode()) !== "window") return;
    await openStandaloneFileChute(tab);
  })();
});

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const stored = await chrome.storage.session.get(STANDALONE_WINDOW_KEY).catch(() => ({}));
    if (stored?.[STANDALONE_WINDOW_KEY] === windowId) await forgetStandaloneWindow();
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  void configureLaunchBehavior();
});
chrome.runtime.onStartup.addListener(() => {
  void configureLaunchBehavior();
});

// Service workers are ephemeral, so also restore the chosen action behavior
// whenever this worker is started for any reason.
void configureLaunchBehavior();
