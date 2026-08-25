const FILECHUTE_DRAG_TYPE = "application/x-filechute-item+json";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const FRAMECHUTE_DRAG_TYPE = "application/x-framechute-item+json";
const BROWSER_STRING_TYPES = ["text/html", "text/uri-list", "text/plain", "DownloadURL"];

function needsNormalization(transfer) {
  if (!transfer) return false;
  const types = [...(transfer.types || [])];
  if (types.includes(FILECHUTE_DRAG_TYPE) || types.includes(CHUTE_DRAG_TYPE) || types.includes(FRAMECHUTE_DRAG_TYPE)) return false;
  if (![...transfer.items || []].some((item) => item.kind === "file")) return false;
  if ((transfer.files?.length || 0) > 0) return false;
  return BROWSER_STRING_TYPES.some((type) => types.includes(type));
}

function cloneBrowserStrings(transfer) {
  const clone = new DataTransfer();
  clone.effectAllowed = "copy";
  for (const type of BROWSER_STRING_TYPES) {
    try {
      const value = transfer.getData(type);
      if (value) clone.setData(type, value);
    } catch {}
  }
  return clone;
}

document.addEventListener("drop", (event) => {
  if (!needsNormalization(event.dataTransfer)) return;
  const clone = cloneBrowserStrings(event.dataTransfer);
  if (![...(clone.types || [])].length) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const target = event.target instanceof EventTarget ? event.target : document;
  target.dispatchEvent(new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    composed: true,
    dataTransfer: clone,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY
  }));
}, true);
