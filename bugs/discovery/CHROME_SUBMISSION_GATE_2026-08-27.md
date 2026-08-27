# FileChute Chrome Submission Gate & Bug Impact Report

**Date:** 2026-08-27  
**Project:** FileChute  
**Scope:** Windows Chromium outbound drag behavior and Chrome Web Store release readiness  
**Status:** Release-blocking architecture review complete  
**Target:** Chrome Web Store submission today

## Executive summary

FileChute's core goal is deliberately simple:

> Keep a real user-selected local folder beside the browser and make moving real files between that folder and the web feel immediate, ordinary, and reliable.

The Windows outbound-drag investigation discovered that the browser does not always preserve that simple model. A `File` added to a drag `DataTransfer` from an extension side panel may appear valid in the source context while failing to arrive as a usable file in the destination page renderer. Repeated attempts can also appear to poison the Windows Chromium drag lifecycle, eventually producing an open-hand/prohibited cursor and later drags that fail before normal `dragstart`.

FileChute then accumulated increasingly complex compatibility machinery to work around this browser boundary. Some of that machinery is useful. Some of it directly conflicts with FileChute's product goals and should not become permanent architecture.

The most important FileChute-side discovery is that two receiver paths were capable of responding to the same physical compatibility-ticket drop, and one path could manufacture a second synthetic drop. That duplicated ownership is a credible contributor to the repeated-drag wedging and must not return.

## Why these bugs matter to FileChute beyond one broken feature

These failures do not merely make one drag action unreliable. They push the codebase away from the exact qualities FileChute is supposed to provide.

### Goal 1: Files should behave like files

**Intended behavior:**

```text
real local File -> drag -> website receives real File
```

**Windows workaround behavior:**

```text
real local File
 -> cache File inside extension
 -> create transfer token
 -> encode compact ticket
 -> cross renderer as text
 -> content script claims ticket
 -> service worker resolves token
 -> read original bytes
 -> send bytes back to page
 -> reconstruct new File
 -> locate destination mechanism
 -> inject/dispatch reconstructed File
```

**Negative impact:** FileChute stops behaving like a thin file shelf and becomes a custom transport protocol. Every additional transport stage creates another failure boundary, another state transition, another browser permission/context dependency, and another place where a normal user drag can diverge from ordinary browser behavior.

This damages the main product promise: there should be almost no perceptible distance between wanting a file somewhere and putting it there.

### Goal 2: FileChute should work broadly, not only on hand-authored targets

The current Windows `direct-input-only` diagnostics strategy succeeds only when FileChute can find a compatible `<input type="file">` and programmatically assign `input.files`.

**Negative impact:** many modern upload surfaces do not expose a simple reachable file input under the element receiving the drag. Some use frameworks, hidden inputs, shadow DOM, custom drop surfaces, or internal event logic.

If FileChute permanently relies on direct-input discovery, compatibility becomes site-dependent and the product shifts from "drag files into the web" toward "drag files into websites for which we wrote enough special handling."

That conflicts with FileChute's universality goal.

### Goal 3: The extension should remain small and understandable

The workaround chain introduced or expanded:

- platform-specific drag branches;
- transfer-file cache state;
- transfer-token registration;
- compact text-ticket encoding/decoding;
- service-worker byte retrieval;
- receiver injection;
- reconstructed `File` creation;
- direct input discovery;
- synthetic DragEvent construction;
- duplicate receiver ownership;
- drag lifecycle cleanup;
- black-box event persistence;
- analyzer state;
- receiver strategy switches;
- target-specific compatibility behavior.

**Negative impact:** a feature that should conceptually require one drag handler now spans sender, storage, service worker, content scripts, receiver strategies, and diagnostics. This raises maintenance cost, regression risk, review difficulty, and the number of assumptions future code must preserve.

It also makes it harder to prove to ourselves that a release is safe because the number of combinations grows rapidly.

### Goal 4: Minimal permissions and minimal page interference

A normal real-file drag would require very little destination-side assistance.

A ticket-recovery architecture requires FileChute code to exist in destination pages so it can detect the private transfer, request bytes, reconstruct the file, and hand it to the page.

**Negative impact:** broader content-script injection and host access are harder to explain than a self-contained side-panel file shelf. They increase Chrome Web Store review surface and make FileChute interact with page internals even when the user's mental model is simply "I dragged a file."

This does not automatically make the extension non-compliant, but it moves the architecture away from the least-invasive form of the product.

### Goal 5: Predictable drag semantics

Duplicate receivers meant one physical drop could result in more than one FileChute logical drop path.

The problematic ownership involved:

- `page-drop-bridge.js`
- `page-drop-text-envelope.js`

The compatibility shim could then manufacture another synthetic drop.

**Negative impact:** one user action no longer maps cleanly to one application action. This is dangerous in any event-driven system and especially dangerous around native OS/browser drag teardown, where event ordering is partly controlled by Chromium.

It creates risks of:

- duplicate upload attempts;
- duplicate UI state changes;
- inconsistent `preventDefault()` behavior;
- synthetic/native event interleaving;
- stale drag cleanup;
- post-drop browser drag wedging;
- bugs that only appear after several repetitions.

This directly violates the FileChute goal of making the interaction feel obvious and deterministic.

### Goal 6: A store-ready codebase should not ship the laboratory as the product

PR #28 adds excellent observability, but it explicitly exists to isolate failure transitions. Its Windows default strategy intentionally suppresses normal synthetic drag fallback and terminates when no compatible direct input can be found.

**Negative impact:** if this diagnostic strategy is mistaken for the finished architecture, users receive intentionally narrowed behavior. Diagnostic controls, analyzer output, experimental strategy switches, and deliberately disabled compatibility paths create an extension that is easier to investigate but not necessarily better to use.

The product should retain the lessons and selected instrumentation, not expose the entire debugging experiment as permanent user-facing machinery.

## Architectural turning point

Commit:

`4c7944f85c69c2f7bcc1c0dec51da0051bc5285a`  
**Use token-only file drags on Windows**

changed Windows behavior from attempting to carry the real `File` directly to deliberately avoiding native File insertion:

```js
const useNativeFileItem = Boolean(file) && !windowsPlatform();
```

That change was understandable because native File transport proved unreliable on Windows, but it marks the point where FileChute changed from a thin drag layer into a FileChute-specific transport-and-reconstruction system.

Later commits added the text envelope, compact `FILECHUTE1|...` carrier, receiver bridges, byte reconstruction, and diagnostic instrumentation.

## What PR #28 genuinely fixes

PR #28 makes one major architectural improvement that should survive the diagnostics phase:

> **One compatibility ticket must have one canonical receiver owner.**

It removes `page-drop-text-envelope.js` from competing injection paths and leaves `page-drop-bridge.js` as the canonical receiver.

This reduces duplicated physical-drop processing and removes one source of synthetic redispatch.

## What PR #28 does not prove

PR #28 does **not** prove that Windows outbound drag is fixed.

Its own diagnostic design defaults Windows to `direct-input-only`, which:

1. receives the compact ticket;
2. retrieves the original bytes;
3. reconstructs a `File`;
4. searches for a compatible file input;
5. assigns `input.files`;
6. dispatches `input`/`change`;
7. fails deliberately when no compatible direct input exists.

It suppresses the generic synthetic drag/drop fallback by design.

Therefore a successful test on one compatible input is not evidence that general drag-and-drop interoperability has been solved.

## Recommended shipping principles

The release design should preserve these invariants:

1. **One physical user drag = one FileChute receiver path.**
2. **Use the real `File` whenever Chromium can transport it reliably.**
3. **Treat `DataTransfer.items.add(File)` success on Windows as an attempt, not proof of delivery.**
4. **Keep `FILECHUTE1|...` only as a compact recovery carrier, not the user's visible payload.**
5. **Never degrade a file into a filename/path dropped as text.**
6. **Never expose large encoded transport JSON to the destination.**
7. **Reconstruct the original bytes into a real `File` when recovery is needed.**
8. **Prefer generic direct input assignment where it genuinely works.**
9. **Use explicit, small adapters for known difficult destinations rather than universal synthetic drag emulation.**
10. **Keep debugging instrumentation available to developers but out of the normal user journey.**
11. **Test repeated drags, not only one successful attempt.**
12. **Keep FileChute's destination-page footprint as small as practical.**

## Chrome Web Store submission impact

### The Web Store review question

The primary store-review concern is not whether every website on Windows accepts every FileChute drag. Software can have platform limitations and still be publishable.

The important release questions are whether:

- the submitted extension is stable;
- requested permissions are necessary and accurately justified;
- the listing accurately describes supported behavior;
- known experimental/debug UI is not presented as finished functionality;
- FileChute does not claim universal Windows drag support if that remains unproven;
- the package does not contain avoidable duplicate receiver logic or known self-induced instability.

### What should be fixed before calling Windows drag solved

**Must retain/fix:**

- single canonical receiver ownership;
- no duplicate physical ticket consumption;
- no accidental second synthetic drop;
- no filename/path text fallback exposed to destinations;
- no giant encoded JSON text payload;
- deterministic cleanup;
- successful repeated-drag testing on Windows.

### What can be described as a known compatibility limitation if necessary

If the release candidate is otherwise stable, it is reasonable to describe some Windows drag destinations as compatibility-limited rather than pretending the browser issue does not exist.

That is preferable to shipping increasingly invasive generic event synthesis merely to claim universal support.

## Required pre-submission Windows matrix

Before the final package is labeled ready, test at minimum:

- PNG -> ChatGPT;
- PNG -> Google image/upload target;
- PNG -> Yandex image/upload target;
- PNG -> a plain HTML `<input type="file">` test page;
- PNG -> a plain HTML custom drag/drop zone;
- 10–15 repeated outbound file drags in one browser session;
- FileChute remains draggable after failed destination attempts;
- no filename/path appears as ordinary text;
- no `FILECHUTE1|...` ticket appears visibly in a text editor/composer;
- no duplicate upload occurs from one physical drop.

FrameChute interoperability should be tested separately because it is a FileChute-aware protocol consumer rather than proof of arbitrary website compatibility.

## Chromium bug report / reporter credit

The underlying browser-level behavior should be reported separately to Chromium with a minimal reproduction that excludes FileChute's receiver bridge and synthetic compatibility machinery.

The upstream question is:

> Why can a real `File` added to a user-initiated drag `DataTransfer` in a Chromium extension side panel appear valid at the source but fail to arrive as a usable `File` in the destination page renderer on Windows, and why can repeated attempts leave later drag gestures unable to start normally?

Preferred reporter credit:

```text
Reporter credit: thanks-cohn
```

The public issue, if accepted, can serve as attribution for discovering/reporting the Chromium behavior. The Chrome Web Store listing is separate and does not itself guarantee bug-finder credit.

## Final assessment

The investigation has been valuable because it exposed a boundary between a FileChute bug and a likely Chromium limitation.

The worst outcome would be to permanently absorb every browser failure into FileChute until the code becomes a browser-within-the-browser. That would defeat the product.

FileChute should remain a small, comprehensible local file shelf. Compatibility code should exist only where the browser makes it necessary, should have one owner, and should disappear from the user's mental model.

The target for today's Chrome submission is therefore not "zero known Chromium limitations." The target is:

> **A stable FileChute whose own code does not amplify the browser bug, whose limitations are represented accurately, and whose architecture still serves the original goal instead of being consumed by the workaround.**
