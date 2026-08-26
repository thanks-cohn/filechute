# FileChute black-box transfer state machine

This is the diagnostic map for the current compact-ticket architecture. It is not a proposal for a different drag transport.

## Sender

1. `pointerdown` creates a session-local attempt ID and records the previous attempt outcome.
2. A physical `dragstart` enters `sidepanel.js:startDrag`.
3. `interop.js` records payload construction and starts caching the exact `File` without reading its contents.
4. On Windows, native `DataTransfer.items.add(File)` is explicitly recorded as skipped by policy. On other platforms its attempted and observed result are separate facts.
5. FileChute writes the private payload and compact `FILECHUTE1|...` ticket, then snapshots what Chromium exposes through `DataTransfer`.
6. Transfer registration is sent to the service worker and its asynchronous response is recorded.
7. Blur, focus, visibility, pointer release, physical `dragend`, and final `dropEffect` close the observable sender path. A watchdog identifies `pointerdown` without `dragstart`.

## Service worker

1. Registration receipt, validation, and session-storage completion are distinct checkpoints.
2. A byte request records transfer lookup before consuming the one-shot registration.
3. Exact cached-file lookup records its wait duration and hit/miss result.
4. A miss records filesystem fallback start and result, including permission/path exceptions.
5. A successful response records metadata and byte length, never file contents.

## Website receiver

1. The browser's physical `dragenter`, throttled `dragover`, and `drop` are captured with target and `DataTransfer` snapshots.
2. Receiver dragover policy records whether FileChute called `preventDefault()` and set `dropEffect`.
3. Ticket detection, usable native-file detection, physical-drop claim, and propagation policy are distinct checkpoints.
4. Each byte request retry and response is recorded.
5. Reconstructed file metadata, input candidates, assignment attempt, resulting `input.files.length`, and dispatched input/change events are recorded.
6. Every synthetic drag/drop dispatch is explicitly marked `eventOrigin: synthetic`; capture-level records also derive origin from `Event.isTrusted`.
7. Receiver completion or exception closes the receiver path.

## Remaining external boundaries

The trace cannot observe Chromium internals between sender blur and destination `dragenter`, between accepted destination `dragover` and a missing physical `drop`, or between pointer movement and a missing browser-generated `dragstart`. These gaps are intentionally reported as Chromium-owned boundaries rather than inferred successes. Destination applications may also ignore correctly dispatched `input`/`change` or synthetic drag events after FileChute's last observable checkpoint; the trace records the dispatch result but does not call that destination UI state successful.
