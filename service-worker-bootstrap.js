import "./black-box-analyzer.js";
import "./black-box-service.js";
import "./service-worker.js";

const DROP_BRIDGE_SESSION_KEY = "filechute-drop-bridge-bootstrap-v1";
const DROP_BRIDGE_MATCHES = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://*.google.com/*",
  "https://*.yandex.com/*",
  "https://*.yandex.ru/*",
  "https://*.yandex.kz/*",
  "https://*.yandex.by/*",
  "https://*.yandex.uz/*",
  "https://*.yandex.com.tr/*"
];

async function injectOpenSupportedTabs({ force = false } = {}) {
  const version = chrome.runtime.getManifest().version;
  if (!force) {
    const stored = await chrome.storage.session.get(DROP_BRIDGE_SESSION_KEY).catch(() => ({}));
    if (stored?.[DROP_BRIDGE_SESSION_KEY] === version) return;
  }

  await chrome.storage.session.set({ [DROP_BRIDGE_SESSION_KEY]: version }).catch(() => {});

  const tabs = await chrome.tabs.query({ url: DROP_BRIDGE_MATCHES }).catch(() => []);
  await Promise.allSettled(tabs
    .filter((tab) => Number.isInteger(tab?.id))
    .map((tab) => chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["black-box.js", "page-drop-bridge.js"]
    })));
}

chrome.runtime.onInstalled.addListener(() => {
  void injectOpenSupportedTabs({ force: true });
});

chrome.runtime.onStartup.addListener(() => {
  void injectOpenSupportedTabs({ force: true });
});

// An unpacked extension reload invalidates the content-script contexts in tabs
// that were already open. Re-seed FileChute's diagnostic + handoff bridges into
// those tabs as soon as the new service-worker context starts.
void injectOpenSupportedTabs();
