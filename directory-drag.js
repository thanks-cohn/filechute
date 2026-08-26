import { makeChutePayload, writeChuteDrag, FILECHUTE_DRAG_TYPE } from "./interop.js";

const entries = document.querySelector("#entries");

function rowName(row) {
  return String(
    row?.querySelector(".entry-name-text")?.textContent ||
    row?.querySelector(".entry-name")?.textContent ||
    "Folder"
  ).trim() || "Folder";
}

function rowPath(row) {
  return String(row?.querySelector(".entry-path")?.textContent || "").trim();
}

function hasChutePayload(transfer) {
  try {
    return Boolean(transfer?.getData(FILECHUTE_DRAG_TYPE));
  } catch {
    return false;
  }
}

function prepareDirectoryRows(root = document) {
  for (const row of root.querySelectorAll?.(".entry.directory") || []) {
    row.hidden = false;
    row.dataset.filechuteDirectory = "true";
    row.draggable = true;

    const grip = row.querySelector(".filechute-grip");
    if (grip) {
      grip.title = "Drag this folder to FrameChute as a gallery";
      grip.setAttribute("aria-label", grip.title);
    }

    const preview = row.querySelector(".preview-wrap");
    if (preview) preview.title = "Drag this folder to FrameChute as a gallery";

    const name = row.querySelector(".entry-name");
    if (name) name.title = "Click to open · drag to FrameChute as a gallery";
  }
}

function ensureDirectoryDrag(event) {
  if (!event.dataTransfer) return;
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest(".entry.directory");
  if (!row) return;

  // sidepanel.js already writes the canonical Chute payload when the
  // filename/preview starts the drag. This is a fallback for dragging the
  // folder row itself or for future UI changes: never replace a payload that
  // is already present.
  if (hasChutePayload(event.dataTransfer)) return;

  const name = rowName(row);
  const relativePath = rowPath(row);
  if (!relativePath) return;

  const payload = makeChutePayload({
    kind: "directory",
    name,
    originalName: name,
    representation: "original",
    mime: "inode/directory",
    relativePath,
    size: null,
    lastModified: null
  });

  writeChuteDrag(event.dataTransfer, payload, null);
  row.classList.add("dragging");
}

function finishDirectoryDrag(event) {
  const target = event.target instanceof Element ? event.target : null;
  target?.closest(".entry.directory")?.classList.remove("dragging");
}

prepareDirectoryRows();

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.(".entry.directory")) prepareDirectoryRows(node.parentElement || document);
      else prepareDirectoryRows(node);
    }
  }
});

if (entries) observer.observe(entries, { childList: true });

document.addEventListener("dragstart", ensureDirectoryDrag, false);
document.addEventListener("dragend", finishDirectoryDrag, true);
