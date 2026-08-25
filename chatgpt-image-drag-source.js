(() => {
  const KEY = "filechute-chatgpt-drag-source-v1";
  const MAX_URLS = 16;

  function pushUrl(list, value) {
    const text = String(value || "").trim();
    if (!text || list.includes(text)) return;
    if (!/^(?:https?:|data:image\/|blob:)/i.test(text)) return;
    list.push(text);
  }

  function srcsetUrls(value) {
    return String(value || "")
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function collectFromImage(image) {
    const urls = [];
    if (!(image instanceof HTMLImageElement)) return urls;

    for (const value of [
      image.currentSrc,
      image.src,
      image.getAttribute("data-src"),
      image.getAttribute("data-url"),
      image.getAttribute("data-image-url"),
      image.getAttribute("data-original"),
      image.getAttribute("data-testid-src")
    ]) pushUrl(urls, value);

    for (const attr of ["srcset", "data-srcset"]) {
      for (const value of srcsetUrls(image.getAttribute(attr))) pushUrl(urls, value);
    }

    let node = image;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (node instanceof HTMLAnchorElement && node.href) pushUrl(urls, node.href);
      node.querySelectorAll?.("a[href]").forEach((anchor) => pushUrl(urls, anchor.href));
      for (const attr of ["data-src", "data-url", "data-image-url", "data-original"]) {
        pushUrl(urls, node.getAttribute?.(attr));
      }
    }

    return urls.slice(0, MAX_URLS);
  }

  function imageForDragTarget(target) {
    if (target instanceof HTMLImageElement) return target;
    if (!(target instanceof Element)) return null;
    return target.closest("img") || target.querySelector("img");
  }

  function shortTitle(image) {
    const value = String(image.alt || image.title || "ChatGPT image").replace(/\s+/g, " ").trim();
    return (value || "ChatGPT image").slice(0, 120);
  }

  document.addEventListener("dragstart", (event) => {
    const image = imageForDragTarget(event.target);
    if (!image) return;

    const urls = collectFromImage(image);
    if (!urls.length) return;

    const payload = {
      capturedAt: Date.now(),
      pageUrl: location.href,
      title: shortTitle(image),
      urls
    };

    try {
      chrome.storage.local.set({ [KEY]: payload });
    } catch {}
  }, true);
})();
