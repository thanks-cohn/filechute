# Chromium Bug Report Packet — FileChute Windows Cross-Renderer Drag

**Prepared:** 2026-08-27  
**Reporter project:** FileChute  
**Suggested reporter credit:** `thanks-cohn`  
**Classification:** Functional Chromium bug unless Chromium triage determines otherwise  
**Do not classify as security without separate evidence.**

## Suggested issue title

**Windows: File added to DataTransfer from extension side panel can fail to arrive as usable File in page renderer; repeated attempts can wedge later dragstart**

## Short summary

A Chromium extension side panel can obtain a real local `File`, add that `File` to the user-initiated drag `DataTransfer` with `DataTransfer.items.add(File)`, and observe what appears to be a valid source-side file item. On Windows Chromium, the destination page renderer may nevertheless receive no usable `File`.

During repeated side-panel -> page drag attempts, a second stateful failure has also been observed: the browser eventually shows an open-hand or prohibited/red cursor and later attempts may stop producing a normal `dragstart` at all.

The behavior is being investigated in FileChute, a local-file side-panel extension. FileChute-specific receiver duplication was also discovered and is being removed, so the Chromium report should use a reduced reproduction with no FileChute recovery protocol or synthetic receiver logic.

## Why this appears browser-level

The source side has a genuine `File` object from a user-approved local filesystem handle. The drag is initiated by a real pointer gesture. The source adds the `File` directly to the drag's `DataTransferItemList`.

The problematic boundary is extension side panel renderer -> ordinary website renderer on Windows Chromium.

The API operation appearing to succeed is not sufficient evidence that the destination receives an actual file.

## Environment

- OS: Windows
- Browser: Chromium / Google Chrome
- Source context: Manifest V3 extension side panel
- Destination context: ordinary web page in another renderer
- Drag source: real user gesture
- Payload: real JavaScript `File`

Before filing, reproduce once on the latest Chrome Stable and once on the latest Chrome Canary and replace this paragraph with exact version numbers.

## Minimal reproduction design

The ideal reduced extension contains only:

1. a Manifest V3 side panel;
2. a button allowing the user to choose one local file through a browser-supported user-consent flow;
3. one draggable DOM element;
4. a `dragstart` listener that executes only:

```js
source.addEventListener('dragstart', (event) => {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.items.add(file);

  console.log({
    items: event.dataTransfer.items.length,
    files: event.dataTransfer.files.length,
    types: [...event.dataTransfer.types]
  });
});
```

The destination test page should contain a normal drag/drop zone that logs:

```js
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  console.log({
    items: event.dataTransfer.items.length,
    files: event.dataTransfer.files.length,
    types: [...event.dataTransfer.types],
    file: event.dataTransfer.files[0] || null
  });
});
```

No custom MIME type, FileChute token, service worker transfer cache, synthetic DragEvent, content-script receiver, or website-specific adapter should exist in the reduced case.

## Steps to reproduce

1. Install/load the reduced Manifest V3 extension on Windows Chrome.
2. Open its side panel.
3. Choose a local PNG or other small file using the extension UI.
4. Open the simple destination test page in a normal browser tab.
5. Drag the side-panel item to the destination drop zone.
6. Compare source-side `DataTransfer` observations with destination-side `DataTransfer.files` / `items`.
7. Repeat the drag 10–15 times without restarting the browser.
8. Record whether later attempts stop reaching `dragstart` or display a prohibited cursor even over the valid drop zone.

## Expected result

If `DataTransfer.items.add(file)` succeeds during a genuine user drag and the source-side transfer exposes a file item, the destination should receive the same usable file through `DataTransfer.files` / `DataTransferItem.getAsFile()`.

Repeated completed drags should not poison the browser's drag lifecycle. A later pointer gesture should continue to produce `dragstart` normally.

## Actual result observed during FileChute investigation

One or both of the following may occur on Windows:

### Symptom A — cross-renderer file loss

The extension side panel appears to add the `File`, but the destination does not receive a usable file.

### Symptom B — stateful drag wedging

After repeated attempts, Chrome may show an open-hand or prohibited/red cursor and subsequent attempts may fail before a normal `dragstart` is emitted.

## Important FileChute-side finding / confounder already addressed

FileChute itself previously had two receiver paths capable of responding to one physical compatibility-ticket drop, and one path could issue synthetic drag/drop events. This is being removed and should **not** be present in the Chromium reproduction.

This distinction is important: the upstream report is specifically about whether Chromium can reliably transport a script-added real `File` from an extension side panel to a page renderer and whether repeated attempts can destabilize later native drag lifecycles.

## Diagnostic evidence to attach

Attach, where possible:

- source-side logs for `pointerdown`, `dragstart`, `dragend`;
- source-side `DataTransfer.items/files/types` snapshot immediately after `items.add(file)`;
- destination `dragenter`, `dragover`, `drop` logs;
- destination `DataTransfer.items/files/types` snapshot;
- `dropEffect` and `effectAllowed` at `dragend`;
- a short screen recording showing the transition from successful-looking drag to prohibited cursor;
- exact Chrome Stable and Canary versions;
- whether the issue reproduces on Linux/macOS for comparison;
- the minimal unpacked extension and destination HTML.

Do not attach FileChute user files or private filesystem information.

## Questions for Chromium triage

1. Is `DataTransferItemList.add(File)` expected to create a transferable file item across the extension side-panel -> page renderer boundary on Windows?
2. If not, should Chromium reject/omit the source-side addition rather than presenting it as a usable file item?
3. Is there a known Windows drag-and-drop lifecycle issue where repeated renderer-crossing drags can leave subsequent drags unable to begin?
4. Are extension side panels subject to a specific drag serialization/security restriction that differs from ordinary same-page drag sources?

## Reporter credit

Please use:

```text
Reporter credit: thanks-cohn
```

If Chromium requests a fuller credit string, use the reporter's preferred name/handle as supplied at filing time.

## Related FileChute chronology

Relevant FileChute investigation points include:

- earlier real-File-first outbound drag implementation;
- commit `4c7944f85c69c2f7bcc1c0dec51da0051bc5285a` — Windows changed to token-only transport after the native File behavior proved unreliable;
- later compact `FILECHUTE1|...` recovery carrier;
- discovery of duplicate FileChute receiver ownership;
- PR #28 diagnostic experiment removing duplicate receiver ownership and isolating direct-input behavior.

These references are useful chronology but should not replace the reduced Chromium reproduction.
