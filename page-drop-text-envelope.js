(() => {
  const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
  const FILECHUTE_TEXT_PREFIX = "FILECHUTE1|";

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

  function parseTicket(transfer) {
    let text = "";
    try {
      text = String(transfer?.getData("text/plain") || "");
    } catch {
      return null;
    }
    if (!text.startsWith(FILECHUTE_TEXT_PREFIX)) return null;

    const parts = text.slice(FILECHUTE_TEXT_PREFIX.length).split("|");
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

  document.addEventListener("dragover", (event) => {
    if (!looksLikeTransport(event.dataTransfer)) return;

    // The ticket is intentionally standard text so it survives the renderer
    // boundary. Keep the page drop-eligible; we verify the FileChute prefix at
    // drop time before consuming anything.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, true);

  document.addEventListener("drop", (event) => {
    const payload = parseTicket(event.dataTransfer);
    if (!payload) return;

    // Do not let the website insert the transport ticket as ordinary text.
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
