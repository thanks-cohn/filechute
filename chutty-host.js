(() => {
  if (window.top !== window || document.getElementById("__chutty_host")) return;

  const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
  const SOURCE_CAPTURE_MAX_AGE_MS = 15000;
  const SUPPORT_IDLE_MS = 8000;
  const FALLBACK_ANIMATIONS = [
    { id:"idle", name:"Idle", cycle:true, sequence:[{ face:"•ᴗ•", label:"CHUTE", duration:260 }] },
    { id:"happy", name:"Happy", cycle:true, sequence:[{ face:">ᴗ<", label:"YAY", className:"play-pop", duration:340 }] },
    { id:"ready", name:"Ready to receive", cycle:false, sequence:[{ face:"•O•", label:"DROP!", className:"ready", duration:240 }] },
    { id:"eating", name:"Eating", cycle:false, loop:true, sequence:[{ face:"•◡•", label:"EATING", className:"play-chomp", duration:180 }, { face:"•O•", label:"EATING", className:"play-squish", duration:180 }] },
    { id:"success", name:"Success", cycle:false, restoreAfter:900, sequence:[{ face:"^ ^", label:"YUMMY", className:"success", duration:360 }] },
    { id:"failure", name:"Could not receive", cycle:false, restoreAfter:1200, sequence:[{ face:"×︵×", label:"TRY AGAIN", className:"failure", duration:320 }] }
  ];
  const FALLBACK_KEYS = {
    visible: "chute-chutty-visible",
    clickCycle: "chute-chutty-click-cycle",
    supportVisible: "chute-chutty-support-visible",
    hoverMenu: "chute-chutty-hover-menu",
    position: "chute-chutty-position",
    animationOrder: "chute-chutty-animation-order-v1",
    animationEnabled: "chute-chutty-animation-enabled-v1",
    ingestCount: "chute-ingest-count"
  };
  const DEFAULTS = { visible:true, clickCycle:true, supportVisible:true, hoverMenu:true, position:"right" };

  const host = document.createElement("div");
  host.id = "__chutty_host";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:18px;bottom:18px;width:92px;height:104px;z-index:2147483647;pointer-events:auto;font-family:"Trebuchet MS",ui-rounded,system-ui,sans-serif;transition:width .12s ease,height .12s ease}
      :host([hidden]){display:none!important}
      :host(.position-left){right:auto;left:18px}
      :host(.expanded){width:208px;height:222px}
      :host(.support-visible){width:218px}
      :host(.expanded.support-visible){width:218px;height:222px}
      :host(.position-left.support-visible) .support{left:91px;right:auto}
      :host(.position-left) .menu{left:4px;right:auto}
      *{box-sizing:border-box}
      .chutty{position:absolute;right:6px;bottom:8px;width:78px;height:88px;padding:0;border:0;background:transparent;cursor:pointer;filter:drop-shadow(0 5px 5px #0004);transform:rotate(1.5deg);transform-origin:bottom right;transition:transform .11s ease}
      :host(.position-left) .chutty{right:auto;left:6px;transform-origin:bottom left}
      .chutty:focus-visible,.support:focus-visible,.menu button:focus-visible{outline:2px solid #4a3a13;outline-offset:2px}
      .paper{position:absolute;inset:11px 5px 4px;display:grid;align-content:center;justify-items:center;gap:3px;border:1px solid #d3b63f;border-radius:5px 5px 10px 10px;background:linear-gradient(#ebd25e3b 1px,transparent 1px) 0 21px/100% 15px,#ffe87a;box-shadow:inset 0 -8px #d7b52b29;color:#4a3a13}
      .tape{position:absolute;z-index:3;top:2px;left:20px;width:39px;height:16px;background:#ebe1b8e0;border:1px solid #b19e6073;transform:rotate(-4deg);clip-path:polygon(3% 12%,95% 0,100% 88%,7% 100%)}
      .mouth{position:absolute;z-index:4;left:13px;right:13px;top:12px;height:13px;border:2px solid #4b3a13;border-top-width:4px;border-radius:50%;background:#241b0b}
      .face{margin-top:10px;font-size:18px;font-weight:900}.label{font-size:10px;font-weight:900;letter-spacing:.12em}.count{min-width:21px;height:21px;padding:2px 5px;border-radius:99px;background:#4a3a13;color:#fff8c6;font:900 11px/17px system-ui}
      .animation-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:8;pointer-events:none}
      .chutty.asset-mode .paper,.chutty.asset-mode .tape,.chutty.asset-mode .mouth{opacity:0}
      .chutty.aware{cursor:copy;transform:rotate(-1deg) scale(1.035)}
      .chutty.ready .mouth{height:20px;top:7px}
      .chutty.success{animation:happy .36s ease}.chutty.failure{animation:nope .3s ease}
      .chutty.play-pop{animation:play-pop .34s cubic-bezier(.2,.85,.25,1.3)}
      .chutty.play-wiggle{animation:play-wiggle .42s ease}
      .chutty.play-squish{animation:play-squish .4s ease}
      .chutty.play-hop{animation:play-hop .46s ease}
      .chutty.play-chomp{animation:play-chomp .42s ease}.chutty.play-chomp .mouth{height:23px;top:5px}
      .support{position:absolute;right:91px;bottom:24px;width:116px;min-height:34px;padding:7px 9px;border:1px solid #4a3a1347;border-radius:999px;background:#fff7cc;color:#4a3a13;box-shadow:0 5px 14px #0003;font:900 10px/1.15 system-ui;cursor:pointer;opacity:0;transform:translateX(8px) scale(.96);pointer-events:none;transition:opacity .14s ease,transform .14s ease}
      :host(.support-visible) .support{opacity:1;transform:none;pointer-events:auto}
      .menu{position:absolute;right:4px;bottom:108px;width:194px;padding:10px;border:1px solid #4a3a1347;border-radius:10px;background:#fff7cc;color:#4a3a13;box-shadow:0 6px 18px #0004;opacity:0;transform:translateY(5px) scale(.98);pointer-events:none;transition:opacity .12s,transform .12s}
      .menu.visible{opacity:1;transform:none;pointer-events:auto}.menu strong,.menu small{display:block;margin-bottom:7px}.menu small{font:600 10px/1.35 system-ui}.menu button{width:100%;margin-top:5px;padding:7px;border:0;border-radius:7px;background:#4a3a13;color:#fff8c6;font:900 11px system-ui;cursor:pointer}.menu .secondary{background:#ead77d;color:#4a3a13}
      @keyframes happy{50%{transform:rotate(-2deg) scale(1.08)}}@keyframes nope{35%{transform:translateX(-3px)}70%{transform:translateX(3px)}}
      @keyframes play-pop{45%{transform:rotate(-2deg) scale(1.13)}75%{transform:rotate(2deg) scale(.98)}}
      @keyframes play-wiggle{20%{transform:rotate(-7deg)}45%{transform:rotate(7deg)}70%{transform:rotate(-4deg)}}
      @keyframes play-squish{40%{transform:scaleX(1.12) scaleY(.9)}70%{transform:scaleX(.96) scaleY(1.06)}}
      @keyframes play-hop{45%{transform:translateY(-10px) rotate(-2deg)}70%{transform:translateY(1px) rotate(2deg)}}
      @keyframes play-chomp{35%{transform:scale(1.08)}65%{transform:scale(.97)}}
      @media(prefers-reduced-motion:reduce){:host,.chutty,.menu,.support{transition:none!important;animation:none!important}}
    </style>
    <section class="menu" aria-hidden="true">
      <strong>Chutty</strong>
      <small>Drop here to hand the item to Chute. Click to cycle enabled animations.</small>
      <button class="open" type="button">Open Chute</button>
      <button class="settings secondary" type="button">Settings</button>
      <button class="hide secondary" type="button">Hide Chutty</button>
    </section>
    <button class="support" type="button" aria-label="Support Chutty">♥ Support Chutty</button>
    <button class="chutty" type="button" aria-label="Chutty: click for another animation, or drop a file or image to save it into Chute">
      <span class="tape"></span>
      <span class="paper"><span class="face">•ᴗ•</span><span class="label">CHUTE</span><span class="count" hidden></span></span>
      <span class="mouth"></span>
      <img class="animation-frame" alt="" hidden>
    </button>`;

  const bin = shadow.querySelector(".chutty");
  const menu = shadow.querySelector(".menu");
  const support = shadow.querySelector(".support");
  const face = shadow.querySelector(".face");
  const label = shadow.querySelector(".label");
  const count = shadow.querySelector(".count");
  const frameImage = shadow.querySelector(".animation-frame");

  let animations = FALLBACK_ANIMATIONS;
  let keys = FALLBACK_KEYS;
  let supportUrl = "https://buy.stripe.com/7sI9CD0uQ96mdY43cc";
  let settings = { ...DEFAULTS };
  let cycleOrder = ["idle", "happy"];
  let enabledCycleIds = new Set(cycleOrder);
  let cycleIndex = -1;
  let currentCycleId = "idle";
  let animationToken = 0;
  let openTimer = 0;
  let closeTimer = 0;
  let supportTimer = 0;
  let dragDepth = 0;

  const animationClasses = new Set([
    "ready", "success", "failure", "play-pop", "play-wiggle",
    "play-squish", "play-hop", "play-chomp"
  ]);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

  function animationById(id) {
    return animations.find((animation) => animation.id === id) || null;
  }

  function clearAnimationClasses() {
    for (const className of animationClasses) bin.classList.remove(className);
  }

  function setMenu(open) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    host.classList.toggle("expanded", open);
    menu.classList.toggle("visible", open);
    menu.setAttribute("aria-hidden", String(!open));
  }

  function scheduleOpen() {
    if (!settings.hoverMenu) return;
    clearTimeout(closeTimer);
    openTimer = setTimeout(() => setMenu(true), 280);
  }

  function scheduleClose() {
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => setMenu(false), 650);
  }

  function hideSupport() {
    clearTimeout(supportTimer);
    host.classList.remove("support-visible");
  }

  function scheduleSupportHide() {
    clearTimeout(supportTimer);
    supportTimer = setTimeout(hideSupport, SUPPORT_IDLE_MS);
  }

  function showSupport() {
    if (!settings.supportVisible) return;
    host.classList.add("support-visible");
    scheduleSupportHide();
  }

  function applyStep(animation, step) {
    clearAnimationClasses();

    const imageName = String(step?.image || "").trim();
    if (imageName) {
      frameImage.src = chrome.runtime.getURL(`animations/assets/${animation.id}/${imageName}`);
      frameImage.hidden = false;
      bin.classList.add("asset-mode");
    } else {
      frameImage.hidden = true;
      frameImage.removeAttribute("src");
      bin.classList.remove("asset-mode");
    }

    if (step?.face != null) face.textContent = String(step.face);
    if (step?.label != null) label.textContent = String(step.label);

    const className = String(step?.className || "").trim();
    if (className) {
      animationClasses.add(className);
      void bin.offsetWidth;
      bin.classList.add(className);
    }
  }

  async function runAnimation(animation, { temporary = false } = {}) {
    if (!animation) return;
    const token = ++animationToken;
    const sequence = Array.isArray(animation.sequence) && animation.sequence.length
      ? animation.sequence
      : [{ face:"•ᴗ•", label:"CHUTE", duration:250 }];

    do {
      for (const step of sequence) {
        if (token !== animationToken) return;
        applyStep(animation, step);
        await wait(step?.duration ?? 200);
      }
    } while (animation.loop && token === animationToken);

    if (token !== animationToken) return;
    clearAnimationClasses();

    if (temporary && Number(animation.restoreAfter) >= 0) {
      await wait(animation.restoreAfter);
      if (token === animationToken) restoreCycleState();
    }
  }

  function normalizedCycleOrder(order) {
    const available = animations.filter((animation) => animation.cycle).map((animation) => animation.id);
    const requested = Array.isArray(order) ? order.map(String) : [];
    const result = requested.filter((id, index) => available.includes(id) && requested.indexOf(id) === index);
    for (const id of available) if (!result.includes(id)) result.push(id);
    return result;
  }

  function activeCycleOrder() {
    const active = cycleOrder.filter((id) => enabledCycleIds.has(id) && animationById(id)?.cycle);
    return active.length ? active : cycleOrder.filter((id) => animationById(id)?.cycle).slice(0, 1);
  }

  function restoreCycleState() {
    const current = animationById(currentCycleId) || animationById(activeCycleOrder()[0]) || animationById("idle");
    if (current) void runAnimation(current);
  }

  function advanceCycle() {
    const active = activeCycleOrder();
    if (!active.length) return;
    cycleIndex = (cycleIndex + 1) % active.length;
    currentCycleId = active[cycleIndex];
    void runAnimation(animationById(currentCycleId));
  }

  function trigger(id, options = {}) {
    const animation = animationById(id);
    if (animation) void runAnimation(animation, options);
  }

  function applySettings(values) {
    settings.visible = values[keys.visible] !== false;
    settings.clickCycle = values[keys.clickCycle] !== false;
    settings.supportVisible = values[keys.supportVisible] !== false;
    settings.hoverMenu = values[keys.hoverMenu] !== false;
    settings.position = values[keys.position] === "left" ? "left" : "right";
    host.hidden = !settings.visible;
    host.classList.toggle("position-left", settings.position === "left");

    if (!settings.supportVisible) hideSupport();
    if (!settings.hoverMenu) setMenu(false);

    cycleOrder = normalizedCycleOrder(values[keys.animationOrder]);
    const storedEnabled = Array.isArray(values[keys.animationEnabled])
      ? values[keys.animationEnabled].map(String)
      : cycleOrder;
    enabledCycleIds = new Set(storedEnabled.filter((id) => cycleOrder.includes(id)));

    const active = activeCycleOrder();
    if (!active.includes(currentCycleId)) {
      currentCycleId = active[0] || "idle";
      cycleIndex = active.indexOf(currentCycleId);
      restoreCycleState();
    }
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function pushCandidate(list, value) {
    const text = String(value || "").trim().replace(/&amp;/gi, "&");
    if (!text || list.includes(text)) return;
    if (!/^(?:https?:|data:image\/|blob:)/i.test(text)) return;
    list.push(text);
  }

  function uriLines(value) {
    return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  }

  function srcsetUrls(value) {
    return String(value || "").split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  }

  function transferCandidates(transfer) {
    const candidates = [];
    let suggestedName = "";

    try {
      const download = String(transfer.getData("DownloadURL") || "");
      const match = download.match(/^([^:]+):([^:]+):(.+)$/);
      if (match) {
        suggestedName = match[2] || "";
        pushCandidate(candidates, match[3]);
      }
    } catch {}

    try {
      const html = transfer.getData("text/html");
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const img of doc.querySelectorAll("img")) {
        suggestedName ||= img.alt || img.title || "";
        for (const attr of ["data-iurl", "data-image-url", "data-original", "data-src", "src"]) {
          pushCandidate(candidates, img.getAttribute(attr));
        }
        for (const attr of ["srcset", "data-srcset"]) {
          for (const url of srcsetUrls(img.getAttribute(attr))) pushCandidate(candidates, url);
        }
      }
      for (const anchor of doc.querySelectorAll("a[href]")) pushCandidate(candidates, anchor.href);
    } catch {}

    try {
      for (const value of uriLines(transfer.getData("text/uri-list"))) pushCandidate(candidates, value);
    } catch {}

    try { pushCandidate(candidates, transfer.getData("text/plain")); } catch {}

    return { candidates, suggestedName };
  }

  async function recentSourceCapture() {
    const sourceKeys = [
      "filechute-chatgpt-drag-source-v1",
      "filechute-google-drag-source-v1",
      "filechute-yandex-drag-source-v1"
    ];
    const values = await chrome.storage.local.get(sourceKeys).catch(() => ({}));
    const now = Date.now();
    const captures = sourceKeys
      .map((key) => values?.[key])
      .filter((capture) => capture && now - Number(capture.capturedAt || 0) <= SOURCE_CAPTURE_MAX_AGE_MS)
      .sort((a, b) => Number(b.capturedAt || 0) - Number(a.capturedAt || 0));

    const capture = captures[0] || null;
    if (!capture) return { candidates: [], suggestedName: "" };
    return {
      candidates: Array.isArray(capture.urls) ? capture.urls.map(String) : [],
      suggestedName: String(capture.title || "")
    };
  }

  async function pageReadableCandidate(value, suggestedName) {
    if (!/^(?:https?:|blob:|data:image\/)/i.test(value)) return null;
    try {
      const response = await fetch(value, { cache: "no-store" });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (blob.size > MAX_CAPTURE_BYTES) throw new Error("Drop is too large for Chutty's browser bridge.");
      if (!String(blob.type).toLowerCase().startsWith("image/")) return null;
      return {
        name: suggestedName || "browser-image",
        type: blob.type,
        parentPageUrl: location.href,
        sourceUrl: /^https?:/i.test(value) ? value : null,
        base64: toBase64(await blob.arrayBuffer())
      };
    } catch {
      return null;
    }
  }

  async function payloads(transfer) {
    const files = [...(transfer.files || [])].filter((file) => file instanceof File && file.size > 0);
    if (files.length) {
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_CAPTURE_BYTES) throw new Error("Drop is too large for Chutty's browser bridge.");
      return Promise.all(files.map(async (file) => ({
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        parentPageUrl: location.href,
        base64: toBase64(await file.arrayBuffer())
      })));
    }

    const direct = transferCandidates(transfer);
    const captured = await recentSourceCapture();
    const candidates = [];
    for (const value of [...captured.candidates, ...direct.candidates]) pushCandidate(candidates, value);
    const suggestedName = captured.suggestedName || direct.suggestedName || "browser-image";

    for (const candidate of candidates) {
      const local = await pageReadableCandidate(candidate, suggestedName);
      if (local) return [local];
    }

    if (!candidates.length) return [];
    return [{
      name: suggestedName,
      candidates: candidates.slice(0, 24),
      parentPageUrl: location.href
    }];
  }

  async function openChute(settingsPanel = false) {
    const response = await chrome.runtime.sendMessage({ type: "filechute-open-panel", settings: settingsPanel });
    if (!response?.ok) trigger("failure", { temporary: true });
  }

  bin.addEventListener("pointerenter", scheduleOpen);
  bin.addEventListener("pointerleave", scheduleClose);
  menu.addEventListener("pointerenter", () => clearTimeout(closeTimer));
  menu.addEventListener("pointerleave", scheduleClose);
  support.addEventListener("pointerenter", () => clearTimeout(supportTimer));
  support.addEventListener("pointerleave", scheduleSupportHide);

  bin.addEventListener("click", () => {
    if (dragDepth || !settings.clickCycle) return;
    advanceCycle();
    showSupport();
  });

  support.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scheduleSupportHide();
    window.open(supportUrl, "_blank", "noopener,noreferrer");
  });

  shadow.querySelector(".open").addEventListener("click", () => void openChute(false));
  shadow.querySelector(".settings").addEventListener("click", () => void openChute(true));
  shadow.querySelector(".hide").addEventListener("click", () => {
    host.hidden = true;
    void chrome.storage.local.set({ [keys.visible]: false });
  });

  document.addEventListener("dragstart", () => {
    hideSupport();
    setMenu(false);
  }, true);

  bin.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    hideSupport();
    setMenu(false);
    bin.classList.add("aware");
    trigger("ready");
  });

  bin.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  bin.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
      bin.classList.remove("aware");
      restoreCycleState();
    }
  });

  bin.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideSupport();
    dragDepth = 0;
    bin.classList.remove("aware");
    trigger("eating");

    try {
      const items = await payloads(event.dataTransfer);
      if (!items.length) throw new Error("No readable file, image, or browser image source was found.");

      const response = await chrome.runtime.sendMessage({ type: "chutty-ingest-v1", items });
      if (!response?.ok) throw new Error(response?.error || "Chute could not save the drop.");

      count.hidden = false;
      count.textContent = response.count > 99 ? "99+" : String(response.count);
      trigger("success", { temporary: true });
    } catch (error) {
      console.warn("Chutty drop failed:", error?.message || error);
      trigger("failure", { temporary: true });
    }
  });

  window.addEventListener("blur", () => {
    dragDepth = 0;
    bin.classList.remove("aware");
    hideSupport();
    setMenu(false);
    restoreCycleState();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const relevant = Object.values(keys).some((key) => changes[key]);
    if (!relevant) return;
    void loadSettings();
  });

  async function loadRuntimeModules() {
    try {
      const [catalogModule, configModule] = await Promise.all([
        import(chrome.runtime.getURL("animations/catalog.js")),
        import(chrome.runtime.getURL("chutty-config.js"))
      ]);
      if (Array.isArray(catalogModule.CHUTTY_ANIMATIONS) && catalogModule.CHUTTY_ANIMATIONS.length) {
        animations = catalogModule.CHUTTY_ANIMATIONS;
      }
      if (configModule.CHUTTY_KEYS) keys = configModule.CHUTTY_KEYS;
      if (configModule.DEFAULT_CHUTTY_SETTINGS) Object.assign(DEFAULTS, configModule.DEFAULT_CHUTTY_SETTINGS);
      if (configModule.CHUTTY_SUPPORT_URL) supportUrl = configModule.CHUTTY_SUPPORT_URL;
    } catch (error) {
      console.warn("Chutty animation modules could not be loaded; using built-in fallback states.", error);
    }
  }

  async function loadSettings() {
    const cycleIds = animations.filter((animation) => animation.cycle).map((animation) => animation.id);
    const defaults = {
      [keys.visible]: DEFAULTS.visible,
      [keys.clickCycle]: DEFAULTS.clickCycle,
      [keys.supportVisible]: DEFAULTS.supportVisible,
      [keys.hoverMenu]: DEFAULTS.hoverMenu,
      [keys.position]: DEFAULTS.position,
      [keys.animationOrder]: cycleIds,
      [keys.animationEnabled]: cycleIds,
      [keys.ingestCount]: 0
    };
    const values = await chrome.storage.local.get(defaults).catch(() => defaults);
    applySettings(values);

    const savedCount = Number(values[keys.ingestCount]) || 0;
    count.hidden = savedCount <= 0;
    count.textContent = savedCount > 99 ? "99+" : String(savedCount);

    if (cycleIndex < 0) {
      const active = activeCycleOrder();
      currentCycleId = active[0] || "idle";
      cycleIndex = Math.max(0, active.indexOf(currentCycleId));
      restoreCycleState();
    }
  }

  async function initialize() {
    await loadRuntimeModules();
    (document.documentElement || document.body).append(host);
    await loadSettings();
  }

  void initialize();
})();