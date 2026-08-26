const FEEDBACK_KEY = "filechute-drop-feedback-v1";
const SUCCESS_RE = /^(?:Saved|Copied|Added|Imported|Received)\b/i;
const MAX_PENDING_MS = 15000;
const MAX_RESTORE_MS = 5000;

const entries = document.querySelector("#entries");
const status = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");

const style = document.createElement("style");
style.dataset.chuteDropFeedback = "true";
style.textContent = `
  body.filechute-drop-active::before {
    content: attr(data-filechute-drop-label) !important;
    inset: auto !important;
    top: 76px !important;
    left: 50% !important;
    width: max-content !important;
    max-width: calc(100vw - 28px) !important;
    min-height: 0 !important;
    transform: translateX(-50%) !important;
    display: block !important;
    padding: 7px 11px !important;
    border: 1px solid rgba(215, 255, 63, .68) !important;
    border-radius: 999px !important;
    background: rgba(18, 20, 20, .94) !important;
    color: #efffc1 !important;
    box-shadow: 0 6px 22px rgba(0,0,0,.38), 0 0 0 1px rgba(215,255,63,.08) !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    line-height: 1.2 !important;
    text-align: center !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    pointer-events: none !important;
    animation: filechute-drop-pill-in 120ms ease-out both !important;
  }

  .entry.directory.drop-target {
    position: relative;
    z-index: 2;
    outline: 2px solid #d7ff3f !important;
    outline-offset: -2px !important;
    background: #20291b !important;
    box-shadow: 0 0 0 2px rgba(215,255,63,.16), 0 0 18px rgba(215,255,63,.28) !important;
    transform: translateX(2px);
    border-radius: 9px;
    animation: filechute-drop-target-bob 650ms ease-in-out infinite alternate;
  }

  #entries.drop-target-current {
    outline: 2px dashed rgba(215,255,63,.82);
    outline-offset: -6px;
    border-radius: 12px;
    background: rgba(215,255,63,.025);
  }

  .entry.directory.drop-accepted,
  #entries.drop-accepted {
    animation: filechute-drop-accepted 1050ms cubic-bezier(.2,.8,.2,1) both !important;
  }

  .entry.directory.drop-rejected,
  #entries.drop-rejected {
    animation: filechute-drop-rejected 760ms ease both !important;
  }

  @keyframes filechute-drop-pill-in {
    from { opacity: 0; transform: translate(-50%, -5px) scale(.97); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }

  @keyframes filechute-drop-target-bob {
    from { box-shadow: 0 0 0 2px rgba(215,255,63,.12), 0 0 11px rgba(215,255,63,.18); }
    to { box-shadow: 0 0 0 3px rgba(215,255,63,.2), 0 0 21px rgba(215,255,63,.34); }
  }

  @keyframes filechute-drop-accepted {
    0% { box-shadow: 0 0 0 0 rgba(107,255,130,0); transform: scale(1); }
    22% { box-shadow: 0 0 0 4px rgba(107,255,130,.38), 0 0 26px rgba(107,255,130,.52); transform: scale(1.012); background: rgba(63,132,70,.22); }
    52% { box-shadow: 0 0 0 8px rgba(107,255,130,.12), 0 0 34px rgba(107,255,130,.26); transform: scale(1.004); }
    100% { box-shadow: 0 0 0 0 rgba(107,255,130,0); transform: scale(1); }
  }

  @keyframes filechute-drop-rejected {
    0% { box-shadow: 0 0 0 0 rgba(255,91,91,0); transform: translateX(0); }
    16% { box-shadow: 0 0 0 4px rgba(255,91,91,.34), 0 0 22px rgba(255,91,91,.4); transform: translateX(-3px); background: rgba(130,43,43,.2); }
    32% { transform: translateX(3px); }
    48% { transform: translateX(-2px); }
    64% { transform: translateX(2px); }
    100% { box-shadow: 0 0 0 0 rgba(255,91,91,0); transform: translateX(0); }
  }
`;
document.head.append(style);

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
  if (types.includes("application/x-framefilechute-item+json") || types.includes("application/x-filechute-item")) return true;
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
  document.body.dataset.chuteDropLabel = `Drop into ${target.name}`;
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
