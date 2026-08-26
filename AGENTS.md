# Codex operating instructions: FileChute black-box bug hunt

## Mission
This branch exists to make browser/extension failures observable before attempting further fixes. Treat FileChute like a flight recorder. The goal is that for every user-visible failure we can answer: **which attempt, which context, which event fired, what Chromium exposed, what FileChute did next, and exactly where the expected state transition stopped.**

Do not merge this diagnostics branch to a release branch unless explicitly requested.

## Ground truth
The user is reproducing on Windows Chromium. Current failure family:

- FileChute can start a drag from the browser side panel.
- Script-created native `File` drag items are unreliable on Windows Chromium.
- A standard `text/plain` FileChute ticket can cross the side-panel -> page renderer boundary.
- A destination has visibly reported `FileChute ticket caught: <filename>`.
- After several attempts Chromium can show the red prohibited-drop cursor; subsequent drags may stop starting until extension/page state is reset.
- Earlier builds degraded into filename/path text; later builds used a large `filechute-transfer-v1:` JSON envelope; current sender uses compact `FILECHUTE1|...` tickets.
- FileChute and FrameChute use `transferToken` as the correlation ID for a transfer. Preserve it in diagnostics.
- Folder drags are private-protocol gallery transfers, not native Windows folder drags.

## Non-negotiable debugging rule
**Never patch an unexplained transition first. Instrument it first.**

If a trace says `dragstart` happened but there is no evidence for what followed, add the missing checkpoint before changing transport logic. If multiple handlers can process one physical event, log handler identity and event identity and eliminate duplicate processing only after the trace proves it.

## Black-box event requirements
Every event record should contain as many of these as are available without reading file contents:

- timestamp and monotonic sequence
- session ID
- transfer/attempt token if known
- context (`filechute-sidepanel`, `chatgpt`, `google`, `yandex`, service worker, etc.)
- event/checkpoint name
- target descriptor (tag/id/classes; never page text bodies)
- `DataTransfer.types`, item kinds/types, file count, `effectAllowed`, `dropEffect`
- document visibility/focus state
- extension ID + manifest version
- browser user agent/platform
- filename/path metadata already present in the FileChute payload (never file bytes)
- result (`ok`, `ignored`, `claimed`, `failed`, `timeout`)
- exception name/message/stack when available
- handler/source module when known

Cap retained history instead of growing without bound. Diagnostics must remain local-only unless the user explicitly exports them.

## Required checkpoints for outbound drag
At minimum preserve checkpoints for:

1. pointer/mouse down on draggable surface
2. `dragstart` entered
3. FileChute payload built
4. exact File cached / cache failure
5. transfer registered with service worker
6. `DataTransfer` after FileChute writes it
7. window blur / visibility changes while drag leaves panel
8. destination `dragenter`
9. destination `dragover`
10. destination ticket/custom MIME detection
11. physical destination `drop`
12. FileChute receiver claim
13. transfer lookup / consume
14. cached-file read vs filesystem fallback
15. file-input assignment attempt/result
16. any synthetic drag/drop dispatch attempt/result
17. `dragend` and its `dropEffect`
18. next pointerdown/dragstart, so wedged-state onset is visible

## Reproduction matrix
Keep test cases separate and label them in traces:

- image -> ChatGPT composer
- image -> Google image/upload target
- image -> Yandex image/upload target
- image -> FrameChute workspace
- directory -> FrameChute workspace gallery
- 10-15 repeated image drags to detect the post-N-attempt Windows wedge

Use small original PNG/JPG files first. Do not infer native Desktop/File Explorer support from browser-page success.

## Codex iteration loop
For each investigation pass:

1. Read the newest exported black-box trace.
2. Group events by `transferToken` and order by sequence/timestamp.
3. Identify the last confirmed-good checkpoint and first missing/failed checkpoint.
4. State one or more ranked hypotheses tied to concrete trace evidence.
5. If evidence is insufficient, add the smallest instrumentation needed and stop there.
6. If evidence is sufficient, make the smallest fix possible.
7. Preserve or improve diagnostics around the fixed area.
8. Record the observed failure signature and fix in `BUG_HUNT.md`.
9. Never claim a Windows drag issue fixed until repeated user testing confirms it.

## Avoid
- forced side-panel `location.reload()` during normal operation
- removing/re-adding live drag File items on Windows
- assuming `DataTransfer.items.add(File)` succeeded because it returned
- treating the presence of a `Files` flavor as proof that `FileList` contains usable files
- using filename/path as ordinary fallback text for a real FileChute file
- multiple independent handlers consuming the same physical FileChute drop without explicit deduplication
- synthetic drag/drop recursion without logging and a compelling reason
- deleting diagnostics because a single test passes

## Expected Codex output
Codex should continuously improve two things together: the product fix and the observability around it. A useful response names the exact failing transition, cites the relevant trace records, proposes or implements a narrowly scoped change, and says what the next user test should prove.