(() => {
  const KEY = "filechute-yandex-drag-source-v1";
  const MAX_URLS = 24;

  function cleanEscapedUrl(value) {
    return String(value || "")
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .trim();
  }

  function pushUrl(list, value) {
    const text = cleanEscapedUrl(value);
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

  function nestedYandexUrls(value) {
    const results = [];
    try {
      const url = new URL(String(value || ""), location.href);
      for (const key of [
        "img_url", "imgurl", "image_url", "image", "img", "mediaurl",
        "orig_url", "origUrl", "original", "url", "rurl"
      ]) {
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

  function urlsFromAttributeBlob(value) {
    const text = cleanEscapedUrl(value);
    if (!text) return [];
    const results = [];

    for (const nested of nestedYandexUrls(text)) pushUrl(results, nested);

    const matches = text.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
    for (const match of matches) pushUrl(results, match);

    try {
      const parsed = JSON.parse(text);
      const walk = (node, depth = 0) => {
        if (depth > 8 || node == null) return;
        if (typeof node === "string") {
          pushUrl(results, node);
          for (const nested of nestedYandexUrls(node)) pushUrl(results, nested);
          return;
        }
        if (Array.isArray(node)) {
          for (const item of node) walk(item, depth + 1);
          return;
        }
        if (typeof node === "object") {
          for (const [key, item] of Object.entries(node)) {
            if (/url|src|orig|preview|image|img/i.test(key)) walk(item, depth + 1);
          }
        }
      };
      walk(parsed);
    } catch {}

    return results;
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
      image.getAttribute("data-origin"),
      image.getAttribute("data-thumb")
    ]) {
      pushUrl(urls, value);
      for (const nested of nestedYandexUrls(value)) pushUrl(urls, nested);
    }

    for (const attr of ["srcset", "data-srcset"]) {
      for (const value of srcsetUrls(image.getAttribute(attr))) pushUrl(urls, value);
    }

    let node = image;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (node instanceof HTMLAnchorElement && node.href) {
        for (const nested of nestedYandexUrls(node.href)) pushUrl(urls, nested);
        pushUrl(urls, node.href);
      }

      node.querySelectorAll?.("a[href]").forEach((anchor) => {
        for (const nested of nestedYandexUrls(anchor.href)) pushUrl(urls, nested);
        pushUrl(urls, anchor.href);
      });

      for (const attr of node.attributes || []) {
        if (!/data-|href|src/i.test(attr.name)) continue;
        for (const candidate of urlsFromAttributeBlob(attr.value)) pushUrl(urls, candidate);
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
      title: image.alt || image.title || document.title || "Yandex image",
      urls
    };

    try {
      chrome.storage.local.set({ [KEY]: payload });
    } catch {}
  }, true);
})();
