(() => {
  if (window.top !== window || document.getElementById("__chutty_host")) return;

  const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
  const host = document.createElement("div");
  host.id = "__chutty_host";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:18px;bottom:18px;width:92px;height:104px;z-index:2147483647;pointer-events:auto;font-family:"Trebuchet MS",ui-rounded,system-ui,sans-serif;transition:width .12s ease,height .12s ease}
      :host(.expanded){width:208px;height:222px}
      *{box-sizing:border-box}.chutty{position:absolute;right:6px;bottom:8px;width:78px;height:88px;padding:0;border:0;background:transparent;cursor:copy;filter:drop-shadow(0 5px 5px #0004);transform:rotate(1.5deg);transform-origin:bottom right;transition:transform .11s ease}
      .paper{position:absolute;inset:11px 5px 4px;display:grid;align-content:center;justify-items:center;gap:3px;border:1px solid #d3b63f;border-radius:5px 5px 10px 10px;background:linear-gradient(#ebd25e3b 1px,transparent 1px) 0 21px/100% 15px,#ffe87a;box-shadow:inset 0 -8px #d7b52b29;color:#4a3a13}
      .tape{position:absolute;z-index:3;top:2px;left:20px;width:39px;height:16px;background:#ebe1b8e0;border:1px solid #b19e6073;transform:rotate(-4deg);clip-path:polygon(3% 12%,95% 0,100% 88%,7% 100%)}
      .mouth{position:absolute;z-index:4;left:13px;right:13px;top:12px;height:13px;border:2px solid #4b3a13;border-top-width:4px;border-radius:50%;background:#241b0b}.face{margin-top:10px;font-size:18px;font-weight:900}.label{font-size:10px;font-weight:900;letter-spacing:.12em}.count{min-width:21px;height:21px;padding:2px 5px;border-radius:99px;background:#4a3a13;color:#fff8c6;font:900 11px/17px system-ui}
      .chutty.aware{transform:rotate(-1deg) scale(1.035)}.chutty.ready .mouth{height:20px;top:7px}.chutty.ready .label{font-size:0}.chutty.ready .label:after{content:"DROP!";font-size:11px}.chutty.success{animation:happy .36s ease}.chutty.failure{animation:nope .3s ease}
      .menu{position:absolute;right:4px;bottom:108px;width:194px;padding:10px;border:1px solid #4a3a1347;border-radius:10px;background:#fff7cc;color:#4a3a13;box-shadow:0 6px 18px #0004;opacity:0;transform:translateY(5px) scale(.98);pointer-events:none;transition:opacity .12s,transform .12s}.menu.visible{opacity:1;transform:none;pointer-events:auto}.menu strong,.menu small{display:block;margin-bottom:7px}.menu small{font:600 10px/1.35 system-ui}.menu button{width:100%;margin-top:5px;padding:7px;border:0;border-radius:7px;background:#4a3a13;color:#fff8c6;font:900 11px system-ui;cursor:pointer}.menu .secondary{background:#ead77d;color:#4a3a13}
      @keyframes happy{50%{transform:rotate(-2deg) scale(1.08)}}@keyframes nope{35%{transform:translateX(-3px)}70%{transform:translateX(3px)}}
      @media(prefers-reduced-motion:reduce){:host,.chutty,.menu{transition:none!important;animation:none!important}}
    </style>
    <section class="menu" aria-hidden="true"><strong>Chutty</strong><small>Drop here to save into your selected root folder.</small><button class="open" type="button">Open Chute</button><button class="settings secondary" type="button">Settings</button><button class="hide secondary" type="button">Hide Chutty</button></section>
    <button class="chutty" type="button" aria-label="Drop into Chute or open the shelf"><span class="tape"></span><span class="paper"><span class="face">•ᴗ•</span><span class="label">CHUTE</span><span class="count" hidden></span></span><span class="mouth"></span></button>`;

  const bin = shadow.querySelector(".chutty");
  const menu = shadow.querySelector(".menu");
  const face = shadow.querySelector(".face");
  const label = shadow.querySelector(".label");
  const count = shadow.querySelector(".count");
  let openTimer = 0;
  let closeTimer = 0;
  let feedbackTimer = 0;
  let dragDepth = 0;

  function setMenu(open) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    host.classList.toggle("expanded", open);
    menu.classList.toggle("visible", open);
    menu.setAttribute("aria-hidden", String(!open));
  }
  function scheduleOpen() { clearTimeout(closeTimer); openTimer = setTimeout(() => setMenu(true), 280); }
  function scheduleClose() { clearTimeout(openTimer); closeTimer = setTimeout(() => setMenu(false), 650); }
  function animate(kind, message, expression) {
    clearTimeout(feedbackTimer);
    bin.classList.remove("success", "failure"); void bin.offsetWidth; bin.classList.add(kind);
    label.textContent = message; face.textContent = expression;
    feedbackTimer = setTimeout(() => { bin.classList.remove(kind); label.textContent = "CHUTE"; face.textContent = "•ᴗ•"; }, 1000);
  }
  async function openChute(settings = false) {
    const response = await chrome.runtime.sendMessage({ type: "filechute-open-panel", settings });
    if (!response?.ok) animate("failure", "OPEN?", "•︵•");
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
  bin.addEventListener("click", () => void openChute(false));
  shadow.querySelector(".open").addEventListener("click", () => void openChute(false));
  shadow.querySelector(".settings").addEventListener("click", () => void openChute(true));
  shadow.querySelector(".hide").addEventListener("click", async () => { await chrome.storage.local.set({ "chute-chutty-visible": false }); host.remove(); });
  document.addEventListener("dragstart", () => setMenu(false), true);
  bin.addEventListener("dragenter", event => { event.preventDefault(); dragDepth += 1; setMenu(false); bin.classList.add("aware", "ready"); });
  bin.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
  bin.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) bin.classList.remove("aware", "ready"); });
  bin.addEventListener("drop", async event => {
    event.preventDefault(); event.stopPropagation(); dragDepth = 0; bin.classList.remove("aware", "ready"); label.textContent = "EATING"; face.textContent = "•◡•";
    try {
      const items = await payloads(event.dataTransfer);
      if (!items.length) throw new Error("No readable file or image was found.");
      const response = await chrome.runtime.sendMessage({ type:"chutty-ingest-v1", items });
      if (!response?.ok) throw new Error(response?.error || "Chute could not save the drop.");
      count.hidden = false; count.textContent = response.count > 99 ? "99+" : String(response.count);
      animate("success", "YUMMY", "^ ^");
    } catch (error) { console.warn("Chutty drop failed:", error.message); animate("failure", "FAILED", "×︵×"); }
  });
  window.addEventListener("blur", () => { dragDepth = 0; bin.classList.remove("aware", "ready"); setMenu(false); });
  chrome.storage.local.get({ "chute-chutty-visible": true, "chute-ingest-count": 0 }).then(values => {
    if (!values["chute-chutty-visible"]) return;
    const savedCount = Number(values["chute-ingest-count"]) || 0;
    if (savedCount) { count.hidden = false; count.textContent = savedCount > 99 ? "99+" : String(savedCount); }
    (document.documentElement || document.body).append(host);
  });
})();
