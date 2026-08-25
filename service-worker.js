import { readStored } from "./storage.js";

const ROOT_KEY = "chute-root-handle-v1";
function safeName(name) { return String(name || "image").replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").trim() || "image"; }
async function writableRoot() {
  const root = await readStored(ROOT_KEY);
  if (!root) throw new Error("Open Chute and choose its location first.");
  if (await root.queryPermission({ mode: "readwrite" }) !== "granted") throw new Error("Open Chute and reconnect the remembered folder first.");
  return root;
}
async function uniqueHandle(directory, requested) {
  const name = safeName(requested), dot = name.lastIndexOf("."), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; i < 10000; i++) { const candidate = i ? `${stem} (${i})${ext}` : name; try { await directory.getFileHandle(candidate); } catch (error) { if (error.name === "NotFoundError") return directory.getFileHandle(candidate, { create: true }); throw error; } }
  throw new Error("Could not create a unique filename.");
}
async function store(file) {
  if (!(file instanceof File) || !file.size) throw new Error("No readable image bytes were received.");
  const handle = await uniqueHandle(await writableRoot(), file.name); const stream = await handle.createWritable();
  try { await stream.write(file); await stream.close(); } catch (error) { await stream.abort().catch(() => {}); throw error; }
  const state = await chrome.storage.local.get({ chuttyIngestCount: 0 }); const count = Number(state.chuttyIngestCount || 0) + 1; await chrome.storage.local.set({ chuttyIngestCount: count });
  return { ok: true, name: handle.name, count };
}
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "chute-store-file-v3") { store(message.file).then(respond).catch((error) => respond({ ok: false, error: error.message })); return true; }
  if (message?.type === "chute-count-v3") { chrome.storage.local.get({ chuttyIngestCount: 0 }).then((value) => respond({ ok: true, count: value.chuttyIngestCount })); return true; }
  return false;
});
chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}));
chrome.runtime.onStartup.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}));
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
