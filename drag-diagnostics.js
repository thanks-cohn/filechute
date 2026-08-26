const entries = document.querySelector("#entries");
const status = document.querySelector("#status");

function rowLabel(target) {
  const row = target instanceof Element ? target.closest(".entry") : null;
  if (!row) return "item";
  return String(
    row.querySelector(".entry-name-text")?.textContent ||
    row.querySelector(".entry-name")?.textContent ||
    "item"
  ).trim() || "item";
}

function setStatus(message) {
  if (!status) return;
  status.textContent = message;
  status.classList.remove("error");
}

entries?.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(".entry")) return;
  setStatus(`Drag debug · pointerdown · ${rowLabel(event.target)}`);
}, { capture: true });

entries?.addEventListener("dragstart", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(".entry")) return;
  const label = rowLabel(event.target);
  setStatus(`Drag debug · dragstart fired · ${label}`);

  queueMicrotask(() => {
    let types = [];
    try { types = [...(event.dataTransfer?.types || [])]; } catch {}
    setStatus(`Drag debug · dragstart OK · ${label} · types: ${types.length ? types.join(", ") : "NONE"}`);
  });
}, { capture: true });

entries?.addEventListener("dragend", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(".entry")) return;
  let effect = "none";
  try { effect = event.dataTransfer?.dropEffect || "none"; } catch {}
  setStatus(`Drag debug · dragend · ${rowLabel(event.target)} · dropEffect: ${effect}`);
}, { capture: true });
