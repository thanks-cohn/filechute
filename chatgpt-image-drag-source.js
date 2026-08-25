(() => {
  const KEY = "filechute-chatgpt-drag-source-v1";
  const MAX_URLS = 24;
  const PRIME_MAX_AGE_MS = 4000;
  let primedCapture = null;

  function cleanUrl(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .trim();
  }

  function pushUrl(list, value) {
    const text = cleanUrl(value);
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

  function backgroundUrls(value) {
    const results = [];
    const text = String(value || "");
    const re = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = re.exec(text))) pushUrl(results, match[2]);
    return results;
  }

  function urlsFromAttribute(value) {
    const results = [];
    const text = cleanUrl(value);
    if (!text) return results;
    pushUrl(results, text);
    for (const match of text.match(/(?:https?:\/\/|blob:|data:image\/)[^\s"'<>]+/gi) || []) pushUrl(results, match);
    return results;
  }

  function addImageUrls(urls, image) {
    if (!(image instanceof HTMLImageElement)) return;
    for (const value of [
      image.currentSrc,
      image.src,
      image.getAttribute("data-src"),
      image.getAttribute("data-url"),
      image.getAttribute("data-image-url"),
      image.getAttribute("data-original"),
      image.getAttribute("data-testid-src"),
      image.getAttribute("data-download-url")
    ]) pushUrl(urls, value);

    for (const attr of ["srcset", "data-srcset"]) {
      for (const value of srcsetUrls(image.getAttribute(attr))) pushUrl(urls, value);
    }

    const picture = image.closest("picture");
    picture?.querySelectorAll("source[srcset], source[data-srcset]").forEach((source) => {
      for (const attr of ["srcset", "data-srcset"]) {
        for (const value of srcsetUrls(source.getAttribute(attr))) pushUrl(urls, value);
      }
    });
  }

  function addElementUrls(urls, element) {
    if (!(element instanceof Element)) return;
    if (element instanceof HTMLImageElement) addImageUrls(urls, element);
    if (element instanceof HTMLAnchorElement) pushUrl(urls, element.href);

    for (const attr of element.attributes || []) {
      if (!/(?:src|url|href|image|download|original|asset|file)/i.test(attr.name)) continue;
      for (const value of urlsFromAttribute(attr.value)) pushUrl(urls, value);
    }

    try {
      for (const value of backgroundUrls(getComputedStyle(element).backgroundImage)) pushUrl(urls, value);
    } catch {}
  }

  function nearbyElements(event) {
    const result = [];
    const add = (node) => {
      if (!(node instanceof Element) || result.includes(node)) return;
      result.push(node);
    };

    for (const node of event?.composedPath?.() || []) add(node);
    add(event?.target);
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      try { add(document.elementFromPoint(event.clientX, event.clientY)); } catch {}
    }

    const seeds = [...result];
    for (const seed of seeds) {
      let node = seed;
      for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) add(node);
    }
    return result;
  }

  function collectFromEvent(event) {
    const urls = [];
    const elements = nearbyElements(event);

    // First inspect the exact event path / overlay stack so the visible tile wins.
    for (const element of elements) addElementUrls(urls, element);

    // ChatGPT's /images gallery can start a native drag from an overlay/button
    // rather than the <img> itself. Search only the nearest wrappers for the
    // image underneath that overlay instead of scanning the whole gallery.
    for (const element of elements.slice(0, 12)) {
      element.querySelectorAll?.("img, picture img").forEach((image) => addImageUrls(urls, image));
      element.querySelectorAll?.("[style*='background'], a[href]").forEach((child) => addElementUrls(urls, child));
      if (urls.length >= MAX_URLS) break;
    }

    return urls.slice(0, MAX_URLS);
  }

  function titleFromEvent(event) {
    for (const element of nearbyElements(event)) {
      if (element instanceof HTMLImageElement) {
        const value = element.alt || element.title;
        if (value) return String(value).replace(/\s+/g, " ").trim().slice(0, 120);
      }
      const value = element.getAttribute?.("aria-label") || element.getAttribute?.("title");
      if (value && !/^(?:download|share|edit|more)$/i.test(String(value).trim())) {
        return String(value).replace(/\s+/g, " ").trim().slice(0, 120);
      }
    }
    return "ChatGPT image";
  }

  function saveCapture(payload) {
    if (!payload?.urls?.length) return;
    primedCapture = payload;
    try { chrome.storage.local.set({ [KEY]: payload }); } catch {}
  }

  function primeFromPointer(event) {
    if (event.button != null && event.button !== 0) return;
    const urls = collectFromEvent(event);
    if (!urls.length) return;
    saveCapture({
      capturedAt: Date.now(),
      pageUrl: location.href,
      title: titleFromEvent(event),
      urls,
      dragConfirmed: false,
      sourceEvent: "pointerdown"
    });
  }

  document.addEventListener("pointerdown", primeFromPointer, true);
  document.addEventListener("mousedown", (event) => {
    if (typeof PointerEvent !== "undefined") return;
    primeFromPointer(event);
  }, true);

  document.addEventListener("dragstart", (event) => {
    let urls = collectFromEvent(event);
    let title = titleFromEvent(event);

    if (!urls.length && primedCapture && Date.now() - Number(primedCapture.capturedAt || 0) <= PRIME_MAX_AGE_MS) {
      urls = primedCapture.urls;
      title = primedCapture.title || title;
    }
    if (!urls.length) return;

    saveCapture({
      capturedAt: Date.now(),
      pageUrl: location.href,
      title,
      urls,
      dragConfirmed: true,
      sourceEvent: "dragstart"
    });
  }, true);
})();
