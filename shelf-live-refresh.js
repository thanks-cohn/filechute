const controls = document.querySelector(".controls");
const breadcrumbs = document.querySelector("#breadcrumbs");
const status = document.querySelector("#status");
const RECENT_KEY = "filechute-recent-drops-v1";
const DRAG_WATCHDOG_MS = 6500;

const style = document.createElement("style");
style.dataset.chuteShelfRefresh = "true";
style.textContent = `
  .controls.filechute-has-refresh {
    grid-template-columns: auto auto auto minmax(0, 1fr);
  }
  #filechute-refresh {
    width: 34px;
    height: 32px;
    padding: 0;
    font-size: 15px;
    line-height: 1;
  }
  #filechute-refresh.filechute-refreshing {
    animation: filechute-refresh-spin 420ms linear;
  }
  @keyframes filechute-refresh-spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.append(style);

function requestRefresh({ animate = false } = {}) {
  if (animate) {
    const button = document.querySelector("#filechute-refresh");
    if (button) {
      button.classList.remove("filechute-refreshing");
      void button.offsetWidth;
      button.classList.add("filechute-refreshing");
      setTimeout(() => button.classList.remove("filechute-refreshing"), 460);
    }
  }
  window.dispatchEvent(new CustomEvent("chute:filesystem-changed"));
}

function recentNames() {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function rememberRecent(name) {
  const clean = String(name || "").trim();
  if (!clean) return;
  const next = [...new Set([clean, ...recentNames()])].slice(0, 24);
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

function observeBrowserSaves() {
  if (!status) return;
  let lastMessage = "";
  const sync = () => {
    const message = String(status.textContent || "").trim();
    if (!message || message === lastMessage) return;
    lastMessage = message;

    const match = message.match(/^Saved (.+) from (?:ChatGPT|Google Images|Yandex Images)\.$/i);
    if (!match?.[1]) return;

    // The browser-source handlers know the final filename only after the bytes
    // have been written. Remember that actual saved name before their quick
    // path-preserving reload so it rises to the top and gets the existing
    // Chute "new" treatment immediately.
    rememberRecent(match[1]);
    requestRefresh();
  };

  new MutationObserver(sync).observe(status, {
    childList: true,
    characterData: true,
    subtree: true
  });
  sync();
}

function installRefreshButton() {
  if (!controls || document.querySelector("#filechute-refresh")) return;
  const button = document.createElement("button");
  button.id = "filechute-refresh";
  button.type = "button";
  button.textContent = "↻";
  button.title = "Refresh this Chute shelf";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", () => requestRefresh({ animate: true }));
  controls.classList.add("filechute-has-refresh");
  controls.insertBefore(button, breadcrumbs || null);
}

let dragWatchdog = 0;

function resetShelfDragState() {
  if (dragWatchdog) {
    clearTimeout(dragWatchdog);
    dragWatchdog = 0;
  }

  document.querySelectorAll(".entry.dragging, .filechute-dragging").forEach((element) => {
    element.classList.remove("dragging", "filechute-dragging");
  });

  document.documentElement.classList.remove("filechute-dragging");
  document.body.classList.remove("filechute-dragging");
  document.documentElement.style.cursor = "";
  document.body.style.cursor = "";
}

function armDragWatchdog() {
  if (dragWatchdog) clearTimeout(dragWatchdog);
  dragWatchdog = setTimeout(() => {
    dragWatchdog = 0;
    resetShelfDragState();
  }, DRAG_WATCHDOG_MS);
}

function freshFile(file) {
  if (!(file instanceof File)) return file;
  try {
    // A fresh File wrapper for every outbound drag prevents Chromium from
    // reusing a stale DataTransfer-backed File object after several
    // extension-to-page drops. Blob parts are referenced, not eagerly copied.
    return new File([file], file.name, {
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified || Date.now()
    });
  } catch {
    return file;
  }
}

function refreshNativeDragFiles(transfer) {
  if (!transfer?.items) return;

  let files = [];
  try { files = [...(transfer.files || [])]; } catch {}
  if (!files.length) return;

  // sidepanel.js has already populated DataTransfer by the time this bubbling
  // listener runs. Replace only the file items with fresh File wrappers while
  // leaving Chute's custom protocol/string flavors intact.
  try {
    for (let index = transfer.items.length - 1; index >= 0; index -= 1) {
      if (transfer.items[index]?.kind === "file") transfer.items.remove(index);
    }
    for (const file of files) transfer.items.add(freshFile(file));
  } catch (error) {
    console.debug("Chute kept Chromium's original drag File object", error);
  }
}

function installOutboundDragHardening() {
  document.addEventListener("dragstart", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("#entries")) return;

    resetShelfDragState();
    refreshNativeDragFiles(event.dataTransfer);
    document.documentElement.classList.add("filechute-dragging");
    document.body.classList.add("filechute-dragging");
    armDragWatchdog();
  }, false);

  document.addEventListener("dragend", resetShelfDragState, true);
  document.addEventListener("drop", resetShelfDragState, true);
  document.addEventListener("pointerup", resetShelfDragState, true);
  document.addEventListener("mouseup", resetShelfDragState, true);
  window.addEventListener("blur", armDragWatchdog);
  window.addEventListener("focus", resetShelfDragState);
  window.addEventListener("pageshow", resetShelfDragState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetShelfDragState();
  });
}

installRefreshButton();
observeBrowserSaves();
installOutboundDragHardening();

// sidepanel.js already performs a guarded once-per-second filesystem scan.
// Do not stack another 250 ms poll on top of it: on larger shelves that caused
// hundreds of directory-entry reads while the user was dragging and could make
// the side panel appear stuck after several cross-page drops. Keep this helper
// event-driven instead: manual refresh plus focus/visibility refreshes.
window.addEventListener("focus", () => requestRefresh());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) requestRefresh();
});
