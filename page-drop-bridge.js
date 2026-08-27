(() => {
  const MARKER = "__filechute_page_drop_bridge_v2__";
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  const FILECHUTE_DRAG_PREFIX = "FILECHUTE1|";
  const ARM_TIMEOUT_MS = 15000;

  if (globalThis[MARKER]) return;
  globalThis[MARKER] = true;

  let armedPayload = null;
  let armedTimer = null;
  let delivering = false;

  function extensionContextAvailable() {
    try { return Boolean(globalThis.chrome?.runtime?.id); } catch { return false; }
  }

  function clearArmed() {
    armedPayload = null;
    if (armedTimer) clearTimeout(armedTimer);
    armedTimer = null;
  }

  function arm(payload) {
    if (!payload?.transferToken || !payload?.relativePath) return;
    armedPayload = { ...payload };
    if (armedTimer) clearTimeout(armedTimer);
    armedTimer = setTimeout(clearArmed, ARM_TIMEOUT_MS);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "filechute-drag-out-start-v1") arm(message.payload);
    if (message?.type === "filechute-drag-out-end-v1") clearArmed();
  });

  function parsePrivatePayload(transfer) {
    try {
      const raw = transfer?.getData(FILECHUTE_DRAG_TYPE);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (payload?.protocol !== "filechute-item" || payload?.version !== 1) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function decodeTicket(value) {
    const text = String(value || "");
    if (!text.startsWith(FILECHUTE_DRAG_PREFIX)) return null;
    const parts = text.slice(FILECHUTE_DRAG_PREFIX.length).split("|");
    if (parts.length < 5) return null;
    try {
      const [sourceExtensionId, transferToken, kind, relativePath, originalName] = parts.map(decodeURIComponent);
      if (!transferToken || !relativePath) return null;
      return {
        protocol: "filechute-item",
        version: 1,
        sourceExtensionId,
        transferToken,
        kind: kind || "file",
        relativePath,
        representation: "original",
        name: originalName || relativePath.split("/").at(-1) || "FileChute file",
        originalName: originalName || relativePath.split("/").at(-1) || "FileChute file"
      };
    } catch {
      return null;
    }
  }

  function parseTicketPayload(transfer) {
    try { return decodeTicket(transfer?.getData("text/plain")); } catch { return null; }
  }

  function payloadForDrop(transfer) {
    return parsePrivatePayload(transfer) || parseTicketPayload(transfer) || armedPayload;
  }

  function nativeFiles(transfer) {
    const files = [];
    if (!transfer) return files;
    try {
      for (const file of [...(transfer.files || [])]) {
        if (file instanceof File) files.push(file);
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
    globalThis.__filechutePageDropToastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 2200);
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
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
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
    const add = (input) => {
      if (input instanceof HTMLInputElement && input.type === "file" && !input.disabled && !local.includes(input)) local.push(input);
    };

    if (target instanceof HTMLInputElement) add(target);
    if (target instanceof Element) {
      add(target.closest("label")?.querySelector('input[type="file"]'));
      target.closest("form")?.querySelectorAll('input[type="file"]').forEach(add);
      let parent = target;
      for (let depth = 0; parent && depth < 7; depth += 1, parent = parent.parentElement) {
        parent.querySelectorAll?.('input[type="file"]').forEach(add);
      }
    }

    collectInputs(document, global);
    const remaining = global.filter((input) => !local.includes(input));
    local.sort((a, b) => Number(visible(b)) - Number(visible(a)));
    remaining.sort((a, b) => Number(visible(b)) - Number(visible(a)));
    return [...local, ...remaining];
  }

  function assignFile(input, file) {
    if (!inputAccepts(input, file)) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return Boolean(input.files?.length);
    } catch {
      return false;
    }
  }

  function dispatchDrop(target, file, originalEvent) {
    if (!(target instanceof EventTarget)) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      transfer.effectAllowed = "copy";
      const options = {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: transfer,
        clientX: originalEvent.clientX,
        clientY: originalEvent.clientY,
        screenX: originalEvent.screenX,
        screenY: originalEvent.screenY
      };
      target.dispatchEvent(new DragEvent("dragenter", options));
      target.dispatchEvent(new DragEvent("dragover", options));
      target.dispatchEvent(new DragEvent("drop", options));
      return true;
    } catch {
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
    const delays = [0, 35, 90, 180, 350];
    let lastError = null;
    for (const delay of delays) {
      if (delay) await wait(delay);
      if (!extensionContextAvailable()) throw new Error("FileChute reloaded while this page was open. Try again.");
      try {
        const response = await chrome.runtime.sendMessage({
          type: "filechute-read-dragged-file-v1",
          transferToken: payload.transferToken,
          relativePath: payload.relativePath,
          representation: payload.representation || "original",
          mime: payload.mime || ""
        });
        if (response?.ok) return response;
        const message = response?.error || "FileChute could not read that file.";
        lastError = new Error(message);
        if (!/no longer available|not registered/i.test(message)) throw lastError;
      } catch (error) {
        lastError = error;
        if (!/no longer available|not registered/i.test(String(error?.message || error))) throw error;
      }
    }
    throw lastError || new Error("FileChute could not read that file.");
  }

  async function receive(payload, event) {
    if (delivering) return;
    if (payload.kind === "directory") throw new Error("This website target accepts files, not a FileChute directory.");
    if (!payload.transferToken || !payload.relativePath) throw new Error("Drag the FileChute item again.");

    delivering = true;
    try {
      const response = await readDraggedFile(payload);
      const file = base64File(response);
      const input = candidateInputs(event.target).find((candidate) => inputAccepts(candidate, file));

      if (input && assignFile(input, file)) {
        clearPageDropState(event.target, event);
        showToast(`Sent ${file.name}`);
        return;
      }

      if (dispatchDrop(event.target, file, event)) {
        clearPageDropState(event.target, event);
        showToast(`Sent ${file.name}`);
        return;
      }

      throw new Error("This page does not expose a compatible file drop target.");
    } finally {
      clearArmed();
      delivering = false;
    }
  }

  document.addEventListener("dragover", (event) => {
    if (!extensionContextAvailable() || delivering) return;
    const types = [...(event.dataTransfer?.types || [])];
    const privateType = types.includes(FILECHUTE_DRAG_TYPE);
    if (!armedPayload && !privateType) return;

    event.preventDefault();
    try { event.dataTransfer.dropEffect = "copy"; } catch {}
  }, true);

  document.addEventListener("drop", (event) => {
    if (!extensionContextAvailable() || delivering) return;
    const payload = payloadForDrop(event.dataTransfer);
    if (!payload) return;

    if (hasUsableNativeFile(event.dataTransfer)) {
      clearArmed();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    void receive(payload, event).catch((error) => {
      clearPageDropState(event.target, event);
      clearArmed();
      console.error("FileChute website handoff failed", error);
      showToast(error?.message || "Could not send that FileChute file to this page.", true);
    });
  }, true);

  window.addEventListener("blur", () => {
    if (!armedPayload || delivering) return;
    setTimeout(() => {
      if (!delivering) clearArmed();
    }, 1600);
  });
})();
