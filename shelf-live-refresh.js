const controls = document.querySelector(".controls");
const breadcrumbs = document.querySelector("#breadcrumbs");

const style = document.createElement("style");
style.dataset.filechuteShelfRefresh = "true";
style.textContent = `
  .controls.filechute-has-refresh {
    grid-template-columns: auto auto auto minmax(0, 1fr);
  }
  #filechute-refresh {
    width: 34px;
    height: 32px;
    padding: 0;
    font-size: 15px;
    line-height: 1;
  }
  #filechute-refresh.filechute-refreshing {
    animation: filechute-refresh-spin 420ms linear;
  }
  @keyframes filechute-refresh-spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.append(style);

function requestRefresh({ animate = false } = {}) {
  if (animate) {
    const button = document.querySelector("#filechute-refresh");
    if (button) {
      button.classList.remove("filechute-refreshing");
      void button.offsetWidth;
      button.classList.add("filechute-refreshing");
      setTimeout(() => button.classList.remove("filechute-refreshing"), 460);
    }
  }
  window.dispatchEvent(new CustomEvent("filechute:filesystem-changed"));
}

function installRefreshButton() {
  if (!controls || document.querySelector("#filechute-refresh")) return;
  const button = document.createElement("button");
  button.id = "filechute-refresh";
  button.type = "button";
  button.textContent = "↻";
  button.title = "Refresh this FileChute shelf";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", () => requestRefresh({ animate: true }));
  controls.classList.add("filechute-has-refresh");
  controls.insertBefore(button, breadcrumbs || null);
}

installRefreshButton();

// sidepanel.js already performs a guarded once-per-second filesystem scan.
// Do not stack another 250 ms poll on top of it: on larger shelves that caused
// hundreds of directory-entry reads while the user was dragging and could make
// the side panel appear stuck after several cross-page drops. Keep this helper
// event-driven instead: manual refresh plus focus/visibility refreshes.
window.addEventListener("focus", () => requestRefresh());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) requestRefresh();
});
