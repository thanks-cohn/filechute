const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const RECENT_KEY = "filechute-recent-drops-v1";

const entries = document.querySelector("#entries");
const controls = document.querySelector(".controls");

function injectStyles() {
  if (document.querySelector("style[data-filechute-ui-enhancements]")) return;
  const style = document.createElement("style");
  style.dataset.filechuteUiEnhancements = "true";
  style.textContent = `
    .filechute-search-wrap {
      position: sticky;
      top: 0;
      z-index: 8;
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1 1 180px;
      margin-left: 6px;
    }
    .filechute-search {
      width: 100%;
      min-width: 90px;
      height: 32px;
      padding: 0 10px 0 29px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 9px;
      background: rgba(255,255,255,.055);
      color: inherit;
      font: 500 12px/1 system-ui, sans-serif;
      outline: none;
    }
    .filechute-search:focus {
      border-color: rgba(255,255,255,.28);
      background: rgba(255,255,255,.075);
    }
    .filechute-search-wrap::before {
      content: "⌕";
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-52%);
      opacity: .58;
      pointer-events: none;
      font: 700 15px/1 system-ui, sans-serif;
    }
    .filechute-grip {
      flex: 0 0 24px;
      width: 24px;
      height: calc(var(--thumbnail-size, 48px) + 2px);
      min-height: 34px;
      display: grid;
      place-items: center;
      padding: 0;
      margin: 0 -2px 0 2px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      opacity: .42;
      cursor: grab;
      touch-action: none;
    }
    .filechute-grip:hover,
    .filechute-grip:focus-visible {
      opacity: .9;
      background: rgba(255,255,255,.065);
      outline: none;
    }
    .filechute-grip:active { cursor: grabbing; }
    .filechute-grip-dots {
      width: 10px;
      height: 18px;
      display: grid;
      grid-template-columns: repeat(2, 3px);
      grid-template-rows: repeat(3, 3px);
      gap: 3px 4px;
      place-content: center;
    }
    .filechute-grip-dots i {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: currentColor;
      display: block;
    }
    .entry.filechute-recent {
      order: -1;
      background: color-mix(in srgb, #d7ff3f 5%, transparent);
    }
    .entry.filechute-recent::after {
      content: "new";
      align-self: start;
      margin: 7px 7px 0 0;
      padding: 2px 5px;
      border-radius: 999px;
      background: rgba(215,255,63,.13);
      color: #d7ff3f;
      font: 700 9px/1 system-ui, sans-serif;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .entry.filechute-search-hidden { display: none !important; }
  `;
  document.head.append(style);
}

function recentNames() {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function saveRecent(names) {
  const next = [...new Set([...names.filter(Boolean), ...recentNames()])].slice(0, 24);
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

function chuteNameFromToken(value) {
  const text = String(value || "");
  if (!text.startsWith("CHUTE_ITEM:")) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(text.slice("CHUTE_ITEM:".length)));
    return payload?.name ? String(payload.name) : null;
  } catch {
    return null;
  }
}

function fileChuteNameFromTransfer(transfer) {
  try {
    const raw = transfer?.getData(FILECHUTE_DRAG_TYPE);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.originalName || payload?.name || null;
  } catch {
    return null;
  }
}

function namesFromDrop(transfer) {
  if (!transfer) return [];
  const names = [...(transfer.files || [])].map((file) => file?.name).filter(Boolean);
  const own = fileChuteNameFromTransfer(transfer);
  if (own) names.push(own);
  let chute = "";
  try {
    chute = transfer.getData(CHUTE_DRAG_TYPE) || transfer.getData("text/plain") || "";
  } catch {}
  const chuteName = chuteNameFromToken(chute);
  if (chuteName) names.push(chuteName);
  return names;
}

function resetDragUi() {
  document.body.classList.remove("filechute-drop-active");
  document.querySelectorAll(".entry.dragging").forEach((row) => row.classList.remove("dragging"));
}

function forwardGripDrag(event, row) {
  const name = row.querySelector(".entry-name");
  if (!name || !event.dataTransfer) return;
  try {
    const forwarded = new DragEvent("dragstart", {
      bubbles: false,
      cancelable: true,
      dataTransfer: event.dataTransfer
    });
    name.dispatchEvent(forwarded);
  } catch (error) {
    console.warn("FileChute grab handle could not forward this drag", error);
  }
}

function addGrip(row) {
  if (!(row instanceof HTMLElement) || row.querySelector(":scope > .filechute-grip")) return;
  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "filechute-grip";
  grip.draggable = true;
  grip.title = row.classList.contains("directory") ? "Drag this folder" : "Drag the full original file";
  grip.setAttribute("aria-label", grip.title);

  const dots = document.createElement("span");
  dots.className = "filechute-grip-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 6; index += 1) dots.append(document.createElement("i"));
  grip.append(dots);

  grip.addEventListener("click", (event) => event.preventDefault());
  grip.addEventListener("dragstart", (event) => forwardGripDrag(event, row));
  grip.addEventListener("dragend", resetDragUi);
  row.prepend(grip);
}

let searchInput = null;

function applySearch() {
  const query = String(searchInput?.value || "").trim().toLocaleLowerCase();
  for (const row of entries?.querySelectorAll(".entry") || []) {
    const name = String(row.querySelector(".entry-name")?.textContent || "").toLocaleLowerCase();
    const path = String(row.querySelector(".entry-path")?.textContent || "").toLocaleLowerCase();
    row.classList.toggle("filechute-search-hidden", Boolean(query) && !name.includes(query) && !path.includes(query));
  }
}

function decorateRows() {
  const recent = new Set(recentNames());
  const rows = [...(entries?.querySelectorAll(".entry") || [])];
  for (const row of rows) {
    addGrip(row);
    const name = String(row.querySelector(".entry-name")?.textContent || "");
    row.classList.toggle("filechute-recent", recent.has(name));
  }
  if (entries) {
    const pinned = rows.filter((row) => row.classList.contains("filechute-recent"));
    const order = recentNames();
    pinned.sort((a, b) => {
      const an = String(a.querySelector(".entry-name")?.textContent || "");
      const bn = String(b.querySelector(".entry-name")?.textContent || "");
      return order.indexOf(an) - order.indexOf(bn);
    });
    for (const row of pinned.reverse()) entries.prepend(row);
  }
  applySearch();
}

function installSearch() {
  if (!controls || controls.querySelector(".filechute-search")) return;
  const wrap = document.createElement("label");
  wrap.className = "filechute-search-wrap";
  wrap.title = "Search files in this folder";
  searchInput = document.createElement("input");
  searchInput.className = "filechute-search";
  searchInput.type = "search";
  searchInput.placeholder = "Search files…";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute("aria-label", "Search files by name");
  searchInput.addEventListener("input", applySearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && searchInput.value) {
      searchInput.value = "";
      applySearch();
      searchInput.blur();
    }
  });
  wrap.append(searchInput);
  controls.append(wrap);
}

injectStyles();
installSearch();
decorateRows();

const observer = new MutationObserver(() => decorateRows());
if (entries) observer.observe(entries, { childList: true });

document.addEventListener("drop", (event) => {
  const names = namesFromDrop(event.dataTransfer);
  if (names.length) saveRecent(names);
  setTimeout(resetDragUi, 0);
}, true);

document.addEventListener("dragover", (event) => {
  const types = [...(event.dataTransfer?.types || [])];
  if (types.includes(FILECHUTE_DRAG_TYPE)) queueMicrotask(resetDragUi);
}, false);

document.addEventListener("dragend", resetDragUi, true);
window.addEventListener("blur", () => setTimeout(resetDragUi, 60));
window.addEventListener("focus", resetDragUi);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resetDragUi();
});
