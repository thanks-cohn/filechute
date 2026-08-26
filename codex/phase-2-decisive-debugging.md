# Codex Phase 2: Make the Debugger Prove Itself, Then Isolate the Failure

## Context

Work only on `diagnostics/codex-black-box-rebuild`.

PR #27 was merged into this branch and substantially improved black-box instrumentation. The product still does not successfully complete FileChute -> ChatGPT / Google / Yandex / FrameChute drag handoff on the Windows test machine.

Do not treat more logging by itself as success. The debugging system must now prove that it is alive, complete, and capable of identifying the first divergent transition.

PR #26 may be consulted for ideas only. Do not restore its older transport architecture.

All output and diagnostic artifacts must remain text-only. Do not create binary output, screenshots, images, archives, PDFs, CRXs, executables, base64 diagnostic dumps, compiled artifacts, or binary fixtures.

## Critical fact 1: RCV-002 is still live

The current branch still loads both `page-drop-bridge.js` and `page-drop-text-envelope.js` on supported websites.

`page-drop-bridge.js` already parses the current compact `FILECHUTE1|...` text ticket directly.

`page-drop-text-envelope.js` also parses the same ticket, calls `preventDefault()` + `stopImmediatePropagation()`, creates a fresh `DataTransfer`, writes the private FileChute MIME payload, and dispatches a second synthetic `drop` event.

This is not merely historical documentation. The duplicate receiver is still executable in the current diagnostics build.

The previous Windows reproduction produced this pattern:

1. physical drag can reach a destination;
2. destination reports `FileChute ticket caught`;
3. actual file is not handed off correctly;
4. after several attempts Chromium begins showing a rejected/red-cross drag cursor;
5. later attempts may stop producing a usable pickup/dragstart at all.

RCV-002 therefore remains a leading causal hypothesis for post-drop poisoning.

## Critical fact 2: the black box does not yet prove log delivery

`black-box.js` sends `filechute-blackbox-log-v1` to the extension service worker and currently swallows send failures. A visible `Export bug log` button proves the UI module loaded, but does not prove:

- service-worker recorder is alive;
- messages are being accepted;
- events are being persisted;
- destination content scripts are logging;
- the exported log contains all expected contexts.

The debugging system must become self-verifying before we depend on its absence-of-events as evidence.

## Primary objective

After this phase, one Windows reproduction must let us answer, with evidence:

> Which exact observable transition was the last healthy transition, and which expected transition was first missing or failed?

If we cannot answer that from the exported text log, this phase is incomplete.

---

# Part A - Add a diagnostic health protocol

Implement a text-only health protocol for the recorder.

At minimum distinguish these recorder contexts:

- FileChute side panel sender recorder;
- FileChute service-worker recorder;
- ChatGPT receiver recorder;
- Google receiver recorder;
- Yandex receiver recorder;
- FrameChute receiver when available through its existing diagnostics branch / external messaging boundary.

Add explicit checkpoints such as:

- `blackbox-context-loaded`
- `blackbox-storage-ping-sent`
- `blackbox-storage-ping-ack`
- `blackbox-storage-ping-failed`
- `receiver-context-loaded`
- `worker-context-loaded`

A health check must perform a real round trip through the same path used for normal logging. Do not simply set a boolean in the caller.

The side panel should visibly show a compact text status, for example:

`Recorder: sender OK | worker OK | ChatGPT OK | Google unknown | Yandex unknown`

Do not infer `OK` merely because a content script is declared in the manifest. It must have actually announced itself during this browser session.

Add a `Check recorder` control beside `Export bug log` and `Clear`.

## Log delivery failures must not disappear silently

Do not swallow every `chrome.runtime.sendMessage()` failure without evidence.

When delivery fails:

1. write a concise console diagnostic;
2. retain a small context-local text fallback record if practical;
3. mark recorder health as degraded;
4. expose the failure in the side-panel health view and export summary.

Do not create a second full competing recorder. Keep one canonical black-box format.

---

# Part B - Make attempt watchdogs immutable

The current dragstart watchdog uses shared mutable variables such as `activeAttemptId` and `dragstartObserved` inside a later timeout.

Fix this so each timeout captures the specific attempt ID / number it belongs to. A later attempt must not cause an earlier watchdog to falsely pass, falsely fail, or be attributed to the wrong attempt.

Each sender attempt must have a stable lifecycle record:

- attempt ID;
- attempt number;
- pointerdown time;
- dragstart observed yes/no;
- dragend observed yes/no;
- final dropEffect when available;
- associated transfer token when one is created;
- previous attempt outcome.

---

# Part C - Add an automatic text-only analyzer

Raw events are necessary but no longer sufficient.

The exported JSON must include a deterministic analysis section generated locally from the raw records. Keep the raw records unchanged as ground truth.

At minimum produce:

- recorder health by context;
- attempts grouped by sender attempt ID;
- events grouped by transfer token;
- ordered checkpoint list per token;
- physical vs synthetic event counts;
- distinct failure signatures;
- missing expected transitions;
- previous-successful-attempt comparison;
- first divergent attempt;
- last confirmed-good checkpoint;
- first failed or missing checkpoint;
- owning component of that boundary when knowable;
- `unknown / Chromium-owned boundary` when it cannot be observed from JS.

Add a visible `Analyze last attempts` button that shows a concise text summary in the FileChute side panel. Example:

`Attempt 7: sender dragstart OK -> ticket written OK -> Google dragover OK -> physical drop MISSING -> dragend dropEffect=none. Attempt 8: pointerdown OK -> dragstart MISSING.`

Do not claim destination success merely because `dispatchEvent()` returned or `input/change` were dispatched.

---

# Part D - Eliminate duplicate physical-drop ownership as a controlled experiment

Do not keep two active receivers for the same compact ticket.

`page-drop-bridge.js` is the canonical website receiver because it already parses:

- private FileChute MIME;
- `FILECHUTE1|...` compact ticket;
- legacy text envelope where required.

For the Windows diagnostics experiment:

1. remove `page-drop-text-envelope.js` from active manifest content-script injection;
2. remove it from service-worker dynamic injection;
3. either delete it on this diagnostic branch or leave it present but provably inert and not loaded;
4. record one startup checkpoint identifying exactly which receiver implementation owns FileChute tickets.

There must be exactly one FileChute handler that claims a physical FileChute `drop` on a website.

Record handler identity on every claim.

Do not allow one physical drop to be consumed and then re-dispatched merely to convert the transport into private MIME for another FileChute handler.

---

# Part E - Gate synthetic DragEvent fallbacks on Windows

The current canonical receiver can still synthesize `dragenter`, `dragover`, `drop`, and synthetic `dragleave` events after reconstructing the File.

This is another leading poisoning boundary and must become an explicit experiment rather than an automatic fallback.

Add a diagnostics-only strategy setting with at least:

- `direct-input-only` (default on Windows)
- `legacy-synthetic-fallback` (off by default on Windows)

Under `direct-input-only`:

- reconstruct the real File;
- locate compatible `<input type=file>` targets;
- attempt direct `input.files` assignment using a fresh DataTransfer only for the assignment operation;
- dispatch required `input`/`change` events;
- DO NOT synthesize `dragenter`, `dragover`, `drop`, or `dragleave` when assignment fails;
- instead log a terminal `receiver-no-compatible-direct-target` failure.

Under `legacy-synthetic-fallback`, retain the old behavior only for A/B comparison and instrument every synthetic construction / dispatch.

The exported analysis must state which receiver strategy each attempt used.

This is a diagnostics experiment, not a declaration that direct-input-only is the final architecture.

---

# Part F - Record the poisoning boundary explicitly

We care especially about the transition from a few apparently viable drags into the Windows red-cross / no-pickup state.

Add explicit signatures for at least:

- physical destination `dragover` observed but physical `drop` missing;
- physical `drop` observed but no byte request reaches the worker;
- byte response succeeds but no input assignment succeeds;
- synthetic DragEvent construction attempted;
- synthetic DragEvent dispatch attempted;
- next sender pointerdown occurs after previous missing dragend;
- pointerdown occurs but dragstart never arrives;
- dragend returns `dropEffect=none`;
- recorder context disappeared / reloaded / became unreachable.

The analyzer should detect the earliest attempt where the ordered transition path differs from the most recent successful or more-complete attempt.

---

# Part G - Preserve architecture invariants

Do not regress these facts:

- Windows cross-renderer transport remains the compact `FILECHUTE1|...` ticket.
- Do not make `DataTransfer.items.add(File)` the primary Windows outbound mechanism.
- Do not restore filename/path text as user-visible drop content.
- Do not restore large JSON as the Windows text carrier.
- Keep File System Access root behavior unchanged.
- Keep the exact cached File / transfer-token backend behavior unless instrumentation proves it is faulty.
- Do not merge into `main`.
- Do not create releases or packages.
- Produce no binary output.

---

# Validation

Before finishing:

1. run JS syntax checks for every modified JS file;
2. validate manifest JSON;
3. run `git diff --check`;
4. verify manifest/static injection and dynamic injection agree about the single canonical receiver;
5. verify recorder health check performs a real persistence round trip;
6. verify exported JSON contains both `raw` evidence and deterministic `analysis` / health data;
7. verify no binary artifacts are added;
8. update `BUG_HUNT.md` with what is now observable and which experiment is active;
9. update `codex/transfer-state-machine.md` to show canonical single-receiver ownership and strategy gating.

Do not report the drag bug fixed based on static checks. The required next step after this change is a real Windows reproduction with repeated drags and an exported text log.

## Desired completion summary

State clearly:

- whether the recorder can prove sender + worker + receiver health;
- whether duplicate receiver ownership has been removed;
- which Windows receiver strategy is active by default;
- which synthetic events are suppressed in that strategy;
- exactly how the analyzer identifies first divergence;
- what the Windows tester should do next to produce decisive evidence.
