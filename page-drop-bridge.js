(() => {
  const MARKER = "__filechute_page_drop_bridge_v1__";
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  const COMPACT_PREFIX = "FILECHUTE1|";
  const LEGACY_PREFIX = "filechute-transfer-v1:";
  const GENERATION = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  globalThis[MARKER] = GENERATION;
  const IS_WINDOWS = /Windows/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
  let receiverStrategy = IS_WINDOWS ? "direct-input-only" : "legacy-synthetic-fallback";
  chrome.storage.local.get("filechuteDiagnosticsReceiverStrategy").then((stored) => {
    const configured = stored?.filechuteDiagnosticsReceiverStrategy;
    if (["direct-input-only", "legacy-synthetic-fallback"].includes(configured)) receiverStrategy = configured;
    diagnostic("receiver-strategy-selected", null, { result: "ok", receiverStrategy, isWindows: IS_WINDOWS });
  }).catch((error) => diagnostic("receiver-strategy-selected", null, { result: "failed", receiverStrategy, isWindows: IS_WINDOWS, exception: { name: error?.name, message: error?.message } }));

  function diagnostic(checkpoint, payload = null, details = {}) {
    globalThis.FileChuteBlackBox?.log?.(checkpoint, {
      transferToken: payload?.transferToken || null,
      itemName: payload?.originalName || payload?.name || null,
      relativePath: payload?.relativePath || null,
      handler: "page-drop-bridge.js",
      receiverStrategy,
      ...details
    });
  }

  diagnostic("receiver-initialized", null, { result: "ok", receiverGeneration: GENERATION, pathname: location.pathname, receiverOwner: "page-drop-bridge.js:canonical-single-owner" });
  diagnostic("receiver-owner-selected", null, { result: "ok", receiverOwner: "page-drop-bridge.js", compactTicketOwnerCount: 1 });

  function extensionContextAvailable() {
    try {
      return Boolean(globalThis.chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function activeBridge() {
    return globalThis[MARKER] === GENERATION && extensionContextAvailable();
  }

  function validPayload(payload) {
    return payload?.protocol === "filechute-item" && payload?.version === 1 ? payload : null;
  }

  function parseCompact(text) {
    if (!text.startsWith(COMPACT_PREFIX)) return null;
    const parts = text.slice(COMPACT_PREFIX.length).split("|");
    if (parts.length < 5) return null;
    const [sourceExtensionId, transferToken, kindCode, encodedPath, ...nameParts] = parts;
    if (!sourceExtensionId || !transferToken) return null;

    try {
      const relativePath = decodeURIComponent(encodedPath || "");
      const originalName = decodeURIComponent(nameParts.join("|") || "");
      return {
        protocol: "filechute-item",
        version: 1,
        kind: kindCode === "d" ? "directory" : "file",
        name: originalName,
        originalName,
        representation: "original",
        mime: kindCode === "d" ? "inode/directory" : "",
        relativePath,
        sourceUrl: null,
        parentPageUrl: null,
        size: null,
        lastModified: null,
        sourceExtensionId,
        transferToken
      };
    } catch {
      return null;
    }
  }

  function parseLegacy(text) {
    if (!text.startsWith(LEGACY_PREFIX)) return null;
    try {
      return validPayload(JSON.parse(decodeURIComponent(text.slice(LEGACY_PREFIX.length))));
    } catch {
      return null;
    }
  }

  function parsePayload(transfer) {
    try {
      const raw = transfer?.getData(FILECHUTE_DRAG_TYPE);
      if (raw) {
        const payload = validPayload(JSON.parse(raw));
        if (payload) return payload;
      }
    } catch {}

    try {
      const text = String(transfer?.getData("text/plain") || "");
      return parseCompact(text) || parseLegacy(text);
    } catch {
      return null;
    }
  }

  function nativeFiles(transfer) {
    const files = [];
    if (!transfer) return files;

    try {
      for (const file of [...(transfer.files || [])]) {
        if (file instanceof File && file.size >= 0) files.push(file);
      }
    } catch {}

    if (files.length) return files;

    try {
      for (const item of [...(transfer.items || [])]) {
        if (item?.kind !== "file") continue;
        const file = item.getAsFile?.();
        if (file instanceof File) files.push(file);
      }
    } catch {}

    return files;
  }

  function hasUsableNativeFile(transfer) {
    return nativeFiles(transfer).length > 0;
  }

  function base64File(response) {
    const binary = atob(String(response?.base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], response?.name || "FileChute file", {
      type: response?.type || "application/octet-stream",
      lastModified: Number(response?.lastModified) || Date.now()
    });
  }

  function showToast(message, error = false) {
    let toast = document.getElementById("__filechute_page_drop_toast__");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "__filechute_page_drop_toast__";
      Object.assign(toast.style, {
        position: "fixed",
        left: "18px",
        bottom: "18px",
        zIndex: "2147483647",
        maxWidth: "420px",
        padding: "9px 12px",
        borderRadius: "10px",
        background: "rgba(18,20,20,.96)",
        color: "#f3f5f0",
        boxShadow: "0 10px 30px rgba(0,0,0,.3)",
        font: "600 12px/1.35 system-ui, sans-serif",
        pointerEvents: "none",
        transition: "opacity 140ms ease",
        opacity: "0"
      });
      (document.documentElement || document.body).append(toast);
    }
    toast.textContent = message;
    toast.style.border = error ? "1px solid rgba(224,93,68,.65)" : "1px solid rgba(255,255,255,.14)";
    toast.style.opacity = "1";
    clearTimeout(globalThis.__filechutePageDropToastTimer);
    globalThis.__filechutePageDropToastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 2600);
  }

  function inputAccepts(input, file) {
    const accept = String(input?.accept || "").trim().toLowerCase();
    if (!accept) return true;
    const mime = String(file.type || "").toLowerCase();
    const lowerName = String(file.name || "").toLowerCase();
    return accept.split(",").map((part) => part.trim()).filter(Boolean).some((rule) => {
      if (rule.startsWith(".")) return lowerName.endsWith(rule);
      if (rule.endsWith("/*")) return mime.startsWith(rule.slice(0, -1));
      return mime === rule;
    });
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function collectInputs(root, result) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('input[type="file"]').forEach((input) => {
      if (!input.disabled && !result.includes(input)) result.push(input);
    });
    root.querySelectorAll("*").forEach((node) => {
      if (node.shadowRoot) collectInputs(node.shadowRoot, result);
    });
  }

  function candidateInputs(target) {
    const local = [];
    const global = [];
    const addLocal = (input) => {
      if (input instanceof HTMLInputElement && input.type === "file" && !input.disabled && !local.includes(input)) local.push(input);
    };

    if (target instanceof HTMLInputElement) addLocal(target);
    if (target instanceof Element) {
      addLocal(target.closest("label")?.querySelector('input[type="file"]'));
      target.closest("form")?.querySelectorAll('input[type="file"]').forEach(addLocal);
      let parent = target;
      for (let depth = 0; parent && depth < 7; depth += 1, parent = parent.parentElement) {
        parent.querySelectorAll?.('input[type="file"]').forEach(addLocal);
      }
    }

    collectInputs(document, global);
    const remaining = global.filter((input) => !local.includes(input));
    local.sort((a, b) => Number(visible(b)) - Number(visible(a)));
    remaining.sort((a, b) => Number(visible(b)) - Number(visible(a)));
    return [...local, ...remaining];
  }

  function assignFile(input, file, payload) {
    if (!inputAccepts(input, file)) {
      diagnostic("receiver-input-assignment-result", payload, { result: "ignored", reason: "accept-rejected", accept: input?.accept || "" });
      return false;
    }
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      const assigned = input.files?.length === 1;
      diagnostic("receiver-input-assignment-result", payload, { result: assigned ? "ok" : "failed", resultingFilesLength: input.files?.length || 0, accept: input.accept || "", eventsDispatched: ["input", "change"] });
      return assigned;
    } catch (error) {
      diagnostic("receiver-input-assignment-result", payload, { result: "failed", exception: { name: error?.name, message: error?.message, stack: error?.stack } });
      return false;
    }
  }

  function dragInit(file, originalEvent) {
    const transfer = new DataTransfer();
    transfer.effectAllowed = "copy";
    transfer.items.add(file);
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: transfer,
      clientX: originalEvent.clientX,
      clientY: originalEvent.clientY,
      screenX: originalEvent.screenX,
      screenY: originalEvent.screenY
    };
  }

  function dispatchDrop(target, file, originalEvent, payload) {
    if (!(target instanceof EventTarget)) return false;
    try {
      for (const type of ["dragenter", "dragover", "drop"]) {
        diagnostic("receiver-synthetic-construction-attempt", payload, { result: "pending", eventOrigin: "synthetic", syntheticEventType: type });
        const syntheticEvent = new DragEvent(type, dragInit(file, originalEvent));
        diagnostic("receiver-synthetic-construction-result", payload, { result: "ok", eventOrigin: "synthetic", syntheticEventType: type });
        diagnostic("receiver-synthetic-dispatch-attempt", payload, { result: "pending", eventOrigin: "synthetic", syntheticEventType: type });
        const accepted = target.dispatchEvent(syntheticEvent);
        diagnostic("receiver-synthetic-dispatch-result", payload, { result: "ok", eventOrigin: "synthetic", syntheticEventType: type, dispatchReturned: accepted });
      }
      return true;
    } catch (error) {
      diagnostic("receiver-synthetic-dispatch-result", payload, { result: "failed", eventOrigin: "synthetic", exception: { name: error?.name, message: error?.message, stack: error?.stack } });
      return false;
    }
  }

  function clearPageDropState(target, originalEvent) {
    const targets = [target, document.body, document.documentElement].filter((item, index, list) => item && list.indexOf(item) === index);
    for (const item of targets) {
      try {
        item.dispatchEvent(new DragEvent("dragleave", {
          bubbles: true,
          cancelable: false,
          composed: true,
          clientX: originalEvent.clientX,
          clientY: originalEvent.clientY
        }));
      } catch {}
    }
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function readDraggedFile(payload) {
    const delays = [0, 40, 100, 220, 420];
    let lastError = null;

    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt]) await wait(delays[attempt]);
      if (!activeBridge()) throw new Error("FileChute reloaded while this page was open. Try the drop again.");

      try {
        diagnostic("receiver-byte-request-started", payload, { result: "pending", requestAttempt: attempt + 1 });
        const response = await chrome.runtime.sendMessage({
          type: "filechute-read-dragged-file-v1",
          transferToken: payload.transferToken,
          relativePath: payload.relativePath,
          representation: payload.representation || "original",
          mime: payload.mime || ""
        });

        if (response?.ok) {
          diagnostic("receiver-byte-request-result", payload, { result: "ok", requestAttempt: attempt + 1, byteSize: response.size });
          return response;
        }
        diagnostic("receiver-byte-request-result", payload, { result: "failed", requestAttempt: attempt + 1, error: response?.error || null });
        const message = response?.error || "FileChute could not read that file.";
        lastError = new Error(message);
        if (!/drag is no longer available|not registered|no longer available/i.test(message)) throw lastError;
      } catch (error) {
        lastError = error;
        if (/extension context invalidated/i.test(String(error?.message || error))) {
          throw new Error("FileChute reloaded while this page was open. Try the drop again.");
        }
        if (!/drag is no longer available|not registered|no longer available/i.test(String(error?.message || error))) throw error;
      }
    }

    throw lastError || new Error("FileChute could not read that file.");
  }

  async function receive(payload, event) {
    diagnostic("receiver-claim", payload, { result: "claimed", eventOrigin: event.isTrusted ? "physical" : "synthetic" });
    if (payload.kind === "directory") throw new Error("This website upload target accepts files, not a FileChute directory.");
    if (!payload.transferToken || !payload.relativePath) throw new Error("Reload FileChute and drag this item again.");

    const response = await readDraggedFile(payload);
    const file = base64File(response);
    diagnostic("receiver-file-reconstructed", payload, { result: "ok", file: { name: file.name, type: file.type, size: file.size } });
    const inputs = candidateInputs(event.target).filter((candidate) => inputAccepts(candidate, file));
    const input = inputs[0];
    diagnostic("receiver-input-candidates", payload, { result: input ? "ok" : "ignored", candidateCount: inputs.length, selected: input ? { accept: input.accept || "", disabled: input.disabled } : null });

    if (input && assignFile(input, file, payload)) {
      if (receiverStrategy === "legacy-synthetic-fallback") clearPageDropState(event.target, event);
      showToast(`Sent ${file.name} to this page.`);
      return;
    }

    if (receiverStrategy === "direct-input-only") {
      diagnostic("receiver-no-compatible-direct-target", payload, { result: "failed", candidateCount: inputs.length, syntheticEventsSuppressed: ["dragenter", "dragover", "drop", "dragleave"] });
      throw new Error("This page does not expose a compatible direct file input. Synthetic drag fallback is disabled for this Windows diagnostic run.");
    }

    if (dispatchDrop(event.target, file, event, payload)) {
      clearPageDropState(event.target, event);
      showToast(`Passed ${file.name} to this drop target.`);
      return;
    }

    clearPageDropState(event.target, event);
    throw new Error("This page does not expose a compatible file upload target.");
  }

  document.addEventListener("dragover", (event) => {
    if (!activeBridge()) return;
    const types = [...(event.dataTransfer?.types || [])];
    if (!types.includes(FILECHUTE_DRAG_TYPE) && !types.includes("text/plain")) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    diagnostic("receiver-dragover-policy", null, { result: "claimed", eventOrigin: event.isTrusted ? "physical" : "synthetic", preventDefaultCalled: true, types, dropEffect: event.dataTransfer?.dropEffect || null });
  }, true);

  document.addEventListener("drop", (event) => {
    if (!activeBridge()) return;
    const payload = parsePayload(event.dataTransfer);
    if (!payload) return;

    diagnostic("receiver-ticket-detected", payload, { result: "ok", eventOrigin: event.isTrusted ? "physical" : "synthetic", ticketFormat: [...(event.dataTransfer?.types || [])].includes(FILECHUTE_DRAG_TYPE) ? "custom-or-text" : "text", transfer: globalThis.FileChuteBlackBox?.transferSnapshot?.(event.dataTransfer) || null });

    if (hasUsableNativeFile(event.dataTransfer)) {
      diagnostic("receiver-native-file-delegated", payload, { result: "ok", usableFileCount: nativeFiles(event.dataTransfer).length });
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    diagnostic("receiver-physical-drop-claimed", payload, { result: "claimed", eventOrigin: event.isTrusted ? "physical" : "synthetic", preventDefaultCalled: true, propagationStopped: true });
    showToast(`FileChute ticket caught: ${payload.originalName || payload.name || "item"}`);

    void receive(payload, event).then(() => diagnostic("receiver-handoff-completed", payload, { result: "ok" })).catch((error) => {
      diagnostic("receiver-handoff-completed", payload, { result: "failed", exception: { name: error?.name, message: error?.message, stack: error?.stack } });
      if (receiverStrategy === "legacy-synthetic-fallback") clearPageDropState(event.target, event);
      console.error("FileChute website handoff failed", error);
      showToast(error?.message || "Could not send that FileChute file to this page.", true);
    });
  }, true);
})();
