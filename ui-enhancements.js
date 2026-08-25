import { readStored } from "./storage.js";

const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const ROOT_HANDLE_KEY = "filechute-root-handle";
const RESTORE_PATH_KEY = "filechute-restore-path-v1";
const RECENT_KEY = "filechute-recent-drops-v1";
const DEFAULT_ATTEMPT_PREFIX = "filechute-default-location-v1:";

const entries = document.querySelector("#entries");
const controls = document.querySelector(".controls");
const breadcrumbs = document.querySelector("#breadcrumbs");
const homeButton = document.querySelector("#home");
const statusElement = document.querySelector("#status");

let searchInput = null;
let locationInput = null;
let pollBusy = false;
let lastDirectoryKey = "";
let lastDirectoryNames = null;
let reloadScheduled = false;

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function injectStyles() {
  if (document.querySelector("style[data-filechute-ui-enhancements]")) return;
  const style = document.createElement("style");
  style.dataset.filechuteUiEnhancements = "true";
  style.textContent = `
    .filechute-nav-tools {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      padding: 6px 8px 0;
    }
    .filechute-location {
      min-width: 0;
      height: 32px;
      padding: 0 10px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 9px;
      background: rgba(255,255,255,.045);
      color: inherit;
      font: 500 12px/1 system-ui, sans-serif;
      outline: none;
    }
    .filechute-location:focus,
    .filechute-search:focus {
      border-color: rgba(255,255,255,.3);
      background: rgba(255,255,255,.075);
    }
    .filechute-location-go {
      min-width: 42px;
      height: 32px;
      padding: 0 9px;
      border-radius: 9px;
    }
    .filechute-search-wrap {
      position: relative;
      display: block;
      grid-column: 1 / -1;
      min-width: 0;
    }
    .filechute-search {
      width: 100%;
      min-width: 0;
      height: 32px;
      box-sizing: border-box;
      padding: 0 10px 0 29px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 9px;
      background: rgba(255,255,255,.045);
      color: inherit;
      font: 500 12px/1 system-ui, sans-serif;
      outline: none;
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
      opacity: .44;
      cursor: grab;
      touch-action: none;
    }
    .filechute-grip:hover,
    .filechute-grip:focus-visible {
      opacity: .95;
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

function currentBreadcrumbParts() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return [];
  return text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
}

function currentPathNames() {
  return currentBreadcrumbParts().slice(1);
}

function currentDisplayLocation() {
  return currentBreadcrumbParts().join("/");
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
  const next = [...new Set([...names.filter(Boolean).map(String), ...recentNames()])].slice(0, 24);
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

function preserveCurrentPath() {
  try { sessionStorage.setItem(RESTORE_PATH_KEY, JSON.stringify(currentPathNames())); } catch {}
}

function scheduleReload() {
  if (reloadScheduled) return;
  reloadScheduled = true;
  preserveCurrentPath();
  setTimeout(() => location.reload(), 80);
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
  try { chute = transfer.getData(CHUTE_DRAG_TYPE) || transfer.getData("text/plain") || ""; } catch {}
  const chuteName = chuteNameFromToken(chute);
  if (chuteName) names.push(chuteName);
  return names;
}

function resetDragUi() {
  document.body.classList.remove("filechute-drop-active");
  document.querySelectorAll(".entry.dragging, .entry.drop-target").forEach((row) => {
    row.classList.remove("dragging", "drop-target");
  });
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

function wireGrip(row) {
  if (!(row instanceof HTMLElement)) return;
  const grip = row.querySelector(":scope > .filechute-grip");
  if (!grip || grip.dataset.filechuteWired === "true") return;
  grip.dataset.filechuteWired = "true";
  grip.draggable = true;
  grip.title = row.classList.contains("directory") ? "Drag this folder" : "Drag the full original file";
  grip.setAttribute("aria-label", grip.title);
  grip.addEventListener("click", (event) => event.preventDefault());
  grip.addEventListener("dragstart", (event) => forwardGripDrag(event, row));
  grip.addEventListener("dragend", resetDragUi);
}

function applySearch() {
  const query = String(searchInput?.value || "").trim().toLocaleLowerCase();
  for (const row of entries?.querySelectorAll(".entry") || []) {
    const name = String(row.querySelector(".entry-name")?.textContent || "").toLocaleLowerCase();
    const path = String(row.querySelector(".entry-path")?.textContent || "").toLocaleLowerCase();
    row.classList.toggle("filechute-search-hidden", Boolean(query) && !name.includes(query) && !path.includes(query));
  }
}

function decorateRows() {
  const recent = recentNames();
  const recentSet = new Set(recent);
  const rows = [...(entries?.querySelectorAll(".entry") || [])];
  for (const row of rows) {
    wireGrip(row);
    const name = String(row.querySelector(".entry-name")?.textContent || "");
    row.classList.toggle("filechute-recent", recentSet.has(name));
  }

  if (entries && recent.length) {
    const byName = new Map(rows.map((row) => [String(row.querySelector(".entry-name")?.textContent || ""), row]));
    for (const name of [...recent].reverse()) {
      const row = byName.get(name);
      if (row) entries.prepend(row);
    }
  }
  applySearch();
  syncLocationInput();
}

function syncLocationInput() {
  if (!locationInput || document.activeElement === locationInput) return;
  locationInput.value = currentDisplayLocation();
}

function directoryRowNamed(name) {
  const wanted = String(name || "").toLocaleLowerCase();
  return [...(entries?.querySelectorAll(".entry.directory") || [])].find((row) =>
    String(row.querySelector(".entry-name")?.textContent || "").toLocaleLowerCase() === wanted
  ) || null;
}

async function waitForDirectoryRow(name, timeout = 2800) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const row = directoryRowNamed(name);
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  return null;
}

async function waitForBreadcrumbPath(pathNames, timeout = 2800) {
  const expected = pathNames.join("/").toLocaleLowerCase();
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const actual = currentPathNames().join("/").toLocaleLowerCase();
    if (actual === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  return false;
}

function normalizeTypedPath(value) {
  let text = String(value || "").trim().replace(/\\/g, "/");
  text = text.replace(/^file:\/\//i, "");
  return text.split("/").map((part) => part.trim()).filter((part) => part && part !== ".");
}

async function navigateTypedLocation(value, { silent = false } = {}) {
  const parts = currentBreadcrumbParts();
  if (!parts.length) {
    if (!silent) setStatus("Choose a FileChute root folder first.", true);
    return false;
  }

  const rootName = parts[0];
  let requested = normalizeTypedPath(value);
  const rootIndex = requested.findIndex((part) => part.toLocaleLowerCase() === rootName.toLocaleLowerCase());
  if (rootIndex >= 0) requested = requested.slice(rootIndex + 1);

  if (!requested.length) {
    homeButton?.click();
    await waitForBreadcrumbPath([]);
    syncLocationInput();
    return true;
  }

  homeButton?.click();
  await waitForBreadcrumbPath([]);

  const travelled = [];
  for (const segment of requested) {
    if (segment === "..") {
      if (!silent) setStatus("Use FileChute's Back button to move upward.", true);
      return false;
    }
    const row = await waitForDirectoryRow(segment);
    if (!row) {
      if (!silent) {
        setStatus(`FileChute cannot open “${segment}” under the selected root. Choose folder once if it is outside FileChute's permitted tree.`, true);
      }
      return false;
    }
    row.querySelector(".entry-name")?.click();
    travelled.push(segment);
    if (!(await waitForBreadcrumbPath(travelled))) return false;
  }

  syncLocationInput();
  if (!silent) setStatus(`Opened ${currentDisplayLocation()}.`);
  return true;
}

async function tryPreferredScreenshotsLocation() {
  const parts = currentBreadcrumbParts();
  if (parts.length !== 1) return;
  const rootName = parts[0];
  const key = `${DEFAULT_ATTEMPT_PREFIX}${rootName.toLocaleLowerCase()}`;
  if (sessionStorage.getItem(key) === "done") return;
  sessionStorage.setItem(key, "done");

  const lower = rootName.toLocaleLowerCase();
  if (lower === "screenshots") return;

  if (lower === "pictures") {
    await navigateTypedLocation(`${rootName}/Screenshots`, { silent: true });
    return;
  }

  if (await navigateTypedLocation(`${rootName}/Pictures/Screenshots`, { silent: true })) return;
  await navigateTypedLocation(`${rootName}/Screenshots`, { silent: true });
}

function installNavigationTools() {
  if (!controls || document.querySelector(".filechute-nav-tools")) return;
  const tools = document.createElement("div");
  tools.className = "filechute-nav-tools";

  locationInput = document.createElement("input");
  locationInput.className = "filechute-location";
  locationInput.type = "text";
  locationInput.autocomplete = "off";
  locationInput.spellcheck = false;
  locationInput.placeholder = "Pictures/Screenshots";
  locationInput.setAttribute("aria-label", "FileChute location");

  const go = document.createElement("button");
  go.type = "button";
  go.className = "filechute-location-go";
  go.textContent = "Go";
  go.title = "Open this permitted directory";

  const searchWrap = document.createElement("label");
  searchWrap.className = "filechute-search-wrap";
  searchWrap.title = "Filter files and folders by typed name";
  searchInput = document.createElement("input");
  searchInput.className = "filechute-search";
  searchInput.type = "search";
  searchInput.placeholder = "Search files by name…";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute("aria-label", "Search files by name");
  searchWrap.append(searchInput);

  const goNow = () => void navigateTypedLocation(locationInput.value);
  go.addEventListener("click", goNow);
  locationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goNow();
    } else if (event.key === "Escape") {
      syncLocationInput();
      locationInput.blur();
    }
  });
  searchInput.addEventListener("input", applySearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && searchInput.value) {
      searchInput.value = "";
      applySearch();
      searchInput.blur();
    }
  });

  tools.append(locationInput, go, searchWrap);
  controls.insertAdjacentElement("afterend", tools);
  syncLocationInput();
}

async function resolveDisplayedDirectory() {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") return null;
  try {
    if ((await root.queryPermission({ mode: "read" })) !== "granted") return null;
  } catch {
    return null;
  }

  let directory = root;
  for (const segment of currentPathNames()) directory = await directory.getDirectoryHandle(segment);
  return directory;
}

async function scanDisplayedDirectory() {
  if (pollBusy || document.hidden || reloadScheduled) return;
  pollBusy = true;
  try {
    const directory = await resolveDisplayedDirectory();
    if (!directory) return;
    const names = [];
    for await (const [name, handle] of directory.entries()) names.push(`${handle.kind}:${name}`);
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    const directoryKey = currentDisplayLocation().toLocaleLowerCase();
    if (directoryKey !== lastDirectoryKey || lastDirectoryNames === null) {
      lastDirectoryKey = directoryKey;
      lastDirectoryNames = names;
      return;
    }

    if (names.join("\n") === lastDirectoryNames.join("\n")) return;

    const previous = new Set(lastDirectoryNames);
    const added = names.filter((entry) => !previous.has(entry)).map((entry) => entry.slice(entry.indexOf(":") + 1));
    if (added.length) saveRecent(added);
    lastDirectoryNames = names;
    scheduleReload();
  } catch (error) {
    console.debug("FileChute live directory refresh skipped", error);
  } finally {
    pollBusy = false;
  }
}

injectStyles();
installNavigationTools();
decorateRows();

const observer = new MutationObserver(() => decorateRows());
if (entries) observer.observe(entries, { childList: true });
if (breadcrumbs) observer.observe(breadcrumbs, { childList: true, characterData: true, subtree: true });

document.addEventListener("drop", (event) => {
  const names = namesFromDrop(event.dataTransfer);
  if (names.length) saveRecent(names);
  setTimeout(resetDragUi, 0);
}, true);

document.addEventListener("dragend", resetDragUi, true);
window.addEventListener("blur", () => setTimeout(resetDragUi, 60));
window.addEventListener("focus", resetDragUi);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resetDragUi();
});

setInterval(() => void scanDisplayedDirectory(), 850);
setTimeout(() => void tryPreferredScreenshotsLocation(), 650);
