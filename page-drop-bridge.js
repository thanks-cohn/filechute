(() => {
  const MARKER = "__filechute_page_drop_bridge_v1__";
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  if (globalThis[MARKER]) return;
  globalThis[MARKER] = true;

  function parsePayload(transfer) {
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
    const result = [];
    const add = (input) => {
      if (input instanceof HTMLInputElement && input.type === "file" && !input.disabled && !result.includes(input)) result.push(input);
    };

    if (target instanceof HTMLInputElement) add(target);
    if (target instanceof Element) {
      add(target.closest("label")?.querySelector('input[type="file"]'));
      target.closest("form")?.querySelectorAll('input[type="file"]').forEach(add);
      let parent = target;
      for (let depth = 0; parent && depth < 6; depth += 1, parent = parent.parentElement) {
        parent.querySelectorAll?.('input[type="file"]').forEach(add);
      }
    }
    collectInputs(document, result);

    result.sort((a, b) => Number(visible(b)) - Number(visible(a)));
    return result;
  }

  function assignFile(input, file) {
    if (!inputAccepts(input, file)) return false;
    try {
      const transfer = new DataTransfer();
      if (input.multiple) for (const existing of [...(input.files || [])]) transfer.items.add(existing);
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return input.files?.length > 0;
    } catch {
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

  function dispatchDrop(target, file, originalEvent) {
    if (!(target instanceof EventTarget)) return false;
    try {
      target.dispatchEvent(new DragEvent("dragenter", dragInit(file, originalEvent)));
      target.dispatchEvent(new DragEvent("dragover", dragInit(file, originalEvent)));
      target.dispatchEvent(new DragEvent("drop", dragInit(file, originalEvent)));
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

  async function receive(payload, event) {
    if (payload.kind === "directory") throw new Error("This website upload target accepts files, not a FileChute directory.");
    if (!payload.transferToken || !payload.relativePath) throw new Error("Reload FileChute and drag this item again.");

    const response = await chrome.runtime.sendMessage({
      type: "filechute-read-dragged-file-v1",
      transferToken: payload.transferToken,
      relativePath: payload.relativePath,
      representation: payload.representation || "original",
      mime: payload.mime || ""
    });
    if (!response?.ok) throw new Error(response?.error || "FileChute could not read that file.");

    const file = base64File(response);
    const inputs = candidateInputs(event.target).filter((candidate) => inputAccepts(candidate, file));
    const input = inputs[0];

    if (input && assignFile(input, file)) {
      clearPageDropState(event.target, event);
      showToast(`Sent ${file.name} to this page.`);
      return;
    }

    if (dispatchDrop(event.target, file, event)) {
      clearPageDropState(event.target, event);
      showToast(`Dropped ${file.name} into this page.`);
      return;
    }

    clearPageDropState(event.target, event);
    throw new Error("This page does not expose a compatible file upload target.");
  }

  document.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes(FILECHUTE_DRAG_TYPE)) return;
    // Allow FileChute's drop while still letting the page's own dragover
    // listeners run. Pages such as ChatGPT use those listeners to manage their
    // visible drop overlay.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, true);

  document.addEventListener("drop", (event) => {
    const payload = parsePayload(event.dataTransfer);
    if (!payload) return;

    // Prevent browser navigation/default handling, but intentionally do NOT
    // stop propagation. The target page must receive its own drop lifecycle so
    // it can dismiss overlays and reset drag UI normally.
    event.preventDefault();

    void receive(payload, event).catch((error) => {
      clearPageDropState(event.target, event);
      console.error("FileChute website handoff failed", error);
      showToast(error?.message || "Could not send that FileChute file to this page.", true);
    });
  }, true);
})();
