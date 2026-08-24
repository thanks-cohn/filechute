import { readStored } from "./storage.js";

const STANDALONE_WIDTH = 390;
const STANDALONE_HEIGHT = 760;
const STANDALONE_WINDOW_KEY = "filechute-standalone-window-id";
const ROOT_HANDLE_KEY = "filechute-root-handle";
const TRANSFER_PREFIX = "filechute-transfer-v1:";
const MAX_INLINE_TRANSFER_BYTES = 48 * 1024 * 1024;

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

async function openStandaloneFileChute(tab) {
  const bounds = await standaloneBounds(tab);
  const existing = await rememberedStandaloneWindow();
  if (existing?.id) {
    try {
      await chrome.windows.update(existing.id, { focused: true, ...bounds });
      return;
    } catch {
      await forgetStandaloneWindow();
    }
  }

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html?standalone=1"),
    type: "popup",
    focused: true,
    ...bounds
  });

  await rememberStandaloneWindow(created?.id);
}

async function toggleFileChute(tab) {
  if (!tab?.id) {
    await openStandaloneFileChute(tab);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["drawer-host.js"]
    });
  } catch (error) {
    console.info("FileChute cannot inject into this page; opening the standalone left shelf instead.", error);
    await openStandaloneFileChute(tab);
  }
}

function transferKey(token) {
  return `${TRANSFER_PREFIX}${String(token || "")}`;
}

async function registerTransfer(message) {
  const token = String(message?.token || "");
  const relativePath = String(message?.relativePath || "");
  if (!token || !relativePath) return false;

  await chrome.storage.session.set({
    [transferKey(token)]: {
      relativePath,
      representation: message?.representation === "thumbnail" ? "thumbnail" : "original"
    }
  });
  return true;
}

async function consumeTransfer(token, relativePath) {
  const key = transferKey(token);
  const stored = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key).catch(() => {});
  const record = stored?.[key];
  if (!record) throw new Error("This FileChute drag is no longer available. Drag the item again.");
  if (String(record.relativePath) !== String(relativePath)) throw new Error("The FileChute drag does not match this file.");
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

async function fileForRelativePath(relativePath) {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") throw new Error("FileChute no longer has a selected root folder.");
  if (!(await hasReadPermission(root))) {
    throw new Error(`Reconnect ${root.name || "the FileChute folder"} in FileChute, then drag again.`);
  }

  const segments = String(relativePath || "").split("/").filter(Boolean);
  if (segments[0] === root.name) segments.shift();
  if (!segments.length) throw new Error("That FileChute item does not resolve to a file.");

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment);
  }
  const handle = await directory.getFileHandle(segments.at(-1));
  return handle.getFile();
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

async function readDraggedFile(message) {
  const relativePath = String(message?.relativePath || "");
  const token = String(message?.transferToken || "");
  const transfer = await consumeTransfer(token, relativePath);

  if (transfer.representation !== "original") {
    throw new Error("This receiver currently requests the original file. Change thumbnail dragging to Original and try again.");
  }

  const file = await fileForRelativePath(relativePath);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "filechute-register-transfer-v1") {
    void registerTransfer(message)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "filechute-read-dragged-file-v1") {
    void readDraggedFile(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return false;
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "filechute-read-dragged-file-v1") return false;
  void readDraggedFile(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  void toggleFileChute(tab);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const stored = await chrome.storage.session.get(STANDALONE_WINDOW_KEY).catch(() => ({}));
    if (stored?.[STANDALONE_WINDOW_KEY] === windowId) await forgetStandaloneWindow();
  })();
});
