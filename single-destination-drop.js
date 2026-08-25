import { readStored } from "./storage.js";

const ROOT_HANDLE_KEY = "filechute-root-handle";
const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const FRAMECHUTE_DRAG_TYPE = "application/x-framechute-item+json";

const statusElement = document.querySelector("#status");
const breadcrumbs = document.querySelector("#breadcrumbs");

let dropBusy = false;

function setStatus(message, error = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

function currentPathNames() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return [];
  return text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean).slice(1);
}

function pathFromEntry(entry) {
  const path = String(entry?.querySelector(".entry-path")?.textContent || "").trim();
  if (!path) return null;
  return path.split("/").filter(Boolean).slice(1);
}

function targetPathForEvent(event) {
  const folderRow = event.target instanceof Element ? event.target.closest(".entry.directory") : null;
  return pathFromEntry(folderRow) || currentPathNames();
}

function customProtocol(transfer) {
  const types = [...(transfer?.types || [])];
  return types.includes(FILECHUTE_DRAG_TYPE) || types.includes(CHUTE_DRAG_TYPE) || types.includes(FRAMECHUTE_DRAG_TYPE);
}

function hasFileItems(transfer) {
  return Boolean(transfer && [...(transfer.items || [])].some((item) => item.kind === "file"));
}

async function rootWithWritePermission() {
  const root = await readStored(ROOT_HANDLE_KEY);
  if (!root || root.kind !== "directory") throw new Error("Choose a FileChute folder first.");

  try {
    if ((await root.queryPermission({ mode: "readwrite" })) === "granted") return root;
  } catch {}

  try {
    if ((await root.requestPermission({ mode: "readwrite" })) === "granted") return root;
  } catch {}

  throw new Error(`FileChute needs write access to ${root.name || "the selected folder"}.`);
}

async function resolveDirectory(pathNames) {
  const root = await rootWithWritePermission();
  let directory = root;
  for (const name of pathNames || []) directory = await directory.getDirectoryHandle(name);
  return { root, directory };
}

function sanitizeName(value, fallback = "dropped-file") {
  const clean = String(value || "").replace(/[\\/\r\n\0]+/g, "_").trim();
  return clean || fallback;
}

async function uniqueFileName(directory, requested) {
  const name = sanitizeName(requested);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? name : `${stem} (${attempt + 1})${ext}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name === "TypeMismatchError") continue;
      throw error;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

async function uniqueDirectoryName(directory, requested) {
  const name = sanitizeName(requested, "Dropped folder");
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? name : `${name} (${attempt + 1})`;
    try {
      await directory.getDirectoryHandle(candidate);
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      if (error?.name === "TypeMismatchError") continue;
      throw error;
    }
  }
  return `${name}-${Date.now()}`;
}

async function writeFile(directory, file, preferredName = file?.name) {
  const name = await uniqueFileName(directory, preferredName || "dropped-file");
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return name;
}

async function copyHandle(source, destination) {
  if (source.kind === "file") {
    const file = await source.getFile();
    await writeFile(destination, file, source.name);
    return { files: 1, folders: 0 };
  }

  if (source.kind !== "directory") return { files: 0, folders: 0 };
  const name = await uniqueDirectoryName(destination, source.name);
  const childDestination = await destination.getDirectoryHandle(name, { create: true });
  let files = 0;
  let folders = 1;

  for await (const [, child] of source.entries()) {
    const copied = await copyHandle(child, childDestination);
    files += copied.files;
    folders += copied.folders;
  }
  return { files, folders };
}

async function fileSystemHandles(transfer) {
  const handles = [];
  for (const item of [...(transfer?.items || [])]) {
    if (item.kind !== "file" || typeof item.getAsFileSystemHandle !== "function") continue;
    try {
      const handle = await item.getAsFileSystemHandle();
      if (handle) handles.push(handle);
    } catch {}
  }
  return handles;
}

async function receiveOnce(transfer, targetPathNames) {
  const { directory } = await resolveDirectory(targetPathNames);
  const handles = await fileSystemHandles(transfer);

  if (handles.length) {
    let files = 0;
    let folders = 0;
    for (const handle of handles) {
      const copied = await copyHandle(handle, directory);
      files += copied.files;
      folders += copied.folders;
    }
    return { files, folders };
  }

  const incoming = [...(transfer?.files || [])].filter((file) => file instanceof File && file.size >= 0);
  let files = 0;
  for (const file of incoming) {
    await writeFile(directory, file, file.name);
    files += 1;
  }
  return { files, folders: 0 };
}

function destinationLabel(pathNames) {
  if (pathNames.length) return pathNames.at(-1);
  const text = String(breadcrumbs?.textContent || "").trim();
  const parts = text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || "current folder";
}

document.addEventListener("dragover", (event) => {
  const transfer = event.dataTransfer;
  if (!transfer || customProtocol(transfer) || !hasFileItems(transfer)) return;
  event.preventDefault();
  if (transfer) transfer.dropEffect = "copy";
}, true);

document.addEventListener("drop", (event) => {
  const transfer = event.dataTransfer;
  if (!transfer || customProtocol(transfer) || !hasFileItems(transfer) || dropBusy) return;

  // Claim native/binary file drops before the older browser fallbacks. Exactly
  // one destination is chosen from the pointer: a hovered subdirectory, or the
  // currently open FileChute directory. Never copy the same drop to both.
  event.preventDefault();
  event.stopImmediatePropagation();
  const targetPathNames = targetPathForEvent(event);
  const target = destinationLabel(targetPathNames);
  dropBusy = true;
  setStatus(`Copying into ${target}…`);

  void receiveOnce(transfer, targetPathNames)
    .then(({ files, folders }) => {
      const fileText = `${files} file${files === 1 ? "" : "s"}`;
      const folderText = folders ? ` and ${folders} folder${folders === 1 ? "" : "s"}` : "";
      setStatus(`Copied ${fileText}${folderText} into ${target}.`);
      window.dispatchEvent(new CustomEvent("filechute:filesystem-changed"));
    })
    .catch((error) => {
      console.error("FileChute single-destination drop failed", error);
      setStatus(error?.message || "Could not copy that drop into FileChute.", true);
    })
    .finally(() => {
      dropBusy = false;
      document.body.classList.remove("filechute-drop-active");
      document.querySelectorAll(".entry.directory.drop-target").forEach((row) => row.classList.remove("drop-target"));
    });
}, true);
