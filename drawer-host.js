(() => {
  const HOST_ID = "__filechute_left_drawer__";
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  const existing = document.getElementById(HOST_ID);

  if (existing) {
    const panel = existing.shadowRoot?.querySelector(".filechute-panel");
    if (panel) {
      panel.style.transform = "translateX(-100%)";
      setTimeout(() => existing.remove(), 190);
    } else {
      existing.remove();
    }
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    inset: "0 auto 0 0",
    width: "390px",
    height: "100vh",
    zIndex: "2147483647",
    pointerEvents: "none"
  });

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .filechute-panel {
      position: absolute;
      inset: 0 auto 0 0;
      width: min(390px, calc(100vw - 42px));
      height: 100vh;
      display: block;
      background: #121414;
      border: 0;
      box-shadow: 18px 0 44px rgba(0, 0, 0, 0.38);
      transform: translateX(-100%);
      transition: transform 180ms cubic-bezier(.2,.8,.2,1);
      pointer-events: auto;
    }
    .filechute-close {
      position: absolute;
      top: 9px;
      right: -34px;
      width: 34px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.14);
      border-left: 0;
      border-radius: 0 10px 10px 0;
      background: #121414;
      color: #f3f5f0;
      font: 700 18px/1 system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 8px 0 18px rgba(0,0,0,.24);
      pointer-events: auto;
    }
    .filechute-close:hover { background: #202422; }
    .filechute-toast {
      position: fixed;
      left: 406px;
      bottom: 18px;
      max-width: min(430px, calc(100vw - 430px));
      padding: 9px 12px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 10px;
      background: rgba(18,20,20,.96);
      color: #f3f5f0;
      box-shadow: 0 10px 30px rgba(0,0,0,.3);
      font: 600 12px/1.35 system-ui, sans-serif;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 140ms ease, transform 140ms ease;
      pointer-events: none;
    }
    .filechute-toast.show { opacity: 1; transform: translateY(0); }
    .filechute-toast.error { border-color: rgba(224,93,68,.6); }
  `;

  const frame = document.createElement("iframe");
  frame.className = "filechute-panel";
  frame.src = chrome.runtime.getURL("sidepanel.html");
  frame.title = "Chute";
  frame.setAttribute("allow", "clipboard-write");

  const close = document.createElement("button");
  close.className = "filechute-close";
  close.type = "button";
  close.title = "Close Chute";
  close.setAttribute("aria-label", "Close Chute");
  close.textContent = "‹";

  const toast = document.createElement("div");
  toast.className = "filechute-toast";
  let toastTimer = null;

  function showToast(message, error = false) {
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  const closeDrawer = () => {
    frame.style.transform = "translateX(-100%)";
    setTimeout(() => host.remove(), 190);
  };

  close.addEventListener("click", closeDrawer);
  shadow.append(style, frame, close, toast);
  (document.documentElement || document.body).append(host);

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
    return new File([bytes], response?.name || "Chute file", {
      type: response?.type || "application/octet-stream",
      lastModified: Number(response?.lastModified) || Date.now()
    });
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

  function nearbyInputs(target) {
    const result = [];
    const add = (input) => {
      if (input instanceof HTMLInputElement && input.type === "file" && !input.disabled && !result.includes(input)) result.push(input);
    };

    if (target instanceof HTMLInputElement) add(target);
    if (target instanceof Element) {
      add(target.closest("label")?.querySelector('input[type="file"]'));
      const form = target.closest("form");
      if (form) form.querySelectorAll('input[type="file"]').forEach(add);
      let parent = target;
      for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) {
        parent.querySelectorAll?.('input[type="file"]').forEach(add);
      }
    }
    document.querySelectorAll('input[type="file"]').forEach(add);
    return result;
  }

  function putFileInInput(input, file) {
    if (!inputAccepts(input, file)) return false;
    try {
      const transfer = new DataTransfer();
      if (input.multiple) {
        for (const existingFile of [...(input.files || [])]) transfer.items.add(existingFile);
      }
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return input.files?.length > 0;
    } catch {
      return false;
    }
  }

  function syntheticDrop(target, file, coordinates) {
    if (!(target instanceof EventTarget)) return false;
    try {
      const transfer = new DataTransfer();
      transfer.effectAllowed = "copy";
      transfer.items.add(file);
      const common = {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: transfer,
        clientX: coordinates.clientX,
        clientY: coordinates.clientY,
        screenX: coordinates.screenX,
        screenY: coordinates.screenY
      };
      target.dispatchEvent(new DragEvent("dragenter", common));
      target.dispatchEvent(new DragEvent("dragover", common));
      target.dispatchEvent(new DragEvent("drop", common));
      return true;
    } catch {
      return false;
    }
  }

  function syntheticPaste(target, file) {
    if (!(target instanceof EventTarget)) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      return target.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: transfer
      }));
    } catch {
      return false;
    }
  }

  async function handFileToPage(payload, originalEvent) {
    if (payload.kind === "directory") throw new Error("Web pages cannot receive Chute directories through a normal file upload yet.");
    if (!payload.transferToken || !payload.relativePath) throw new Error("Reload Chute and drag the item again.");

    const response = await chrome.runtime.sendMessage({
      type: "filechute-read-dragged-file-v1",
      transferToken: payload.transferToken,
      relativePath: payload.relativePath,
      representation: payload.representation || "original",
      mime: payload.mime || ""
    });
    if (!response?.ok) throw new Error(response?.error || "Chute could not read that file.");

    const file = base64File(response);
    const target = originalEvent.target;
    const inputs = nearbyInputs(target);
    const accepting = inputs.find((input) => inputAccepts(input, file));
    if (accepting && putFileInInput(accepting, file)) {
      showToast(`Sent ${file.name} to this page.`);
      return;
    }

    const coordinates = {
      clientX: originalEvent.clientX,
      clientY: originalEvent.clientY,
      screenX: originalEvent.screenX,
      screenY: originalEvent.screenY
    };
    if (syntheticDrop(target, file, coordinates)) {
      showToast(`Dropped ${file.name} into this page.`);
      return;
    }

    const pasteTarget = document.activeElement || target;
    if (syntheticPaste(pasteTarget, file)) {
      showToast(`Pasted ${file.name} into this page.`);
      return;
    }

    throw new Error("This page does not expose a compatible file upload target.");
  }

  document.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes(FILECHUTE_DRAG_TYPE)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, true);

  document.addEventListener("drop", (event) => {
    const payload = parsePayload(event.dataTransfer);
    if (!payload) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void handFileToPage(payload, event).catch((error) => {
      console.error("Chute → webpage handoff failed", error);
      showToast(error?.message || "Could not send that file to this page.", true);
    });
  }, true);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      frame.style.transform = "translateX(0)";
    });
  });
})();
