const entries = document.querySelector("#entries");
const breadcrumbs = document.querySelector("#breadcrumbs");

function rootNameFromBreadcrumbs() {
  const text = String(breadcrumbs?.textContent || "").trim();
  if (!text || text === "No folder selected") return "";
  return text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean)[0] || "";
}

function disableAutomaticFolderDive() {
  const rootName = rootNameFromBreadcrumbs();
  if (!rootName) return;
  // ui-enhancements.js historically auto-entered Pictures/Screenshots after
  // startup. FileChute now follows the user's chosen root literally: the user
  // clicks a visible child directory when they want to enter it.
  try {
    sessionStorage.setItem(`filechute-default-location-v1:${rootName.toLocaleLowerCase()}`, "done");
  } catch {}
}

function keepDirectoryRowsVisible(root = document) {
  for (const row of root.querySelectorAll?.(".entry.directory") || []) {
    row.hidden = false;
    row.classList.remove("filechute-search-hidden");
    row.dataset.filechuteDirectory = "true";

    const name = row.querySelector(".entry-name-text") || row.querySelector(".entry-name");
    if (name) name.title = "Click to open · drag to FrameChute as a gallery";
    const preview = row.querySelector(".preview-wrap");
    if (preview) preview.title = "Drag this folder to FrameChute as a gallery";
  }
}

const style = document.createElement("style");
style.dataset.filechuteDirectoryVisibility = "true";
style.textContent = `
  /* Directories are first-class FileChute objects. They are not paged, never
     disappear behind the file search filter, and always remain above files. */
  #entries > .entry.directory {
    display: grid !important;
    order: -100000 !important;
  }
  #entries > .entry.directory.filechute-search-hidden {
    display: grid !important;
  }
  #entries > .entry.directory .fallback-icon {
    filter: none;
  }
`;
document.head.append(style);

disableAutomaticFolderDive();
keepDirectoryRowsVisible();

const breadcrumbObserver = new MutationObserver(disableAutomaticFolderDive);
if (breadcrumbs) breadcrumbObserver.observe(breadcrumbs, { childList: true, characterData: true, subtree: true });

const entryObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "attributes") {
      const row = mutation.target instanceof Element ? mutation.target.closest(".entry.directory") : null;
      if (row) keepDirectoryRowsVisible(row.parentElement || document);
      continue;
    }
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      keepDirectoryRowsVisible(node.matches?.(".entry.directory") ? (node.parentElement || document) : node);
    }
  }
});

if (entries) {
  entryObserver.observe(entries, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "style"]
  });
}
