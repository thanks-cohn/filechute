(() => {
  const LOG_MESSAGE = "filechute-blackbox-log-v1";
  const DUMP_MESSAGE = "filechute-blackbox-dump-v1";
  const CLEAR_MESSAGE = "filechute-blackbox-clear-v1";
  const COMPACT_PREFIX = "FILECHUTE1|";
  const LEGACY_PREFIX = "filechute-transfer-v1:";
  const CUSTOM_TYPE = "application/x-filechute-item+json";

  const source = (() => {
    const protocol = location.protocol;
    if (protocol === "chrome-extension:") return location.pathname.includes("sidepanel") ? "filechute-sidepanel" : "filechute-extension";
    const host = location.hostname;
    if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) return "chatgpt";
    if (host.includes("google.")) return "google";
    if (host.includes("yandex.")) return "yandex";
    return host || protocol;
  })();

  const sessionKey = "filechute-blackbox-session-v1";
  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem(sessionKey) || crypto.randomUUID();
    sessionStorage.setItem(sessionKey, sessionId);
  } catch {
    sessionId = crypto.randomUUID();
  }

  let lastDragoverLog = 0;
  let lastKnownToken = null;
  let lastKnownName = null;

  function targetDescriptor(target) {
    if (!(target instanceof Element)) return null;
    const classes = [...target.classList].slice(0, 6);
    return {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      classes,
      draggable: target.draggable === true || null,
      role: target.getAttribute("role") || null,
      type: target.getAttribute("type") || null
    };
  }

  function parsePayloadFromText(text) {
    const value = String(text || "");
    if (value.startsWith(COMPACT_PREFIX)) {
      const parts = value.slice(COMPACT_PREFIX.length).split("|");
      if (parts.length >= 5) {
        const [sourceExtensionId, transferToken, kindCode, encodedPath, ...nameParts] = parts;
        try {
          return {
            sourceExtensionId,
            transferToken,
            kind: kindCode === "d" ? "directory" : "file",
            relativePath: decodeURIComponent(encodedPath || ""),
            originalName: decodeURIComponent(nameParts.join("|") || "")
          };
        } catch {}
      }
    }

    if (value.startsWith(LEGACY_PREFIX)) {
      try {
        return JSON.parse(decodeURIComponent(value.slice(LEGACY_PREFIX.length)));
      } catch {}
    }
    return null;
  }

  function transferSnapshot(transfer, { allowRead = true } = {}) {
    if (!transfer) return null;
    const snapshot = {
      effectAllowed: transfer.effectAllowed || null,
      dropEffect: transfer.dropEffect || null,
      types: [],
      filesLength: null,
      items: []
    };

    try { snapshot.types = [...(transfer.types || [])]; } catch {}
    try { snapshot.filesLength = transfer.files?.length ?? null; } catch {}
    try {
      snapshot.items = [...(transfer.items || [])].map((item) => ({
        kind: item.kind || null,
        type: item.type || null
      }));
    } catch {}

    if (allowRead) {
      let payload = null;
      try {
        const raw = transfer.getData(CUSTOM_TYPE);
        if (raw) payload = JSON.parse(raw);
      } catch {}
      if (!payload) {
        try { payload = parsePayloadFromText(transfer.getData("text/plain")); } catch {}
      }
      if (payload) {
        snapshot.payload = {
          transferToken: payload.transferToken || null,
          kind: payload.kind || null,
          originalName: payload.originalName || payload.name || null,
          relativePath: payload.relativePath || null,
          sourceExtensionId: payload.sourceExtensionId || null
        };
        if (snapshot.payload.transferToken) lastKnownToken = snapshot.payload.transferToken;
        if (snapshot.payload.originalName) lastKnownName = snapshot.payload.originalName;
      }
    }
    return snapshot;
  }

  function log(checkpoint, details = {}) {
    if (!globalThis.chrome?.runtime?.sendMessage) return;
    const event = {
      at: new Date().toISOString(),
      performanceNow: Number(performance.now().toFixed(3)),
      sessionId,
      source,
      checkpoint,
      transferToken: details.transferToken || lastKnownToken || null,
      itemName: details.itemName || lastKnownName || null,
      visible: document.visibilityState,
      hasFocus: document.hasFocus(),
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform || navigator.platform || null,
      ...details
    };
    try {
      chrome.runtime.sendMessage({ type: LOG_MESSAGE, event }).catch(() => {});
    } catch {}
  }

  function logEvent(name, event, { allowRead = true } = {}) {
    const transfer = event?.dataTransfer || null;
    const transferData = transferSnapshot(transfer, { allowRead });
    log(name, {
      target: targetDescriptor(event?.target),
      clientX: Number.isFinite(event?.clientX) ? event.clientX : null,
      clientY: Number.isFinite(event?.clientY) ? event.clientY : null,
      button: Number.isFinite(event?.button) ? event.button : null,
      defaultPrevented: Boolean(event?.defaultPrevented),
      transfer: transferData,
      transferToken: transferData?.payload?.transferToken || null,
      itemName: transferData?.payload?.originalName || null
    });
  }

  document.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (source === "filechute-sidepanel" && !target?.closest("#entries")) return;
    logEvent("pointerdown", event, { allowRead: false });
  }, true);

  document.addEventListener("dragstart", (event) => logEvent("dragstart", event), true);
  document.addEventListener("dragenter", (event) => logEvent("dragenter", event, { allowRead: false }), true);
  document.addEventListener("dragover", (event) => {
    const now = performance.now();
    if (now - lastDragoverLog < 250) return;
    lastDragoverLog = now;
    logEvent("dragover", event, { allowRead: false });
  }, true);
  document.addEventListener("drop", (event) => logEvent("drop", event), true);
  document.addEventListener("dragend", (event) => {
    logEvent("dragend", event);
    lastKnownToken = null;
    lastKnownName = null;
  }, true);

  window.addEventListener("blur", () => log("window-blur"), true);
  window.addEventListener("focus", () => log("window-focus"), true);
  document.addEventListener("visibilitychange", () => log("visibilitychange", { state: document.visibilityState }), true);
  window.addEventListener("error", (event) => log("window-error", {
    message: event.message || null,
    filename: event.filename || null,
    lineno: event.lineno || null,
    colno: event.colno || null,
    stack: event.error?.stack || null
  }), true);
  window.addEventListener("unhandledrejection", (event) => log("unhandledrejection", {
    message: event.reason?.message || String(event.reason || ""),
    stack: event.reason?.stack || null
  }), true);

  const observer = new MutationObserver(() => {
    for (const id of ["__filechute_page_drop_toast__", "__filechute_transport_toast__", "status"]) {
      const node = document.getElementById(id);
      const text = String(node?.textContent || "").trim();
      if (!text) continue;
      const key = `__filechute_blackbox_last_${id}`;
      if (globalThis[key] === text) continue;
      globalThis[key] = text;
      log("ui-message", { elementId: id, message: text.slice(0, 500) });
    }
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true, characterData: true });

  async function exportLog() {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: DUMP_MESSAGE });
    } catch (error) {
      alert(`Could not export FileChute bug log: ${error?.message || error}`);
      return;
    }
    if (!response?.ok) {
      alert(response?.error || "Could not export FileChute bug log.");
      return;
    }
    const blob = new Blob([JSON.stringify(response, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `filechute-black-box-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function clearLog() {
    if (!confirm("Clear the local FileChute black-box history?")) return;
    await chrome.runtime.sendMessage({ type: CLEAR_MESSAGE }).catch(() => {});
    log("blackbox-cleared");
  }

  globalThis.FileChuteBlackBox = { log, export: exportLog, clear: clearLog };

  if (source === "filechute-sidepanel") {
    const mount = () => {
      if (document.getElementById("filechute-blackbox-controls")) return;
      const wrap = document.createElement("div");
      wrap.id = "filechute-blackbox-controls";
      Object.assign(wrap.style, {
        position: "fixed", right: "8px", bottom: "8px", zIndex: "2147483647",
        display: "flex", gap: "5px", opacity: ".88"
      });
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.textContent = "Export bug log";
      exportButton.title = "Download the local FileChute black-box trace for Codex";
      exportButton.addEventListener("click", () => void exportLog());
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.textContent = "Clear";
      clearButton.title = "Clear local black-box history";
      clearButton.addEventListener("click", () => void clearLog());
      wrap.append(exportButton, clearButton);
      document.body.append(wrap);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  log("blackbox-loaded", { hrefOrigin: location.origin, pathname: location.pathname });
})();
