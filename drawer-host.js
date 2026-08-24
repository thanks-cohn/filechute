(() => {
  const HOST_ID = "__filechute_left_drawer__";
  const existing = document.getElementById(HOST_ID);

  if (existing) {
    const panel = existing.shadowRoot?.querySelector(".filechute-panel");
    if (panel) {
      panel.style.transform = "translateX(-100%)";
      setTimeout(() => existing.remove(), 190);
    } else {
      existing.remove();
    }
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    inset: "0 auto 0 0",
    width: "390px",
    height: "100vh",
    zIndex: "2147483647",
    pointerEvents: "none"
  });

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .filechute-panel {
      position: absolute;
      inset: 0 auto 0 0;
      width: min(390px, calc(100vw - 42px));
      height: 100vh;
      display: block;
      background: #121414;
      border: 0;
      box-shadow: 18px 0 44px rgba(0, 0, 0, 0.38);
      transform: translateX(-100%);
      transition: transform 180ms cubic-bezier(.2,.8,.2,1);
      pointer-events: auto;
    }
    .filechute-close {
      position: absolute;
      top: 9px;
      right: -34px;
      width: 34px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.14);
      border-left: 0;
      border-radius: 0 10px 10px 0;
      background: #121414;
      color: #f3f5f0;
      font: 700 18px/1 system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 8px 0 18px rgba(0,0,0,.24);
      pointer-events: auto;
    }
    .filechute-close:hover { background: #202422; }
  `;

  const frame = document.createElement("iframe");
  frame.className = "filechute-panel";
  frame.src = chrome.runtime.getURL("sidepanel.html");
  frame.title = "FileChute";
  frame.setAttribute("allow", "clipboard-write");

  const close = document.createElement("button");
  close.className = "filechute-close";
  close.type = "button";
  close.title = "Close FileChute";
  close.setAttribute("aria-label", "Close FileChute");
  close.textContent = "‹";

  const closeDrawer = () => {
    frame.style.transform = "translateX(-100%)";
    setTimeout(() => host.remove(), 190);
  };

  close.addEventListener("click", closeDrawer);
  shadow.append(style, frame, close);
  (document.documentElement || document.body).append(host);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      frame.style.transform = "translateX(0)";
    });
  });
})();
