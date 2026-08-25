(() => {
  const MAX_PAGE_RESOURCE_BYTES = 48 * 1024 * 1024;

  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
  }

  function extensionFor(type) {
    return {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/avif": ".avif",
      "image/svg+xml": ".svg"
    }[type] || "";
  }

  function cleanName(value, type) {
    let name = String(value || "browser-image").replace(/[\\/\r\n\0]+/g, "_").trim() || "browser-image";
    if (!/\.[a-z0-9]{1,8}$/i.test(name)) name += extensionFor(type);
    return name;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "filechute-read-page-resource-v1") return false;

    void (async () => {
      const url = String(message?.url || "");
      if (!url || !/^(?:blob:|data:|https?:)/i.test(url)) {
        throw new Error("The page resource URL is not transferable.");
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`The page resource returned HTTP ${response.status}.`);
      const blob = await response.blob();
      if (blob.size > MAX_PAGE_RESOURCE_BYTES) {
        throw new Error("This page-owned resource is too large for the browser bridge. Use the original local file instead.");
      }

      const type = blob.type || "application/octet-stream";
      sendResponse({
        ok: true,
        name: cleanName(message?.suggestedName, type),
        type,
        size: blob.size,
        base64: bytesToBase64(await blob.arrayBuffer())
      });
    })().catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

    return true;
  });
})();
