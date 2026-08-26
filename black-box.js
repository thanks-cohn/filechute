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
  let activeAttemptId = null;
  let attemptNumber = Number(sessionStorage.getItem(`${sessionKey}-attempt`) || 0);
  let eventNumber = 0;
  let previousAttempt = null;
  let attemptStartedAt = null;
  let dragstartObserved = false;
  let dragendObserved = false;
  let activeAttemptLifecycle = null;
  const fallbackKey = "filechute-blackbox-delivery-fallback-v1";
  let recorderDegraded = false;

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

  function retainFallback(event, error) {
    recorderDegraded = true;
    console.warn("FileChute black-box delivery failed", error?.message || error, event.checkpoint);
    try {
      const records = JSON.parse(localStorage.getItem(fallbackKey) || "[]");
      records.push({ ...event, deliveryError: String(error?.message || error || "unknown") });
      localStorage.setItem(fallbackKey, JSON.stringify(records.slice(-40)));
    } catch {}
    updateHealthText();
  }

  async function deliver(event) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      retainFallback(event, new Error("chrome.runtime.sendMessage unavailable"));
      return null;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: LOG_MESSAGE, event });
      if (!response?.ok || !response.sequence) throw new Error(response?.error || "persistence acknowledgement missing sequence");
      return response;
    } catch (error) {
      retainFallback(event, error);
      return null;
    }
  }

  function buildEvent(checkpoint, details = {}) {
    return {
      at: new Date().toISOString(), performanceNow: Number(performance.now().toFixed(3)), sessionId,
      attemptId: details.attemptId || activeAttemptId,
      attemptNumber: details.attemptNumber || (activeAttemptId ? attemptNumber : null),
      source, component: source, checkpoint, transferToken: details.transferToken || lastKnownToken || null,
      itemName: details.itemName || lastKnownName || null, visible: document.visibilityState,
      hasFocus: document.hasFocus(), userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform || navigator.platform || null,
      extensionId: chrome.runtime.id, manifestVersion: chrome.runtime.getManifest().version, ...details
    };
  }

  function log(checkpoint, details = {}) {
    void deliver(buildEvent(checkpoint, details));
  }

  async function checkRecorder() {
    const requestId = crypto.randomUUID();
    const sent = buildEvent("blackbox-storage-ping-sent", { result: "pending", requestId });
    const response = await deliver(sent);
    if (!response) {
      retainFallback(buildEvent("blackbox-storage-ping-failed", { result: "failed", requestId }), new Error("ping was not persisted"));
      return null;
    }
    const ack = await deliver(buildEvent("blackbox-storage-ping-ack", { result: "ok", requestId, persistedSequence: response.sequence }));
    updateHealthText();
    return ack;
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
      eventId: `${sessionId}:${++eventNumber}`,
      eventOrigin: event?.isTrusted === false ? "synthetic" : "physical",
      handler: "black-box.js:capture",
      transfer: transferData,
      transferToken: transferData?.payload?.transferToken || null,
      itemName: transferData?.payload?.originalName || null
    });
  }

  document.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (source === "filechute-sidepanel" && !target?.closest("#entries")) return;
    if (source === "filechute-sidepanel") {
      if (activeAttemptId && dragstartObserved && !dragendObserved) {
        log("previous-attempt-missing-dragend", {
          result: "failed",
          failureSignature: "W-DRAG-002:next-pointerdown-after-missing-dragend"
        });
        previousAttempt = { dragendObserved: false, dropEffect: null, finishedAt: performance.now() };
      }
      attemptNumber += 1;
      try { sessionStorage.setItem(`${sessionKey}-attempt`, String(attemptNumber)); } catch {}
      activeAttemptId = `${sessionId}:${attemptNumber}`;
      attemptStartedAt = performance.now();
      dragstartObserved = false;
      dragendObserved = false;
      activeAttemptLifecycle = { attemptId: activeAttemptId, attemptNumber, dragstartObserved: false, dragendObserved: false };
    }
    logEvent("pointerdown", event, { allowRead: false });
    if (source === "filechute-sidepanel") log("attempt-started", {
      result: "ok",
      elapsedSincePreviousAttemptMs: previousAttempt ? Number((performance.now() - previousAttempt.finishedAt).toFixed(3)) : null,
      previousAttempt: previousAttempt ? {
        dragendObserved: previousAttempt.dragendObserved,
        dropEffect: previousAttempt.dropEffect
      } : null
    });
    if (source === "filechute-sidepanel") {
      const watchedAttempt = activeAttemptLifecycle;
      setTimeout(() => {
        if (!watchedAttempt.dragstartObserved) log("dragstart-watchdog", {
          attemptId: watchedAttempt.attemptId,
          attemptNumber: watchedAttempt.attemptNumber,
          result: "timeout",
          failureSignature: "W-DRAG-002:pointerdown-without-dragstart",
          timeoutMs: 1500
        });
      }, 1500);
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    dragstartObserved = true;
    if (activeAttemptLifecycle) activeAttemptLifecycle.dragstartObserved = true;
    logEvent("dragstart", event);
  }, true);
  document.addEventListener("pointerup", (event) => logEvent("pointerup", event, { allowRead: false }), true);
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
    if (source === "filechute-sidepanel") {
      dragendObserved = true;
      if (activeAttemptLifecycle) activeAttemptLifecycle.dragendObserved = true;
      const dropEffect = event.dataTransfer?.dropEffect || "none";
      log("attempt-ended", {
        result: dropEffect === "none" ? "failed" : "ok",
        dropEffect,
        durationMs: attemptStartedAt === null ? null : Number((performance.now() - attemptStartedAt).toFixed(3))
      });
      previousAttempt = { dragendObserved: true, dropEffect, finishedAt: performance.now() };
    }
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

  function updateHealthText(text) {
    const node = document.getElementById("filechute-blackbox-health");
    if (node) node.textContent = text || `Recorder: ${source} ${recorderDegraded ? "DEGRADED" : "checking…"}`;
  }

  async function showHealth() {
    const response = await chrome.runtime.sendMessage({ type: DUMP_MESSAGE }).catch(() => null);
    const statuses = response?.analysis?.recorderHealth || [];
    const label = (name) => statuses.find((item) => item.context === name)?.status || "unknown";
    updateHealthText(`Recorder: sender ${label("filechute-sidepanel").toUpperCase()} | worker ${label("filechute-service-worker").toUpperCase()} | ChatGPT ${label("chatgpt")} | Google ${label("google")} | Yandex ${label("yandex")}`);
  }

  async function showAnalysis() {
    const response = await chrome.runtime.sendMessage({ type: DUMP_MESSAGE }).catch(() => null);
    const analysis = response?.analysis;
    if (!analysis) return alert("Recorder analysis unavailable.");
    const recent = analysis.attempts.slice(-5).map((attempt) => `Attempt ${attempt.attemptNumber || attempt.attemptId}: ${attempt.lastConfirmedGoodCheckpoint || "none"} -> ${attempt.firstFailedOrMissingCheckpoint || "complete"} (${attempt.owningComponent})`).join("\n");
    const divergence = analysis.firstDivergentAttempt ? `First divergence: ${analysis.firstDivergentAttempt.attemptId} at ${analysis.firstDivergentAttempt.firstDivergentCheckpoint}` : "First divergence: not established";
    alert(`${divergence}\n${recent || "No attempts recorded."}`);
  }

  globalThis.FileChuteBlackBox = {
    log,
    transferSnapshot,
    currentAttempt: () => ({ attemptId: activeAttemptId, attemptNumber }),
    export: exportLog,
    clear: clearLog,
    checkRecorder
  };

  if (source === "filechute-sidepanel") {
    const mount = () => {
      if (document.getElementById("filechute-blackbox-controls")) return;
      const wrap = document.createElement("div");
      wrap.id = "filechute-blackbox-controls";
      Object.assign(wrap.style, {
        position: "fixed", right: "8px", bottom: "8px", zIndex: "2147483647",
        display: "flex", gap: "5px", opacity: ".88", alignItems: "center", flexWrap: "wrap", maxWidth: "680px"
      });
      const health = document.createElement("span");
      health.id = "filechute-blackbox-health";
      health.textContent = "Recorder: checking…";
      const strategy = document.createElement("select");
      strategy.title = "Diagnostics receiver strategy (reload destination tabs after changing)";
      for (const [value, label] of [["direct-input-only", "Direct input only"], ["legacy-synthetic-fallback", "Legacy synthetic fallback"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        strategy.append(option);
      }
      const defaultStrategy = /Windows/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? "direct-input-only" : "legacy-synthetic-fallback";
      strategy.value = defaultStrategy;
      chrome.storage.local.get("filechuteDiagnosticsReceiverStrategy").then((stored) => {
        strategy.value = stored?.filechuteDiagnosticsReceiverStrategy || defaultStrategy;
      }).catch(() => {});
      strategy.addEventListener("change", () => {
        void chrome.storage.local.set({ filechuteDiagnosticsReceiverStrategy: strategy.value });
        log("receiver-strategy-setting-changed", { result: "ok", receiverStrategy: strategy.value });
      });
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.textContent = "Export bug log";
      exportButton.title = "Download the local FileChute black-box trace for Codex";
      exportButton.addEventListener("click", () => void exportLog());
      const checkButton = document.createElement("button");
      checkButton.type = "button";
      checkButton.textContent = "Check recorder";
      checkButton.addEventListener("click", () => void checkRecorder().then(showHealth));
      const analyzeButton = document.createElement("button");
      analyzeButton.type = "button";
      analyzeButton.textContent = "Analyze last attempts";
      analyzeButton.addEventListener("click", () => void showAnalysis());
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.textContent = "Clear";
      clearButton.title = "Clear local black-box history";
      clearButton.addEventListener("click", () => void clearLog());
      wrap.append(health, strategy, checkButton, analyzeButton, exportButton, clearButton);
      document.body.append(wrap);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }

  log("blackbox-context-loaded", { result: "ok", hrefOrigin: location.origin, pathname: location.pathname });
  if (source !== "filechute-sidepanel") log("receiver-context-loaded", { result: "ok", hrefOrigin: location.origin, pathname: location.pathname });
  void checkRecorder().then(() => { if (source === "filechute-sidepanel") void showHealth(); });
})();
