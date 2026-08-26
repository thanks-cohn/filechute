# FileChute bug-hunt ledger

This file is a durable index for Codex investigations. Add new signatures; do not erase old ones when fixed.

## Windows root-handle / reload family

### W-ROOT-001: selected root/reconnect flashes and permission does not stick
Observed on Windows Chromium when folder selection/reconnect was followed by forced side-panel reload. The live File System Access grant could fall back to `prompt` after document destruction.

Current mitigation on parent fix branch: live handle handoff without reload, in-document live handle cache, stale-handle reset.

### W-ROOT-002: filesystem change causes permission loss
Automatic shelf watcher previously reloaded the side-panel document after directory changes. Mitigated by in-place `filechute:filesystem-changed` refresh.

### W-RESIZE-001: Resize throws NotFoundError
Resize path previously re-read/re-resolved handles after dialog open. Mitigated by using the exact live target handle and in-place navigation.

## Windows outbound drag family

### W-DRAG-001: synthetic File item looks draggable but destination receives no usable file
Chromium can accept `DataTransfer.items.add(File)` without delivering a usable native File cross-renderer. Do not use return value as proof.

### W-DRAG-002: repeated drags eventually show open hand / red prohibited cursor and later drags stop starting
Observed after several extension-to-page attempts. Current high-priority investigation. Need black-box trace that shows the last successful attempt and the first wedged attempt.

Key evidence already observed:
- browser can carry standard text across the side-panel -> page boundary;
- destination has shown `FileChute ticket caught: <filename>`;
- after that / after several drags, Chrome may display the red prohibited cursor;
- subsequent attempts can fail to pick anything up.

Suspects to distinguish with trace, not guesswork:
- duplicate consumers processing one physical drop;
- synthetic secondary `DragEvent` / `drop` dispatch while native Windows drag teardown is still active;
- Chromium Windows drag subsystem regression independent of FileChute;
- missing/late `dragend` cleanup;
- target failing to call `preventDefault()` on a later dragover;
- stale service-worker transfer registration/cache state.

### W-DRAG-003: filename/path appears as dropped text
Older fallback exposed filename/path as `text/plain`; destination consumed it as text. Must not regress.

### W-DRAG-004: large encoded transport text appears in ChatGPT composer
An older sender used `filechute-transfer-v1:<encoded JSON>`. This proved standard text crossed renderer boundaries but receiver did not claim it before the page. Current compact sender uses `FILECHUTE1|...`; receivers should remain backward-compatible while diagnostics branch is active.

### W-DRAG-005: custom MIME token does not reliably survive extension-sidepanel -> page renderer boundary
Private `application/x-filechute-item+json` cannot be the sole cross-renderer carrier on Windows Chromium. Standard compact ticket is the compatibility carrier.

## Folder / FrameChute family

### W-DIR-001: directory cannot be picked up / only tiny grip works
Folder rows historically prioritized click-to-open and had limited draggable hit area. Parent fix branch widens folder drag surfaces. Re-test separately from file transport.

### W-DIR-002: folder reaches FrameChute but does not create gallery
Folder transfer is a FileChute gallery protocol, not a native directory File. Receiver must claim ticket during dragover/drop and open extension-gallery source using transfer token + relative path.

## Receiver family

### RCV-001: destination ticket is caught but actual file is not attached
Distinguish:
1. receiver claim,
2. transfer lookup,
3. cached-file read,
4. byte response,
5. reconstructed File,
6. nearest file-input selection,
7. `input.files` assignment,
8. input/change dispatch.

Never collapse these into one `receive failed` event.

### RCV-002: duplicate receiver paths
At one point `page-drop-bridge.js` and `page-drop-text-envelope.js` could both process the same ticket; compatibility shim also manufactured a synthetic second drop. This is a leading suspect for Windows post-drop wedging. Instrument handler identity and deduplicate physical drops.

## Test policy
For every fix, run at least:
- one PNG -> ChatGPT;
- one PNG -> Google/Yandex target;
- one PNG -> FrameChute;
- one folder -> FrameChute;
- 10-15 repeated browser-page drags.

A one-off success is not closure for W-DRAG-002.