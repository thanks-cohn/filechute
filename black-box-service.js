const BLACK_BOX_KEY = "filechute-black-box-v1";
const BLACK_BOX_MAX_EVENTS = 6000;

let writeChain = Promise.resolve();

function cleanEvent(value) {
  if (!value || typeof value !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {
      checkpoint: "blackbox-serialization-failed",
      message: String(value)
    };
  }
}

async function readBox() {
  const stored = await chrome.storage.local.get(BLACK_BOX_KEY).catch(() => ({}));
  const box = stored?.[BLACK_BOX_KEY];
  if (box && Array.isArray(box.events)) return box;
  return { nextSequence: 1, events: [] };
}

function appendEvent(event) {
  const cleaned = cleanEvent(event);
  if (!cleaned) return Promise.resolve(null);

  writeChain = writeChain.then(async () => {
    const box = await readBox();
    const sequence = Number(box.nextSequence) || 1;
    const record = {
      sequence,
      storedAt: new Date().toISOString(),
      ...cleaned
    };
    const events = [...box.events, record];
    if (events.length > BLACK_BOX_MAX_EVENTS) {
      events.splice(0, events.length - BLACK_BOX_MAX_EVENTS);
    }
    await chrome.storage.local.set({
      [BLACK_BOX_KEY]: {
        nextSequence: sequence + 1,
        events
      }
    });
    return sequence;
  }).catch((error) => {
    console.debug("FileChute black-box write failed", error);
    return null;
  });

  return writeChain;
}

function serviceRecord(checkpoint, message, sender, extra = {}) {
  const transferToken = String(message?.transferToken || message?.token || message?.sourceToken || "") || null;
  const relativePath = String(message?.relativePath || message?.directoryPath || message?.entryPath || "") || null;
  const itemName = String(message?.name || "") || null;
  void appendEvent({
    at: new Date().toISOString(),
    source: "filechute-service-worker",
    checkpoint,
    transferToken,
    itemName,
    relativePath,
    messageType: message?.type || null,
    senderExtensionId: sender?.id || null,
    senderTabId: Number.isInteger(sender?.tab?.id) ? sender.tab.id : null,
    manifestVersion: chrome.runtime.getManifest().version,
    ...extra
  });
}

globalThis.FileChuteServiceBlackBox = {
  append(checkpoint, message = {}, extra = {}) {
    serviceRecord(checkpoint, message, null, { handler: "service-worker.js", ...extra });
  }
};

const observedTransferMessages = new Set([
  "filechute-register-transfer-v1",
  "filechute-read-dragged-file-v1",
  "chute-gallery-list-v1",
  "chute-gallery-read-v1"
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (observedTransferMessages.has(message?.type)) {
    serviceRecord("service-message-received", message, sender, { external: false });
  }

  if (message?.type === "filechute-blackbox-log-v1") {
    void appendEvent(message.event).then((sequence) => sendResponse({ ok: true, sequence }));
    return true;
  }

  if (message?.type === "filechute-blackbox-dump-v1") {
    void readBox()
      .then((box) => sendResponse({
        ok: true,
        format: "filechute-black-box-v1",
        exportedAt: new Date().toISOString(),
        extensionId: chrome.runtime.id,
        manifest: chrome.runtime.getManifest(),
        ...box
      }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "filechute-blackbox-clear-v1") {
    void chrome.storage.local.remove(BLACK_BOX_KEY)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return false;
});

chrome.runtime.onMessageExternal.addListener((message, sender) => {
  if (!observedTransferMessages.has(message?.type)) return false;
  serviceRecord("service-external-message-received", message, sender, { external: true });
  return false;
});
