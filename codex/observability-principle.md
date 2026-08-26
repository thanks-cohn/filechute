# Codex Request: Make Every Failure Observable

## Core principle

We should always be able to answer:

1. **When did the system stop behaving correctly?**
2. **Where, exactly, did the healthy path diverge into the broken path?**
3. **What was the last confirmed-good state?**
4. **What was the first confirmed-bad state?**
5. **What changed between those two states?**
6. **Which component owned that transition: FileChute UI, FileChute service worker, Chromium drag transport, destination page, or FrameChute?**

The goal is not merely to collect errors. The goal is to make the runtime behavior reconstructable after the fact.

A useful bug report should read like a flight recorder, not a diary entry. Instead of:

> Dragging broke after a few tries.

we should be able to say:

> Attempts 1-4 reached `dragstart`, carried `text/plain`, reached destination `dragover`, were claimed, reached `drop`, requested bytes, assigned one file, and ended with `dropEffect=copy`. Attempt 5 reached destination `dragover` but no physical `drop` arrived; `dragend` returned `dropEffect=none`. Attempt 6 received `pointerdown` but no `dragstart`. The first observable divergence therefore occurred between destination `dragover` and native `drop` on attempt 5, followed by a poisoned sender state on attempt 6.

That level of specificity is the standard.

## Scope

Work primarily on the diagnostics branches:

- FileChute: `diagnostics/codex-black-box`
- FrameChute: `diagnostics/codex-black-box`

Treat the FileChute transfer token as the primary correlation key across both extensions.

Do not merge these diagnostics into release branches unless explicitly requested.

## Primary assignment

Expand the current black-box instrumentation so that any drag/drop failure can be localized to the smallest practical transition.

Do not begin by proposing another drag transport rewrite. First make the current path observable enough that the evidence tells us what to change.

When a transition is ambiguous, add instrumentation for that transition before changing behavior.

## Required observability model

Think of every transfer as a state machine with explicit checkpoints.

### Sender / FileChute UI

Capture, when applicable:

- attempt ID
- transfer token
- wall-clock timestamp
- monotonic elapsed time from attempt start
- item name
- item kind: file or directory
- relative path
- source surface: grip, filename, preview, row, other
- `pointerdown`
- mouse/pointer button
- `dragstart`
- whether `dataTransfer` existed
- `dataTransfer.types`
- `dataTransfer.items.length`
- `dataTransfer.files.length`
- item kinds/types where readable
- `effectAllowed`
- ticket format used
- whether private MIME was written
- whether `text/plain` ticket was written
- whether native File insertion was attempted
- whether native File insertion appeared to succeed
- whether exact File bytes were cached
- transfer registration message sent
- transfer registration response/failure
- drag image setup result
- `drag`
- `dragend`
- final `dropEffect`
- focus loss
- focus regain
- `visibilitychange`
- pointer/mouse release
- watchdog cleanup
- next attempted `pointerdown`
- next attempted `dragstart`

The diagnostic system should make it obvious when Windows reaches `pointerdown` but never produces `dragstart`.

### FileChute service worker

Capture:

- transfer registration received
- token and item metadata registered
- registration storage success/failure
- cached File lookup start/result
- filesystem-handle fallback start/result
- internal vs external caller where safely available
- request type
- byte-read request received
- directory/gallery request received
- response success/failure
- response byte size
- time spent waiting for cache
- time spent reopening filesystem path
- permission state where relevant
- token consumed/retained/expired
- exceptions with name/message/stack where available

Do not log actual file contents.

### Website receiver: ChatGPT / Google / Yandex

Capture:

- hostname and pathname
- receiver generation/version
- script initialization
- `dragenter`
- `dragover`
- `dragleave`
- physical `drop`
- `dataTransfer.types`
- `effectAllowed`
- `dropEffect`
- whether compact ticket was detectable
- whether legacy ticket was detectable
- whether private MIME was detectable
- parsed transfer token
- receiver claim decision
- whether `preventDefault()` was called
- whether propagation was stopped
- native `FileList` count
- native `DataTransferItemList` summary
- candidate file inputs discovered
- which candidate was selected
- input `accept` value
- reconstructed File name/type/size
- assignment attempt/result
- resulting `input.files.length`
- `input` event dispatched
- `change` event dispatched
- fallback path selected
- any synthetic drag/drop event creation
- receiver completion
- receiver error

Very important: distinguish a **physical browser event** from an event created by our code. Add an explicit field such as:

```json
{"eventOrigin":"physical"}
```

or:

```json
{"eventOrigin":"synthetic"}
```

Do not let synthetic and physical events become indistinguishable in the trace.

### FrameChute receiver

Capture:

- workspace receiver initialization
- `dragenter`
- `dragover`
- `dragleave`
- physical `drop`
- transfer types
- ticket decode result
- transfer token
- directory vs file
- claim decision
- external FileChute message start/result
- byte reconstruction
- gallery event creation
- local block creation start/result
- any synthetic redispatch
- final block type created
- final status message
- exception details

Again, physical and synthetic events must be clearly differentiated.

## Cross-attempt diagnosis

Single-attempt logging is insufficient because the key Windows failure is stateful.

The recorder must make repeated attempts comparable.

For each attempt, derive or make derivable:

- attempt number within the session
- previous attempt outcome
- time since previous attempt
- whether previous attempt received `dragend`
- previous `dropEffect`
- whether browser/window focus returned
- whether the current attempt reached `pointerdown`
- whether the current attempt reached `dragstart`

A useful analyzer should be able to identify patterns such as:

- first N attempts healthy, N+1 fails
- failures only after receiver synthetic events
- failures only after `dropEffect=none`
- failures only after missing `dragend`
- receiver sees `dragover` but no `drop`
- sender gets `pointerdown` but no `dragstart`
- token registered but never consumed
- token consumed but destination never receives a file
- FrameChute requests bytes successfully but no block appears

## Failure signatures

Maintain a text ledger of distinct observed failure signatures. Do not collapse different failures into one generic "drag broken" entry.

At minimum preserve these known signatures:

1. Folder permission/reconnect loop after side-panel reload on Windows.
2. Directory watcher reload destroys live filesystem permission context.
3. Synthetic native `File` insertion appears successful but destination receives no useful file.
4. Filename/path text reaches destination instead of the actual file.
5. Private custom MIME does not reliably cross extension-to-page renderer boundaries.
6. Standard `text/plain` FileChute ticket crosses successfully.
7. Receiver shows `FileChute ticket caught` but file does not complete.
8. Red crossed-circle/no-drop cursor after several attempts.
9. Subsequent FileChute drag cannot start after prior failed/claimed drops.
10. FileChute directory can be selected/opened but cannot complete FrameChute gallery transfer.
11. Physical drag reaches receiver but no service-worker byte request follows.
12. Service-worker byte request succeeds but destination UI does not accept reconstructed File.

Whenever a new signature appears, add it instead of overwriting an old one.

## Black-box log requirements

The log must remain:

- local-only
- bounded/capped
- append-oriented
- resilient to extension service-worker restarts
- exportable as plain UTF-8 JSON
- human-readable enough for inspection
- structured enough for automated comparison
- safe to hand directly to Codex

Prefer newline-friendly records or a simple JSON document with an `events` array.

Every event should have, where relevant:

```json
{
  "sequence": 123,
  "timestamp": "...",
  "sessionId": "...",
  "attemptId": "...",
  "transferToken": "...",
  "component": "filechute-sidepanel",
  "checkpoint": "dragstart",
  "eventOrigin": "physical",
  "details": {}
}
```

Do not put binary file contents, screenshots, image blobs, base64 file payloads, or other large binary-derived material into the diagnostic log.

Metadata such as file name, MIME type, byte length, and hashes are acceptable when useful, but do not serialize the actual file bytes.

## Make the recorder difficult to lie to

Instrumentation must not silently create a false narrative.

Examples:

- Do not log `drop` merely because our code dispatched a synthetic `DragEvent("drop")`; identify it as synthetic.
- Do not call a transfer successful because a function returned without throwing. Record the observable result too.
- Do not infer a native File exists from a `"Files"` type string alone. Record actual `files.length`, item kinds, and `getAsFile()` results when legal.
- Do not label a file-input assignment successful unless the resulting `input.files` state confirms it.
- Do not label a FrameChute import successful unless the resulting block/gallery is actually created.

## Diagnostic UI

Keep diagnostics lightweight.

Useful controls:

- `Export bug log`
- `Clear bug log`
- current event count
- current attempt number
- last checkpoint
- last failure signature

Do not turn the product UI into a debugger dashboard unless necessary. The exported trace is the primary artifact.

## Optional text analyzer

If useful, add a small text-only diagnostic analyzer that consumes exported JSON and produces a Markdown report containing:

- session summary
- attempts in order
- first failing attempt
- last known-good checkpoint
- first known-bad checkpoint
- suspicious state changes
- unmatched sender/receiver tokens
- missing expected events
- likely component boundary
- new failure signatures
- evidence for and against each hypothesis

The analyzer should avoid pretending certainty where the trace has a gap. Say `unknown between X and Y` when that is the evidence.

## Codex working rule

Before fixing a bug, answer:

> Can the current trace prove where this failure begins?

If **yes**, use that evidence.

If **no**, instrument the missing boundary first.

After every fix, preserve or improve the observability. Do not remove checkpoints just because one bug disappeared.

The instrumentation is part of the engineering system, not disposable scaffolding.

## Important constraint: text-only output

**Do not generate binary output.**

For this task and its diagnostic artifacts:

- no PNG/JPG/WebP output
- no screenshots generated by Codex
- no ZIP archives
- no PDFs
- no compiled executables
- no packaged CRX files
- no binary fixtures
- no base64-encoded file payload dumps
- no generated media

Use plain UTF-8 source/text artifacts only, such as:

- `.md`
- `.txt`
- `.json`
- `.jsonl`
- `.js`
- `.html`
- `.css`

If a binary artifact would normally be useful, describe what should be inspected in text instead.

## Deliverables

1. Review the existing FileChute and FrameChute black-box instrumentation.
2. Produce a written map of the current transfer state machine.
3. Identify every currently unobservable transition.
4. Instrument those transitions.
5. Ensure attempts are correlated across repeated drags and across both extensions.
6. Ensure physical vs synthetic events are explicit.
7. Ensure service-worker requests are correlated to the initiating transfer token.
8. Preserve a growing failure-signature ledger.
9. Provide a text-only exported trace format suitable for direct Codex analysis.
10. Provide a text-only analyzer/report path if it materially improves diagnosis.
11. Do not change release branches or create releases.
12. Do not produce binary output.

## Success criterion

The system succeeds when a tester can say only:

> It broke after a few drags.

and the exported logs are sufficient for Codex to answer, with evidence:

> Attempt 6 was the first failure. FileChute successfully created the drag and registered token X. The destination claimed `dragover` but never received a physical `drop`. FileChute then received `dragend` with `dropEffect=none`. Attempt 7 received `pointerdown` but Chrome emitted no `dragstart`. The failure therefore begins at the Chromium destination-drop boundary on attempt 6 and leaves the sender unable to initiate the next drag. No filesystem or transfer-registration failure occurred.

That is the principle: **whatever happens, we should know when it broke and where it broke.**
