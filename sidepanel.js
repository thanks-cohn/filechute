import { readStored, writeStored } from "./storage.js";

const ROOT_KEY = "chute-root-handle-v1";
const PATH_KEY = "chute-current-path-v1";
const $ = (selector) => document.querySelector(selector);
const setup = $("#setup"), browser = $("#browser"), status = $("#status"), entries = $("#entries");
let root = null, path = [], directory = null, results = [], page = 0, searchGeneration = 0;
let previewUrls = [];

function message(text, error = false) { status.textContent = text; status.classList.toggle("error", error); }
async function permission(handle, request = false) {
  if (!handle) return "denied";
  const options = { mode: "readwrite" };
  const state = await handle.queryPermission(options).catch(() => "prompt");
  return request && state !== "granted" ? handle.requestPermission(options).catch(() => "denied") : state;
}
async function chooseRoot() {
  try {
    const parent = await showDirectoryPicker({ mode: "readwrite", startIn: "pictures" });
    const chute = await parent.getDirectoryHandle("Chute", { create: true });
    await writeStored(ROOT_KEY, chute); root = chute; path = []; await writeStored(PATH_KEY, []); await open();
  } catch (error) {
    if (error?.name !== "AbortError") showSetup(`Chrome could not use that location: ${error.message}`);
  }
}
function showSetup(error = "") {
  setup.hidden = false; browser.hidden = true;
  const reconnect = $("#reconnect"); reconnect.hidden = !root;
  if (error) { reconnect.hidden = false; reconnect.textContent = error; reconnect.classList.add("error"); }
}
async function reconnect() {
  if ((await permission(root, true)) === "granted") { path = []; await open(); }
  else showSetup("Access was not granted. Reconnect remembered Chute");
}
async function resolvePath(parts) {
  let current = root;
  for (const part of parts) current = await current.getDirectoryHandle(part);
  return current;
}
function safeName(name) { return String(name || "file").replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").trim() || "file"; }
async function uniqueHandle(dir, requested) {
  const name = safeName(requested); const dot = name.lastIndexOf("."); const stem = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; i < 10000; i++) {
    const candidate = i ? `${stem} (${i})${ext}` : name;
    try { await dir.getFileHandle(candidate); } catch (error) { if (error.name === "NotFoundError") return dir.getFileHandle(candidate, { create: true }); throw error; }
  }
  throw new Error("Could not create a unique filename.");
}
async function saveFile(file) {
  const handle = await uniqueHandle(directory, file.name); const writable = await handle.createWritable();
  try { await writable.write(file); await writable.close(); } catch (error) { await writable.abort().catch(() => {}); throw error; }
}
async function enumerate(dir, prefix = "", token = searchGeneration) {
  const found = [];
  for await (const [name, handle] of dir.entries()) {
    if (token !== searchGeneration) throw new DOMException("Superseded", "AbortError");
    const relativePath = prefix ? `${prefix}/${name}` : name;
    found.push({ name, handle, relativePath });
    if (handle.kind === "directory") found.push(...await enumerate(handle, relativePath, token));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return found;
}
function clearPreviews() { previewUrls.forEach(URL.revokeObjectURL); previewUrls = []; }
function icon(item) { return item.handle.kind === "directory" ? "📁" : /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(item.name) ? "🖼️" : /\.(?:mp4|webm|mov|m4v|ogv)$/i.test(item.name) ? "🎬" : "📄"; }
async function renderItem(item, generation) {
  const row = document.createElement("article"); row.className = `entry ${item.handle.kind}`; row.draggable = item.handle.kind === "file";
  const preview = document.createElement("div"); preview.className = "preview"; preview.textContent = icon(item);
  const info = document.createElement("div"); const name = document.createElement("div"); name.className = "name"; name.textContent = item.name;
  const location = document.createElement("button"); location.className = "path"; location.textContent = item.relativePath; location.title = "Copy Chute-relative path";
  location.onclick = () => navigator.clipboard.writeText(item.relativePath);
  info.append(name, location); row.append(preview, info);
  if (item.handle.kind === "directory") row.onclick = async (event) => { if (event.target === location) return; path.push(item.name); await open(); };
  else {
    const file = await item.handle.getFile();
    if (generation !== searchGeneration) return row;
    if (/^image\//.test(file.type) || /^video\//.test(file.type)) { const url = URL.createObjectURL(file); previewUrls.push(url); const media = document.createElement(/^video\//.test(file.type) ? "video" : "img"); media.src = url; if (media instanceof HTMLVideoElement) { media.muted = true; media.preload = "metadata"; } preview.replaceChildren(media); }
    row.ondragstart = (event) => {
      // Create a new wrapper synchronously for every gesture. DataTransfer may
      // become read-only after an awaited operation, and reusing a wrapper made
      // repeated outbound drags unreliable in Chromium.
      const transferable = new File([file], item.name, { type: file.type, lastModified: file.lastModified });
      event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.items.add(transferable);
      event.dataTransfer.setData("application/x-chute-source+json", JSON.stringify({ provider: "Chute", relativePath: item.relativePath, name: item.name, size: file.size, type: file.type }));
      event.dataTransfer.setData("text/plain", item.relativePath);
      row.classList.add("dragging"); setTimeout(() => row.classList.remove("dragging"), 10000);
    };
    row.ondragend = () => row.classList.remove("dragging");
  }
  return row;
}
async function render() {
  const generation = searchGeneration; clearPreviews(); entries.replaceChildren();
  const limit = Number($("#limit").value); const pages = Math.max(1, Math.ceil(results.length / limit)); page = Math.min(page, pages - 1);
  for (const item of results.slice(page * limit, (page + 1) * limit)) entries.append(await renderItem(item, generation));
  $("#page").textContent = results.length > limit ? `${page + 1} / ${pages}` : ""; $("#prev").disabled = page === 0; $("#next").disabled = page >= pages - 1;
  message(results.length ? `${results.length} item${results.length === 1 ? "" : "s"}` : "This folder is empty.");
}
function renderCrumbs() {
  const crumbs = $("#crumbs"); crumbs.replaceChildren();
  ["Chute", ...path].forEach((part, index) => { const button = document.createElement("button"); button.className = "crumb"; button.textContent = `${index ? " / " : ""}${part}`; button.onclick = async () => { path = path.slice(0, index); await open(); }; crumbs.append(button); });
  $("#back").disabled = path.length === 0;
}
async function open() {
  directory = await resolvePath(path).catch(async () => { path = []; return root; }); await writeStored(PATH_KEY, path);
  setup.hidden = true; browser.hidden = false; renderCrumbs(); page = 0; const token = ++searchGeneration;
  const current = []; for await (const [name, handle] of directory.entries()) current.push({ name, handle, relativePath: [...path, name].join("/") });
  if (token !== searchGeneration) return; results = current.sort((a,b) => (a.handle.kind === b.handle.kind ? a.name.localeCompare(b.name, undefined, {numeric:true}) : a.handle.kind === "directory" ? -1 : 1)); await render();
}
let searchTimer;
async function search() {
  clearTimeout(searchTimer); const query = $("#search").value.trim().toLocaleLowerCase(); const token = ++searchGeneration; page = 0;
  searchTimer = setTimeout(async () => { try { if (!query) return open(); message("Searching Chute…"); const all = await enumerate(root, "", token); if (token !== searchGeneration) return; results = all.filter((item) => item.name.toLocaleLowerCase().includes(query)).sort((a,b) => a.relativePath.localeCompare(b.relativePath)); await render(); } catch (error) { if (error.name !== "AbortError") message(`Search failed: ${error.message}`, true); } }, 180);
}
entries.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); entries.classList.add("dropzone"); } });
entries.addEventListener("dragleave", () => entries.classList.remove("dropzone"));
entries.addEventListener("drop", async (event) => { event.preventDefault(); entries.classList.remove("dropzone"); try { const files = [...event.dataTransfer.files].filter((file) => file.size || file.name); if (!files.length) throw new Error("That drag did not contain a readable file."); for (const file of files) await saveFile(file); await open(); message(`Saved ${files.length} file${files.length === 1 ? "" : "s"} here.`); } catch (error) { message(`Drop failed: ${error.message}`, true); } });
$("#choose").onclick = chooseRoot; $("#setup-choose").onclick = chooseRoot; $("#reconnect").onclick = reconnect; $("#back").onclick = async () => { if (path.length) { path.pop(); await open(); } }; $("#home").onclick = async () => { path = []; await open(); }; $("#search").oninput = search; $("#limit").onchange = () => { page = 0; render(); }; $("#prev").onclick = () => { page--; render(); }; $("#next").onclick = () => { page++; render(); };
document.addEventListener("dragend", () => document.querySelectorAll(".dragging").forEach((node) => node.classList.remove("dragging")), true);

async function initialize() {
  if (!("showDirectoryPicker" in window)) return showSetup("Chrome's File System Access API is unavailable here.");
  root = await readStored(ROOT_KEY); if (!root) return showSetup();
  const state = await permission(root); if (state !== "granted") return showSetup();
  path = Array.isArray(await readStored(PATH_KEY)) ? await readStored(PATH_KEY) : []; await open();
}
initialize().catch((error) => showSetup(`Chute could not start: ${error.message}`));
