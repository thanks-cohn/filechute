async function toggleFileChute(tab) {
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["drawer-host.js"]
    });
  } catch (error) {
    console.warn("FileChute could not open on this page:", error);
    try {
      await chrome.action.setBadgeBackgroundColor({ color: "#e05d44" });
      await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {}), 1800);
    } catch {}
  }
}

chrome.action.onClicked.addListener((tab) => {
  toggleFileChute(tab);
});
