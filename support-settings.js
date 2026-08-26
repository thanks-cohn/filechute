const SUPPORT_URL_KEY = "chute-support-url";

const input = document.querySelector("#chutty-support-url");
const form = document.querySelector("#settings-form");
const settingsButton = document.querySelector("#open-settings");
const cancelButton = document.querySelector("#settings-cancel");
const cancelX = document.querySelector("#settings-cancel-x");
const status = document.querySelector("#status");

function setStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", error);
}

function normalizedSupportUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

async function loadSupportUrl() {
  if (!(input instanceof HTMLInputElement)) return;
  const stored = await chrome.storage.local.get({ [SUPPORT_URL_KEY]: "" }).catch(() => ({}));
  input.value = String(stored?.[SUPPORT_URL_KEY] || "");
  input.setCustomValidity("");
}

if (input instanceof HTMLInputElement) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}

settingsButton?.addEventListener("click", () => void loadSupportUrl());
cancelButton?.addEventListener("click", () => void loadSupportUrl(), true);
cancelX?.addEventListener("click", () => void loadSupportUrl(), true);

form?.addEventListener("submit", (event) => {
  if (!(input instanceof HTMLInputElement)) return;
  const normalized = normalizedSupportUrl(input.value);
  if (normalized === null) {
    event.preventDefault();
    event.stopImmediatePropagation();
    input.setCustomValidity("Use a full http:// or https:// support URL, or leave this blank.");
    input.reportValidity();
    setStatus("The Chutty support URL is not valid.", true);
    return;
  }

  input.setCustomValidity("");
  void chrome.storage.local.set({ [SUPPORT_URL_KEY]: normalized }).catch((error) => {
    console.error("Chute could not save the Chutty support URL", error);
    setStatus("Could not save the Chutty support URL.", true);
  });
}, true);

void loadSupportUrl();
