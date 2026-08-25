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

let pulseTimer = 0;

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

function startLiveRefresh() {
  clearInterval(pulseTimer);
  // The core shelf already compares directory signatures before rerendering.
  // Pulse it frequently enough that files created outside FileChute appear
  // almost immediately without burning a reload or disturbing the open path.
  pulseTimer = setInterval(() => requestRefresh(), 250);
}

installRefreshButton();
startLiveRefresh();

window.addEventListener("focus", () => requestRefresh());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) requestRefresh();
});
