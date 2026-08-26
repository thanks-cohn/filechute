(() => {
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  const FILECHUTE_TEXT_PREFIX = "filechute-transfer-v1:";

  function looksLikeTransport(transfer) {
    try {
      const types = [...(transfer?.types || [])];
      return types.includes("text/plain") && (transfer.effectAllowed === "copy" || transfer.effectAllowed === "all" || transfer.effectAllowed === "uninitialized");
    } catch {
      return false;
    }
  }

  function parseEnvelope(transfer) {
    let text = "";
    try {
      text = String(transfer?.getData("text/plain") || "");
    } catch {
      return null;
    }
    if (!text.startsWith(FILECHUTE_TEXT_PREFIX)) return null;

    try {
      const payload = JSON.parse(decodeURIComponent(text.slice(FILECHUTE_TEXT_PREFIX.length)));
      if (payload?.protocol !== "filechute-item" || payload?.version !== 1) return null;
      return payload;
    } catch {
      return null;
    }
  }

  document.addEventListener("dragover", (event) => {
    if (!looksLikeTransport(event.dataTransfer)) return;

    // Chromium may strip FileChute's custom MIME type when the drag crosses
    // from an extension side panel into another renderer. text/plain survives,
    // so keep the destination drop-eligible until we can inspect the envelope
    // at the actual drop event.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, true);

  document.addEventListener("drop", (event) => {
    const payload = parseEnvelope(event.dataTransfer);
    if (!payload) return;

    // Do not let the target website insert the transport envelope as text.
    event.preventDefault();
    event.stopImmediatePropagation();

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
