(() => {
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  const COMPACT_PREFIX = "FILECHUTE1|";
  const LEGACY_PREFIX = "filechute-transfer-v1:";

  function looksLikeTransport(transfer) {
    try {
      const types = [...(transfer?.types || [])];
      return types.includes("text/plain") && (
        transfer.effectAllowed === "copy" ||
        transfer.effectAllowed === "all" ||
        transfer.effectAllowed === "uninitialized"
      );
    } catch {
      return false;
    }
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

  function parseTicket(transfer) {
    let text = "";
    try {
      text = String(transfer?.getData("text/plain") || "");
    } catch {
      return null;
    }
    return parseCompact(text) || parseLegacy(text);
  }

  function showCaught(payload) {
    let toast = document.getElementById("__filechute_transport_toast__");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "__filechute_transport_toast__";
      Object.assign(toast.style, {
        position: "fixed",
        right: "18px",
        bottom: "18px",
        zIndex: "2147483647",
        padding: "8px 11px",
        borderRadius: "9px",
        background: "rgba(18,20,20,.96)",
        color: "#f3f5f0",
        border: "1px solid rgba(255,255,255,.14)",
        font: "600 12px/1.3 system-ui, sans-serif",
        pointerEvents: "none"
      });
      (document.documentElement || document.body).append(toast);
    }
    toast.textContent = `FileChute ticket caught: ${payload?.originalName || payload?.name || "item"}`;
    clearTimeout(globalThis.__filechuteTransportToastTimer);
    globalThis.__filechuteTransportToastTimer = setTimeout(() => toast.remove(), 1800);
  }

  document.addEventListener("dragover", (event) => {
    if (!looksLikeTransport(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, true);

  document.addEventListener("drop", (event) => {
    const payload = parseTicket(event.dataTransfer);
    if (!payload) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showCaught(payload);

    const transfer = new DataTransfer();
    transfer.effectAllowed = "copy";
    transfer.setData(FILECHUTE_DRAG_TYPE, JSON.stringify(payload));

    const target = event.target instanceof EventTarget ? event.target : document;
    target.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: transfer,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY
    }));
  }, true);
})();
