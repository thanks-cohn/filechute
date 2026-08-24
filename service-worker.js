const STANDALONE_WIDTH = 390;
const STANDALONE_HEIGHT = 760;
const STANDALONE_WINDOW_KEY = "filechute-standalone-window-id";

async function rememberedStandaloneWindow() {
  try {
    const stored = await chrome.storage.session.get(STANDALONE_WINDOW_KEY);
    const id = stored?.[STANDALONE_WINDOW_KEY];
    if (!Number.isInteger(id)) return null;
    return await chrome.windows.get(id);
  } catch {
    return null;
  }
}

async function rememberStandaloneWindow(id) {
  if (!Number.isInteger(id)) return;
  try {
    await chrome.storage.session.set({ [STANDALONE_WINDOW_KEY]: id });
  } catch {}
}

async function forgetStandaloneWindow() {
  try {
    await chrome.storage.session.remove(STANDALONE_WINDOW_KEY);
  } catch {}
}

async function openStandaloneFileChute(tab) {
  const existing = await rememberedStandaloneWindow();
  if (existing?.id) {
    await chrome.windows.update(existing.id, { focused: true });
    return;
  }

  let host = null;
  try {
    if (Number.isInteger(tab?.windowId)) host = await chrome.windows.get(tab.windowId);
  } catch {}

  const width = STANDALONE_WIDTH;
  const height = Math.max(480, Math.min(STANDALONE_HEIGHT, Number(host?.height) || STANDALONE_HEIGHT));
  const top = Number.isFinite(host?.top) ? host.top : 40;
  let left = Number.isFinite(host?.left) ? host.left : 20;
  if (left >= width) left -= width;

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html?standalone=1"),
    type: "popup",
    focused: true,
    width,
    height,
    left: Math.round(left),
    top: Math.round(top)
  });

  await rememberStandaloneWindow(created?.id);
}

async function toggleFileChute(tab) {
  if (!tab?.id) {
    await openStandaloneFileChute(tab);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["drawer-host.js"]
    });
  } catch (error) {
    console.info("FileChute cannot inject into this page; opening the standalone left shelf instead.", error);
    await openStandaloneFileChute(tab);
  }
}

chrome.action.onClicked.addListener((tab) => {
  void toggleFileChute(tab);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const stored = await chrome.storage.session.get(STANDALONE_WINDOW_KEY).catch(() => ({}));
    if (stored?.[STANDALONE_WINDOW_KEY] === windowId) await forgetStandaloneWindow();
  })();
});
