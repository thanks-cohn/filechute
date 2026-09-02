const DIAGNOSTIC_MESSAGE = "filechute-diagnostic-v1";
const MAX_TEXT_LENGTH = 1000;

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\r\n\t]+/g, " ").slice(0, MAX_TEXT_LENGTH);
}

function errorText(error) {
  if (!error) return "";
  return `${text(error.name || "Error")}:${text(error.message || error)}`;
}

// Diagnostics deliberately cross extension boundaries as one JSON string. No
// File, Blob, ArrayBuffer, data URL, or arbitrary page object can enter the log.
export function dragDiagnostic(boundary, {
  token = "",
  state = "observed",
  detail = "",
  error = null
} = {}) {
  const record = {
    at: new Date().toISOString(),
    token: text(token) || "unavailable",
    boundary: text(boundary) || "unknown",
    state: text(state),
    detail: text(detail),
    error: errorText(error)
  };
  record.signature = [record.boundary, record.state, record.error].filter(Boolean).join("|");
  const line = JSON.stringify(record);
  console.info(`[FileChute drag] ${line}`);
  try {
    const sent = globalThis.chrome?.runtime?.sendMessage?.({ type: DIAGNOSTIC_MESSAGE, line });
    sent?.catch?.(() => {});
  } catch {}
  return line;
}

export const DRAG_DIAGNOSTIC_MESSAGE = DIAGNOSTIC_MESSAGE;
