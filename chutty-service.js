import { readStored } from "./storage.js";
import { mergeMetadata } from "./metadata-store.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const OPEN_SETTINGS_KEY = "filechute-open-settings";
const MAX_CHUTTY_CAPTURE_BYTES = 32 * 1024 * 1024;

async function writableRootDirectory() {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") throw new Error("Choose a Chute folder first.");

  let permission = "denied";
  try { permission = await root.queryPermission({ mode: "readwrite" }); } catch {}
  if (permission !== "granted") {
    throw new Error(`Reconnect ${root.name || "the Chute folder"} from the Chute panel, then try again.`);
  }
  return root;
}

function safeFileName(value, fallback = "browser-image") {
  const name = String(value || "")
    .replace(/[\\/:*?"<>|\r\n\0]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return name.slice(0, 180) || fallback;
}

async function uniqueRootName(root, requested) {
  const name = safeFileName(requested);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt ? `${stem} (${attempt + 1})${extension}` : name;
    try {
      await root.getFileHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name !== "TypeMismatchError") throw error;
    }
  }
  return `${stem}-${Date.now()}${extension}`;
}

function base64Bytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function responseFileName(url, mime) {
  let name = "browser-image";
  try { name = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || name); } catch {}
  name = safeFileName(name);
  if (!/\.[a-z0-9]{2,8}$/i.test(name)) {
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/avif": "avif",
      "image/svg+xml": "svg"
    }[mime] || "img";
    name += `.${extension}`;
  }
  return name;
}

async function materializeChuttyItem(item) {
  if (item?.base64) {
    const bytes = base64Bytes(item.base64);
    if (bytes.byteLength > MAX_CHUTTY_CAPTURE_BYTES) {
      throw new Error("A dropped file is too large for the browser-image bridge.");
    }
    return {
      bytes,
      name: safeFileName(item.name, "browser-file"),
      type: String(item.type || "application/octet-stream"),
      sourceUrl: null,
      parentPageUrl: String(item.parentPageUrl || "") || null
    };
  }

  const url = new URL(String(item?.sourceUrl || ""));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("The source image is unavailable to Chute.");
  }

  const response = await fetch(url.href, {
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) throw new Error(`The source image returned HTTP ${response.status}.`);

  const blob = await response.blob();
  if (!String(blob.type).toLowerCase().startsWith("image/")) {
    throw new Error("The dragged source did not return image bytes.");
  }
  if (blob.size > MAX_CHUTTY_CAPTURE_BYTES) {
    throw new Error("The source image is too large for the browser-image bridge.");
  }

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    name: responseFileName(url, blob.type),
    type: blob.type,
    sourceUrl: url.href,
    parentPageUrl: String(item.parentPageUrl || "") || null
  };
}

async function writeChuttyItem(root, item) {
  const payload = await materializeChuttyItem(item);
  const name = await uniqueRootName(root, payload.name);
  const handle = await root.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();

  try {
    await writable.write(new Blob([payload.bytes], { type: payload.type }));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }

  if (payload.sourceUrl || payload.parentPageUrl) {
    await mergeMetadata(`${root.name}/${name}`, {
      sourceUrl: payload.sourceUrl || null,
      parentPageUrl: payload.parentPageUrl || null
    });
  }
  return name;
}

async function ingestWithChutty(message) {
  const root = await writableRootDirectory();
  const items = Array.isArray(message?.items) ? message.items.slice(0, 20) : [];
  if (!items.length) throw new Error("The drop contained no readable files.");

  let written = 0;
  const failures = [];
  for (const item of items) {
    try {
      await writeChuttyItem(root, item);
      written += 1;
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }

  if (!written) throw new Error(failures[0] || "Chute could not save that drop.");

  const stored = await chrome.storage.local.get({ "chute-ingest-count": 0 });
  const count = (Number(stored["chute-ingest-count"]) || 0) + written;
  await chrome.storage.local.set({ "chute-ingest-count": count });

  return {
    ok: true,
    written,
    count,
    partial: failures.length > 0,
    failed: failures.length
  };
}

async function openChutePanel(sender, settings = false) {
  if (!Number.isInteger(sender?.tab?.windowId)) {
    throw new Error("Chute needs an active browser tab to open the panel.");
  }
  if (settings) await chrome.storage.session.set({ [OPEN_SETTINGS_KEY]: true });
  await chrome.sidePanel.open({ windowId: sender.tab.windowId });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "filechute-open-panel") {
    void openChutePanel(sender, Boolean(message.settings))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "chutty-ingest-v1") {
    void ingestWithChutty(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return false;
});
