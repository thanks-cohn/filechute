# FileChute Windows Outbound Drag Discovery Report

**Date:** 2026-08-27  
**Project:** FileChute  
**Scope:** Windows Chromium outbound file dragging from an extension side panel into ordinary web pages  
**Status:** Confirmed architectural discovery; Chromium behavior still requires upstream confirmation  
**Release relevance:** High

## Executive summary

FileChute's Windows outbound-drag problem is not one single failure. Investigation showed two separate layers:

1. Chromium on Windows can accept a script-created `File` through `DataTransfer.items.add(File)` in an extension side panel while the destination renderer receives no usable native file. Repeated attempts have also been observed to degrade into an open-hand / prohibited-cursor state in which later drags stop starting.
2. FileChute's compatibility architecture added a token/ticket recovery path, but at one point two receiver implementations could process the same physical drop and one compatibility shim could manufacture a second synthetic drop. That duplication is a credible FileChute-side contributor to the post-drop drag-state wedging.

The central product discovery is therefore that FileChute should not treat the diagnostics architecture as the shipping architecture. We need one canonical receiver, real-file-first behavior where Chromium actually carries the file, and a compact recovery ticket where Windows Chromium does not.

## What originally worked conceptually

The simple outbound model was:

```text
local File
   |
   v
DataTransfer.items.add(File)
   |
   v
website receives normal File drop
```

In the pre-Windows-workaround implementation, `writeFileChuteDrag()` attempted to place the real `File` into the drag first, then added FileChute metadata.

The relevant earlier behavior was effectively:

```js
if (file) {
  transfer.items.add(file);
}
```

This is desirable because arbitrary upload surfaces already understand ordinary browser file drags and FileChute does not need destination-specific code when the browser transports the file correctly.

## Windows failure discovered

On Windows Chromium, the observable behavior does not always match the JavaScript API result.

`DataTransferItemList.add(File)` may appear to succeed while the destination renderer does not receive a usable file. FileChute's bug ledger names this family `W-DRAG-001`.

A second symptom, `W-DRAG-002`, appears after repeated extension-side-panel-to-page attempts:

- the cursor may remain an open hand;
- a prohibited/red cursor may appear over otherwise valid targets;
- subsequent attempts may fail before `dragstart`;
- restarting/reloading the relevant browser state may restore dragging.

This is important because a successful return from `transfer.items.add(file)` is not sufficient proof that Chromium has created a real cross-renderer file drag.

## Architectural turning point

The major FileChute workaround entered at commit:

`4c7944f85c69c2f7bcc1c0dec51da0051bc5285a`  
**Use token-only file drags on Windows**

That change intentionally stopped attempting native `File` insertion on Windows:

```js
const useNativeFileItem = Boolean(file) && !windowsPlatform();
```

From that point onward, Windows outbound dragging became a FileChute transport/recovery protocol rather than a normal file drag.

Subsequent commits evolved that workaround:

- token-only Windows transfer;
- text envelope;
- compact `FILECHUTE1|...` ticket;
- page receiver;
- transfer-token lookup;
- cached/filesystem byte retrieval;
- reconstructed `File`;
- direct file-input assignment and/or synthetic drag fallback;
- extensive black-box diagnostics.

The protocol solved a real cross-renderer transport problem, but it also increased the number of moving parts involved in every Windows drop.

## Current sender behavior on diagnostics branch

The sender currently distinguishes Windows from non-Windows.

Conceptually:

```text
NON-WINDOWS
real File -> DataTransfer File item -> normal destination

WINDOWS
real File retained by FileChute
       |
       +-> compact FILECHUTE1 ticket crosses renderer boundary
       |
       +-> receiving content script detects ticket
       |
       +-> service worker returns original bytes
       |
       +-> receiver reconstructs File
```

The compact ticket is valuable because investigation has shown that small standard `text/plain` drag data crosses the extension side-panel -> page renderer boundary more reliably than private custom MIME data or a script-created File item on Windows.

## Receiver duplication discovered

During the diagnostics investigation, FileChute identified a significant receiver-ownership problem.

Two receiver paths had been capable of processing the same physical FileChute ticket:

- `page-drop-bridge.js`
- `page-drop-text-envelope.js`

The compatibility text-envelope path could also manufacture a second synthetic drop after the physical drop was already being handled.

This means one physical user action could become multiple logical drop-processing paths.

That matters because the observed Windows failure is stateful: repeated attempts eventually appear to wedge Chromium's drag subsystem. Synthetic redispatch while the native Windows drag lifecycle is still tearing down is therefore a credible contributing factor.

PR #28 correctly moves toward **one canonical receiver owner** by removing `page-drop-text-envelope.js` from static, dynamic, and web-accessible injection and leaving `page-drop-bridge.js` as the sole compact-ticket owner.

This single-owner change should be retained.

## Why PR #28 is not itself the product fix

PR #28, `Make Windows drag diagnostics self-verifying`, is primarily a diagnostic experiment.

On Windows it defaults the receiver to:

```text
direct-input-only
```

That strategy:

1. catches the FileChute ticket;
2. retrieves the original bytes;
3. reconstructs a real `File`;
4. searches for a compatible `<input type="file">`;
5. assigns the reconstructed `File` to `input.files`;
6. dispatches `input` and `change`.

If no compatible file input is exposed, the strategy stops. It deliberately suppresses the generic synthetic `dragenter`, `dragover`, `drop`, and `dragleave` fallback.

Therefore PR #28 cannot be interpreted as evidence that arbitrary Windows website dropping is solved. It intentionally narrows behavior to isolate the cause of `W-DRAG-002`.

## What we now believe the shipping architecture should be

The release architecture should be smaller than the diagnostics architecture.

```text
                         FILECHUTE OUTBOUND DRAG
                                  |
                                  v
                         actual File available?
                                  |
                     +------------+------------+
                     |                         |
                    YES                       NO
                     |                         |
                     v                         v
        attempt normal File flavor       FileChute protocol only
                     |
          +----------+----------+
          |                     |
    destination gets File    Windows/browser path
          |                  cannot carry File
          v                     |
       finished                 v
                       compact FILECHUTE1 ticket
                                  |
                                  v
                         ONE canonical receiver
                                  |
                                  v
                          reconstruct real File
                                  |
                     +------------+------------+
                     |                         |
             compatible file input       known special target
                     |                         |
                     v                         v
             assign input.files          explicit adapter
```

### Required invariants

1. **One physical drop, one receiver owner.**
2. **Never allow two FileChute receivers to claim the same compact ticket.**
3. **Never treat `DataTransfer.items.add(File)` success as proof that a Windows cross-renderer file exists.**
4. **Do not expose a filename/path as ordinary dropped text.**
5. **Do not expose a giant encoded JSON transport blob to the destination.**
6. **Use compact text only as a private recovery carrier that FileChute immediately claims.**
7. **Prefer the real `File` whenever Chromium transports it reliably.**
8. **When recovery is needed, reconstruct the original `File`, not a filename placeholder.**
9. **Use a small number of explicit adapters for difficult known destinations instead of trying to synthesize arbitrary website drag semantics universally.**
10. **Keep diagnostics observable but out of the normal user path.**

## Release-impact assessment

### Safe / useful findings to carry forward

- compact `FILECHUTE1|...` compatibility ticket;
- transfer-token registration;
- exact-byte recovery;
- one canonical receiver;
- direct `input.files` assignment when a compatible input exists;
- explicit instrumentation for sender/worker/receiver transitions;
- detection of physical vs synthetic events;
- repeated-drag testing instead of accepting one successful drag as proof.

### Diagnostic-only behavior that should not be mistaken for final UX

- Windows `direct-input-only` as a universal product strategy;
- disabling all fallback mechanisms solely to isolate an experiment;
- exposing analyzer controls as if ordinary users need them;
- requiring arbitrary websites to expose a directly reachable file input.

## Upstream Chromium question

The most valuable upstream Chromium question is not "why does FileChute fail?" It is narrower:

> In Chromium on Windows, why can a `File` added to a drag `DataTransfer` from an extension side panel appear present in the source context but fail to arrive as a usable `File` in the destination renderer, and why can repeated attempts leave subsequent drag lifecycles unable to start normally?

A reduced reproduction should remove FileChute's filesystem, token transport, destination adapters, and UI so Chromium engineers can evaluate the cross-renderer drag behavior independently.

## Attribution request

If the Chromium behavior is confirmed upstream, preferred public reporter credit should be supplied explicitly in the issue report, for example:

```text
Reporter credit: thanks-cohn
```

or a chosen real-name/handle combination.

## Bottom line

FileChute has identified both a probable Chromium/Windows cross-renderer drag limitation and a FileChute-side receiver-duplication problem that could amplify it.

The correct response is not to keep adding transport layers. The correct response is to retain the useful recovery carrier, reduce ownership to one receiver, isolate destination-specific compatibility logic, and separately report the underlying Chromium behavior with a minimal reproduction.
