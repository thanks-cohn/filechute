const FEEDBACK_KEY = "filechute-drop-feedback-v1";
const SUCCESS_RE = /^(?:Saved|Copied|Added|Imported|Received)\b/i;
const MAX_PENDING_MS = 15000;
const MAX_RESTORE_MS = 5000;

const entries = document.querySelector("#entries");
const status = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");

let pendingDrop = null;
let hoverTarget = null;
let flashTimer = 0;

function rowName(row) {
  return String(
    row?.querySelector(".entry-name-text")?.textContent ||
    row?.querySelector(".entry-name")?.textContent ||
    ""
  ).trim();
}

function rowPath(row) {
  return String(row?.querySelector(".entry-path")?.textContent || "").trim();
}

function currentFolderLabel() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return "current folder";
  const parts = text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || "current folder";
}

function targetForEvent(event) {
  const row = event.target instanceof Element ? event.target.closest(".entry.directory") : null;
  if (row) {
    return {
      kind: "directory",
      element: row,
      name: rowName(row) || "folder",
      path: rowPath(row)
    };
  }
  return {
    kind: "current",
    element: entries,
    name: currentFolderLabel(),
    path: String(breadcrumbs?.textContent || "").trim()
  };
}

function incomingTransfer(transfer) {
  if (!transfer) return false;
  const types = [...(transfer.types || [])];
  if (types.includes("application/x-filechute-item+json")) return false;
  if (types.includes("application/x-framechute-item+json") || types.includes("application/x-chute-item")) return true;
  if ([...transfer.items || []].some((item) => item.kind === "file")) return true;
  return types.some((type) => ["text/html", "text/uri-list", "text/plain", "DownloadURL"].includes(type));
}

function clearHover() {
  document.querySelectorAll(".entry.directory.drop-target").forEach((row) => row.classList.remove("drop-target"));
  entries?.classList.remove("drop-target-current");
  document.body.classList.remove("filechute-drop-active");
  document.body.removeAttribute("data-filechute-drop-label");
  hoverTarget = null;
}

function markHover(event) {
  const target = targetForEvent(event);
  if (hoverTarget?.element !== target.element) {
    clearHover();
    hoverTarget = target;
  }

  if (target.kind === "directory") target.element?.classList.add("drop-target");
  else target.element?.classList.add("drop-target-current");

  document.body.classList.add("filechute-drop-active");
  document.body.dataset.filechuteDropLabel = target.kind === "directory"
    ? `Drop into ${target.name}`
    : `Drop into ${target.name}`;
  return target;
}

function clearFlashClasses() {
  document.querySelectorAll(".drop-accepted, .drop-rejected").forEach((element) => {
    element.classList.remove("drop-accepted", "drop-rejected");
  });
}

function flashTarget(target, accepted) {
  if (!target?.element) return;
  clearTimeout(flashTimer);
  clearFlashClasses();
  target.element.classList.add(accepted ? "drop-accepted" : "drop-rejected");
  flashTimer = setTimeout(() => {
    target.element?.classList.remove("drop-accepted", "drop-rejected");
  }, accepted ? 1250 : 900);
}

function saveSuccess(target) {
  try {
    sessionStorage.setItem(FEEDBACK_KEY, JSON.stringify({
      ok: true,
      kind: target.kind,
      name: target.name,
      path: target.path,
      at: Date.now()
    }));
  } catch {}
}

function observeStatus() {
  if (!status) return;
  const update = () => {
    if (!pendingDrop || Date.now() - pendingDrop.at > MAX_PENDING_MS) {
      pendingDrop = null;
      return;
    }

    const message = String(status.textContent || "").trim();
    if (!message) return;

    if (status.classList.contains("error")) {
      flashTarget(pendingDrop.target, false);
      pendingDrop = null;
      return;
    }

    if (SUCCESS_RE.test(message)) {
      saveSuccess(pendingDrop.target);
      pendingDrop = null;
    }
  };

  new MutationObserver(update).observe(status, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
}

function findRestoredTarget(saved) {
  if (saved.kind !== "directory") {
    return { kind: "current", element: entries, name: saved.name, path: saved.path };
  }

  const rows = [...document.querySelectorAll(".entry.directory")];
  const row = rows.find((candidate) => {
    const path = rowPath(candidate);
    if (saved.path && path === saved.path) return true;
    return rowName(candidate) === saved.name;
  });
  return row ? { kind: "directory", element: row, name: saved.name, path: saved.path } : null;
}

async function restoreSuccessFlash() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(FEEDBACK_KEY) || "null");
    sessionStorage.removeItem(FEEDBACK_KEY);
  } catch {}
  if (!saved?.ok || Date.now() - Number(saved.at || 0) > MAX_RESTORE_MS) return;

  const started = Date.now();
  while (Date.now() - started < 1800) {
    const target = findRestoredTarget(saved);
    if (target?.element) {
      flashTarget(target, true);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (entries) flashTarget({ kind: "current", element: entries, name: saved.name, path: saved.path }, true);
}

document.addEventListener("dragover", (event) => {
  if (!incomingTransfer(event.dataTransfer)) return;
  markHover(event);
}, true);

document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  clearHover();
}, true);

document.addEventListener("drop", (event) => {
  if (!incomingTransfer(event.dataTransfer)) return;
  const target = markHover(event);
  pendingDrop = { target, at: Date.now() };
  clearHover();
}, true);

window.addEventListener("blur", () => clearHover());

observeStatus();
void restoreSuccessFlash();
