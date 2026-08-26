(() => {
  if (window.top !== window || document.getElementById("__chutty_host")) return;

  const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
  const SUPPORT_URL_KEY = "chute-support-url";
  const SUPPORT_IDLE_MS = 8000;
  const PLAY_CLASSES = ["play-pop", "play-wiggle", "play-squish", "play-hop", "play-chomp"];
  const PLAY_STATES = [
    { face: ">ᴗ<", label: "YAY", className: "play-pop" },
    { face: "•⤙•", label: "HMM", className: "play-wiggle" },
    { face: "˶•ᴗ•˶", label: "HI", className: "play-squish" },
    { face: "◕ᴗ◕", label: "AGAIN", className: "play-hop" },
    { face: "•O•", label: "NOM?", className: "play-chomp" }
  ];

  const host = document.createElement("div");
  host.id = "__chutty_host";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:18px;bottom:18px;width:92px;height:104px;z-index:2147483647;pointer-events:auto;font-family:"Trebuchet MS",ui-rounded,system-ui,sans-serif;transition:width .12s ease,height .12s ease}
      :host(.expanded){width:208px;height:222px}
      :host(.support-visible){width:218px}
      :host(.expanded.support-visible){width:218px;height:222px}
      *{box-sizing:border-box}.chutty{position:absolute;right:6px;bottom:8px;width:78px;height:88px;padding:0;border:0;background:transparent;cursor:pointer;filter:drop-shadow(0 5px 5px #0004);transform:rotate(1.5deg);transform-origin:bottom right;transition:transform .11s ease}
      .chutty:focus-visible,.support:focus-visible,.menu button:focus-visible{outline:2px solid #4a3a13;outline-offset:2px}
      .paper{position:absolute;inset:11px 5px 4px;display:grid;align-content:center;justify-items:center;gap:3px;border:1px solid #d3b63f;border-radius:5px 5px 10px 10px;background:linear-gradient(#ebd25e3b 1px,transparent 1px) 0 21px/100% 15px,#ffe87a;box-shadow:inset 0 -8px #d7b52b29;color:#4a3a13}
      .tape{position:absolute;z-index:3;top:2px;left:20px;width:39px;height:16px;background:#ebe1b8e0;border:1px solid #b19e6073;transform:rotate(-4deg);clip-path:polygon(3% 12%,95% 0,100% 88%,7% 100%)}
      .mouth{position:absolute;z-index:4;left:13px;right:13px;top:12px;height:13px;border:2px solid #4b3a13;border-top-width:4px;border-radius:50%;background:#241b0b}.face{margin-top:10px;font-size:18px;font-weight:900}.label{font-size:10px;font-weight:900;letter-spacing:.12em}.count{min-width:21px;height:21px;padding:2px 5px;border-radius:99px;background:#4a3a13;color:#fff8c6;font:900 11px/17px system-ui}
      .chutty.aware{cursor:copy;transform:rotate(-1deg) scale(1.035)}.chutty.ready .mouth{height:20px;top:7px}.chutty.ready .label{font-size:0}.chutty.ready .label:after{content:"DROP!";font-size:11px}.chutty.success{animation:happy .36s ease}.chutty.failure{animation:nope .3s ease}
      .chutty.play-pop{animation:play-pop .34s cubic-bezier(.2,.85,.25,1.3)}.chutty.play-wiggle{animation:play-wiggle .42s ease}.chutty.play-squish{animation:play-squish .4s ease}.chutty.play-hop{animation:play-hop .46s ease}.chutty.play-chomp{animation:play-chomp .42s ease}.chutty.play-chomp .mouth{height:23px;top:5px}
      .support{position:absolute;right:91px;bottom:24px;width:116px;min-height:34px;padding:7px 9px;border:1px solid #4a3a1347;border-radius:999px;background:#fff7cc;color:#4a3a13;box-shadow:0 5px 14px #0003;font:900 10px/1.15 system-ui;cursor:pointer;opacity:0;transform:translateX(8px) scale(.96);pointer-events:none;transition:opacity .14s ease,transform .14s ease}
      :host(.support-visible) .support{opacity:1;transform:none;pointer-events:auto}.support:disabled{cursor:not-allowed;opacity:.62}
      .menu{position:absolute;right:4px;bottom:108px;width:194px;padding:10px;border:1px solid #4a3a1347;border-radius:10px;background:#fff7cc;color:#4a3a13;box-shadow:0 6px 18px #0004;opacity:0;transform:translateY(5px) scale(.98);pointer-events:none;transition:opacity .12s,transform .12s}.menu.visible{opacity:1;transform:none;pointer-events:auto}.menu strong,.menu small{display:block;margin-bottom:7px}.menu small{font:600 10px/1.35 system-ui}.menu button{width:100%;margin-top:5px;padding:7px;border:0;border-radius:7px;background:#4a3a13;color:#fff8c6;font:900 11px system-ui;cursor:pointer}.menu .secondary{background:#ead77d;color:#4a3a13}
      @keyframes happy{50%{transform:rotate(-2deg) scale(1.08)}}@keyframes nope{35%{transform:translateX(-3px)}70%{transform:translateX(3px)}}
      @keyframes play-pop{45%{transform:rotate(-2deg) scale(1.13)}75%{transform:rotate(2deg) scale(.98)}}
      @keyframes play-wiggle{20%{transform:rotate(-7deg)}45%{transform:rotate(7deg)}70%{transform:rotate(-4deg)}}
      @keyframes play-squish{40%{transform:scaleX(1.12) scaleY(.9)}70%{transform:scaleX(.96) scaleY(1.06)}}
      @keyframes play-hop{45%{transform:translateY(-10px) rotate(-2deg)}70%{transform:translateY(1px) rotate(2deg)}}
      @keyframes play-chomp{35%{transform:scale(1.08)}65%{transform:scale(.97)}}
      @media(prefers-reduced-motion:reduce){:host,.chutty,.menu,.support{transition:none!important;animation:none!important}}
    </style>
    <section class="menu" aria-hidden="true"><strong>Chutty</strong><small>Drop here to save into your selected root folder. Click Chutty to cycle his animations.</small><button class="open" type="button">Open Chute</button><button class="settings secondary" type="button">Settings</button><button class="hide secondary" type="button">Hide Chutty</button></section>
    <button class="support" type="button" aria-label="Support Chutty" disabled title="Support link is not configured yet">♥ Support Chutty</button>
    <button class="chutty" type="button" aria-label="Chutty: click for another animation, or drop a file or image to save it into Chute"><span class="tape"></span><span class="paper"><span class="face">•ᴗ•</span><span class="label">CHUTE</span><span class="count" hidden></span></span><span class="mouth"></span></button>`;

  const bin = shadow.querySelector(".chutty");
  const menu = shadow.querySelector(".menu");
  const support = shadow.querySelector(".support");
  const face = shadow.querySelector(".face");
  const label = shadow.querySelector(".label");
  const count = shadow.querySelector(".count");
  let openTimer = 0;
  let closeTimer = 0;
  let feedbackTimer = 0;
  let supportTimer = 0;
  let dragDepth = 0;
  let playStateIndex = -1;
  let supportUrl = "";

  function setMenu(open) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    host.classList.toggle("expanded", open);
    menu.classList.toggle("visible", open);
    menu.setAttribute("aria-hidden", String(!open));
  }
  function scheduleOpen() { clearTimeout(closeTimer); openTimer = setTimeout(() => setMenu(true), 280); }
  function scheduleClose() { clearTimeout(openTimer); closeTimer = setTimeout(() => setMenu(false), 650); }

  function clearPlayClasses() {
    bin.classList.remove(...PLAY_CLASSES);
  }

  function restorePlayState() {
    clearPlayClasses();
    if (playStateIndex < 0) {
      face.textContent = "•ᴗ•";
      label.textContent = "CHUTE";
      return;
    }
    const state = PLAY_STATES[playStateIndex];
    face.textContent = state.face;
    label.textContent = state.label;
  }

  function playCurrentState() {
    const state = PLAY_STATES[playStateIndex];
    clearPlayClasses();
    face.textContent = state.face;
    label.textContent = state.label;
    void bin.offsetWidth;
    bin.classList.add(state.className);
  }

  function advancePlayState() {
    playStateIndex = (playStateIndex + 1) % PLAY_STATES.length;
    playCurrentState();
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
    host.classList.add("support-visible");
    scheduleSupportHide();
  }

  function animate(kind, message, expression) {
    clearTimeout(feedbackTimer);
    clearPlayClasses();
    bin.classList.remove("success", "failure");
    void bin.offsetWidth;
    bin.classList.add(kind);
    label.textContent = message;
    face.textContent = expression;
    feedbackTimer = setTimeout(() => {
      bin.classList.remove(kind);
      restorePlayState();
    }, 1000);
  }

  async function openChute(settings = false) {
    const response = await chrome.runtime.sendMessage({ type: "filechute-open-panel", settings });
    if (!response?.ok) animate("failure", "OPEN?", "•︵•");
  }

  function configuredSupportUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function applySupportUrl(value) {
    supportUrl = configuredSupportUrl(value);
    support.disabled = !supportUrl;
    support.title = supportUrl ? "Support Chutty" : "Support link is not configured yet";
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer); let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  }

  async function payloads(transfer) {
    const files = [...(transfer.files || [])];
    if (files.length) {
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_CAPTURE_BYTES) throw new Error("Drop is too large for the browser-image bridge.");
      return Promise.all(files.map(async (file) => ({ name:file.name, type:file.type, lastModified:file.lastModified, base64:toBase64(await file.arrayBuffer()) })));
    }
    const html = transfer.getData("text/html");
    const sourceUrl = (() => { try { return new DOMParser().parseFromString(html,"text/html").querySelector("img[src]")?.src || transfer.getData("text/uri-list").split(/\r?\n/).find(line => line && !line.startsWith("#")); } catch { return ""; } })();
    return sourceUrl ? [{ sourceUrl, parentPageUrl: location.href }] : [];
  }

  bin.addEventListener("pointerenter", scheduleOpen);
  bin.addEventListener("pointerleave", scheduleClose);
  menu.addEventListener("pointerenter", () => { clearTimeout(closeTimer); });
  menu.addEventListener("pointerleave", scheduleClose);
  support.addEventListener("pointerenter", () => clearTimeout(supportTimer));
  support.addEventListener("pointerleave", scheduleSupportHide);

  bin.addEventListener("click", () => {
    if (dragDepth) return;
    advancePlayState();
    showSupport();
  });

  support.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!supportUrl) return;
    scheduleSupportHide();
    window.open(supportUrl, "_blank", "noopener,noreferrer");
  });

  shadow.querySelector(".open").addEventListener("click", () => void openChute(false));
  shadow.querySelector(".settings").addEventListener("click", () => void openChute(true));
  shadow.querySelector(".hide").addEventListener("click", async () => { await chrome.storage.local.set({ "chute-chutty-visible": false }); host.remove(); });

  document.addEventListener("dragstart", () => { hideSupport(); setMenu(false); }, true);
  bin.addEventListener("dragenter", event => { event.preventDefault(); dragDepth += 1; hideSupport(); setMenu(false); bin.classList.add("aware", "ready"); });
  bin.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
  bin.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) bin.classList.remove("aware", "ready"); });
  bin.addEventListener("drop", async event => {
    event.preventDefault();
    event.stopPropagation();
    hideSupport();
    dragDepth = 0;
    clearPlayClasses();
    bin.classList.remove("aware", "ready");
    label.textContent = "EATING";
    face.textContent = "•◡•";
    try {
      const items = await payloads(event.dataTransfer);
      if (!items.length) throw new Error("No readable file or image was found.");
      const response = await chrome.runtime.sendMessage({ type:"chutty-ingest-v1", items });
      if (!response?.ok) throw new Error(response?.error || "Chute could not save the drop.");
      count.hidden = false;
      count.textContent = response.count > 99 ? "99+" : String(response.count);
      animate("success", "YUMMY", "^ ^");
    } catch (error) {
      console.warn("Chutty drop failed:", error.message);
      animate("failure", "FAILED", "×︵×");
    }
  });

  window.addEventListener("blur", () => { dragDepth = 0; bin.classList.remove("aware", "ready"); hideSupport(); setMenu(false); });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SUPPORT_URL_KEY]) return;
    applySupportUrl(changes[SUPPORT_URL_KEY].newValue);
  });

  chrome.storage.local.get({ "chute-chutty-visible": true, "chute-ingest-count": 0, [SUPPORT_URL_KEY]: "" }).then(values => {
    if (!values["chute-chutty-visible"]) return;
    applySupportUrl(values[SUPPORT_URL_KEY]);
    const savedCount = Number(values["chute-ingest-count"]) || 0;
    if (savedCount) {
      count.hidden = false;
      count.textContent = savedCount > 99 ? "99+" : String(savedCount);
    }
    (document.documentElement || document.body).append(host);
  });
})();
