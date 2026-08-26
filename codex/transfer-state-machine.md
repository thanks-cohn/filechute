# FileChute black-box transfer state machine

This is the diagnostic map for the current compact-ticket architecture. It is not a proposal for a different drag transport.

## Recorder health

1. Every sender or website context records `blackbox-context-loaded`; website contexts additionally record `receiver-context-loaded`.
2. The context persists `blackbox-storage-ping-sent` through the normal service-worker logging path and requires a stored sequence acknowledgement.
3. It then persists `blackbox-storage-ping-ack`. A missing acknowledgement records a bounded local text fallback, marks health degraded, and emits a console warning.
4. The worker independently records `worker-context-loaded`. Exported health is based on observed records, never manifest declarations.

## Sender

1. `pointerdown` creates an immutable session-local attempt ID/number and records the previous outcome. Its watchdog closes over that exact ID and cannot be satisfied or blamed by a later attempt.
2. A physical `dragstart` enters `sidepanel.js:startDrag`.
3. `interop.js` records payload construction and exact-file cache outcome without logging file contents.
4. On Windows, native `DataTransfer.items.add(File)` remains skipped by policy.
5. FileChute writes private metadata and the compact `FILECHUTE1|...` text ticket, then snapshots Chromium's `DataTransfer` view.
6. Registration request/result, focus/visibility, pointer release, physical `dragend`, and final `dropEffect` complete the observable sender path.

## Service worker

Registration, lookup, exact cached-file access, filesystem fallback, and byte response remain distinct checkpoints correlated by `transferToken`. File contents are never logged.

## Website receiver: one owner

`page-drop-bridge.js` is the only injected owner of physical FileChute website drops. It directly parses private MIME, compact `FILECHUTE1|...`, and the legacy envelope. `page-drop-text-envelope.js` is not statically injected, dynamically injected, or web-accessible, so no handler consumes a physical ticket merely to redispatch a synthetic ticket.

Every startup and claim records the canonical handler identity and receiver strategy. Physical and synthetic events remain explicitly distinguished.

## Strategy gate

On Windows, `direct-input-only` is the diagnostics default:

1. Claim the physical compact-ticket drop.
2. Request bytes by `transferToken` and reconstruct the real `File`.
3. Find compatible file inputs and use a fresh `DataTransfer` only to assign `input.files`.
4. Dispatch `input` and `change`, and verify the resulting file count.
5. If no direct assignment succeeds, record terminal `receiver-no-compatible-direct-target`.
6. Do not synthesize `dragenter`, `dragover`, `drop`, or cleanup `dragleave`.

`legacy-synthetic-fallback` is retained only as an explicit diagnostics A/B setting. It logs synthetic event construction and dispatch separately before using the historical fallback.

## Deterministic first divergence

Export preserves the raw bounded event store and adds analysis. Analysis orders by persistent sequence, groups by attempt ID and transfer token, joins cross-context records using `transferToken`, counts physical/synthetic events, derives known poisoning signatures, and compares each attempt with the most complete preceding attempt. It reports the first differing/missing checkpoint, the preceding confirmed checkpoint, and the owning handler. Gaps between accepted physical `dragover` and a missing physical `drop`, or between pointerdown and a missing browser-generated `dragstart`, are reported as `unknown / Chromium-owned boundary`.

A dispatched DOM event is not destination success. Only observed assignment state is reported as FileChute success, and real Windows repeated-drag evidence is required before claiming the underlying bug fixed.
