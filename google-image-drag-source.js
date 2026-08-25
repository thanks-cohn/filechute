(() => {
  const KEY = "filechute-google-drag-source-v1";
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

  function nestedGoogleUrls(value) {
    const results = [];
    try {
      const url = new URL(String(value || ""), location.href);
      for (const key of ["imgurl", "mediaurl", "image_url", "image", "img", "url"]) {
        const nested = url.searchParams.get(key);
        if (!nested) continue;
        try {
          const decoded = decodeURIComponent(nested);
          if (/^(?:https?:|data:image\/|blob:)/i.test(decoded)) results.push(decoded);
        } catch {}
      }
    } catch {}
    return results;
  }

  function collectFromImage(image) {
    const urls = [];
    if (!(image instanceof HTMLImageElement)) return urls;

    for (const value of [
      image.currentSrc,
      image.src,
      image.getAttribute("data-iurl"),
      image.getAttribute("data-image-url"),
      image.getAttribute("data-original"),
      image.getAttribute("data-src"),
      image.getAttribute("data-url")
    ]) pushUrl(urls, value);

    for (const attr of ["srcset", "data-srcset"]) {
      for (const value of srcsetUrls(image.getAttribute(attr))) pushUrl(urls, value);
    }

    let node = image;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const links = [];
      if (node instanceof HTMLAnchorElement && node.href) links.push(node.href);
      node.querySelectorAll?.("a[href]").forEach((anchor) => links.push(anchor.href));
      for (const href of links) {
        for (const nested of nestedGoogleUrls(href)) pushUrl(urls, nested);
        pushUrl(urls, href);
      }

      for (const attr of ["data-iurl", "data-image-url", "data-original", "data-src", "data-url"]) {
        const value = node.getAttribute?.(attr);
        pushUrl(urls, value);
        for (const nested of nestedGoogleUrls(value)) pushUrl(urls, nested);
      }
    }

    return urls.slice(0, MAX_URLS);
  }

  function imageForDragTarget(target) {
    if (target instanceof HTMLImageElement) return target;
    if (!(target instanceof Element)) return null;
    return target.closest("img") || target.querySelector("img");
  }

  document.addEventListener("dragstart", (event) => {
    const image = imageForDragTarget(event.target);
    if (!image) return;

    const urls = collectFromImage(image);
    if (!urls.length) return;

    const payload = {
      capturedAt: Date.now(),
      pageUrl: location.href,
      title: image.alt || image.title || document.title || "Google image",
      urls
    };

    try {
      chrome.storage.local.set({ [KEY]: payload });
    } catch {}
  }, true);
})();
