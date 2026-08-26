import { CHUTTY_ANIMATIONS, DEFAULT_CYCLE_ORDER } from "./animations/catalog.js";
import { CHUTTY_KEYS, DEFAULT_CHUTTY_SETTINGS } from "./chutty-config.js";

const form = document.querySelector("#settings-form");
const settingsButton = document.querySelector("#open-settings");
const cancelButton = document.querySelector("#settings-cancel");
const cancelX = document.querySelector("#settings-cancel-x");

const visibleInput = document.querySelector("#chutty-visible");
const clickCycleInput = document.querySelector("#chutty-click-cycle");
const supportVisibleInput = document.querySelector("#chutty-support-visible");
const hoverMenuInput = document.querySelector("#chutty-hover-menu");
const positionInput = document.querySelector("#chutty-position");
const animationList = document.querySelector("#chutty-animation-list");

const cycleAnimations = CHUTTY_ANIMATIONS.filter((animation) => animation.cycle);
const cycleIds = cycleAnimations.map((animation) => animation.id);
const cycleById = new Map(cycleAnimations.map((animation) => [animation.id, animation]));

let draftOrder = [...DEFAULT_CYCLE_ORDER];
let draftEnabled = new Set(cycleIds);
let resubmitting = false;

function normalizeOrder(value) {
  const requested = Array.isArray(value) ? value.map(String) : [];
  const valid = requested.filter((id, index) => cycleById.has(id) && requested.indexOf(id) === index);
  for (const id of cycleIds) {
    if (!valid.includes(id)) valid.push(id);
  }
  return valid;
}

function normalizeEnabled(value) {
  if (!Array.isArray(value)) return new Set(cycleIds);
  return new Set(value.map(String).filter((id) => cycleById.has(id)));
}

function syncDependentControls() {
  const enabled = visibleInput?.checked !== false;
  for (const control of [clickCycleInput, supportVisibleInput, hoverMenuInput, positionInput]) {
    if (control) control.disabled = !enabled;
  }
  animationList?.querySelectorAll("button,input").forEach((control) => {
    control.disabled = !enabled || clickCycleInput?.checked === false;
  });
}

function moveAnimation(id, delta) {
  const index = draftOrder.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= draftOrder.length) return;
  [draftOrder[index], draftOrder[target]] = [draftOrder[target], draftOrder[index]];
  renderAnimationList();
}

function renderAnimationList() {
  if (!animationList) return;
  animationList.replaceChildren();

  for (const [index, id] of draftOrder.entries()) {
    const animation = cycleById.get(id);
    if (!animation) continue;

    const row = document.createElement("div");
    row.className = "chutty-animation-row";

    const label = document.createElement("label");
    label.className = "chutty-animation-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draftEnabled.has(id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) draftEnabled.add(id);
      else draftEnabled.delete(id);
    });

    const text = document.createElement("span");
    text.textContent = animation.name || id;
    label.append(checkbox, text);

    const controls = document.createElement("span");
    controls.className = "chutty-animation-order";

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = `Move ${animation.name || id} earlier`;
    up.setAttribute("aria-label", up.title);
    up.disabled = index === 0;
    up.addEventListener("click", () => moveAnimation(id, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = `Move ${animation.name || id} later`;
    down.setAttribute("aria-label", down.title);
    down.disabled = index === draftOrder.length - 1;
    down.addEventListener("click", () => moveAnimation(id, 1));

    controls.append(up, down);
    row.append(label, controls);
    animationList.append(row);
  }

  syncDependentControls();
}

async function loadDraft() {
  const defaults = {
    [CHUTTY_KEYS.visible]: DEFAULT_CHUTTY_SETTINGS.visible,
    [CHUTTY_KEYS.clickCycle]: DEFAULT_CHUTTY_SETTINGS.clickCycle,
    [CHUTTY_KEYS.supportVisible]: DEFAULT_CHUTTY_SETTINGS.supportVisible,
    [CHUTTY_KEYS.hoverMenu]: DEFAULT_CHUTTY_SETTINGS.hoverMenu,
    [CHUTTY_KEYS.position]: DEFAULT_CHUTTY_SETTINGS.position,
    [CHUTTY_KEYS.animationOrder]: [...DEFAULT_CYCLE_ORDER],
    [CHUTTY_KEYS.animationEnabled]: [...cycleIds]
  };

  const values = await chrome.storage.local.get(defaults).catch(() => defaults);

  if (visibleInput) visibleInput.checked = values[CHUTTY_KEYS.visible] !== false;
  if (clickCycleInput) clickCycleInput.checked = values[CHUTTY_KEYS.clickCycle] !== false;
  if (supportVisibleInput) supportVisibleInput.checked = values[CHUTTY_KEYS.supportVisible] !== false;
  if (hoverMenuInput) hoverMenuInput.checked = values[CHUTTY_KEYS.hoverMenu] !== false;
  if (positionInput) positionInput.value = values[CHUTTY_KEYS.position] === "left" ? "left" : "right";

  draftOrder = normalizeOrder(values[CHUTTY_KEYS.animationOrder]);
  draftEnabled = normalizeEnabled(values[CHUTTY_KEYS.animationEnabled]);
  renderAnimationList();
  syncDependentControls();
}

async function persistDraft() {
  await chrome.storage.local.set({
    [CHUTTY_KEYS.visible]: visibleInput?.checked !== false,
    [CHUTTY_KEYS.clickCycle]: clickCycleInput?.checked !== false,
    [CHUTTY_KEYS.supportVisible]: supportVisibleInput?.checked !== false,
    [CHUTTY_KEYS.hoverMenu]: hoverMenuInput?.checked !== false,
    [CHUTTY_KEYS.position]: positionInput?.value === "left" ? "left" : "right",
    [CHUTTY_KEYS.animationOrder]: normalizeOrder(draftOrder),
    [CHUTTY_KEYS.animationEnabled]: normalizeOrder(draftOrder).filter((id) => draftEnabled.has(id))
  });
}

visibleInput?.addEventListener("change", syncDependentControls);
clickCycleInput?.addEventListener("change", syncDependentControls);

settingsButton?.addEventListener("click", () => void loadDraft());
cancelButton?.addEventListener("click", () => void loadDraft(), true);
cancelX?.addEventListener("click", () => void loadDraft(), true);

form?.addEventListener("submit", (event) => {
  if (resubmitting) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
  void persistDraft()
    .then(() => {
      resubmitting = true;
      try {
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitter instanceof HTMLButtonElement ? submitter : undefined);
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } finally {
        resubmitting = false;
      }
    })
    .catch((error) => {
      console.error("Could not apply Chutty settings", error);
      resubmitting = false;
    });
}, true);

void loadDraft();
